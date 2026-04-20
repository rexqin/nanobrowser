/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useCallback, useRef } from 'react';
import { FiSettings } from 'react-icons/fi';
import { PiPlusBold } from 'react-icons/pi';
import { GrHistory } from 'react-icons/gr';
import {
  Actors,
  agentModelStore,
  planHistoryStore,
  type PlanRun,
  type PlanSession,
  type PlanSessionMetadata,
  type PlanStep,
} from '@extension/storage';
import { sidePanelExecutionAgentEventSchema, sidePanelInternalMessageSchema } from '@extension/shared';
import type { SidePanelInternalMessage } from '@extension/shared';
import { t } from '@extension/i18n';
import PlanBuilder, { type PlanStepActivityLine } from './components/PlanBuilder';
import PlanHistoryList from './components/PlanHistoryList';
import PlanListSidebar from './components/PlanListSidebar';
import { EventType, type AgentEvent, ExecutionState } from './types/event';
import './SidePanel.css';

// Declare chrome API types
declare global {
  interface Window {
    chrome: typeof chrome;
  }
}

function isTerminalExecutionState(state: ExecutionState): boolean {
  return (
    state === ExecutionState.ACT_OK ||
    state === ExecutionState.ACT_FAIL ||
    state === ExecutionState.STEP_OK ||
    state === ExecutionState.STEP_FAIL ||
    state === ExecutionState.STEP_CANCEL ||
    state === ExecutionState.TASK_OK ||
    state === ExecutionState.TASK_FAIL ||
    state === ExecutionState.TASK_CANCEL
  );
}

function formatDurationSuffix(event: AgentEvent): string {
  if (!isTerminalExecutionState(event.state)) {
    return '';
  }
  const ms = event.data.activeElapsedMs ?? event.data.elapsedMs;
  if (ms === undefined) {
    return '';
  }
  return `（耗时 ${(ms / 1000).toFixed(ms >= 10000 ? 1 : 2)}s）`;
}

