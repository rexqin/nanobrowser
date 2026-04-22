import 'webextension-polyfill';
import {
  type BrowserContextConfig,
  type BrowserState,
  DEFAULT_BROWSER_CONTEXT_CONFIG,
  type TabInfo,
  URLNotAllowedError,
} from './views';
import Page, { build_initial_state } from './page';
import { createLogger } from '@src/background/log';
import { isUrlAllowed } from './util';
import { analytics } from '../services/analytics';

const logger = createLogger('BrowserContext');

interface TabLifecycleTrace {
  tabId: number;
  attachAttempts: number;
  attachSuccesses: number;
  detachAttempts: number;
  detachSuccesses: number;
  lastAttachAt: number | null;
  lastDetachAt: number | null;
  lastAccessAt: number | null;
  lastUrl: string | null;
  lastTitle: string | null;
  lastError: string | null;
  lastDetachReason: string | null;
}

function isNoTabError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('No tab with id');
}

function isBlockedAutomationUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    lower.startsWith('chrome://') ||
    lower.startsWith('edge://') ||
    lower.startsWith('about:') ||
    lower.startsWith('devtools://') ||
    lower.startsWith('view-source:')
  );
}

export default class BrowserContext {
  private _config: BrowserContextConfig;
  private _currentTabId: number | null = null;
  private _attachedPages: Map<number, Page> = new Map();

  constructor(config: Partial<BrowserContextConfig>) {
    this._config = { ...DEFAULT_BROWSER_CONTEXT_CONFIG, ...config };
  }

  public getConfig(): BrowserContextConfig {
    return this._config;
  }

  public updateConfig(config: Partial<BrowserContextConfig>): void {
    this._config = { ...this._config, ...config };
  }

  public updateCurrentTabId(tabId: number): void {
    // only update tab id, but don't attach it.
    this._currentTabId = tabId;
  }

  private async _getOrCreatePage(tab: chrome.tabs.Tab, forceUpdate = false): Promise<Page> {
    if (!tab.id) {
      throw new Error('Tab ID is not available');
    }

    const existingPage = this._attachedPages.get(tab.id);
    if (existingPage) {
      logger.info('getOrCreatePage', tab.id, 'already attached');
      if (!forceUpdate) {
        return existingPage;
      }
      // detach the page and remove it from the attached pages if forceUpdate is true
      await existingPage.detachPuppeteer();
      this._attachedPages.delete(tab.id);
    }
    logger.info('getOrCreatePage', tab.id, 'creating new page');
    return new Page(tab.id, tab.url || '', tab.title || '', this._config);
  }

  public async cleanup(): Promise<void> {
    // detach all pages
    for (const page of this._attachedPages.values()) {
      await page.detachPuppeteer();
    }
    this._attachedPages.clear();
    this._currentTabId = null;
  }

  public async attachPage(page: Page): Promise<boolean> {
    // check if page is already attached
    if (this._attachedPages.has(page.tabId)) {
      logger.info('attachPage', page.tabId, 'already attached');

      return true;
    }

    try {
      const attached = await page.attachPuppeteer();
      logger.debug('attachPage:attachPuppeteer-result', {
        tabId: page.tabId,
        attached,
      });
      if (attached) {
        logger.info('attachPage', page.tabId, 'attached');
        // add page to managed pages
        this._attachedPages.set(page.tabId, page);

        logger.debug('attachPage:done', {
          tabId: page.tabId,
          currentAttachedCount: this._attachedPages.size,
        });
        return true;
      }
      logger.debug('attachPage:failed', {
        tabId: page.tabId,
        currentAttachedCount: this._attachedPages.size,
      });

      return false;
    } catch (error) {
      logger.error('attachPage:error', {
        tabId: page.tabId,
        currentAttachedCount: this._attachedPages.size,
        error,
      });
      throw error;
    }
  }

  public async detachPage(tabId: number, reason: string = 'manual'): Promise<void> {
    logger.debug('detachPage:start', {
      tabId,
      currentAttachedCount: this._attachedPages.size,
      hasExistingEntry: this._attachedPages.has(tabId),
    });

    // detach page
    const page = this._attachedPages.get(tabId);
    if (!page) {
      logger.debug('detachPage:skip-not-found', {
        tabId,
        currentAttachedCount: this._attachedPages.size,
      });
      return;
    }

    try {
      await page.detachPuppeteer();

      logger.debug('detachPage:detachPuppeteer-done', { tabId });
    } catch (error) {
      logger.error('detachPage:error', { tabId, error });
      throw error;
    } finally {
      // remove page from managed pages
      this._attachedPages.delete(tabId);

      logger.debug('detachPage:done', {
        tabId,
        currentAttachedCount: this._attachedPages.size,
      });
    }
  }

