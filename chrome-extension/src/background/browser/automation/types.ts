export type { Protocol as AutomationProtocol } from 'devtools-protocol';

export interface AutomationCDPSession {
  id?(): string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  send<T = any>(method: string, params?: Record<string, unknown>): Promise<T>;
  on<TArgs extends unknown[]>(event: string, listener: (...args: TArgs) => void): void;
  off<TArgs extends unknown[]>(event: string, listener: (...args: TArgs) => void): void;
}

export interface AutomationPageHandle {
  tabId: number;
  implementation: 'chrome-debugger';
}
