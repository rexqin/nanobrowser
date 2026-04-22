import type { AutomationCDPSession, AutomationPageHandle } from './types';
import type { AutomationConnectorMode, AutomationEngine } from './adapter';

export interface AutomationConnection {
  pageHandle: AutomationPageHandle;
  cdpSession: AutomationCDPSession;
  disconnect: () => Promise<void>;
}

export interface AutomationConnector {
  connectToTab(tabId: number): Promise<AutomationConnection>;
}

type AutomationEventListener = (...args: unknown[]) => void;

function getChromeRuntimeErrorMessage(prefix: string): string {
  const details = chrome.runtime.lastError?.message ?? 'unknown chrome runtime error';
  return `[automation:chrome-debugger] ${prefix}: ${details}`;
}

class ChromeDebuggerSession implements AutomationCDPSession {
  private readonly debuggee: chrome.debugger.Debuggee;
  private readonly listenersByEvent = new Map<string, Set<AutomationEventListener>>();
  private readonly eventRouter: (source: chrome.debugger.Debuggee, method: string, params?: object) => void;

  constructor(tabId: number) {
    this.debuggee = { tabId };
    this.eventRouter = (source, method, params) => {
      if (source.tabId !== this.debuggee.tabId) {
        return;
      }
      const listeners = this.listenersByEvent.get(method);
      if (!listeners || listeners.size === 0) {
        return;
      }
      for (const listener of listeners) {
        listener(params);
      }
    };
    chrome.debugger.onEvent.addListener(this.eventRouter);
  }

  async send<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> {
    return await new Promise<T>((resolve, reject) => {
      chrome.debugger.sendCommand(this.debuggee, method, params, result => {
        if (chrome.runtime.lastError) {
          reject(new Error(getChromeRuntimeErrorMessage(`sendCommand failed (${method})`)));
          return;
        }
        resolve(result as T);
      });
    });
  }

  on<TArgs extends unknown[]>(event: string, listener: (...args: TArgs) => void): void {
    const listeners = this.listenersByEvent.get(event) ?? new Set<AutomationEventListener>();
    listeners.add(listener as AutomationEventListener);
    this.listenersByEvent.set(event, listeners);
  }

  off<TArgs extends unknown[]>(event: string, listener: (...args: TArgs) => void): void {
    const listeners = this.listenersByEvent.get(event);
    if (!listeners) {
      return;
    }
    listeners.delete(listener as AutomationEventListener);
    if (listeners.size === 0) {
      this.listenersByEvent.delete(event);
    }
  }

  async disconnect(): Promise<void> {
    chrome.debugger.onEvent.removeListener(this.eventRouter);
    this.listenersByEvent.clear();
    await new Promise<void>((resolve, reject) => {
      chrome.debugger.detach(this.debuggee, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(getChromeRuntimeErrorMessage('detach failed')));
          return;
        }
        resolve();
      });
    });
  }
}

class ChromeDebuggerConnector implements AutomationConnector {
  private async runHealthProbe(session: AutomationCDPSession): Promise<void> {
    await session.send('Page.enable');
    await session.send('Runtime.enable');
  }

  async connectToTab(tabId: number): Promise<AutomationConnection> {
    const debuggee: chrome.debugger.Debuggee = { tabId };
    await new Promise<void>((resolve, reject) => {
      chrome.debugger.attach(debuggee, '1.3', () => {
        if (chrome.runtime.lastError) {
          reject(new Error(getChromeRuntimeErrorMessage(`attach failed (tabId=${tabId})`)));
          return;
        }
        resolve();
      });
    });

    const cdpSession = new ChromeDebuggerSession(tabId);
    try {
      await this.runHealthProbe(cdpSession);
    } catch (error) {
      await cdpSession.disconnect().catch(() => undefined);
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`[automation:chrome-debugger] health probe failed (tabId=${tabId}): ${message}`);
    }
    return {
      pageHandle: { tabId, implementation: 'chrome-debugger' },
      cdpSession,
      disconnect: async () => {
        await cdpSession.disconnect();
      },
    };
  }
}

export function createAutomationConnector(
  engine: AutomationEngine,
  connectorMode: AutomationConnectorMode = 'auto',
): AutomationConnector {
  void engine;
  void connectorMode;
  return new ChromeDebuggerConnector();
}
