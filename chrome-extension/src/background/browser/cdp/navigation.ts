import type { AutomationCDPSession } from '../automation/types';

export async function navigateToUrl(cdp: AutomationCDPSession, url: string): Promise<void> {
  await cdp.send('Page.enable').catch(() => undefined);
  await cdp.send('Page.navigate', { url });
}

export async function reloadPage(cdp: AutomationCDPSession): Promise<void> {
  await cdp.send('Page.enable').catch(() => undefined);
  await cdp.send('Page.reload');
}

export async function navigateHistory(cdp: AutomationCDPSession, delta: -1 | 1): Promise<boolean> {
  const history = await cdp.send('Page.getNavigationHistory');
  const target = history.entries[history.currentIndex + delta];
  if (!target) {
    return false;
  }
  await cdp.send('Page.navigateToHistoryEntry', { entryId: target.id });
  return true;
}
