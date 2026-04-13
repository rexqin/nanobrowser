import { useEffect, useMemo, useRef, useState } from 'react';
import { Actors, type PlanSession, type PlanStep } from '@extension/storage';
import { t } from '@extension/i18n';

type PlanStepUiExecStatus = 'pending' | 'running' | 'ok' | 'fail' | 'cancel';

/** One log line under a plan step (User / Planner / Navigator / System, etc.) */
export interface PlanStepActivityLine {
  id: string;
  actor: Actors;
  state?: string;
  content: string;
  timestamp: number;
  isProgress: boolean;
}

interface PlanBuilderProps {
  plan: PlanSession | null;
  executing: boolean;
  runningStepId?: string | null;
  stepStatusByStepId?: Record<string, PlanStepUiExecStatus>;
  activityByStepId?: Record<string, PlanStepActivityLine[]>;
  onCreatePlan: () => Promise<void>;
  onSave: (steps: PlanStep[], title: string) => Promise<void>;
  onExecute: (steps: PlanStep[], title: string) => Promise<void>;
  onStopTask: () => void;
  taskAwaitingUserResume?: boolean;
  /** Latest TASK_PAUSE detail from backend (planner hint); fallback to generic i18n if empty. */
  userPauseHint?: string | null;
  onResumeTask?: () => void;
}

const createStep = (order: number): PlanStep => ({
  id: crypto.randomUUID(),
  content: '',
  order,
});

function actorDisplayName(actor: Actors): string {
  switch (actor) {
    case Actors.USER:
      return t('nav_planBuilder_actor_user');
    case Actors.PLANNER:
      return t('nav_planBuilder_actor_planner');
    case Actors.NAVIGATOR:
      return t('nav_planBuilder_actor_navigator');
    case Actors.SYSTEM:
      return t('nav_planBuilder_actor_system');
    case Actors.VALIDATOR:
      return t('nav_planBuilder_actor_validator');
    default:
      return String(actor);
  }
}

