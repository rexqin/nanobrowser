import 'webextension-polyfill';
import {
  agentModelStore,
  AgentNameEnum,
  firewallStore,
  generalSettingsStore,
  llmProviderStore,
  analyticsSettingsStore,
  logtoConfigStore,
  logtoSessionStore,
  type LogtoSession,
} from '@extension/storage';
import { t } from '@extension/i18n';
import {
  type ExternalPublishMessage,
  externalIncomingMessageSchema,
  externalPublishMessageSchema,
  type ExternalIncomingMessage,
  type SidePanelPublishReceivedMessage,
} from '@extension/shared';
import BrowserContext from './browser/context';
import type Page from './browser/page';
import type { AutomationConnectorMode, AutomationEngine } from './browser/automation/adapter';
import { Executor } from './agent/executor';
import { createLogger } from './log';
import { createChatModel } from './agent/helper';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

import { shouldCleanupExecutorOnTerminalEvent } from './executor-lifecycle';
import { SpeechToTextService } from './services/speechToText';

import { analytics } from './services/analytics';

const logger = createLogger('background');

/** Matches manifest externally_connectable (https only, hzgm.tech and subdomains). */
function isHzgmTechSenderUrl(urlStr: string | undefined): boolean {
  if (!urlStr) return false;
  try {
    const { protocol, hostname } = new URL(urlStr);
    if (protocol !== 'https:') return false;
    return hostname === 'hzgm.tech' || hostname.endsWith('.hzgm.tech');
  } catch {
    return false;
  }
}

const resolveAutomationEngine = (): AutomationEngine => {
  const fromStorage = (globalThis as { NANOBROWSER_AUTOMATION_ENGINE?: string }).NANOBROWSER_AUTOMATION_ENGINE;
  if (fromStorage === 'cdp' || fromStorage === 'hybrid') {
    return fromStorage;
  }
  return 'hybrid';
};

const resolveAutomationConnectorMode = (): AutomationConnectorMode => {
  const fromStorage = (globalThis as { NANOBROWSER_AUTOMATION_CONNECTOR_MODE?: string })
    .NANOBROWSER_AUTOMATION_CONNECTOR_MODE;
  if (fromStorage === 'auto' || fromStorage === 'chrome-debugger') {
    return fromStorage;
  }
  return 'chrome-debugger';
};

const automationEngine = resolveAutomationEngine();
const automationConnectorMode = resolveAutomationConnectorMode();
const browserContext = new BrowserContext({
  automationEngine,
  automationConnectorMode,
});
logger.info('automation runtime initialized', {
  engine: automationEngine,
  connectorMode: automationConnectorMode,
});
let currentExecutor: Executor | null = null;
let currentPort: chrome.runtime.Port | null = null;
/** Background tab used for multi-step plan execution; closed when the plan ends or a normal task uses the active tab. */
let planDedicatedTabId: number | null = null;

async function closePlanDedicatedTabIfAny(): Promise<void> {
  if (planDedicatedTabId === null) return;
  const id = planDedicatedTabId;
  planDedicatedTabId = null;
  try {
    await browserContext.closeTab(id);
  } catch (e) {
    logger.warning('closePlanDedicatedTab failed', e);
  }
}

async function detachPlanDedicatedTabIfAny(reason: 'cancel' | 'disconnect'): Promise<void> {
  if (planDedicatedTabId === null) return;
  const id = planDedicatedTabId;
  planDedicatedTabId = null;
  try {
    await browserContext.detachPage(id);
  } catch (e) {
    logger.warning(`detach plan dedicated tab failed (${reason})`, e);
  }
}

const pendingSidePanelMessages: SidePanelPublishReceivedMessage[] = [];
const SIDE_PANEL_URL = chrome.runtime.getURL('side-panel/index.html');

function postAutomationTargetTab(port: chrome.runtime.Port, page: Page): void {
  try {
    port.postMessage({ type: 'automation_target_tab', tabId: page.tabId });
  } catch (error) {
    logger.warning('postAutomationTargetTab failed', error);
  }
}

// Setup side panel behavior
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(error => console.error(error));

// chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
//   if (tabId && changeInfo.status === 'complete' && isScriptableTabUrl(tab.url)) {
//   }
// });

// Listen for debugger detached event
// if canceled_by_user, remove the tab from the browser context
chrome.debugger.onDetach.addListener(async (source, reason) => {
  console.log('Debugger detached:', source, reason);
  if (reason === 'canceled_by_user') {
    if (source.tabId) {
      currentExecutor?.cancel();
      await browserContext.cleanup();
    }
  }
});

