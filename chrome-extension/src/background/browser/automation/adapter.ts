import type { AutomationCDPSession, AutomationPageHandle } from './types';
import { createAutomationConnector, type AutomationConnector } from './connector';

export type AutomationEngine = 'cdp' | 'hybrid';
export type AutomationConnectorMode = 'auto' | 'chrome-debugger';

export interface PageAutomationAdapter {
  readonly engine: AutomationEngine;
  attach(tabId: number): Promise<AutomationPageHandle>;
  ensureAttached(tabId: number): Promise<AutomationPageHandle>;
  detach(): Promise<void>;
  getCDPSession(): AutomationCDPSession | null;
  isAttached(): boolean;
}

class CdpBackedAutomationAdapter implements PageAutomationAdapter {
  readonly engine: AutomationEngine;
  private readonly connector: AutomationConnector;
  private pageHandle: AutomationPageHandle | null = null;
  private cdpSession: AutomationCDPSession | null = null;
  private disconnectFn: (() => Promise<void>) | null = null;

  constructor(engine: AutomationEngine, connectorMode: AutomationConnectorMode = 'auto') {
    this.engine = engine;
    this.connector = createAutomationConnector(engine, connectorMode);
  }

  async attach(tabId: number): Promise<AutomationPageHandle> {
    if (this.pageHandle && this.cdpSession && this.disconnectFn) {
      return this.pageHandle;
    }
    const { pageHandle, cdpSession, disconnect } = await this.connector.connectToTab(tabId);
    this.pageHandle = pageHandle;
    this.cdpSession = cdpSession;
    this.disconnectFn = disconnect;
    return pageHandle;
  }

  async ensureAttached(tabId: number): Promise<AutomationPageHandle> {
    if (this.pageHandle && this.cdpSession && this.disconnectFn) {
      return this.pageHandle;
    }
    return await this.attach(tabId);
  }

  async detach(): Promise<void> {
    if (this.disconnectFn) {
      await this.disconnectFn();
    }
    this.disconnectFn = null;
    this.cdpSession = null;
    this.pageHandle = null;
  }

  getCDPSession(): AutomationCDPSession | null {
    return this.cdpSession;
  }

  isAttached(): boolean {
    return this.pageHandle !== null && this.cdpSession !== null && this.disconnectFn !== null;
  }
}

export function createPageAutomationAdapter(
  engine: AutomationEngine,
  connectorMode: AutomationConnectorMode = 'auto',
): PageAutomationAdapter {
  // Current migration stage: all engines are served by the same CDP-backed adapter,
  // but the engine flag enables phased routing and observability.
  return new CdpBackedAutomationAdapter(engine, connectorMode);
}
