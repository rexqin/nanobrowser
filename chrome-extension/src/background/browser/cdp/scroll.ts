import type { AutomationCDPSession } from '../automation/types';

import { runtimeEvaluate } from './runtime';

export async function scrollPageToPercent(cdp: AutomationCDPSession, yPercent: number): Promise<void> {
  await runtimeEvaluate(
    cdp,
    `(() => {
      const yPercent = ${JSON.stringify(yPercent)};
      const scrollHeight = document.documentElement.scrollHeight;
      const viewportHeight = window.visualViewport?.height || window.innerHeight;
      const scrollTop = (scrollHeight - viewportHeight) * (yPercent / 100);
      window.scrollTo({
        top: scrollTop,
        left: window.scrollX,
        behavior: 'smooth',
      });
      return true;
    })()`,
  );
}

export async function scrollPageBy(cdp: AutomationCDPSession, deltaY: number): Promise<void> {
  await runtimeEvaluate(
    cdp,
    `(() => {
      const deltaY = ${JSON.stringify(deltaY)};
      window.scrollBy({
        top: deltaY,
        left: 0,
        behavior: 'smooth',
      });
      return true;
    })()`,
  );
}

export async function scrollPageByViewport(cdp: AutomationCDPSession, direction: 'next' | 'prev'): Promise<void> {
  const expression =
    direction === 'prev'
      ? 'window.scrollBy(0, -(window.visualViewport?.height || window.innerHeight)); true;'
      : 'window.scrollBy(0, (window.visualViewport?.height || window.innerHeight)); true;';
  await runtimeEvaluate(cdp, expression);
}