  /**
   * 仅在当前窗口选择一个已存在的 tab（优先 active）。
   * 注意：这里不会创建新 tab。
   */
  private async _resolveExistingTabInCurrentWindow(): Promise<chrome.tabs.Tab> {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab?.id) {
      return activeTab;
    }

    const tabs = await chrome.tabs.query({ currentWindow: true });
    const fallback = tabs.find(tab => tab.id);
    if (fallback?.id) {
      logger.info('No active tab found, fallback to existing tab', fallback.id, fallback.url, fallback.title);
      return fallback;
    }

    throw new Error('No existing tab available in current window');
  }

  /**
   * 为指定 tab 创建/复用 Page、执行 attach，并写入当前 tab id。
   */
  private async _bindPageToCurrentTab(tab: chrome.tabs.Tab): Promise<Page> {
    const page = await this._getOrCreatePage(tab);
    await this.attachPage(page);
    this._currentTabId = tab.id ?? null;

    return page;
  }

  /**
   * 返回当前逻辑 tab 对应的 Page：已 attach 则直接复用；否则按 tab id 拉 tab 并 attach；
   * 若尚未指定当前 tab，则只从当前窗口已有 tab 中选择并 attach（不会新建 tab）。
   */
  public async getCurrentPage(): Promise<Page> {
    const tabId = this._currentTabId;

    if (tabId !== null) {
      const cached = this._attachedPages.get(tabId);
      if (cached) {
        return cached;
      }

      try {
        const tab = await chrome.tabs.get(tabId);
        logger.info('getCurrentPage attach tab', tab.id, tab.url, tab.title);
        return await this._bindPageToCurrentTab(tab);
      } catch (error) {
        if (isNoTabError(error)) {
          logger.info(`Current tab ${tabId} no longer exists, falling back to active tab`);
          this._currentTabId = null;
          return this.getCurrentPage();
        }
        throw error;
      }
    }

    const tab = await this._resolveExistingTabInCurrentWindow();
    logger.info('getCurrentPage active tab', tab.id, tab.url, tab.title);
    return await this._bindPageToCurrentTab(tab);
  }

  /**
   * Get all tab IDs from the browser and the current window.
   * @returns A set of tab IDs.
   */
  public async getAllTabIds(): Promise<Set<number>> {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    return new Set(tabs.map(tab => tab.id).filter(id => id !== undefined));
  }

  /**
   * Wait for tab events to occur after a tab is created or updated.
   * @param tabId - The ID of the tab to wait for events on.
   * @param options - An object containing options for the wait.
   * @returns A promise that resolves when the tab events occur.
   */
  private async waitForTabEvents(
    tabId: number,
    options: {
      waitForUpdate?: boolean;
      waitForActivation?: boolean;
      timeoutMs?: number;
    } = {},
  ): Promise<void> {
    const { waitForUpdate = true, waitForActivation = true, timeoutMs = 5000 } = options;

    const promises: Promise<void>[] = [];

    if (waitForUpdate) {
      const updatePromise = new Promise<void>(resolve => {
        let hasUrl = false;
        let hasTitle = false;
        let isComplete = false;

        const onUpdatedHandler = (updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
          if (updatedTabId !== tabId) return;

          if (changeInfo.url) hasUrl = true;
          if (changeInfo.title) hasTitle = true;
          if (changeInfo.status === 'complete') isComplete = true;

          // Resolve when we have all the information we need
          if (hasUrl && hasTitle && isComplete) {
            chrome.tabs.onUpdated.removeListener(onUpdatedHandler);
            resolve();
          }
        };
        chrome.tabs.onUpdated.addListener(onUpdatedHandler);

        // Check current state
        chrome.tabs.get(tabId).then(tab => {
          if (tab.url) hasUrl = true;
          if (tab.title) hasTitle = true;
          if (tab.status === 'complete') isComplete = true;

          if (hasUrl && hasTitle && isComplete) {
            chrome.tabs.onUpdated.removeListener(onUpdatedHandler);
            resolve();
          }
        });
      });
      promises.push(updatePromise);
    }

    if (waitForActivation) {
      const activatedPromise = new Promise<void>(resolve => {
        const onActivatedHandler = (activeInfo: chrome.tabs.TabActiveInfo) => {
          if (activeInfo.tabId === tabId) {
            chrome.tabs.onActivated.removeListener(onActivatedHandler);
            resolve();
          }
        };
        chrome.tabs.onActivated.addListener(onActivatedHandler);

        // Check current state
        chrome.tabs.get(tabId).then(tab => {
          if (tab.active) {
            chrome.tabs.onActivated.removeListener(onActivatedHandler);
            resolve();
          }
        });
      });
      promises.push(activatedPromise);
    }

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Tab operation timed out after ${timeoutMs} ms`)), timeoutMs),
    );

    await Promise.race([Promise.all(promises), timeoutPromise]);
  }

  private async waitForTabNavigationComplete(tabId: number, timeoutMs = 15000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      let tab: chrome.tabs.Tab;
      try {
        tab = await chrome.tabs.get(tabId);
      } catch (error) {
        if (isNoTabError(error)) {
          throw new Error(`Tab ${tabId} no longer exists during navigation`);
        }
        throw error;
      }
      if (tab.status === 'complete' && !!tab.url) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    throw new Error(`Tab navigation timed out after ${timeoutMs} ms`);
  }

  public async switchTab(tabId: number): Promise<Page> {
    logger.info('switchTab', tabId);

    await chrome.tabs.update(tabId, { active: true });
    await this.waitForTabEvents(tabId, { waitForUpdate: false });

    const page = await this._getOrCreatePage(await chrome.tabs.get(tabId));
    await this.attachPage(page);
    this._currentTabId = tabId;
    return page;
  }

  private async findFallbackWebTab(excludeTabId?: number): Promise<chrome.tabs.Tab | null> {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    for (const tab of tabs) {
      if (!tab.id || tab.id === excludeTabId || !tab.url) {
        continue;
      }
      if (isBlockedAutomationUrl(tab.url)) {
        continue;
      }
      if (!isUrlAllowed(tab.url, this._config.allowedUrls, this._config.deniedUrls)) {
        continue;
      }
      return tab;
    }
    return null;
  }

  /**
   * Ensure current tab is navigable by automation before url updates.
   * Returns true when navigation has already been completed by opening a replacement tab.
   */
  private async ensureNavigableTabForNavigation(targetUrl: string): Promise<boolean> {
    if (!this._currentTabId) {
      return false;
    }
    let currentTab: chrome.tabs.Tab;
    try {
      currentTab = await chrome.tabs.get(this._currentTabId);
    } catch (error) {
      if (isNoTabError(error)) {
        this._currentTabId = null;
        return false;
      }
      throw error;
    }
    if (!currentTab.url || !isBlockedAutomationUrl(currentTab.url)) {
      return false;
    }

    logger.info(`Current tab is restricted for automation: ${currentTab.url}`);
    const fallbackTab = await this.findFallbackWebTab(currentTab.id);
    if (fallbackTab?.id) {
      logger.info(`Switching to fallback tab ${fallbackTab.id}: ${fallbackTab.url}`);
      await this.switchTab(fallbackTab.id);
      return false;
    }

    logger.info('No fallback web tab found, opening a fresh tab for navigation');
    await this.openTab(targetUrl);
    return true;
  }

  public async navigateTo(url: string): Promise<void> {
    if (!isUrlAllowed(url, this._config.allowedUrls, this._config.deniedUrls)) {
      throw new URLNotAllowedError(`URL: ${url} is not allowed`);
    }

    // Track domain visit for analytics
    void analytics.trackDomainVisit(url);

    // If current tab is restricted (e.g. chrome://extensions), recover first.
    if (await this.ensureNavigableTabForNavigation(url)) {
      return;
    }

    const page = await this.getCurrentPage();
    if (!page) {
      await this.openTab(url);
      return;
    }
    // if page is attached, use puppeteer to navigate to the url
    if (page.attached) {
      await page.navigateTo(url);
      return;
    }
    //  Use chrome.tabs.update only if the page is not attached
    const tabId = page.tabId;
    // Update tab and wait for events
    await chrome.tabs.update(tabId, { url, active: true });
    await this.waitForTabNavigationComplete(tabId);

    // Reattach the page after navigation completes
    const updatedPage = await this._getOrCreatePage(await chrome.tabs.get(tabId), true);
    await this.attachPage(updatedPage);
    this._currentTabId = tabId;
  }

  public async openTab(url: string): Promise<Page> {
    if (!isUrlAllowed(url, this._config.allowedUrls, this._config.deniedUrls)) {
      throw new URLNotAllowedError(`Open tab failed. URL: ${url} is not allowed`);
    }

    // Create the new tab
    const tab = await chrome.tabs.create({ url, active: true });
    if (!tab.id) {
      throw new Error('No tab ID available');
    }
    // Deterministic navigation completion (avoid brittle 5s tab event timeout).
    await this.waitForTabNavigationComplete(tab.id);

    // Get updated tab information
    const updatedTab = await chrome.tabs.get(tab.id);
    // Create and attach the page after tab is fully loaded and activated
    const page = await this._getOrCreatePage(updatedTab);
    await this.attachPage(page);
    this._currentTabId = tab.id;

    return page;
  }

  /**
   * Open a tab in the background (does not activate) and attach Puppeteer.
   * Used for plan runs so the user's current tab stays focused.
   */
  public async openInactiveTab(url?: string): Promise<Page> {
    const targetUrl = url ?? this._config.homePageUrl;
    if (!isUrlAllowed(targetUrl, this._config.allowedUrls, this._config.deniedUrls)) {
      throw new URLNotAllowedError(`Open tab failed. URL: ${targetUrl} is not allowed`);
    }

    const tab = await chrome.tabs.create({ url: targetUrl, active: false });
    if (!tab.id) {
      throw new Error('No tab ID available');
    }
    // Blank tabs may never get a non-empty title; skip full URL/title/complete wait used by openTab.
    await this.waitForTabEvents(tab.id, { waitForUpdate: false, waitForActivation: false });

    const updatedTab = await chrome.tabs.get(tab.id);
    const page = await this._getOrCreatePage(updatedTab);
    await this.attachPage(page);
    this._currentTabId = tab.id;

    return page;
  }

  /**
   * Attach to an existing tab without focusing it (e.g. resume plan on the dedicated background tab).
   */
  public async attachToTabInBackground(tabId: number): Promise<Page> {
    const tab = await chrome.tabs.get(tabId);
    const page = await this._getOrCreatePage(tab);
    await this.attachPage(page);
    this._currentTabId = tabId;
    return page;
  }

  public async closeTab(tabId: number): Promise<void> {
    await this.detachPage(tabId, 'closeTab');
    await chrome.tabs.remove(tabId);
    // update current tab id if needed
    if (this._currentTabId === tabId) {
      this._currentTabId = null;
    }
  }

  /**
   * Remove a tab from the attached pages map. This will not run detachPuppeteer.
   * @param tabId - The ID of the tab to remove.
   */
  public removeAttachedPage(tabId: number): void {
    this._attachedPages.delete(tabId);
    // update current tab id if needed
    if (this._currentTabId === tabId) {
      this._currentTabId = null;
    }
  }

  public async getTabInfos(): Promise<TabInfo[]> {
    const tabs = await chrome.tabs.query({});
    const tabInfos: TabInfo[] = [];

    for (const tab of tabs) {
      if (tab.id && tab.url && tab.title) {
        tabInfos.push({
          id: tab.id,
          url: tab.url,
          title: tab.title,
        });
      }
    }
    return tabInfos;
  }

  public async getCachedState(cacheClickableElementsHashes = false): Promise<BrowserState> {
    const currentPage = await this.getCurrentPage();

    let pageState = !currentPage ? build_initial_state() : currentPage.getCachedState();
    if (!pageState) {
      pageState = await currentPage.getState(cacheClickableElementsHashes);
    }

    const tabInfos = await this.getTabInfos();
    const browserState: BrowserState = {
      ...pageState,
      tabs: tabInfos,
    };
    return browserState;
  }

  public async getState(cacheClickableElementsHashes = false): Promise<BrowserState> {
    const currentPage = await this.getCurrentPage();

    const pageState = !currentPage ? build_initial_state() : await currentPage.getState(cacheClickableElementsHashes);
    const tabInfos = await this.getTabInfos();
    const browserState: BrowserState = {
      ...pageState,
      tabs: tabInfos,
      // browser_errors: [],
    };
    return browserState;
  }
}
