import type { AutomationCDPSession } from '../automation/types';

export interface NetworkWaitSnapshot {
  networkDetected: boolean;
  networkCompletedCount: number;
}

export class CdpNetworkWaiter {
  private trackingStarted = false;
  private networkDetected = false;
  private networkCompletedCount = 0;
  private readonly seenRequestIds = new Set<string>();

  private onRequestWillBeSent = (event: { requestId?: string; request?: { url?: string } }) => {
    if (!this.trackingStarted) return;
    const requestId = event.requestId;
    const url = event.request?.url ?? '';
    if (!requestId || !url || url.startsWith('data:')) return;
    this.networkDetected = true;
    this.seenRequestIds.add(requestId);
  };

  private onLoadingFinished = (event: { requestId?: string }) => {
    if (!this.trackingStarted) return;
    const requestId = event.requestId;
    if (!requestId) return;
    if (this.seenRequestIds.has(requestId)) {
      this.networkCompletedCount += 1;
    }
  };

  private onLoadingFailed = (event: { requestId?: string }) => {
    if (!this.trackingStarted) return;
    const requestId = event.requestId;
    if (!requestId) return;
    if (this.seenRequestIds.has(requestId)) {
      this.networkCompletedCount += 1;
    }
  };

  async start(cdp: AutomationCDPSession): Promise<void> {
    await cdp.send('Network.enable').catch(() => undefined);
    cdp.on('Network.requestWillBeSent', this.onRequestWillBeSent);
    cdp.on('Network.loadingFinished', this.onLoadingFinished);
    cdp.on('Network.loadingFailed', this.onLoadingFailed);
  }

  beginTracking(): void {
    this.trackingStarted = true;
  }

  async waitForCompletion(timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (this.networkDetected && this.networkCompletedCount > 0) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return this.networkDetected && this.networkCompletedCount > 0;
  }

  stop(cdp: AutomationCDPSession): void {
    this.trackingStarted = false;
    cdp.off('Network.requestWillBeSent', this.onRequestWillBeSent);
    cdp.off('Network.loadingFinished', this.onLoadingFinished);
    cdp.off('Network.loadingFailed', this.onLoadingFailed);
  }

  snapshot(): NetworkWaitSnapshot {
    return {
      networkDetected: this.networkDetected,
      networkCompletedCount: this.networkCompletedCount,
    };
  }
}
