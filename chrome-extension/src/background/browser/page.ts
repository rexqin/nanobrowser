import 'webextension-polyfill';

import type { AutomationCDPSession, AutomationPageHandle } from './automation/types';

import {
  getClickableElements as _getClickableElements,
  getScrollInfo as _getScrollInfo,
  type EnhancedDOMState,
} from './dom/service';

import { type BrowserContextConfig, DEFAULT_BROWSER_CONTEXT_CONFIG, type PageState, URLNotAllowedError } from './views';
import { createLogger } from '@src/background/log';
import { ClickableElementProcessor } from './dom/clickable/service';
import { isUrlAllowed } from './util';
import { EnhancedDOMTreeNode } from './dom/enhancedDOMTreeNode';
import { NodeType } from './dom/domService';
import { SerializedDOMState } from './dom/serializedDOMState';
import { CdpNetworkWaiter } from './cdp/networkWaiter';
import { createPageAutomationAdapter, type PageAutomationAdapter } from './automation/adapter';
import { callFunctionOnBackendNode } from './cdp/nodeInvoker';
import { runtimeEvaluate, waitForPageLoadState as waitForPageLoadStateWithCdp } from './cdp/runtime';
import { navigateHistory, navigateToUrl, reloadPage } from './cdp/navigation';
import { waitForStableNetworkWithCdp } from './cdp/networkIdle';
import { sendKeyCombination } from './cdp/keyboard';
import { scrollPageBy, scrollPageByViewport, scrollPageToPercent } from './cdp/scroll';
import { getPageHtml, scrollToVisibleText } from './cdp/content';

const logger = createLogger('Page');

function isCdpEvaluationBlockedUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol === 'chrome:') return true;
    if (parsed.protocol === 'chrome-extension:') {
      // Allow current extension pages, block other extensions.
      return parsed.hostname !== chrome.runtime.id;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return true;
    const host = parsed.hostname.toLowerCase();
    if (
      (host === 'chrome.google.com' || host === 'chromewebstore.google.com') &&
      parsed.pathname.startsWith('/webstore')
    ) {
      return true;
    }
    return false;
  } catch {
    return true;
  }
}

export function build_initial_state(tabId?: number, url?: string, title?: string): PageState {
  return {
    elementTree: new EnhancedDOMTreeNode({
      nodeId: 0,
      backendNodeId: 0,
      nodeType: NodeType.ELEMENT_NODE,
      nodeName: 'body',
      nodeValue: null,
      attributes: {},
      isScrollable: null,
      isVisible: true,
      absolutePosition: null,
      targetId: '',
      frameId: null,
      sessionId: null,
      contentDocument: null,
      shadowRootType: null,
      shadowRoots: null,
      parentNode: null,
      childrenNodes: null,
      axNode: null,
      snapshotNode: null,
      _compoundChildren: [],
      uuid: '',
    }),
    serializedDomState: new SerializedDOMState(null, new Map()),
    tabId: tabId || 0,
    url: url || '',
    title: title || '',
    screenshot: null,
    scrollY: 0,
    scrollHeight: 0,
    visualViewportHeight: 0,
  };
}

/**
 * Cached clickable elements hashes for the last state
 */
export class CachedStateClickableElementsHashes {
  url: string;
  hashes: Set<string>;

  constructor(url: string, hashes: Set<string>) {
    this.url = url;
    this.hashes = hashes;
  }
}

export default class Page {
  private _tabId: number;
  private _attachedPageHandle: AutomationPageHandle | null = null;
  private _automationAdapter: PageAutomationAdapter;
  private _config: BrowserContextConfig;
  private _state: PageState;
  private _cachedState: PageState | null = null;
  private _cachedStateClickableElementsHashes: CachedStateClickableElementsHashes | null = null;

  constructor(tabId: number, url: string, title: string, config: Partial<BrowserContextConfig> = {}) {
    this._tabId = tabId;
    this._config = { ...DEFAULT_BROWSER_CONTEXT_CONFIG, ...config };
    this._automationAdapter = createPageAutomationAdapter(
      this._config.automationEngine,
      this._config.automationConnectorMode,
    );
    this._state = build_initial_state(tabId, url, title);
  }

  get tabId(): number {
    return this._tabId;
  }

  get attached(): boolean {
    return this._attachedPageHandle !== null;
  }

  private _setAttachedPageHandle(page: AutomationPageHandle | null): void {
    this._attachedPageHandle = page;
  }

  async attachAutomation(): Promise<boolean> {
    if (this._attachedPageHandle) {
      return true;
    }

    logger.info('attaching automation adapter', {
      tabId: this._tabId,
      engine: this._automationAdapter.engine,
    });
    const page = await this._automationAdapter.attach(this._tabId);
    this._setAttachedPageHandle(page);

    // Add anti-detection scripts
    await this._addAntiDetectionScripts();

    return true;
  }