const SidePanel = () => {
  type PlanStepExecUiStatus = 'pending' | 'running' | 'ok' | 'fail' | 'cancel';
  type PanelPage = 'plan_list' | 'plan_builder' | 'plan_history';

  interface PlanExecutionState {
    runId: string;
    planId: string;
    steps: PlanStep[];
    currentStepIndex: number;
    hadFailure: boolean;
    stepStatuses: PlanStepExecUiStatus[];
  }

  const progressMessage = '显示进度...';
  const MAX_PLAN_STEP_ACTIVITY = 200;
  const [planStepActivity, setPlanStepActivity] = useState<Record<string, PlanStepActivityLine[]>>({});
  const [panelNotice, setPanelNotice] = useState<string | null>(null);
  const [panelPage, setPanelPage] = useState<PanelPage>('plan_list');
  const [planMetadatas, setPlanMetadatas] = useState<PlanSessionMetadata[]>([]);
  const [planRunsByPlanId, setPlanRunsByPlanId] = useState<Record<string, PlanRun[]>>({});
  const [currentPlan, setCurrentPlan] = useState<PlanSession | null>(null);
  const [planExecution, setPlanExecution] = useState<PlanExecutionState | null>(null);
  const [lastTaskTerminal, setLastTaskTerminal] = useState<ExecutionState | null>(null);
  const [isFollowUpMode, setIsFollowUpMode] = useState(false);
  const [hasConfiguredModels, setHasConfiguredModels] = useState<boolean | null>(null); // null = loading, false = no models, true = has models
  const [taskAwaitingUserResume, setTaskAwaitingUserResume] = useState(false);
  const [userPauseHint, setUserPauseHint] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const planExecutionRef = useRef<PlanExecutionState | null>(null);
  const portRef = useRef<chrome.runtime.Port | null>(null);
  const heartbeatIntervalRef = useRef<number | null>(null);

  // Check if models are configured
  const checkModelConfiguration = useCallback(async () => {
    try {
      const configuredAgents = await agentModelStore.getConfiguredAgents();

      // Check if at least one agent (preferably Navigator) is configured
      const hasAtLeastOneModel = configuredAgents.length > 0;
      setHasConfiguredModels(hasAtLeastOneModel);
    } catch (error) {
      console.error('Error checking model configuration:', error);
      setHasConfiguredModels(false);
    }
  }, []);

  // Check model configuration on mount
  useEffect(() => {
    checkModelConfiguration();
  }, [checkModelConfiguration]);

  // Re-check model configuration when the side panel becomes visible again
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        checkModelConfiguration();
      }
    };

    const handleFocus = () => {
      checkModelConfiguration();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [checkModelConfiguration]);

  useEffect(() => {
    planExecutionRef.current = planExecution;
  }, [planExecution]);

  const releasePlanDedicatedTab = useCallback(() => {
    try {
      if (portRef.current?.name !== 'side-panel-connection') return;
      portRef.current.postMessage({ type: 'plan_dedicated_tab_close' });
    } catch (e) {
      console.error('plan_dedicated_tab_close failed:', e);
    }
  }, []);

  useEffect(() => {
    setPlanStepActivity({});
  }, [currentPlan?.id]);

  const appendPlanStepActivityLine = useCallback((stepId: string, line: Omit<PlanStepActivityLine, 'id'>) => {
    setPlanStepActivity(prev => {
      const row: PlanStepActivityLine = { ...line, id: crypto.randomUUID() };
      const cur = [...(prev[stepId] ?? []), row];
      const capped = cur.length > MAX_PLAN_STEP_ACTIVITY ? cur.slice(-MAX_PLAN_STEP_ACTIVITY) : cur;
      return { ...prev, [stepId]: capped };
    });
  }, []);

  const handleTaskState = useCallback(
    (event: AgentEvent) => {
      const { actor, state, timestamp, data } = event;
      const content = data?.details;
      const durationSuffix = formatDurationSuffix(event);
      const contentWithDuration = content?.trim() ? `${content}${durationSuffix}` : durationSuffix;
      let skip = true;
      let displayProgress = false;

      switch (actor) {
        case Actors.SYSTEM:
          switch (state) {
            case ExecutionState.TASK_START:
              setTaskAwaitingUserResume(false);
              setUserPauseHint(null);
              break;
            case ExecutionState.TASK_OK:
              // Each plan step should be independent: do not reuse follow-up mode.
              setIsFollowUpMode(false);
              setTaskAwaitingUserResume(false);
              setUserPauseHint(null);
              break;
            case ExecutionState.TASK_FAIL:
              // Each plan step should be independent: do not reuse follow-up mode.
              setIsFollowUpMode(false);
              setTaskAwaitingUserResume(false);
              setUserPauseHint(null);
              skip = false;
              break;
            case ExecutionState.TASK_CANCEL:
              setIsFollowUpMode(false);
              setTaskAwaitingUserResume(false);
              setUserPauseHint(null);
              skip = false;
              break;
            case ExecutionState.TASK_PAUSE:
              setTaskAwaitingUserResume(true);
              setUserPauseHint(content?.trim() ? content : null);
              skip = false;
              break;
            case ExecutionState.TASK_RESUME:
              setTaskAwaitingUserResume(false);
              setUserPauseHint(null);
              skip = false;
              break;
            default:
              console.error('Invalid task state', state);
              return;
          }
          break;
        case Actors.USER:
          break;
        case Actors.PLANNER:
          switch (state) {
            case ExecutionState.STEP_START:
              displayProgress = true;
              break;
            case ExecutionState.STEP_OK:
              skip = false;
              break;
            case ExecutionState.STEP_FAIL:
              skip = false;
              break;
            case ExecutionState.STEP_CANCEL:
              break;
            default:
              console.error('Invalid step state', state);
              return;
          }
          break;
        case Actors.NAVIGATOR:
          switch (state) {
            case ExecutionState.STEP_START:
              displayProgress = true;
              break;
            case ExecutionState.STEP_OK:
              displayProgress = false;
              break;
            case ExecutionState.STEP_FAIL:
              skip = false;
              displayProgress = false;
              break;
            case ExecutionState.STEP_CANCEL:
              displayProgress = false;
              break;
            case ExecutionState.ACT_START:
              if (content !== 'cache_content') {
                // skip to display caching content
                skip = false;
              }
              break;
            case ExecutionState.ACT_OK:
              skip = true;
              break;
            case ExecutionState.ACT_FAIL:
              skip = false;
              break;
            default:
              console.error('Invalid action', state);
              return;
          }
          break;
        case Actors.VALIDATOR:
          // Handle legacy validator events from historical messages
          switch (state) {
            case ExecutionState.STEP_START:
              displayProgress = true;
              break;
            case ExecutionState.STEP_OK:
              skip = false;
              break;
            case ExecutionState.STEP_FAIL:
              skip = false;
              break;
            default:
              console.error('Invalid validation', state);
              return;
          }
          break;
        default:
          console.error('Unknown actor', actor);
          return;
      }

      if (
        actor === Actors.SYSTEM &&
        (state === ExecutionState.TASK_OK || state === ExecutionState.TASK_FAIL || state === ExecutionState.TASK_CANCEL)
      ) {
        setLastTaskTerminal(state);
      }

      const executionSnapshot = planExecutionRef.current;
      const activePlanStepId = executionSnapshot?.steps[executionSnapshot.currentStepIndex]?.id ?? null;

      if (activePlanStepId) {
        if (displayProgress) {
          appendPlanStepActivityLine(activePlanStepId, {
            actor,
            state,
            content: progressMessage,
            timestamp,
            isProgress: true,
          });
        }
        if (!skip) {
          appendPlanStepActivityLine(activePlanStepId, {
            actor,
            state,
            content: contentWithDuration || '',
            timestamp,
            isProgress: false,
          });
        } else if (
          (actor === Actors.NAVIGATOR || actor === Actors.PLANNER) &&
          (state === ExecutionState.STEP_OK ||
            state === ExecutionState.STEP_FAIL ||
            state === ExecutionState.STEP_CANCEL ||
            state === ExecutionState.ACT_OK ||
            state === ExecutionState.ACT_FAIL)
        ) {
          appendPlanStepActivityLine(activePlanStepId, {
            actor,
            state,
            content: contentWithDuration || '',
            timestamp,
            isProgress: false,
          });
        } else if (
          actor === Actors.SYSTEM &&
          (state === ExecutionState.TASK_START ||
            state === ExecutionState.TASK_OK ||
            state === ExecutionState.TASK_PAUSE ||
            state === ExecutionState.TASK_RESUME)
        ) {
          appendPlanStepActivityLine(activePlanStepId, {
            actor,
            state,
            content: contentWithDuration || '',
            timestamp,
            isProgress: false,
          });
        }
      } else {
        if (!skip) {
          const msg =
            contentWithDuration && String(contentWithDuration).trim()
              ? String(contentWithDuration)
              : `${actor}: ${state}`;
          setPanelNotice(msg);
        } else if (displayProgress) {
          setPanelNotice(progressMessage);
        }
      }
    },
    [appendPlanStepActivityLine],
  );

  // Stop heartbeat and close connection
  const stopConnection = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    if (portRef.current) {
      portRef.current.disconnect();
      portRef.current = null;
    }
  }, []);

  const loadPlanMetadatas = useCallback(async () => {
    try {
      const metas = await planHistoryStore.getPlanMetadatas();
      setPlanMetadatas(metas.sort((a, b) => b.updatedAt - a.updatedAt));
    } catch (error) {
      console.error('Failed to load plan sessions:', error);
    }
  }, []);

  useEffect(() => {
    if (hasConfiguredModels === true) {
      void loadPlanMetadatas();
    }
  }, [hasConfiguredModels, loadPlanMetadatas]);

  const loadPlanRuns = useCallback(async () => {
    try {
      const allRuns = await planHistoryStore.getPlanRuns();
      const grouped = allRuns.reduce<Record<string, PlanRun[]>>((acc, run) => {
        if (!acc[run.planId]) acc[run.planId] = [];
        acc[run.planId].push(run);
        return acc;
      }, {});
      setPlanRunsByPlanId(grouped);
    } catch (error) {
      console.error('Failed to load plan runs:', error);
    }
  }, []);

  // Setup connection management
  const setupConnection = useCallback(() => {
    // Only setup if no existing connection
    if (portRef.current) {
      return;
    }

    try {
      portRef.current = chrome.runtime.connect({ name: 'side-panel-connection' });

      portRef.current.onMessage.addListener(async (rawMessage: unknown) => {
        const parsed = sidePanelInternalMessageSchema.safeParse(rawMessage);
        if (!parsed.success) {
          console.warn('Ignoring unknown side-panel internal message', rawMessage);
          return;
        }
        const message: SidePanelInternalMessage = parsed.data;

        if (message.type === EventType.EXECUTION) {
          const parsedExecution = sidePanelExecutionAgentEventSchema.safeParse(message);
          if (!parsedExecution.success) {
            setPanelNotice(t('errors_unknown'));
            console.error('Invalid execution message payload', parsedExecution.error.flatten());
            return;
          }
          handleTaskState(parsedExecution.data as unknown as AgentEvent);
        } else if (message.type === 'error') {
          setPanelNotice(message.error || t('errors_unknown'));
        } else if (message.type === 'external_publish_received') {
          const publishSteps = message.payload.publishSteps ?? [];
          const normalizedSteps = publishSteps
            .map(step => step.trim())
            .filter(step => step.length > 0)
            .map((content, order) => ({
              id: crypto.randomUUID(),
              content,
              order,
            }));

          if (normalizedSteps.length > 0) {
            try {
              const parsedUrl = message.payload.touchpointUrl ? new URL(message.payload.touchpointUrl) : null;
              const host = parsedUrl?.hostname ?? 'external';
              const autoTitle = `Auto Publish Plan (${host})`;
              const plan = await planHistoryStore.createPlan(autoTitle);
              const savedPlan = await planHistoryStore.savePlanSteps(plan.id, normalizedSteps);
              setCurrentPlan(savedPlan);
              setPanelPage('plan_builder');
              await loadPlanMetadatas();
            } catch (error) {
              console.error('Failed to create plan from external publish steps:', error);
              setPanelNotice(error instanceof Error ? error.message : t('errors_unknown'));
              setPanelPage('plan_list');
            }
          }
        } else if (message.type === 'heartbeat_ack') {
          console.log('Heartbeat acknowledged');
        }
      });

      portRef.current.onDisconnect.addListener(() => {
        const error = chrome.runtime.lastError;
        console.log('Connection disconnected', error ? `Error: ${error.message}` : '');
        portRef.current = null;
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
          heartbeatIntervalRef.current = null;
        }
        setTaskAwaitingUserResume(false);
        setUserPauseHint(null);
      });

      // Setup heartbeat interval
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }

      heartbeatIntervalRef.current = window.setInterval(() => {
        if (portRef.current?.name === 'side-panel-connection') {
          try {
            portRef.current.postMessage({ type: 'heartbeat' });
          } catch (error) {
            console.error('Heartbeat failed:', error);
            stopConnection(); // Stop connection if heartbeat fails
          }
        } else {
          stopConnection(); // Stop if port is invalid
        }
      }, 25000);
    } catch (error) {
      console.error('Failed to establish connection:', error);
      setPanelNotice(t('errors_conn_serviceWorker'));
      portRef.current = null;
    }
  }, [handleTaskState, stopConnection, loadPlanMetadatas]);

  // Add safety check for message sending
  const sendMessage = useCallback(
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    (message: any) => {
      if (portRef.current?.name !== 'side-panel-connection') {
        throw new Error('No valid connection available');
      }
      try {
        portRef.current.postMessage(message);
      } catch (error) {
        console.error('Failed to send message:', error);
        stopConnection(); // Stop connection when message sending fails
        throw error;
      }
    },
    [stopConnection],
  );

  // Connect as soon as side panel is opened
  useEffect(() => {
    setupConnection();
  }, [setupConnection]);

  const handleSendMessage = useCallback(
    async (text: string, displayText?: string) => {
      console.log('handleSendMessage', text);

      const trimmedText = text.trim();

      if (!trimmedText) return;

      try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const tabId = tabs[0]?.id;
        if (!tabId) {
          throw new Error('No active tab found');
        }

        if (!isFollowUpMode) {
          sessionIdRef.current = crypto.randomUUID();
        }

        const userMessage = {
          actor: Actors.USER,
          content: displayText || text,
          timestamp: Date.now(),
        };

        const planExecSnap = planExecutionRef.current;
        const planStepIdForUser = planExecSnap?.steps[planExecSnap.currentStepIndex]?.id;
        if (planStepIdForUser) {
          appendPlanStepActivityLine(planStepIdForUser, {
            actor: Actors.USER,
            content: userMessage.content,
            timestamp: userMessage.timestamp,
            isProgress: false,
          });
        }

        if (!portRef.current) {
          setupConnection();
        }

        const planDedicatedTab = Boolean(planExecutionRef.current);

        if (isFollowUpMode) {
          await sendMessage({
            type: 'follow_up_task',
            task: text,
            taskId: sessionIdRef.current,
            tabId,
            planDedicatedTab,
          });
          console.log('follow_up_task sent', text, tabId, sessionIdRef.current);
        } else {
          await sendMessage({
            type: 'new_task',
            task: text,
            taskId: sessionIdRef.current,
            tabId,
            planDedicatedTab,
          });
          console.log('new_task sent', text, tabId, sessionIdRef.current);
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error('Task error', errorMessage);
        const ex = planExecutionRef.current;
        const sid = ex?.steps[ex.currentStepIndex]?.id;
        if (sid) {
          appendPlanStepActivityLine(sid, {
            actor: Actors.SYSTEM,
            state: ExecutionState.TASK_FAIL,
            content: errorMessage,
            timestamp: Date.now(),
            isProgress: false,
          });
        } else {
          setPanelNotice(errorMessage);
        }
        stopConnection();
      }
    },
    [appendPlanStepActivityLine, isFollowUpMode, sendMessage, setupConnection, stopConnection],
  );

  const handleStopTask = async () => {
    try {
      portRef.current?.postMessage({
        type: 'cancel_task',
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('cancel_task error', errorMessage);
      const ex = planExecutionRef.current;
      const sid = ex?.steps[ex.currentStepIndex]?.id;
      if (sid) {
        appendPlanStepActivityLine(sid, {
          actor: Actors.SYSTEM,
          state: ExecutionState.TASK_FAIL,
          content: errorMessage,
          timestamp: Date.now(),
          isProgress: false,
        });
      } else {
        setPanelNotice(errorMessage);
      }
    }
  };

  const handleResumeTask = () => {
    try {
      if (portRef.current?.name !== 'side-panel-connection') {
        setupConnection();
      }
      portRef.current?.postMessage({ type: 'resume_task' });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('resume_task error', errorMessage);
      const ex = planExecutionRef.current;
      const sid = ex?.steps[ex.currentStepIndex]?.id;
      if (sid) {
        appendPlanStepActivityLine(sid, {
          actor: Actors.SYSTEM,
          state: ExecutionState.TASK_FAIL,
          content: errorMessage,
          timestamp: Date.now(),
          isProgress: false,
        });
      } else {
        setPanelNotice(errorMessage);
      }
    }
  };

  useEffect(() => {
    const run = async () => {
      if (!planExecutionRef.current || !lastTaskTerminal) return;

      const execution = planExecutionRef.current;
      const currentStep = execution.steps[execution.currentStepIndex];
      if (!currentStep) return;

      const stepStatus =
        lastTaskTerminal === ExecutionState.TASK_OK
          ? 'ok'
          : lastTaskTerminal === ExecutionState.TASK_FAIL
            ? 'fail'
            : 'cancel';

      const nextStepStatuses = [...execution.stepStatuses];
      nextStepStatuses[execution.currentStepIndex] = stepStatus;

      await planHistoryStore.setStepRunFinished(execution.runId, currentStep.id, stepStatus);

      if (lastTaskTerminal === ExecutionState.TASK_CANCEL) {
        await planHistoryStore.finishRun(execution.runId, 'cancel');
        setPlanExecution(null);
        releasePlanDedicatedTab();
        setLastTaskTerminal(null);
        await loadPlanRuns();
        return;
      }

      // Plan-level fail-fast: when one task fails, stop the whole plan.
      if (lastTaskTerminal === ExecutionState.TASK_FAIL) {
        await planHistoryStore.finishRun(execution.runId, 'fail');
        setPlanExecution(null);
        releasePlanDedicatedTab();
        setLastTaskTerminal(null);
        await loadPlanRuns();
        return;
      }

      const hadFailure = execution.hadFailure || stepStatus === 'fail';
      const nextStepIndex = execution.currentStepIndex + 1;

      if (nextStepIndex >= execution.steps.length) {
        await planHistoryStore.finishRun(execution.runId, hadFailure ? 'fail' : 'ok');
        setPlanExecution(null);
        releasePlanDedicatedTab();
        setLastTaskTerminal(null);
        await loadPlanRuns();
        return;
      }

      nextStepStatuses[nextStepIndex] = 'running';
      const nextExecution: PlanExecutionState = {
        ...execution,
        currentStepIndex: nextStepIndex,
        hadFailure,
        stepStatuses: nextStepStatuses,
      };
      setPlanExecution(nextExecution);
      await handleSendMessage(nextExecution.steps[nextStepIndex].content);
      await planHistoryStore.setStepRunStarted(
        nextExecution.runId,
        nextExecution.steps[nextStepIndex].id,
        sessionIdRef.current ?? undefined,
      );
      setLastTaskTerminal(null);
      await loadPlanRuns();
    };

    void run();
  }, [handleSendMessage, lastTaskTerminal, loadPlanRuns, releasePlanDedicatedTab]);

  const handleCreatePlan = async () => {
    const newPlan = await planHistoryStore.createPlan('New Plan');
    setCurrentPlan(newPlan);
    setPanelPage('plan_builder');
    await loadPlanMetadatas();
  };

  const handleSavePlan = useCallback(
    async (steps: PlanStep[], title: string) => {
      let targetPlan = currentPlan;
      if (!targetPlan) {
        targetPlan = await planHistoryStore.createPlan(title.trim() || 'New Plan');
      }
      const trimmedTitle = title.trim();
      if (trimmedTitle && trimmedTitle !== targetPlan.title.trim()) {
        await planHistoryStore.updatePlanTitle(targetPlan.id, trimmedTitle);
      }
      const savedPlan = await planHistoryStore.savePlanSteps(targetPlan.id, steps);
      setCurrentPlan({
        ...savedPlan,
        title: trimmedTitle || savedPlan.title,
      });
      await loadPlanMetadatas();
    },
    [currentPlan, loadPlanMetadatas],
  );

  const handleExecutePlan = async (steps: PlanStep[], title: string) => {
    if (!currentPlan) return;
    const cleanedSteps = steps.filter(step => step.content.trim() !== '').map((step, order) => ({ ...step, order }));
    if (cleanedSteps.length === 0) return;
    setPlanStepActivity({});

    const titleTrimmed = title.trim();
    if (titleTrimmed && titleTrimmed !== currentPlan.title) {
      await planHistoryStore.updatePlanTitle(currentPlan.id, titleTrimmed);
    }
    const savedPlan = await planHistoryStore.savePlanSteps(currentPlan.id, cleanedSteps);
    setCurrentPlan({
      ...savedPlan,
      title: titleTrimmed || savedPlan.title,
    });
    await loadPlanMetadatas();

    const run = await planHistoryStore.startRun(currentPlan.id, cleanedSteps);
    const stepStatuses: PlanStepExecUiStatus[] = cleanedSteps.map((_, i) => (i === 0 ? 'running' : 'pending'));
    const execution: PlanExecutionState = {
      runId: run.id,
      planId: currentPlan.id,
      steps: cleanedSteps,
      currentStepIndex: 0,
      hadFailure: false,
      stepStatuses,
    };
    setPlanExecution(execution);
    setPanelPage('plan_builder');
    setIsFollowUpMode(false);
    await handleSendMessage(cleanedSteps[0].content);
    await planHistoryStore.setStepRunStarted(run.id, cleanedSteps[0].id, sessionIdRef.current ?? undefined);
    await loadPlanRuns();
  };

  const handleLoadHistory = async () => {
    await loadPlanMetadatas();
    await loadPlanRuns();
    setPanelPage('plan_history');
  };

  const handleBackToPlanList = async () => {
    if (planExecutionRef.current) {
      await handleStopTask();
    }
    setPanelPage('plan_list');
  };

  const handlePlanSelect = async (planId: string) => {
    try {
      const plan = await planHistoryStore.getPlan(planId);
      if (plan) {
        setPanelNotice(null);
        setCurrentPlan(plan);
        setPanelPage('plan_builder');
      } else {
        setPanelPage('plan_list');
        setPanelNotice('Plan not found');
      }
    } catch (error) {
      console.error('Failed to load plan:', error);
      setPanelPage('plan_list');
      setPanelNotice(error instanceof Error ? error.message : t('errors_unknown'));
    }
  };

  const handlePlanDelete = async (planId: string) => {
    try {
      await planHistoryStore.deletePlan(planId);
      await loadPlanMetadatas();
      await loadPlanRuns();
      if (currentPlan?.id === planId) {
        setCurrentPlan(null);
      }
    } catch (error) {
      console.error('Failed to delete plan:', error);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopConnection();
    };
  }, [stopConnection]);

  const panelClassName =
    'bg-gradient-to-b from-[#fff4e8] via-[#ffedd9] to-[#ffe3c6] border-[#fdb56f]/35 shadow-[0_0_0_1px_rgba(253,181,111,0.15),0_10px_28px_rgba(253,181,111,0.18)]';
  const iconClassName = 'text-[#fdb56f] hover:text-[#ee9b47]';
  const helperTextClassName = '';
  const spinnerBorderClassName = '';
  const setupButtonClassName = 'bg-[#fdb56f] text-white hover:bg-[#ee9b47]';
  const panelBackgroundStyle = { backgroundColor: '#fff1e3' };

  return (
    <div>
      <div
        className={`flex h-screen flex-col ${panelClassName} overflow-hidden rounded-2xl border`}
        style={panelBackgroundStyle}>
        <header className="header relative">
          <div className="header-logo">
            {panelPage === 'plan_history' || panelPage === 'plan_builder' ? (
              <button
                type="button"
                onClick={() => {
                  void handleBackToPlanList();
                }}
                className={`${iconClassName} cursor-pointer`}
                aria-label={t('nav_back_a11y')}>
                {t('nav_back')}
              </button>
            ) : (
              <img src="/landscape.png" alt="Extension Logo" className="h-6" />
            )}
          </div>
          <div className="header-icons">
            {panelPage === 'plan_list' && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    void handleCreatePlan();
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      void handleCreatePlan();
                    }
                  }}
                  className={`header-icon ${iconClassName} cursor-pointer`}
                  aria-label={t('nav_newChat_a11y')}
                  tabIndex={0}>
                  <PiPlusBold size={20} />
                </button>
                <button
                  type="button"
                  onClick={handleLoadHistory}
                  onKeyDown={e => e.key === 'Enter' && handleLoadHistory()}
                  className={`header-icon ${iconClassName} cursor-pointer`}
                  aria-label={t('nav_loadHistory_a11y')}
                  tabIndex={0}>
                  <GrHistory size={20} />
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => chrome.runtime.openOptionsPage()}
              onKeyDown={e => e.key === 'Enter' && chrome.runtime.openOptionsPage()}
              className={`header-icon ${iconClassName} cursor-pointer`}
              aria-label={t('nav_settings_a11y')}
              tabIndex={0}>
              <FiSettings size={20} />
            </button>
          </div>
        </header>
        {panelPage === 'plan_history' ? (
          <div className="flex-1 overflow-hidden">
            <PlanHistoryList
              plans={planMetadatas}
              runsByPlanId={planRunsByPlanId}
              onPlanSelect={handlePlanSelect}
              onPlanDelete={handlePlanDelete}
              visible={true}
            />
          </div>
        ) : (
          <>
            {/* Show loading state while checking model configuration */}
            {hasConfiguredModels === null && (
              <div className={`flex flex-1 items-center justify-center p-8 ${helperTextClassName}`}>
                <div className="text-center">
                  <div
                    className={`mx-auto mb-4 size-8 animate-spin rounded-full border-2 ${spinnerBorderClassName} border-t-transparent`}></div>
                  <p>{t('status_checkingConfig')}</p>
                </div>
              </div>
            )}

            {/* Show setup message when no models are configured */}
            {hasConfiguredModels === false && (
              <div className={`flex flex-1 items-center justify-center p-8 ${helperTextClassName}`}>
                <div className="max-w-md text-center">
                  <img src="/landscape.png" alt="iBB8 Logo" className="mx-auto mb-4 h-16" />

                  <p className="mb-4">{t('welcome_instruction')}</p>
                  <button
                    onClick={() => chrome.runtime.openOptionsPage()}
                    className={`my-4 rounded-lg px-4 py-2 font-medium transition-colors ${setupButtonClassName}`}>
                    {t('welcome_openSettings')}
                  </button>
                </div>
              </div>
            )}

            {/* Plan UI when models are configured */}
            {hasConfiguredModels === true && panelPage === 'plan_list' && (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-t border-[#fdb56f]/20">
                <PlanListSidebar
                  plans={planMetadatas}
                  currentPlanId={currentPlan?.id ?? null}
                  disabled={!!planExecution}
                  onCreatePlan={() => {
                    void handleCreatePlan();
                  }}
                  onSelectPlan={planId => {
                    void handlePlanSelect(planId);
                  }}
                  onDeletePlan={handlePlanDelete}
                />
              </div>
            )}

            {hasConfiguredModels === true && panelPage === 'plan_builder' && (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-t border-[#fdb56f]/20">
                <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                  {panelNotice ? (
                    <div
                      role="status"
                      className="mx-3 mt-2 flex items-start justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                      <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{panelNotice}</span>
                      <button
                        type="button"
                        onClick={() => setPanelNotice(null)}
                        className="shrink-0 rounded px-1 text-amber-800 hover:bg-amber-100"
                        aria-label="Dismiss">
                        ×
                      </button>
                    </div>
                  ) : null}
                  <div className="min-h-0 flex-1 overflow-hidden">
                    {currentPlan ? (
                      <PlanBuilder
                        plan={currentPlan}
                        executing={!!planExecution}
                        runningStepId={
                          planExecution ? (planExecution.steps[planExecution.currentStepIndex]?.id ?? null) : null
                        }
                        stepStatusByStepId={
                          planExecution
                            ? Object.fromEntries(
                                planExecution.steps.map((s, i) => [s.id, planExecution.stepStatuses[i]]),
                              )
                            : undefined
                        }
                        activityByStepId={planStepActivity}
                        onCreatePlan={handleCreatePlan}
                        onSave={handleSavePlan}
                        onExecute={handleExecutePlan}
                        onStopTask={handleStopTask}
                        taskAwaitingUserResume={taskAwaitingUserResume}
                        userPauseHint={userPauseHint}
                        onResumeTask={handleResumeTask}
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center p-6">
                        <button
                          type="button"
                          onClick={() => {
                            void handleCreatePlan();
                          }}
                          className="rounded-md bg-[#fdb56f] px-4 py-2 text-sm font-medium text-white hover:bg-[#ee9b47]">
                          {t('nav_planList_create')}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default SidePanel;