function PlanStepActivityLog({ lines, autoScroll }: { lines: PlanStepActivityLine[]; autoScroll: boolean }) {
  const endRef = useRef<HTMLDivElement>(null);
  const lastId = lines.at(-1)?.id;

  useEffect(() => {
    if (autoScroll && lastId) {
      endRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [autoScroll, lastId]);

  if (lines.length === 0) return null;

  return (
    <div className="mt-2 max-h-40 overflow-y-auto rounded border border-[#fdb56f]/15 bg-[#fffdfb] px-2 py-1.5">
      <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-[#a35b19]">
        {t('nav_planBuilder_activity')}
      </p>
      <ul className="space-y-1.5">
        {lines.map(line => (
          <li key={line.id} className="text-[11px] leading-snug">
            <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0">
              <span className={`font-semibold ${line.isProgress ? 'text-amber-800' : 'text-[#6f3909]'}`}>
                {actorDisplayName(line.actor)}
              </span>
              {line.state ? (
                <span className="rounded bg-[#fff3e0] px-1 font-mono text-[9px] text-[#8a490d]">{line.state}</span>
              ) : null}
            </div>
            {line.content ? (
              <p
                className={`mt-0.5 whitespace-pre-wrap break-words pl-0.5 ${line.isProgress ? 'italic text-amber-900/90' : 'text-[#5c3d1e]'}`}>
                {line.content}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
      <div ref={endRef} />
    </div>
  );
}

function stepStatusLabel(status: PlanStepUiExecStatus): string {
  switch (status) {
    case 'pending':
      return t('nav_planBuilder_status_pending');
    case 'running':
      return t('nav_planBuilder_status_running');
    case 'ok':
      return t('nav_planBuilder_status_done');
    case 'fail':
      return t('nav_planBuilder_status_failed');
    case 'cancel':
      return t('nav_planBuilder_status_cancelled');
    default:
      return '';
  }
}

export default function PlanBuilder({
  plan,
  executing,
  runningStepId,
  stepStatusByStepId,
  activityByStepId,
  onCreatePlan,
  onSave,
  onExecute,
  onStopTask,
  taskAwaitingUserResume = false,
  userPauseHint = null,
  onResumeTask,
}: PlanBuilderProps) {
  const [title, setTitle] = useState(plan?.title ?? t('nav_planBuilder_defaultTitle'));
  const [steps, setSteps] = useState<PlanStep[]>(plan?.steps ?? []);
  const [isSaving, setIsSaving] = useState(false);
  const [saveNotice, setSaveNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const saveNoticeTimerRef = useRef<number | null>(null);

  // Re-hydrate when switching plans or after save (updatedAt); avoid resetting on unrelated parent re-renders that replace `plan` by reference only.
  useEffect(() => {
    if (!plan) return;
    setTitle(plan.title ?? t('nav_planBuilder_defaultTitle'));
    setSteps(plan.steps ?? []);
  }, [plan?.id, plan?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps -- snapshot id + updatedAt

  useEffect(() => {
    return () => {
      if (saveNoticeTimerRef.current !== null) {
        window.clearTimeout(saveNoticeTimerRef.current);
      }
    };
  }, []);

  const sortedSteps = useMemo(() => [...steps].sort((a, b) => a.order - b.order), [steps]);

  const updateStep = (id: string, content: string) => {
    setSteps(prev => prev.map(step => (step.id === id ? { ...step, content } : step)));
  };

  const addStep = () => {
    setSteps(prev => [...prev, createStep(prev.length)]);
  };

  const removeStep = (id: string) => {
    setSteps(prev =>
      prev
        .filter(step => step.id !== id)
        .map((step, index) => ({
          ...step,
          order: index,
        })),
    );
  };

  const handleSave = async () => {
    if (saveNoticeTimerRef.current !== null) {
      window.clearTimeout(saveNoticeTimerRef.current);
      saveNoticeTimerRef.current = null;
    }
    setSaveNotice(null);
    setIsSaving(true);
    try {
      await onSave(
        sortedSteps.map((step, index) => ({
          ...step,
          order: index,
        })),
        title,
      );
      setSaveNotice({ type: 'ok', text: t('nav_planBuilder_saveSuccess') });
      saveNoticeTimerRef.current = window.setTimeout(() => {
        setSaveNotice(null);
        saveNoticeTimerRef.current = null;
      }, 2500);
    } catch (err) {
      console.error('Plan save failed', err);
      const text = err instanceof Error ? err.message : String(err);
      setSaveNotice({ type: 'err', text: text || t('nav_planBuilder_saveFail') });
    } finally {
      setIsSaving(false);
    }
  };

  const handleExecute = async () => {
    const validSteps = sortedSteps.filter(step => step.content.trim() !== '');
    if (validSteps.length === 0) return;
    await onExecute(validSteps, title);
  };

  const primaryActionLabel = taskAwaitingUserResume
    ? t('chat_buttons_resume')
    : executing
      ? t('chat_buttons_stop')
      : t('nav_planBuilder_execute');
  const primaryActionButtonClassName = taskAwaitingUserResume
    ? 'rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:bg-emerald-300 disabled:text-emerald-100'
    : executing
      ? 'rounded-md bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:bg-rose-300 disabled:text-rose-100'
      : 'rounded-md bg-[#fdb56f] px-3 py-2 text-sm font-medium text-white hover:bg-[#ee9b47] disabled:bg-[#f6d3b0] disabled:text-white/80';

  if (!plan) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <button
          type="button"
          onClick={() => void onCreatePlan()}
          className="rounded-md bg-[#fdb56f] px-4 py-2 font-medium text-white hover:bg-[#ee9b47]">
          {t('nav_planList_create')}
        </button>
      </div>
    );
  }

  return (
    <section className="flex h-full flex-col gap-3 p-3">
      {saveNotice ? (
        <div
          role="status"
          className={`rounded-md px-3 py-2 text-sm ${
            saveNotice.type === 'ok' ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-800'
          }`}>
          {saveNotice.text}
        </div>
      ) : null}
      <div className="rounded-lg border border-[#fdb56f]/25 bg-[#fffaf5] p-3">
        <label htmlFor="plan-title" className="mb-1 block text-xs text-[#8a490d]">
          {t('nav_planBuilder_titleLabel')}
        </label>
        <input
          id="plan-title"
          type="text"
          value={title}
          disabled={executing}
          onChange={e => {
            setTitle(e.target.value);
          }}
          className="w-full rounded-md border border-[#fdb56f]/30 bg-white px-3 py-2 text-sm text-[#6f3909] disabled:opacity-60"
          placeholder={t('nav_planBuilder_titlePlaceholder')}
        />
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto rounded-lg border border-[#fdb56f]/20 bg-[#fff8f1] p-3">
        {executing && (
          <div
            className={`flex flex-col gap-2 rounded-md border px-3 py-2 ${
              taskAwaitingUserResume ? 'border-amber-400/80 bg-amber-50/90' : 'border-[#fdb56f]/40 bg-white'
            }`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-[#8a490d]">
                {taskAwaitingUserResume ? t('exec_task_pause') : t('nav_planBuilder_runningHint')}
              </p>
            </div>
            {taskAwaitingUserResume ? (
              <p className="text-xs text-[#6f3909]/90">
                {userPauseHint?.trim() ? userPauseHint : t('exec_awaitUserLogin')}
              </p>
            ) : null}
          </div>
        )}
        {sortedSteps.length === 0 && <p className="text-sm text-[#a35b19]">{t('nav_planBuilder_emptySteps')}</p>}
        {sortedSteps.map((step, index) => (
          <div key={step.id} className="rounded-md border border-[#fdb56f]/25 bg-white p-2">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-[#8a490d]">
                {t('nav_planBuilder_stepLabel', [String(index + 1)])}
              </span>
              <div className="flex items-center gap-2">
                {stepStatusByStepId?.[step.id] ? (
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                      stepStatusByStepId[step.id] === 'running'
                        ? 'bg-amber-100 text-amber-900'
                        : stepStatusByStepId[step.id] === 'ok'
                          ? 'bg-emerald-100 text-emerald-800'
                          : stepStatusByStepId[step.id] === 'fail'
                            ? 'bg-red-100 text-red-800'
                            : stepStatusByStepId[step.id] === 'cancel'
                              ? 'bg-slate-100 text-slate-700'
                              : 'bg-[#fff3e0] text-[#8a490d]'
                    }`}>
                    {stepStatusLabel(stepStatusByStepId[step.id])}
                  </span>
                ) : null}
                <button
                  type="button"
                  disabled={executing}
                  onClick={() => removeStep(step.id)}
                  className="text-xs text-red-500 hover:text-red-600 disabled:opacity-40">
                  {t('nav_planBuilder_remove')}
                </button>
              </div>
            </div>
            <textarea
              value={step.content}
              disabled={executing}
              onChange={e => updateStep(step.id, e.target.value)}
              rows={3}
              className="w-full resize-y rounded-md border border-[#fdb56f]/20 p-2 text-sm text-[#6f3909] outline-none focus:border-[#fdb56f] disabled:opacity-60"
              placeholder={t('nav_planBuilder_stepPlaceholder')}
            />
            <PlanStepActivityLog
              lines={activityByStepId?.[step.id] ?? []}
              autoScroll={executing && runningStepId === step.id}
            />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          disabled={executing}
          onClick={addStep}
          className="rounded-md border border-[#fdb56f]/30 px-3 py-2 text-sm text-[#8a490d] disabled:opacity-50">
          {t('nav_planBuilder_addStep')}
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={executing || isSaving}
            className="rounded-md border border-[#fdb56f]/30 px-3 py-2 text-sm text-[#8a490d] disabled:opacity-50">
            {isSaving ? t('nav_planBuilder_saving') : t('nav_planBuilder_save')}
          </button>
          <button
            type="button"
            onClick={() => {
              if (taskAwaitingUserResume) {
                onResumeTask?.();
                return;
              }
              if (executing) {
                onStopTask();
                return;
              }
              void handleExecute();
            }}
            disabled={!executing && sortedSteps.every(step => step.content.trim() === '')}
            className={primaryActionButtonClassName}>
            {primaryActionLabel}
          </button>
        </div>
      </div>
    </section>
  );
}
