import type { AutomationCDPSession } from '../automation/types';

export async function waitForStableNetworkWithCdp(
  cdp: AutomationCDPSession,
  options: {
    waitForNetworkIdleSeconds: number;
    maxWaitSeconds: number;
  },
): Promise<void> {
  const { waitForNetworkIdleSeconds, maxWaitSeconds } = options;
  const RELEVANT_RESOURCE_TYPES = new Set(['document', 'stylesheet', 'image', 'font', 'script', 'iframe']);

  const RELEVANT_CONTENT_TYPES = new Set([
    'text/html',
    'text/css',
    'application/javascript',
    'image/',
    'font/',
    'application/json',
  ]);

  const IGNORED_URL_PATTERNS = new Set([
    'analytics',
    'tracking',
    'telemetry',
    'beacon',
    'metrics',
    'doubleclick',
    'adsystem',
    'adserver',
    'advertising',
    'facebook.com/plugins',
    'platform.twitter',
    'linkedin.com/embed',
    'livechat',
    'zendesk',
    'intercom',
    'crisp.chat',
    'hotjar',
    'push-notifications',
    'onesignal',
    'pushwoosh',
    'heartbeat',
    'ping',
    'alive',
    'webrtc',
    'rtmp://',
    'wss://',
    'cloudfront.net',
    'fastly.net',
  ]);

  const pendingRequests = new Set<string>();
  let lastActivity = Date.now();
  const trackedRequests = new Set<string>();

  const onRequest = (event: {
    requestId?: string;
    request?: { url?: string; headers?: Record<string, string | undefined> };
    type?: string;
  }) => {
    const requestId = event.requestId;
    if (!requestId) return;
    const resourceType = (event.type || '').toLowerCase();
    if (!RELEVANT_RESOURCE_TYPES.has(resourceType)) return;
    if (['websocket', 'media', 'eventsource', 'manifest', 'other'].includes(resourceType)) return;

    const url = (event.request?.url || '').toLowerCase();
    if (Array.from(IGNORED_URL_PATTERNS).some(pattern => url.includes(pattern))) return;
    if (url.startsWith('data:') || url.startsWith('blob:')) return;

    const headers = event.request?.headers || {};
    if (
      headers['purpose'] === 'prefetch' ||
      headers['sec-fetch-dest'] === 'video' ||
      headers['sec-fetch-dest'] === 'audio'
    ) {
      return;
    }

    trackedRequests.add(requestId);
    pendingRequests.add(requestId);
    lastActivity = Date.now();
  };

  const onResponse = (event: {
    requestId?: string;
    response?: { mimeType?: string; headers?: Record<string, string> };
  }) => {
    const requestId = event.requestId;
    if (!requestId || !pendingRequests.has(requestId)) return;

    const mimeType = event.response?.mimeType?.toLowerCase() || '';
    const headerType = event.response?.headers?.['content-type']?.toLowerCase() || '';
    const contentType = mimeType || headerType;

    if (
      ['streaming', 'video', 'audio', 'webm', 'mp4', 'event-stream', 'websocket', 'protobuf'].some(t =>
        contentType.includes(t),
      )
    ) {
      pendingRequests.delete(requestId);
      return;
    }

    if (!Array.from(RELEVANT_CONTENT_TYPES).some(ct => contentType.includes(ct))) {
      pendingRequests.delete(requestId);
      return;
    }

    const contentLength = event.response?.headers?.['content-length'];
    if (contentLength && Number.parseInt(contentLength) > 5 * 1024 * 1024) {
      pendingRequests.delete(requestId);
      return;
    }

    pendingRequests.delete(requestId);
    lastActivity = Date.now();
  };

  const onLoadDone = (event: { requestId?: string }) => {
    const requestId = event.requestId;
    if (!requestId || !trackedRequests.has(requestId)) return;
    pendingRequests.delete(requestId);
    lastActivity = Date.now();
  };

  await cdp.send('Network.enable').catch(() => undefined);
  cdp.on('Network.requestWillBeSent', onRequest);
  cdp.on('Network.responseReceived', onResponse);
  cdp.on('Network.loadingFinished', onLoadDone);
  cdp.on('Network.loadingFailed', onLoadDone);

  try {
    const startTime = Date.now();
    // eslint-disable-next-line no-constant-condition
    while (true) {
      await new Promise(resolve => setTimeout(resolve, 100));
      const now = Date.now();
      const timeSinceLastActivity = (now - lastActivity) / 1000;
      if (pendingRequests.size === 0 && timeSinceLastActivity >= waitForNetworkIdleSeconds) {
        break;
      }
      const elapsedTime = (now - startTime) / 1000;
      if (elapsedTime > maxWaitSeconds) {
        // eslint-disable-next-line no-console
        console.debug(
          `Network timeout after ${maxWaitSeconds}s with ${pendingRequests.size} pending requests:`,
          Array.from(pendingRequests),
        );
        break;
      }
    }
  } finally {
    cdp.off('Network.requestWillBeSent', onRequest);
    cdp.off('Network.responseReceived', onResponse);
    cdp.off('Network.loadingFinished', onLoadDone);
    cdp.off('Network.loadingFailed', onLoadDone);
  }
}