// Cleanup when tab is closed
chrome.tabs.onRemoved.addListener(tabId => {
  browserContext.removeAttachedPage(tabId);
});

logger.info('background loaded');

// Initialize analytics
analytics.init().catch(error => {
  logger.error('Failed to initialize analytics:', error);
});

// Listen for analytics settings changes
analyticsSettingsStore.subscribe(() => {
  analytics.updateSettings().catch(error => {
    logger.error('Failed to update analytics settings:', error);
  });
});

// Listen for simple messages (e.g., from options page)
function toBase64Url(data: ArrayBuffer): string {
  const bytes = new Uint8Array(data);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function randomUrlSafeString(bytes = 32): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return toBase64Url(arr.buffer);
}

async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return toBase64Url(digest);
}

function normalizeEndpoint(endpoint: string): string {
  return endpoint.replace(/\/+$/, '');
}

async function exchangeCodeForToken(params: {
  endpoint: string;
  appId: string;
  code: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<{
  access_token: string;
  id_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
}> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: params.appId,
    code_verifier: params.codeVerifier,
  });

  const response = await fetch(`${normalizeEndpoint(params.endpoint)}/oidc/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => '');
    throw new Error(`Logto token exchange failed: ${response.status} ${details}`);
  }

  return (await response.json()) as {
    access_token: string;
    id_token: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
    scope?: string;
  };
}

async function fetchLogtoUserInfo(endpoint: string, accessToken: string): Promise<LogtoSession['userInfo']> {
  const response = await fetch(`${normalizeEndpoint(endpoint)}/oidc/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!response.ok) {
    return undefined;
  }
  return (await response.json()) as LogtoSession['userInfo'];
}

async function getLogtoStatus() {
  const config = await logtoConfigStore.getConfig();
  const session = await logtoSessionStore.getSession();
  const isAuthenticated = await logtoSessionStore.isAuthenticated();
  return { config, session, isAuthenticated };
}