  private async _addAntiDetectionScripts(): Promise<void> {
    const cdp = this.getCDPSession();
    if (!cdp) {
      return;
    }

    await cdp.send('Page.enable').catch(() => undefined);
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `
      // Webdriver property
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      });

      // Languages
      // Object.defineProperty(navigator, 'languages', {
      //   get: () => ['en-US']
      // });

      // Plugins
      // Object.defineProperty(navigator, 'plugins', {
      //   get: () => [1, 2, 3, 4, 5]
      // });

      // Chrome runtime
      window.chrome = { runtime: {} };

      // Permissions
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: Notification.permission }) :
          originalQuery(parameters)
      );

      // Shadow DOM
      (function () {
        const originalAttachShadow = Element.prototype.attachShadow;
        Element.prototype.attachShadow = function attachShadow(options) {
          return originalAttachShadow.call(this, { ...options, mode: "open" });
        };
      })();
    `,
    });
  }

  async detachAutomation(): Promise<void> {
    if (this._automationAdapter.isAttached() || this._attachedPageHandle) {
      await this._automationAdapter.detach();
      this._setAttachedPageHandle(null);

      logger.debug('detachAutomation:done', { tabId: this._tabId });
      // reset the state
      this._state = build_initial_state(this._tabId);
    }
  }

  private async _ensureAttachedPage(): Promise<AutomationPageHandle> {
    if (this._attachedPageHandle) {
      return this._attachedPageHandle;
    }

    logger.warning('Attached automation page missing, attempting auto reconnect', { tabId: this._tabId });
    const page = await this._automationAdapter.ensureAttached(this._tabId);
    this._setAttachedPageHandle(page);
    if (!this._attachedPageHandle) {
      throw new Error('Automation page is not connected');
    }

    logger.info('Automation page auto reconnect succeeded', { tabId: this._tabId });
    return this._attachedPageHandle;
  }

  async getClickableElements(focusElement: number): Promise<EnhancedDOMState | null> {
    await this._ensureAttachedPage();
    const cdpSession = this.getCDPSession();
    if (!cdpSession) {
      throw new Error('Failed to get CDP session (page missing or not connected)');
    }
    return _getClickableElements(
      this._tabId,
      this.url(),
      focusElement,
      this._config.viewportExpansion,
      import.meta.env.DEV,
      cdpSession,
    );
  }

  /** Attached automation page 的主 CDP 客户端；公开类型不含 `_client`，扩展里也不能用 `createCDPSession()` */
  private getCDPSession(): AutomationCDPSession | null {
    return this._automationAdapter.getCDPSession();
  }

  private _getRequiredCDPSession(): AutomationCDPSession {
    const cdp = this.getCDPSession();
    if (!cdp) {
      throw new Error('CDP session unavailable');
    }
    return cdp;
  }

  // Get scroll position information for the current page.
  async getScrollInfo(): Promise<[number, number, number]> {
    return _getScrollInfo(this._tabId);
  }

  // Get scroll position information for a specific element.
  async getElementScrollInfo(elementNode: EnhancedDOMTreeNode): Promise<[number, number, number]> {
    await this._ensureAttachedPage();

    const scrollInfo = (await this._callOnBackendNode(
      elementNode,
      `function() {
        const el = this;
        if (!(el instanceof HTMLElement)) {
          throw new Error('Target is not an HTMLElement');
        }
        let target = el;
        while (target && target !== document.body && target !== document.documentElement) {
          const style = window.getComputedStyle(target);
          const hasVerticalScrollbar = target.scrollHeight > target.clientHeight;
          const canScrollVertically =
            style.overflowY === 'scroll' ||
            style.overflowY === 'auto' ||
            style.overflow === 'scroll' ||
            style.overflow === 'auto';
          if (hasVerticalScrollbar && canScrollVertically) {
            break;
          }
          target = target.parentElement || document.body;
        }
        return {
          scrollTop: target.scrollTop,
          clientHeight: target.clientHeight,
          scrollHeight: target.scrollHeight,
        };
      }`,
    )) as { scrollTop: number; clientHeight: number; scrollHeight: number };

    return [scrollInfo.scrollTop, scrollInfo.clientHeight, scrollInfo.scrollHeight];
  }

  async getContent(): Promise<string> {
    await this._ensureAttachedPage();
    const cdp = this.getCDPSession();
    if (!cdp) {
      throw new Error('CDP session unavailable');
    }
    return await getPageHtml(cdp);
  }

  getCachedState(): PageState | null {
    return this._cachedState;
  }

  async getState(cacheClickableElementsHashes = false): Promise<PageState> {
    await this.waitForPageAndFramesLoad();
    const updatedState = await this._updateState();

    // Find out which elements are new
    // Do this only if url has not changed
    if (cacheClickableElementsHashes) {
      // If we are on the same url as the last state, we can use the cached hashes
      if (
        this._cachedStateClickableElementsHashes &&
        this._cachedStateClickableElementsHashes.url === updatedState.url
      ) {
        // Get clickable elements from the updated state
        const updatedStateClickableElements = ClickableElementProcessor.getClickableElements(updatedState.elementTree);

        // Mark elements as new if they weren't in the previous state
        for (const domElement of updatedStateClickableElements) {
          const hash = await ClickableElementProcessor.hashDomElement(domElement);
          domElement.isNew = !this._cachedStateClickableElementsHashes.hashes.has(hash);
        }
      }

      // In any case, we need to cache the new hashes
      const newHashes = await ClickableElementProcessor.getClickableElementsHashes(updatedState.elementTree);
      this._cachedStateClickableElementsHashes = new CachedStateClickableElementsHashes(updatedState.url, newHashes);
    }

    // Save the updated state as the cached state
    this._cachedState = updatedState;
    if (import.meta.env.DEV) {
      logger.debug('getState updatedState (DEV)', updatedState);
    }
    return updatedState;
  }

  async _updateState(focusElement = -1): Promise<PageState> {
    try {
      // Test if page is still accessible
      await runtimeEvaluate(this._getRequiredCDPSession(), '1');
    } catch (error) {
      logger.warning('Current page is no longer accessible:', error);
      await this.detachAutomation();
      await this._ensureAttachedPage();
    }

    try {
      const currentUrl = (await runtimeEvaluate<string>(this._getRequiredCDPSession(), 'location.href')) ?? '';
      if (isCdpEvaluationBlockedUrl(currentUrl)) {
        logger.info(`Skip state update on blocked URL: ${currentUrl}`);
        return this._state;
      }

      const content = await this.getClickableElements(focusElement);
      if (!content) {
        logger.warning('Failed to get clickable elements');
        // Return last known good state if available
        return this._state;
      }

      const screenshot: string | null = null;
      const [scrollY, visualViewportHeight, scrollHeight] = await this.getScrollInfo();

      // update the state
      this._state.elementTree = content.elementTree;
      this._state.serializedDomState = content.serializedDomState;
      this._state.url = currentUrl;
      this._state.title = (await runtimeEvaluate<string>(this._getRequiredCDPSession(), 'document.title')) ?? '';
      this._state.screenshot = screenshot;
      this._state.scrollY = scrollY;
      this._state.visualViewportHeight = visualViewportHeight;
      this._state.scrollHeight = scrollHeight;
      return this._state;
    } catch (error) {
      logger.error('Failed to update state:', error);
      // Return last known good state if available
      return this._state;
    }
  }

  async takeScreenshot(fullPage = false): Promise<string | null> {
    await this._ensureAttachedPage();
    const cdp = this.getCDPSession();
    if (!cdp) {
      throw new Error('CDP session unavailable');
    }

    try {
      // First disable animations/transitions
      await runtimeEvaluate(
        this._getRequiredCDPSession(),
        `
        (() => {
          const styleId = 'automation-disable-animations';
          if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = \`
              *, *::before, *::after {
                animation: none !important;
                transition: none !important;
              }
            \`;
            document.head.appendChild(style);
          }
          return true;
        })()
      `,
      );

      let screenshot: string;
      if (fullPage) {
        const metrics = await cdp.send('Page.getLayoutMetrics');
        const contentSize = metrics.contentSize;
        const capture = await cdp.send('Page.captureScreenshot', {
          format: 'jpeg',
          quality: 80,
          clip: {
            x: 0,
            y: 0,
            width: Math.max(1, Math.floor(contentSize.width)),
            height: Math.max(1, Math.floor(contentSize.height)),
            scale: 1,
          },
          captureBeyondViewport: true,
        });
        screenshot = capture.data;
      } else {
        const capture = await cdp.send('Page.captureScreenshot', {
          format: 'jpeg',
          quality: 80,
        });
        screenshot = capture.data;
      }

      // Clean up the style element
      await runtimeEvaluate(
        this._getRequiredCDPSession(),
        `
        (() => {
          const style = document.getElementById('automation-disable-animations');
          if (style) {
            style.remove();
          }
          return true;
        })()
      `,
      );

      return screenshot;
    } catch (error) {
      logger.error('Failed to take screenshot:', error);
      throw error;
    }
  }

  url(): string {
    return this._state.url;
  }

  async title(): Promise<string> {
    try {
      const title = await runtimeEvaluate<string>(this._getRequiredCDPSession(), 'document.title');
      if (typeof title === 'string') {
        this._state.title = title;
        return title;
      }
    } catch {
      // noop - fallback to cached state
    }
    return this._state.title;
  }

  async navigateTo(url: string): Promise<void> {
    await this._ensureAttachedPage();
    logger.info('navigateTo', url);

    // Check if URL is allowed
    if (!isUrlAllowed(url, this._config.allowedUrls, this._config.deniedUrls)) {
      throw new URLNotAllowedError(`URL: ${url} is not allowed`);
    }

    try {
      const cdp = this.getCDPSession();
      if (!cdp) {
        throw new Error('CDP session unavailable');
      }
      await navigateToUrl(cdp, url);
      await this.waitForPageAndFramesLoad();
      logger.info('navigateTo complete');
    } catch (error) {
      if (error instanceof URLNotAllowedError) {
        throw error;
      }

      if (error instanceof Error && error.message.includes('timeout')) {
        logger.warning('Navigation timeout, but page might still be usable:', error);
        return;
      }

      logger.error('Navigation failed:', error);
      throw error;
    }
  }

  async refreshPage(): Promise<void> {
    await this._ensureAttachedPage();

    try {
      const cdp = this.getCDPSession();
      if (!cdp) {
        throw new Error('CDP session unavailable');
      }
      await reloadPage(cdp);
      await this.waitForPageAndFramesLoad();
      logger.info('Page refresh complete');
    } catch (error) {
      if (error instanceof URLNotAllowedError) {
        throw error;
      }

      if (error instanceof Error && error.message.includes('timeout')) {
        logger.warning('Refresh timeout, but page might still be usable:', error);
        return;
      }

      logger.error('Page refresh failed:', error);
      throw error;
    }
  }

  async goBack(): Promise<void> {
    await this._ensureAttachedPage();

    try {
      const cdp = this.getCDPSession();
      if (!cdp) {
        throw new Error('CDP session unavailable');
      }
      const navigated = await navigateHistory(cdp, -1);
      if (!navigated) {
        return;
      }
      await this.waitForPageAndFramesLoad();
      logger.info('Navigation back completed');
    } catch (error) {
      if (error instanceof URLNotAllowedError) {
        throw error;
      }

      if (error instanceof Error && error.message.includes('timeout')) {
        logger.warning('Back navigation timeout, but page might still be usable:', error);
        return;
      }

      logger.error('Could not navigate back:', error);
      throw error;
    }
  }

  async goForward(): Promise<void> {
    await this._ensureAttachedPage();

    try {
      const cdp = this.getCDPSession();
      if (!cdp) {
        throw new Error('CDP session unavailable');
      }
      const navigated = await navigateHistory(cdp, 1);
      if (!navigated) {
        return;
      }
      await this.waitForPageAndFramesLoad();
      logger.info('Navigation forward completed');
    } catch (error) {
      if (error instanceof URLNotAllowedError) {
        throw error;
      }

      if (error instanceof Error && error.message.includes('timeout')) {
        logger.warning('Forward navigation timeout, but page might still be usable:', error);
        return;
      }

      logger.error('Could not navigate forward:', error);
      throw error;
    }
  }

  // scroll to a percentage of the page or element
  // if yPercent is 0, scroll to the top of the page, if 100, scroll to the bottom of the page
  // if elementNode is provided, scroll to a percentage of the element
  // if elementNode is not provided, scroll to a percentage of the page
  async scrollToPercent(yPercent: number, elementNode?: EnhancedDOMTreeNode): Promise<void> {
    await this._ensureAttachedPage();
    if (!elementNode) {
      const cdp = this.getCDPSession();
      if (!cdp) {
        throw new Error('CDP session unavailable');
      }
      await scrollPageToPercent(cdp, yPercent);
    } else {
      await this._callOnBackendNode(
        elementNode,
        `function(percent) {
          const el = this;
          if (!(el instanceof HTMLElement)) {
            throw new Error('Target is not an HTMLElement');
          }
          let target = el;
          while (target && target !== document.body && target !== document.documentElement) {
            if (target.scrollHeight > target.clientHeight) break;
            target = target.parentElement || document.body;
          }
          const scrollHeight = target.scrollHeight;
          const viewportHeight = target.clientHeight;
          const scrollTop = (scrollHeight - viewportHeight) * (percent / 100);
          target.scrollTo({ top: scrollTop, left: target.scrollLeft, behavior: 'smooth' });
          return true;
        }`,
        [yPercent],
      );
    }
  }

  async scrollBy(y: number, elementNode?: EnhancedDOMTreeNode): Promise<void> {
    await this._ensureAttachedPage();
    if (!elementNode) {
      const cdp = this.getCDPSession();
      if (!cdp) {
        throw new Error('CDP session unavailable');
      }
      await scrollPageBy(cdp, y);
    } else {
      await this._callOnBackendNode(
        elementNode,
        `function(deltaY) {
          const el = this;
          if (!(el instanceof HTMLElement)) {
            throw new Error('Target is not an HTMLElement');
          }
          let target = el;
          while (target && target !== document.body && target !== document.documentElement) {
            if (target.scrollHeight > target.clientHeight) break;
            target = target.parentElement || document.body;
          }
          target.scrollBy({ top: deltaY, left: 0, behavior: 'smooth' });
          return true;
        }`,
        [y],
      );
    }
  }

  async scrollToPreviousPage(elementNode?: EnhancedDOMTreeNode): Promise<void> {
    await this._ensureAttachedPage();

    if (!elementNode) {
      // Scroll the whole page up by viewport height
      const cdp = this.getCDPSession();
      if (!cdp) {
        throw new Error('CDP session unavailable');
      }
      await scrollPageByViewport(cdp, 'prev');
    } else {
      await this._callOnBackendNode(
        elementNode,
        `function() {
          const el = this;
          if (!(el instanceof HTMLElement)) {
            throw new Error('Target is not an HTMLElement');
          }
          let target = el;
          while (target && target !== document.body && target !== document.documentElement) {
            if (target.scrollHeight > target.clientHeight) break;
            target = target.parentElement || document.body;
          }
          target.scrollBy(0, -target.clientHeight);
          return true;
        }`,
      );
    }
  }

  async scrollToNextPage(elementNode?: EnhancedDOMTreeNode): Promise<void> {
    await this._ensureAttachedPage();

    if (!elementNode) {
      // Scroll the whole page down by viewport height
      const cdp = this.getCDPSession();
      if (!cdp) {
        throw new Error('CDP session unavailable');
      }
      await scrollPageByViewport(cdp, 'next');
    } else {
      await this._callOnBackendNode(
        elementNode,
        `function() {
          const el = this;
          if (!(el instanceof HTMLElement)) {
            throw new Error('Target is not an HTMLElement');
          }
          let target = el;
          while (target && target !== document.body && target !== document.documentElement) {
            if (target.scrollHeight > target.clientHeight) break;
            target = target.parentElement || document.body;
          }
          target.scrollBy(0, target.clientHeight);
          return true;
        }`,
      );
    }
  }

  async sendKeys(keys: string): Promise<void> {
    await this._ensureAttachedPage();
    const cdp = this.getCDPSession();
    if (!cdp) {
      throw new Error('CDP session unavailable');
    }
    try {
      await sendKeyCombination(cdp, keys);
      await this.waitForPageAndFramesLoad();
      logger.info('sendKeys complete', keys);
    } catch (error) {
      logger.error('Failed to send keys:', error);
      throw new Error(`Failed to send keys: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async scrollToText(text: string, nth: number = 1): Promise<boolean> {
    await this._ensureAttachedPage();
    const cdp = this.getCDPSession();
    if (!cdp) {
      throw new Error('CDP session unavailable');
    }

    try {
      const found = await scrollToVisibleText(cdp, text, nth);
      if (found) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      return found;
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : String(error));
    }
  }

  async getDropdownOptions(index: number): Promise<Array<{ index: number; text: string; value: string }>> {
    const selectorMap = this.getSelectorMap();
    const element = selectorMap?.get(index);

    if (!element) {
      throw new Error('Element not found');
    }
    await this._ensureAttachedPage();

    try {
      const options = (await this._callOnBackendNode(
        element,
        `function() {
          const select = this;
          if (!(select instanceof HTMLSelectElement)) {
            throw new Error('Element is not a select element');
          }
          return Array.from(select.options).map(option => ({
            index: option.index,
            text: option.text,
            value: option.value,
          }));
        }`,
      )) as Array<{ index: number; text: string; value: string }>;

      if (!options.length) {
        throw new Error('No options found in dropdown');
      }

      return options;
    } catch (error) {
      throw new Error(`Failed to get dropdown options: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async selectDropdownOption(index: number, text: string): Promise<string> {
    const selectorMap = this.getSelectorMap();
    const element = selectorMap?.get(index);

    if (!element) {
      throw new Error('Element not found');
    }
    await this._ensureAttachedPage();

    logger.debug(`Attempting to select '${text}' from dropdown`);
    logger.debug(`Element attributes: ${JSON.stringify(element.attributes)}`);
    logger.debug(`Element tag: ${element.tagName}`);

    // Validate that we're working with a select element
    if (element.tagName?.toLowerCase() !== 'select') {
      const msg = `Cannot select option: Element with index ${index} is a ${element.tagName}, not a SELECT`;
      logger.error(msg);
      throw new Error(msg);
    }

    try {
      const result = (await this._callOnBackendNode(
        element,
        `function(optionText, elementIndex) {
          const select = this;
          if (!(select instanceof HTMLSelectElement)) {
            return {
              found: false,
              message: 'Element with index ' + elementIndex + ' is not a SELECT',
            };
          }
          const options = Array.from(select.options);
          const option = options.find(opt => opt.text.trim() === optionText);
          if (!option) {
            const availableOptions = options.map(o => o.text.trim()).join('", "');
            return {
              found: false,
              message:
                'Option "' +
                optionText +
                '" not found in dropdown element with index ' +
                elementIndex +
                '. Available options: "' +
                availableOptions +
                '"',
            };
          }
          const previousValue = select.value;
          select.value = option.value;
          if (previousValue !== option.value) {
            select.dispatchEvent(new Event('change', { bubbles: true }));
            select.dispatchEvent(new Event('input', { bubbles: true }));
          }
          return {
            found: true,
            message: 'Selected option "' + optionText + '" with value "' + option.value + '"',
          };
        }`,
        [text, index],
      )) as { found: boolean; message: string };

      logger.debug('Selection result:', result);
      // whether found or not, return the message
      return result.message;
    } catch (error) {
      const errorMessage = `${error instanceof Error ? error.message : String(error)}`;
      logger.error(errorMessage);
      throw new Error(errorMessage);
    }
  }

  private async _callOnBackendNode(
    elementNode: EnhancedDOMTreeNode,
    functionDeclaration: string,
    args: Array<string | number | boolean | null> = [],
    returnByValue = true,
  ): Promise<unknown> {
    const cdp = this.getCDPSession();
    if (!cdp) {
      throw new Error('CDP session unavailable');
    }
    return await callFunctionOnBackendNode(cdp, elementNode.backendNodeId, functionDeclaration, args, returnByValue);
  }

  async isElementVisibleByBackendNode(elementNode: EnhancedDOMTreeNode): Promise<boolean> {
    await this._ensureAttachedPage();
    const visible = await this._callOnBackendNode(
      elementNode,
      `function() {
        const el = this;
        if (!(el instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          style.opacity !== '0' &&
          rect.width > 0 &&
          rect.height > 0
        );
      }`,
    );
    return Boolean(visible);
  }

  async pasteImageDataToElementNode(
    elementNode: EnhancedDOMTreeNode,
    imageUrl: string,
  ): Promise<{
    success: boolean;
    outputLength: number;
    dispatch: boolean;
    final: boolean;
    networkDetected: boolean;
    networkCompleted: boolean;
    error?: string;
  }> {
    await this._ensureAttachedPage();
    const cdp = this.getCDPSession();
    const waitForNetworkAfterPasteMs = 3000;
    const networkWaiter = new CdpNetworkWaiter();

    try {
      if (cdp) {
        await networkWaiter.start(cdp);
      }

      const response = await fetch(imageUrl);
      if (!response.ok) {
        return {
          success: false,
          outputLength: 0,
          dispatch: false,
          final: false,
          networkDetected: networkWaiter.snapshot().networkDetected,
          networkCompleted: false,
          error: `Failed to download image in extension context: ${response.status} ${response.statusText}`,
        };
      }
      const buffer = await response.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const outputLength = bytes.length;
      const inferredMime = (response.headers.get('content-type') || '').split(';')[0].trim() || 'image/png';
      let base64: string;
      const globalAny = globalThis as unknown as {
        Buffer?: { from: (b: Uint8Array) => { toString: (enc: string) => string } };
      };
      if (globalAny.Buffer) {
        base64 = globalAny.Buffer.from(bytes).toString('base64');
      } else {
        let binary = '';
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          const chunk = bytes.subarray(i, i + chunkSize);
          for (let j = 0; j < chunk.length; j++) {
            binary += String.fromCharCode(chunk[j]);
          }
        }
        base64 = btoa(binary);
      }
      const dataUri = `data:${inferredMime};base64,${base64}`;
      networkWaiter.beginTracking();
      const result = (await this._callOnBackendNode(
        elementNode,
        `async function(uri) {
          try {
            const element = this;
            if (!(element instanceof HTMLElement)) {
              throw new Error('Target element is not an HTMLElement');
            }
            const hasTargetImgInInnerHtml = (el, targetUri) => {
              const html = el.innerHTML || '';
              if (!html) return false;
              const wrapper = document.createElement('div');
              wrapper.innerHTML = html;
              const imgs = wrapper.querySelectorAll('img');
              for (const img of imgs) {
                const src = img.getAttribute('src');
                if (src === targetUri) {
                  return true;
                }
              }
              return false;
            };
            const commaIdx = uri.indexOf(',');
            if (commaIdx < 0) {
              throw new Error('Invalid data URI for image paste');
            }
            const meta = uri.slice(0, commaIdx);
            const raw = uri.slice(commaIdx + 1);
            const mimeMatch = /^data:([^;]+);base64$/i.exec(meta);
            const mime = mimeMatch?.[1] || 'image/png';
            const binary = atob(raw);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
              bytes[i] = binary.charCodeAt(i);
            }
            const blob = new Blob([bytes], { type: mime });
            const file = new File([blob], 'pasted-image', { type: blob.type || 'image/png' });
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            dataTransfer.setData('text/html', '<img src="' + uri + '" alt="embedded-image" />');
      
            element.focus();
            let pasteEvent;
            try {
              pasteEvent = new ClipboardEvent('paste', {
                clipboardData: dataTransfer,
                bubbles: true,
                cancelable: true,
              });
            } catch {
              pasteEvent = new Event('paste', { bubbles: true, cancelable: true });
              Object.defineProperty(pasteEvent, 'clipboardData', { value: dataTransfer });
            }
            const pasteDispatched = element.dispatchEvent(pasteEvent);
            await new Promise(resolve => setTimeout(resolve, 3000));
            let ok = hasTargetImgInInnerHtml(element, uri);
            if (!ok) {
              const img = document.createElement('img');
              img.src = uri;
              img.alt = 'embedded-image';

              if (element.isContentEditable) {
                const selection = window.getSelection();
                if (selection && selection.rangeCount > 0) {
                  const range = selection.getRangeAt(0);
                  range.deleteContents();
                  range.insertNode(img);
                  range.setStartAfter(img);
                  range.collapse(true);
                  selection.removeAllRanges();
                  selection.addRange(range);
                } else {
                  element.appendChild(img);
                }
              } else {
                element.appendChild(img);
              }

              element.dispatchEvent(new Event('input', { bubbles: true }));
              element.dispatchEvent(new Event('change', { bubbles: true }));
              await new Promise(resolve => setTimeout(resolve, 3000));
              ok = hasTargetImgInInnerHtml(element, uri);
              if (!ok) {
                // Some editors async-sync content outside the current element subtree.
                // Avoid false negatives when paste event was accepted by editor handlers.
                if (pasteDispatched) {
                  return { dispatch: pasteDispatched, final: false };
                }
                return {
                  dispatch: pasteDispatched,
                  final: false,
                  error: 'Image insertion not persisted in editor DOM after paste and fallback',
                };
              }
            }
            return { dispatch: pasteDispatched, final: ok };
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return { dispatch: false, final: false, error: message };
          }
        }`,
        [dataUri],
      )) as { dispatch: boolean; final: boolean; error?: string } | undefined;
      if (!result || typeof result.dispatch !== 'boolean' || typeof result.final !== 'boolean') {
        return {
          success: false,
          outputLength,
          dispatch: false,
          final: false,
          networkDetected: networkWaiter.snapshot().networkDetected,
          networkCompleted: false,
          error: 'Image paste CDP function returned invalid result',
        };
      }

      const networkCompleted = await networkWaiter.waitForCompletion(waitForNetworkAfterPasteMs);
      const networkSnapshot = networkWaiter.snapshot();
      const finalDomOk = Boolean(
        await this._callOnBackendNode(
          elementNode,
          `function(uri) {
            const element = this;
            if (!(element instanceof HTMLElement)) return false;
            const html = element.innerHTML || '';
            if (!html) return false;
            const wrapper = document.createElement('div');
            wrapper.innerHTML = html;
            const imgs = wrapper.querySelectorAll('img');
            for (const img of imgs) {
              const src = img.getAttribute('src');
              if (src === uri) {
                return true;
              }
            }
            return false;
          }`,
          [dataUri],
        ),
      );

      logger.info('pasteImageDataToElementNode network/dom check', {
        tabId: this._tabId,
        networkDetected: networkSnapshot.networkDetected,
        networkCompletedCount: networkSnapshot.networkCompletedCount,
        networkCompleted,
        cdpDispatch: result.dispatch,
        cdpFinal: result.final,
        finalDomOk,
      });

      const final = result.final || finalDomOk;
      const success = final || networkCompleted;

      return {
        success,
        outputLength,
        dispatch: result.dispatch,
        final,
        networkDetected: networkSnapshot.networkDetected,
        networkCompleted,
        error: success
          ? undefined
          : (result.error ??
            (networkSnapshot.networkDetected
              ? 'Paste dispatched but no tracked network request completed before timeout'
              : 'No DOM insertion and no tracked network request after paste')),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const networkSnapshot = networkWaiter.snapshot();
      return {
        success: false,
        outputLength: 0,
        dispatch: false,
        final: false,
        networkDetected: networkSnapshot.networkDetected,
        networkCompleted: false,
        error: `Image paste failed: ${message}`,
      };
    } finally {
      if (cdp) {
        networkWaiter.stop(cdp);
      }
    }
  }

  async inputTextElementNode(
    elementNode: EnhancedDOMTreeNode,
    text: string,
    inputMode: 'override' | 'append' = 'override',
  ): Promise<void> {
    await this._ensureAttachedPage();

    try {
      await this._callOnBackendNode(
        elementNode,
        `function(value, mode) {
          const el = this;
          if (!(el instanceof HTMLElement)) {
            throw new Error('Target is not an HTMLElement');
          }
          el.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' });
          el.focus();
          const shouldAppend = mode === 'append';
          if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
            const currentValue = el.value || '';
            const nextValue = shouldAppend ? (currentValue + value) : value;
            el.value = nextValue;
            const len = el.value.length;
            if (typeof el.setSelectionRange === 'function') {
              el.setSelectionRange(len, len);
            }
          } else if (el.isContentEditable || el.getAttribute('contenteditable') === 'true') {
            const selection = window.getSelection();
            if (!selection) {
              throw new Error('Selection API unavailable');
            }

            const ensureRangeInsideEl = () => {
              if (selection.rangeCount === 0) {
                return false;
              }
              const range = selection.getRangeAt(0);
              const container = range.commonAncestorContainer;
              return container === el || el.contains(container);
            };

            if (!ensureRangeInsideEl() || shouldAppend) {
              const range = document.createRange();
              range.selectNodeContents(el);
              range.collapse(false);
              selection.removeAllRanges();
              selection.addRange(range);
            }

            if (!shouldAppend) {
              // override only clears text-like content while preserving structure where possible.
              el.textContent = '';
              const resetRange = document.createRange();
              resetRange.selectNodeContents(el);
              resetRange.collapse(false);
              selection.removeAllRanges();
              selection.addRange(resetRange);
            }

            const activeRange = selection.getRangeAt(0);
            activeRange.deleteContents();
            const textNode = document.createTextNode(value);
            activeRange.insertNode(textNode);
            activeRange.setStartAfter(textNode);
            activeRange.setEndAfter(textNode);
            selection.removeAllRanges();
            selection.addRange(activeRange);
          } else {
            const currentValue = el.textContent || '';
            const nextValue = shouldAppend ? (currentValue + value) : value;
            el.textContent = nextValue;
          }
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }`,
        [text, inputMode],
      );

      // Wait for page stability after input
      await this.waitForPageAndFramesLoad();
    } catch (error) {
      const errorMsg = `Failed to input text into element: ${elementNode}. Error: ${error instanceof Error ? error.message : String(error)}`;
      logger.error(errorMsg);
      throw new Error(errorMsg);
    }
  }

  async clickElementNode(elementNode: EnhancedDOMTreeNode): Promise<void> {
    await this._ensureAttachedPage();

    try {
      await this._callOnBackendNode(
        elementNode,
        `function() {
          const el = this;
          if (!(el instanceof HTMLElement)) {
            throw new Error('Target is not an HTMLElement');
          }
          el.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' });
          el.focus();
          if (typeof el.click === 'function') {
            el.click();
          } else {
            el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true }));
          }
          return true;
        }`,
      );
    } catch (error) {
      throw new Error(
        `Failed to click element: ${elementNode}. Error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async hoverElementNode(elementNode: EnhancedDOMTreeNode): Promise<void> {
    await this._ensureAttachedPage();

    try {
      await this._callOnBackendNode(
        elementNode,
        `function() {
          const el = this;
          if (!(el instanceof HTMLElement)) {
            throw new Error('Target is not an HTMLElement');
          }
          el.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' });
          el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, composed: true }));
          el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false, cancelable: true, composed: true }));
          el.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, composed: true }));
          return true;
        }`,
      );
    } catch (error) {
      const errorMsg = `Failed to hover element: ${elementNode}. Error: ${error instanceof Error ? error.message : String(error)}`;
      logger.error(errorMsg);
      throw new Error(errorMsg);
    }
  }

  getSelectorMap(): Map<number, EnhancedDOMTreeNode> {
    // If there is no cached state, return an empty map
    if (this._cachedState === null) {
      return new Map();
    }
    // Otherwise return the cached state's selector map
    return this._cachedState.serializedDomState.selectorMap;
  }

  getDomElementByIndex(index: number): EnhancedDOMTreeNode | null {
    const selectorMap = this.getSelectorMap();
    return selectorMap.get(index) || null;
  }

  isFileUploader(elementNode: EnhancedDOMTreeNode, maxDepth = 3, currentDepth = 0): boolean {
    if (currentDepth > maxDepth) {
      return false;
    }

    // Check current element
    if (elementNode.tagName === 'input') {
      // Check for file input attributes
      const attributes = elementNode.attributes;
      // biome-ignore lint/complexity/useLiteralKeys: <explanation>
      if (attributes['type']?.toLowerCase() === 'file' || !!attributes['accept']) {
        return true;
      }
    }

    // Recursively check children
    if (elementNode.children && currentDepth < maxDepth) {
      for (const child of elementNode.children) {
        if ('tagName' in child) {
          // EnhancedDOMTreeNode type guard
          if (this.isFileUploader(child as EnhancedDOMTreeNode, maxDepth, currentDepth + 1)) {
            return true;
          }
        }
      }
    }

    return false;
  }

  async waitForPageLoadState(timeout?: number) {
    const timeoutValue = timeout || 8000;
    await this._ensureAttachedPage();
    const cdp = this.getCDPSession();
    if (!cdp) {
      throw new Error('CDP session unavailable');
    }
    await waitForPageLoadStateWithCdp(cdp, timeoutValue);
  }

  private async _waitForStableNetwork() {
    await this._ensureAttachedPage();
    const cdp = this.getCDPSession();
    if (!cdp) {
      return;
    }
    await waitForStableNetworkWithCdp(cdp, {
      waitForNetworkIdleSeconds: this._config.waitForNetworkIdlePageLoadTime,
      maxWaitSeconds: this._config.maximumWaitPageLoadTime,
    });
    console.debug(`Network stabilized for ${this._config.waitForNetworkIdlePageLoadTime} seconds`);
  }

  async waitForPageAndFramesLoad(timeoutOverwrite?: number): Promise<void> {
    // Start timing
    const startTime = Date.now();

    // Wait for page load
    try {
      await this._waitForStableNetwork();
    } catch (error) {
      if (error instanceof URLNotAllowedError) {
        throw error;
      }
      console.warn('Page load failed, continuing...', error);
    }

    // Calculate remaining time to meet minimum wait time
    const elapsed = (Date.now() - startTime) / 1000; // Convert to seconds
    const minWaitTime = timeoutOverwrite || this._config.minimumWaitPageLoadTime;
    const remaining = Math.max(minWaitTime - elapsed, 0);

    console.debug(
      `--Page loaded in ${elapsed.toFixed(2)} seconds, waiting for additional ${remaining.toFixed(2)} seconds`,
    );

    // Sleep remaining time if needed
    if (remaining > 0) {
      await new Promise(resolve => setTimeout(resolve, remaining * 1000)); // Convert seconds to milliseconds
    }
  }
}
