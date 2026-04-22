import type { AutomationCDPSession } from '../automation/types';

export async function runtimeEvaluate<T = unknown>(
  cdp: AutomationCDPSession,
  expression: string,
  returnByValue = true,
): Promise<T | undefined> {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    returnByValue,
    awaitPromise: true,
  });
  return result.result?.value as T | undefined;
}

export async function waitForPageLoadState(cdp: AutomationCDPSession, timeoutMs = 8000): Promise<void> {
  await cdp.send('Page.enable').catch(() => undefined);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cdp.off('Page.loadEventFired', onLoad);
      reject(new Error(`waitForPageLoadState timeout after ${timeoutMs} ms`));
    }, timeoutMs);
    const onLoad = () => {
      clearTimeout(timer);
      cdp.off('Page.loadEventFired', onLoad);
      resolve();
    };
    cdp.on('Page.loadEventFired', onLoad);
  });
}