async function signInWithLogto(interactive = true) {
  const config = await logtoConfigStore.getConfig();
  if (!config.endpoint || !config.appId) {
    throw new Error('请先在设置页填写 Logto Endpoint 和 App ID');
  }

  const state = randomUrlSafeString(24);
  const codeVerifier = randomUrlSafeString(64);
  const codeChallenge = await sha256Base64Url(codeVerifier);
  const redirectUri = chrome.identity.getRedirectURL('logto');
  const authUrl = new URL(`${normalizeEndpoint(config.endpoint)}/oidc/auth`);
  authUrl.searchParams.set('client_id', config.appId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', config.scope || 'openid profile email offline_access');
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('state', state);
  if (config.resource.trim()) {
    authUrl.searchParams.set('resource', config.resource.trim());
  }

  const callbackUrl = await chrome.identity.launchWebAuthFlow({
    interactive,
    url: authUrl.toString(),
  });

  if (!callbackUrl) {
    throw new Error('登录失败：未收到回调地址');
  }

  const callback = new URL(callbackUrl);
  const error = callback.searchParams.get('error');
  if (error) {
    const errorDescription = callback.searchParams.get('error_description') || error;
    throw new Error(`登录失败：${errorDescription}`);
  }

  const returnedState = callback.searchParams.get('state');
  if (!returnedState || returnedState !== state) {
    throw new Error('登录失败：state 校验不通过');
  }

  const code = callback.searchParams.get('code');
  if (!code) {
    throw new Error('登录失败：缺少授权码');
  }

  const tokenResponse = await exchangeCodeForToken({
    endpoint: config.endpoint,
    appId: config.appId,
    code,
    redirectUri,
    codeVerifier,
  });

  const userInfo = await fetchLogtoUserInfo(config.endpoint, tokenResponse.access_token);
  const session: LogtoSession = {
    accessToken: tokenResponse.access_token,
    idToken: tokenResponse.id_token,
    refreshToken: tokenResponse.refresh_token,
    expiresAt: Date.now() + (tokenResponse.expires_in ?? 3600) * 1000,
    tokenType: tokenResponse.token_type ?? 'Bearer',
    scope: tokenResponse.scope ?? config.scope,
    userInfo,
  };
  await logtoSessionStore.setSession(session);

  return {
    isAuthenticated: true,
    config,
    session,
  };
}

async function signOutFromLogto() {
  const session = await logtoSessionStore.getSession();
  const config = await logtoConfigStore.getConfig();
  await logtoSessionStore.clearSession();

  if (session?.idToken && config.endpoint) {
    const logoutUrl = new URL(`${normalizeEndpoint(config.endpoint)}/oidc/session/end`);
    logoutUrl.searchParams.set('post_logout_redirect_uri', chrome.identity.getRedirectURL('logto-logout'));
    logoutUrl.searchParams.set('id_token_hint', session.idToken);
    try {
      await chrome.identity.launchWebAuthFlow({
        interactive: false,
        url: logoutUrl.toString(),
      });
    } catch (error) {
      logger.warning('Logto logout flow failed, local session is cleared', error);
    }
  }

  return {
    isAuthenticated: false,
    session: null,
    config,
  };
}

async function syncLogtoSessionWithIdp() {
  const status = await getLogtoStatus();
  if (!status.isAuthenticated) {
    return status;
  }

  try {
    // Use non-interactive flow to verify IdP session still exists.
    return await signInWithLogto(false);
  } catch {
    await logtoSessionStore.clearSession();
    const config = await logtoConfigStore.getConfig();
    return {
      isAuthenticated: false,
      session: null,
      config,
      syncedBySilentCheck: true,
    };
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'logto_get_status') {
    void getLogtoStatus()
      .then(status => sendResponse({ ok: true, ...status }))
      .catch(error => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
    return true;
  }

  if (message?.type === 'logto_update_config') {
    void logtoConfigStore
      .updateConfig(message?.config ?? {})
      .then(async () => {
        const status = await getLogtoStatus();
        sendResponse({ ok: true, ...status });
      })
      .catch(error => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
    return true;
  }

  if (message?.type === 'logto_sign_in') {
    void signInWithLogto()
      .then(status => sendResponse({ ok: true, ...status }))
      .catch(error => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
    return true;
  }

  if (message?.type === 'logto_sign_in_silent') {
    void signInWithLogto(false)
      .then(status => sendResponse({ ok: true, ...status }))
      .catch(() => sendResponse({ ok: true, silentFailed: true }));
    return true;
  }

  if (message?.type === 'logto_sync_session') {
    void syncLogtoSessionWithIdp()
      .then(status => sendResponse({ ok: true, ...status }))
      .catch(error => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
    return true;
  }

  if (message?.type === 'logto_sign_out') {
    void signOutFromLogto()
      .then(status => sendResponse({ ok: true, ...status }))
      .catch(error => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
    return true;
  }

  return false;
});

// Web pages under https://*.hzgm.tech (see manifest externally_connectable)
chrome.runtime.onMessageExternal.addListener(async (message, sender, sendResponse) => {
  const parsedExternalMessage = externalIncomingMessageSchema.safeParse(message);
  if (!parsedExternalMessage.success) {
    logger.warning('Invalid external message payload', parsedExternalMessage.error.flatten());
    sendResponse({ ok: false, error: 'invalid_message' });
    return false;
  }
  const externalMessage: ExternalIncomingMessage = parsedExternalMessage.data;

  if (!isHzgmTechSenderUrl(sender.url)) {
    logger.warning('Blocked external message', sender.url);
    sendResponse({ ok: false, error: 'forbidden' });
    return false;
  }

  if (externalMessage && externalMessage.type === 'ping') {
    sendResponse({ ok: true, type: 'pong' });
    return false;
  }

  if (externalMessage && externalMessage.type === 'publish') {
    const parsedExternalPublishMessage = externalPublishMessageSchema.safeParse(externalMessage);
    if (!parsedExternalPublishMessage.success) {
      logger.warning('Invalid external publish message payload', parsedExternalPublishMessage.error.flatten());
      sendResponse({ ok: false, error: 'invalid_message' });
      return false;
    }
    const externalPublishMessage: ExternalPublishMessage = parsedExternalPublishMessage.data;
    try {
      const targetTabId = sender.tab?.id;
      if (targetTabId) {
        await chrome.sidePanel.open({ tabId: targetTabId });
      } else {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (activeTab?.id) {
          await chrome.sidePanel.open({ tabId: activeTab.id });
        }
      }
    } catch (error) {
      logger.warning('Failed to auto-open side panel for external publish message', error);
    }
    const sidePanelMessage: SidePanelPublishReceivedMessage = {
      type: 'external_publish_received',
      message: '收到发布指令',
      payload: externalPublishMessage,
      from: sender.url,
      timestamp: Date.now(),
    };

    if (currentPort) {
      currentPort.postMessage(sidePanelMessage);
    } else {
      pendingSidePanelMessages.push(sidePanelMessage);
    }
    sendResponse({ ok: true, type: 'publish_received' });
    return false;
  }

  logger.info('External message from hzgm.tech', { url: sender.url, message: externalMessage });
  sendResponse({ ok: true, received: true });
  return false;
});

// Setup connection listener for long-lived connections (e.g., side panel)
chrome.runtime.onConnect.addListener(port => {
  if (port.name === 'side-panel-connection') {
    const senderUrl = port.sender?.url;
    const senderId = port.sender?.id;

    if (!senderUrl || senderId !== chrome.runtime.id || senderUrl !== SIDE_PANEL_URL) {
      logger.warning('Blocked unauthorized side-panel-connection', senderId, senderUrl);
      port.disconnect();
      return;
    }

    currentPort = port;
    if (pendingSidePanelMessages.length > 0) {
      const bufferedMessages = [...pendingSidePanelMessages];
      pendingSidePanelMessages.length = 0;
      for (const sidePanelMessage of bufferedMessages) {
        try {
          currentPort.postMessage(sidePanelMessage);
        } catch (error) {
          logger.warning('Failed to flush buffered side panel message', error);
        }
      }
    }

    port.onMessage.addListener(async message => {
      try {
        switch (message.type) {
          case 'heartbeat':
            // Acknowledge heartbeat
            port.postMessage({ type: 'heartbeat_ack' });
            break;

          case 'new_task': {
            if (!message.task) return port.postMessage({ type: 'error', error: t('bg_cmd_newTask_noTask') });
            if (!message.tabId) return port.postMessage({ type: 'error', error: t('bg_errors_noTabId') });

            logger.info('new_task', message.tabId, message.task, { planDedicatedTab: message.planDedicatedTab });
            try {
              let attachedPage: Page;
              if (message.planDedicatedTab) {
                // Keep plan tab lifecycle aligned with a whole plan run:
                // attach once at plan start, detach/close when plan ends.
                if (planDedicatedTabId === null) {
                  attachedPage = await browserContext.attachToTabInBackground(message.tabId);
                  planDedicatedTabId = attachedPage.tabId;
                } else {
                  attachedPage = await browserContext.attachToTabInBackground(planDedicatedTabId);
                  planDedicatedTabId = attachedPage.tabId;
                }
              } else {
                await closePlanDedicatedTabIfAny();
                attachedPage = await browserContext.switchTab(message.tabId);
              }
              postAutomationTargetTab(port, attachedPage);
            } catch (error) {
              logger.error('new_task tab setup failed:', error);
              return port.postMessage({
                type: 'error',
                error: error instanceof Error ? error.message : t('errors_unknown'),
              });
            }

            // For normal tasks, start from a clean executor/browser state.
            // For plan runs, executor/page lifecycle is managed by plan terminal events.
            if (!message.planDedicatedTab) {
              try {
                await currentExecutor?.cleanup();
              } catch (error) {
                logger.warning('previous executor cleanup failed during new_task', error);
              }
            }

            currentExecutor = await setupExecutor(message.taskId, message.task, browserContext);
            subscribeToExecutorEvents(currentExecutor);

            const result = await currentExecutor.execute();
            logger.info('new_task execution result', message.tabId, result);
            break;
          }

          case 'follow_up_task': {
            if (!message.task) return port.postMessage({ type: 'error', error: t('bg_cmd_followUpTask_noTask') });
            if (!message.tabId) return port.postMessage({ type: 'error', error: t('bg_errors_noTabId') });

            logger.info('follow_up_task', message.tabId, message.task, { planDedicatedTab: message.planDedicatedTab });

            try {
              let attachedPage: Page;
              if (message.planDedicatedTab) {
                const dedicatedId = planDedicatedTabId;
                const dedicatedTab = dedicatedId !== null ? await chrome.tabs.get(dedicatedId).catch(() => null) : null;
                const incomingTab = await chrome.tabs.get(message.tabId).catch(() => null);

                logger.debug('follow_up_task tab routing (DEV)', {
                  planDedicatedTabId: dedicatedId,
                  planDedicatedTabUrl: dedicatedTab?.url,
                  messageTabId: message.tabId,
                  messageTabUrl: incomingTab?.url,
                });

                const canUseDedicated = dedicatedId !== null && dedicatedTab?.url;
                if (canUseDedicated) {
                  attachedPage = await browserContext.attachToTabInBackground(dedicatedId);
                } else {
                  attachedPage = await browserContext.attachToTabInBackground(message.tabId);
                }
                planDedicatedTabId = attachedPage.tabId;
              } else {
                await closePlanDedicatedTabIfAny();
                attachedPage = await browserContext.switchTab(message.tabId);
              }
              postAutomationTargetTab(port, attachedPage);
            } catch (error) {
              logger.error('follow_up_task tab setup failed:', error);
              return port.postMessage({
                type: 'error',
                error: error instanceof Error ? error.message : t('errors_unknown'),
              });
            }

            // If executor exists, add follow-up task
            if (currentExecutor) {
              currentExecutor.addFollowUpTask(message.task);
              // Re-subscribe to events in case the previous subscription was cleaned up
              subscribeToExecutorEvents(currentExecutor);
              const result = await currentExecutor.execute();
              logger.info('follow_up_task execution result', message.tabId, result);
            } else {
              // executor was cleaned up, can not add follow-up task
              logger.info('follow_up_task: executor was cleaned up, can not add follow-up task');
              return port.postMessage({ type: 'error', error: t('bg_cmd_followUpTask_cleaned') });
            }
            break;
          }

          case 'plan_dedicated_tab_close': {
            await closePlanDedicatedTabIfAny();
            break;
          }

          case 'cancel_task': {
            if (!currentExecutor) return port.postMessage({ type: 'error', error: t('bg_errors_noRunningTask') });
            await currentExecutor.cancel();
            await detachPlanDedicatedTabIfAny('cancel');
            break;
          }

          case 'resume_task': {
            if (!currentExecutor) return port.postMessage({ type: 'error', error: t('bg_cmd_resumeTask_noTask') });
            await currentExecutor.resume();
            return port.postMessage({ type: 'success' });
          }

          case 'pause_task': {
            if (!currentExecutor) return port.postMessage({ type: 'error', error: t('bg_errors_noRunningTask') });
            await currentExecutor.pause();
            return port.postMessage({ type: 'success' });
          }

          case 'screenshot': {
            if (!message.tabId) return port.postMessage({ type: 'error', error: t('bg_errors_noTabId') });
            const page = await browserContext.switchTab(message.tabId);
            const screenshot = await page.takeScreenshot();
            logger.info('screenshot', message.tabId, screenshot);
            return port.postMessage({ type: 'success', screenshot });
          }

          case 'state': {
            try {
              const browserState = await browserContext.getState();
              const elementsText = browserState.serializedDomState.llmRepresentation();

              logger.info('state', browserState);
              logger.info('interactive elements', elementsText);
              return port.postMessage({ type: 'success', msg: t('bg_cmd_state_printed') });
            } catch (error) {
              logger.error('Failed to get state:', error);
              return port.postMessage({ type: 'error', error: t('bg_cmd_state_failed') });
            }
          }

          case 'speech_to_text': {
            try {
              if (!message.audio) {
                return port.postMessage({
                  type: 'speech_to_text_error',
                  error: t('bg_cmd_stt_noAudioData'),
                });
              }

              logger.info('Processing speech-to-text request...');

              // Get all providers for speech-to-text service
              const providers = await llmProviderStore.getAllProviders();

              // Create speech-to-text service with all providers
              const speechToTextService = await SpeechToTextService.create(providers);

              // Extract base64 audio data (remove data URL prefix if present)
              let base64Audio = message.audio;
              if (base64Audio.startsWith('data:')) {
                base64Audio = base64Audio.split(',')[1];
              }

              // Transcribe audio
              const transcribedText = await speechToTextService.transcribeAudio(base64Audio);

              logger.info('Speech-to-text completed successfully');
              return port.postMessage({
                type: 'speech_to_text_result',
                text: transcribedText,
              });
            } catch (error) {
              logger.error('Speech-to-text failed:', error);
              return port.postMessage({
                type: 'speech_to_text_error',
                error: error instanceof Error ? error.message : t('bg_cmd_stt_failed'),
              });
            }
          }

          case 'replay': {
            if (!message.tabId) return port.postMessage({ type: 'error', error: t('bg_errors_noTabId') });
            if (!message.taskId) return port.postMessage({ type: 'error', error: t('bg_errors_noTaskId') });
            if (!message.historySessionId)
              return port.postMessage({ type: 'error', error: t('bg_cmd_replay_noHistory') });
            logger.info('replay', message.tabId, message.taskId, message.historySessionId);

            try {
              await closePlanDedicatedTabIfAny();
              // Switch to the specified tab
              await browserContext.switchTab(message.tabId);
              // Setup executor with the new taskId and a dummy task description
              currentExecutor = await setupExecutor(message.taskId, message.task, browserContext);
              subscribeToExecutorEvents(currentExecutor);

              // Run replayHistory with the history session ID
              const result = await currentExecutor.replayHistory(message.historySessionId);
              logger.debug('replay execution result', message.tabId, result);
            } catch (error) {
              logger.error('Replay failed:', error);
              return port.postMessage({
                type: 'error',
                error: error instanceof Error ? error.message : t('bg_cmd_replay_failed'),
              });
            }
            break;
          }

          default:
            return port.postMessage({ type: 'error', error: t('errors_cmd_unknown', [message.type]) });
        }
      } catch (error) {
        console.error('Error handling port message:', error);
        port.postMessage({
          type: 'error',
          error: error instanceof Error ? error.message : t('errors_unknown'),
        });
      }
    });

    port.onDisconnect.addListener(() => {
      // this event is also triggered when the side panel is closed, so we need to cancel the task
      console.log('Side panel disconnected');
      currentPort = null;
      void detachPlanDedicatedTabIfAny('disconnect');
      currentExecutor?.cancel();
    });
  }
});

async function setupExecutor(taskId: string, task: string, browserContext: BrowserContext) {
  const providers = await llmProviderStore.getAllProviders();
  // if no providers, need to display the options page
  if (Object.keys(providers).length === 0) {
    throw new Error(t('bg_setup_noApiKeys'));
  }

  // Clean up any legacy validator settings for backward compatibility
  await agentModelStore.cleanupLegacyValidatorSettings();

  const agentModels = await agentModelStore.getAllAgentModels();
  // verify if every provider used in the agent models exists in the providers
  for (const agentModel of Object.values(agentModels)) {
    if (!providers[agentModel.provider]) {
      throw new Error(t('bg_setup_noProvider', [agentModel.provider]));
    }
  }

  const navigatorModel = agentModels[AgentNameEnum.Navigator];
  if (!navigatorModel) {
    throw new Error(t('bg_setup_noNavigatorModel'));
  }
  // Log the provider config being used for the navigator
  const navigatorProviderConfig = providers[navigatorModel.provider];
  const navigatorLLM = createChatModel(navigatorProviderConfig, navigatorModel);

  let plannerLLM: BaseChatModel | null = null;
  const plannerModel = agentModels[AgentNameEnum.Planner];
  if (plannerModel) {
    // Log the provider config being used for the planner
    const plannerProviderConfig = providers[plannerModel.provider];
    plannerLLM = createChatModel(plannerProviderConfig, plannerModel);
  }

  // Apply firewall settings to browser context
  const firewall = await firewallStore.getFirewall();
  if (firewall.enabled) {
    browserContext.updateConfig({
      allowedUrls: firewall.allowList,
      deniedUrls: firewall.denyList,
    });
  } else {
    browserContext.updateConfig({
      allowedUrls: [],
      deniedUrls: [],
    });
  }

  const generalSettings = await generalSettingsStore.getSettings();
  browserContext.updateConfig({
    minimumWaitPageLoadTime: generalSettings.minWaitPageLoad / 1000.0,
  });

  const executor = new Executor(task, taskId, browserContext, navigatorLLM, {
    plannerLLM: plannerLLM ?? navigatorLLM,
    agentOptions: {
      maxSteps: generalSettings.maxSteps,
      maxFailures: generalSettings.maxFailures,
      maxActionsPerStep: generalSettings.maxActionsPerStep,
      planningInterval: generalSettings.planningInterval,
    },
    generalSettings: generalSettings,
  });

  return executor;
}

// Update subscribeToExecutorEvents to use port
async function subscribeToExecutorEvents(executor: Executor) {
  // Clear previous event listeners to prevent multiple subscriptions
  executor.clearExecutionEvents();

  // Subscribe to new events
  executor.subscribeExecutionEvents(async event => {
    try {
      if (currentPort) {
        currentPort.postMessage(event);
      }
    } catch (error) {
      logger.error('Failed to send message to side panel:', error);
    }

    if (
      shouldCleanupExecutorOnTerminalEvent({
        state: event.state,
        isPlanExecutionActive: planDedicatedTabId !== null,
      })
    ) {
      await currentExecutor?.cleanup();
    }
  });
}
