import type { AutomationCDPSession } from '../automation/types';

import { runtimeEvaluate } from './runtime';

export async function getPageHtml(cdp: AutomationCDPSession): Promise<string> {
  return (
    (await runtimeEvaluate<string>(
      cdp,
      `(() => document.documentElement?.outerHTML ?? document.body?.outerHTML ?? '')()`,
    )) ?? ''
  );
}

export async function scrollToVisibleText(cdp: AutomationCDPSession, text: string, nth = 1): Promise<boolean> {
  return (
    (await runtimeEvaluate<boolean>(
      cdp,
      `(() => {
        const targetText = ${JSON.stringify(text)};
        const targetNth = ${JSON.stringify(nth)};
        const lowerCaseText = targetText.toLowerCase();
        const nodes = Array.from(document.querySelectorAll('body *'));
        const candidates = nodes.filter(node => {
          const txt = (node.textContent || '').toLowerCase();
          if (!txt.includes(lowerCaseText)) {
            return false;
          }
          const style = window.getComputedStyle(node);
          const rect = node.getBoundingClientRect();
          return (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            style.opacity !== '0' &&
            rect.width > 0 &&
            rect.height > 0
          );
        });
        if (candidates.length < targetNth || targetNth <= 0) {
          return false;
        }
        const target = candidates[targetNth - 1];
        target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
        return true;
      })()`,
    )) ?? false
  );
}
