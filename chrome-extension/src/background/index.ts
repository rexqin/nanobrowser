import 'webextension-polyfill';
import {
  agentModelStore,
  AgentNameEnum,
  firewallStore,
  generalSettingsStore,
  llmProviderStore,
  analyticsSettingsStore,
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
import { Executor } from './agent/executor';
import { createLogger } from './log';
import { createChatModel } from './agent/helper';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { DEFAULT_AGENT_OPTIONS } from './agent/types';
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

const browserContext = new BrowserContext({});
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
const pendingSidePanelMessages: SidePanelPublishReceivedMessage[] = [];
const SIDE_PANEL_URL = chrome.runtime.getURL('side-panel/index.html');

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
chrome.runtime.onMessage.addListener(() => {
  // Handle other message types if needed in the future
  // Return false if response is not sent asynchronously
  // return false;
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
              if (message.planDedicatedTab) {
                // Keep plan tab lifecycle aligned with a whole plan run:
                // attach once at plan start, detach/close when plan ends.
                if (planDedicatedTabId === null) {
                  const dedicatedPage = await browserContext.openInactiveTab();
                  planDedicatedTabId = dedicatedPage.tabId;
                } else {
                  await browserContext.attachToTabInBackground(planDedicatedTabId);
                }
              } else {
                await closePlanDedicatedTabIfAny();
                await browserContext.switchTab(message.tabId);
              }
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
              if (message.planDedicatedTab) {
                // When navigation internally falls back to a fresh tab (e.g. about:blank is blocked),
                // `planDedicatedTabId` might still point to the old blocked tab.
                // In that case, prefer attaching to the incoming `message.tabId`.
                const blockedPrefixes = ['chrome://', 'edge://', 'about:', 'devtools://', 'view-source:'];
                const isBlockedUrl = (url?: string) => {
                  const lower = (url ?? '').toLowerCase();
                  return blockedPrefixes.some(prefix => lower.startsWith(prefix));
                };

                const dedicatedId = planDedicatedTabId;
                const dedicatedTab = dedicatedId !== null ? await chrome.tabs.get(dedicatedId).catch(() => null) : null;
                const incomingTab = await chrome.tabs.get(message.tabId).catch(() => null);

                logger.debug('follow_up_task tab routing (DEV)', {
                  planDedicatedTabId: dedicatedId,
                  planDedicatedTabUrl: dedicatedTab?.url,
                  messageTabId: message.tabId,
                  messageTabUrl: incomingTab?.url,
                });

                const canUseDedicated = dedicatedId !== null && dedicatedTab?.url && !isBlockedUrl(dedicatedTab.url);
                if (canUseDedicated) {
                  await browserContext.attachToTabInBackground(dedicatedId);
                } else {
                  planDedicatedTabId = message.tabId;
                  await browserContext.attachToTabInBackground(message.tabId);
                }
              } else {
                await closePlanDedicatedTabIfAny();
                await browserContext.switchTab(message.tabId);
              }
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
              const elementsText = browserState.serializedDomState.llmRepresentation(
                DEFAULT_AGENT_OPTIONS.includeAttributes,
              );

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
      void closePlanDedicatedTabIfAny();
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
