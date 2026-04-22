import 'webextension-polyfill';
import { connect, ExtensionTransport } from 'puppeteer-core';

import type {
  Page as PuppeteerPage,
  Browser,
  CDPSession as PuppeteerCDPSession,
  KeyInput,
  ProtocolType,
  HTTPRequest,
  HTTPResponse,
} from 'puppeteer-core';

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
  private _browser: Browser | null = null;
  private _puppeteerPage: PuppeteerPage | null = null;
  private _config: BrowserContextConfig;
  private _state: PageState;
  private _cachedState: PageState | null = null;
  private _cachedStateClickableElementsHashes: CachedStateClickableElementsHashes | null = null;
  private _evaluateWrapped = false;

  constructor(tabId: number, url: string, title: string, config: Partial<BrowserContextConfig> = {}) {
    this._tabId = tabId;
    this._config = { ...DEFAULT_BROWSER_CONTEXT_CONFIG, ...config };
    this._state = build_initial_state(tabId, url, title);
  }

  get tabId(): number {
    return this._tabId;
  }

  get attached(): boolean {
    return this._puppeteerPage !== null;
  }

  async attachPuppeteer(): Promise<boolean> {
    if (this._puppeteerPage) {
      return true;
    }

    logger.info('attaching puppeteer', this._tabId);
    const browser = await connect({
      transport: await ExtensionTransport.connectTab(this._tabId),
      defaultViewport: null,
      protocol: 'cdp' as ProtocolType,
    });
    this._browser = browser;

    const [page] = await browser.pages();
    this._puppeteerPage = page;

    this._wrapEvaluateForDebug();

    // Add anti-detection scripts
    await this._addAntiDetectionScripts();

    return true;
  }

  private async _addAntiDetectionScripts(): Promise<void> {
    if (!this._puppeteerPage) {
      return;
    }

    await this._puppeteerPage.evaluateOnNewDocument(`
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
    `);
  }

  private _serializeEvaluateFunction(fnOrScript: unknown): string {
    if (typeof fnOrScript === 'string') {
      return fnOrScript;
    }
    if (typeof fnOrScript === 'function') {
      return fnOrScript.toString();
    }
    try {
      return JSON.stringify(fnOrScript);
    } catch {
      return String(fnOrScript);
    }
  }

  private _wrapEvaluateForDebug(): void {
    if (!import.meta.env.DEV || !this._puppeteerPage || this._evaluateWrapped) {
      return;
    }
    const page = this._puppeteerPage as PuppeteerPage;
    const originalEvaluate = (page.evaluate as (...args: unknown[]) => Promise<unknown>).bind(page);
    (page as unknown as { evaluate: (...args: unknown[]) => Promise<unknown> }).evaluate = async (
      ...args: unknown[]
    ) => {
      const [fnOrScript, ...restArgs] = args;
      logger.debug('[puppeteer.evaluate] script/function:', this._serializeEvaluateFunction(fnOrScript));
      if (restArgs.length > 0) {
        logger.debug('[puppeteer.evaluate] args:', restArgs);
      }
      return originalEvaluate(...args);
    };
    this._evaluateWrapped = true;
  }

  async detachPuppeteer(): Promise<void> {
    if (this._browser) {
      await this._browser.disconnect();
      this._browser = null;
      this._puppeteerPage = null;

      logger.debug('detachPuppeteer:done', { tabId: this._tabId });
      // reset the state
      this._state = build_initial_state(this._tabId);
    }
  }

  private async _ensurePuppeteerPage(): Promise<PuppeteerPage> {
    if (this._puppeteerPage) {
      return this._puppeteerPage;
    }

    logger.warning('Puppeteer page missing, attempting auto reconnect', { tabId: this._tabId });
    const attached = await this.attachPuppeteer();
    if (!attached || !this._puppeteerPage) {
      throw new Error('Puppeteer is not connected');
    }

    logger.info('Puppeteer auto reconnect succeeded', { tabId: this._tabId });
    return this._puppeteerPage;
  }

  async getClickableElements(focusElement: number): Promise<EnhancedDOMState | null> {
    const puppeteerPage = await this._ensurePuppeteerPage();
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
      puppeteerPage,
      cdpSession,
    );
  }

  /** Puppeteer Page 的主 CDP 客户端；公开类型不含 `_client`，扩展里也不能用 `createCDPSession()` */
  private getCDPSession(): PuppeteerCDPSession | null {
    if (!this._puppeteerPage) {
      return null;
    }
    const client = (this._puppeteerPage as unknown as { _client?: () => PuppeteerCDPSession })._client?.();
    return client ?? null;
  }

  // Get scroll position information for the current page.
  async getScrollInfo(): Promise<[number, number, number]> {
    return _getScrollInfo(this._tabId);
  }

  // Get scroll position information for a specific element.
  async getElementScrollInfo(elementNode: EnhancedDOMTreeNode): Promise<[number, number, number]> {
    await this._ensurePuppeteerPage();

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
    const puppeteerPage = await this._ensurePuppeteerPage();
    return await puppeteerPage.content();
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
      // @ts-expect-error - puppeteerPage is not null, already checked before calling this function
      await this._puppeteerPage.evaluate('1');
    } catch (error) {
      logger.warning('Current page is no longer accessible:', error);
      if (this._browser) {
        const pages = await this._browser.pages();
        if (pages.length > 0) {
          this._puppeteerPage = pages[0];
        } else {
          throw new Error('Browser closed: no valid pages available');
        }
      }
    }

    try {
      const currentUrl = this._puppeteerPage?.url() ?? '';
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
      this._state.url = this._puppeteerPage?.url() || '';
      this._state.title = (await this._puppeteerPage?.title()) || '';
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
    const puppeteerPage = await this._ensurePuppeteerPage();

    try {
      // First disable animations/transitions
      await puppeteerPage.evaluate(() => {
        const styleId = 'puppeteer-disable-animations';
        if (!document.getElementById(styleId)) {
          const style = document.createElement('style');
          style.id = styleId;
          style.textContent = `
            *, *::before, *::after {
              animation: none !important;
              transition: none !important;
            }
          `;
          document.head.appendChild(style);
        }
      });

      // Take the screenshot using JPEG format with 80% quality
      const screenshot = await puppeteerPage.screenshot({
        fullPage: fullPage,
        encoding: 'base64',
        type: 'jpeg',
        quality: 80, // Good balance between quality and file size
      });

      // Clean up the style element
      await puppeteerPage.evaluate(() => {
        const style = document.getElementById('puppeteer-disable-animations');
        if (style) {
          style.remove();
        }
      });

      return screenshot as string;
    } catch (error) {
      logger.error('Failed to take screenshot:', error);
      throw error;
    }
  }

  url(): string {
    if (this._puppeteerPage) {
      return this._puppeteerPage.url();
    }
    return this._state.url;
  }

  async title(): Promise<string> {
    if (this._puppeteerPage) {
      return await this._puppeteerPage.title();
    }
    return this._state.title;
  }

  async navigateTo(url: string): Promise<void> {
    const puppeteerPage = await this._ensurePuppeteerPage();
    logger.info('navigateTo', url);

    // Check if URL is allowed
    if (!isUrlAllowed(url, this._config.allowedUrls, this._config.deniedUrls)) {
      throw new URLNotAllowedError(`URL: ${url} is not allowed`);
    }

    try {
      await Promise.all([this.waitForPageAndFramesLoad(), puppeteerPage.goto(url)]);
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
    const puppeteerPage = await this._ensurePuppeteerPage();

    try {
      await Promise.all([this.waitForPageAndFramesLoad(), puppeteerPage.reload()]);
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
    const puppeteerPage = await this._ensurePuppeteerPage();

    try {
      await Promise.all([this.waitForPageAndFramesLoad(), puppeteerPage.goBack()]);
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
    const puppeteerPage = await this._ensurePuppeteerPage();

    try {
      await Promise.all([this.waitForPageAndFramesLoad(), puppeteerPage.goForward()]);
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
    const puppeteerPage = await this._ensurePuppeteerPage();
    if (!elementNode) {
      await puppeteerPage.evaluate(yPercent => {
        const scrollHeight = document.documentElement.scrollHeight;
        const viewportHeight = window.visualViewport?.height || window.innerHeight;
        const scrollTop = (scrollHeight - viewportHeight) * (yPercent / 100);
        window.scrollTo({
          top: scrollTop,
          left: window.scrollX,
          behavior: 'smooth',
        });
      }, yPercent);
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
    const puppeteerPage = await this._ensurePuppeteerPage();
    if (!elementNode) {
      await puppeteerPage.evaluate(y => {
        window.scrollBy({
          top: y,
          left: 0,
          behavior: 'smooth',
        });
      }, y);
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
    const puppeteerPage = await this._ensurePuppeteerPage();

    if (!elementNode) {
      // Scroll the whole page up by viewport height
      await puppeteerPage.evaluate('window.scrollBy(0, -(window.visualViewport?.height || window.innerHeight));');
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
    const puppeteerPage = await this._ensurePuppeteerPage();

    if (!elementNode) {
      // Scroll the whole page down by viewport height
      await puppeteerPage.evaluate('window.scrollBy(0, (window.visualViewport?.height || window.innerHeight));');
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
    const puppeteerPage = await this._ensurePuppeteerPage();

    // Split combination keys (e.g., "Control+A" or "Shift+ArrowLeft")
    const keyParts = keys.split('+');
    const modifiers = keyParts.slice(0, -1);
    const mainKey = keyParts[keyParts.length - 1];

    // Press modifiers and main key, ensure modifiers are released even if an error occurs.
    try {
      // Press all modifier keys (e.g., Control, Shift, etc.)
      for (const modifier of modifiers) {
        await puppeteerPage.keyboard.down(this._convertKey(modifier));
      }
      // Press the main key
      // also wait for stable state
      await Promise.all([puppeteerPage.keyboard.press(this._convertKey(mainKey)), this.waitForPageAndFramesLoad()]);
      logger.info('sendKeys complete', keys);
    } catch (error) {
      logger.error('Failed to send keys:', error);
      throw new Error(`Failed to send keys: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      // Release all modifier keys in reverse order regardless of any errors in key press.
      for (const modifier of [...modifiers].reverse()) {
        try {
          await puppeteerPage.keyboard.up(this._convertKey(modifier));
        } catch (releaseError) {
          logger.error('Failed to release modifier:', modifier, releaseError);
        }
      }
    }
  }

  private _convertKey(key: string): KeyInput {
    const lowerKey = key.trim().toLowerCase();
    const isMac = navigator.userAgent.toLowerCase().includes('mac os x');

    if (isMac) {
      if (lowerKey === 'control' || lowerKey === 'ctrl') {
        return 'Meta' as KeyInput; // Use Command key on Mac
      }
      if (lowerKey === 'command' || lowerKey === 'cmd') {
        return 'Meta' as KeyInput; // Map Command/Cmd to Meta on Mac
      }
      if (lowerKey === 'option' || lowerKey === 'opt') {
        return 'Alt' as KeyInput; // Map Option/Opt to Alt on Mac
      }
    }

    const keyMap: { [key: string]: string } = {
      // Letters
      a: 'KeyA',
      b: 'KeyB',
      c: 'KeyC',
      d: 'KeyD',
      e: 'KeyE',
      f: 'KeyF',
      g: 'KeyG',
      h: 'KeyH',
      i: 'KeyI',
      j: 'KeyJ',
      k: 'KeyK',
      l: 'KeyL',
      m: 'KeyM',
      n: 'KeyN',
      o: 'KeyO',
      p: 'KeyP',
      q: 'KeyQ',
      r: 'KeyR',
      s: 'KeyS',
      t: 'KeyT',
      u: 'KeyU',
      v: 'KeyV',
      w: 'KeyW',
      x: 'KeyX',
      y: 'KeyY',
      z: 'KeyZ',

      // Numbers
      '0': 'Digit0',
      '1': 'Digit1',
      '2': 'Digit2',
      '3': 'Digit3',
      '4': 'Digit4',
      '5': 'Digit5',
      '6': 'Digit6',
      '7': 'Digit7',
      '8': 'Digit8',
      '9': 'Digit9',

      // Special keys
      control: 'Control',
      shift: 'Shift',
      alt: 'Alt',
      meta: 'Meta',
      enter: 'Enter',
      backspace: 'Backspace',
      delete: 'Delete',
      arrowleft: 'ArrowLeft',
      arrowright: 'ArrowRight',
      arrowup: 'ArrowUp',
      arrowdown: 'ArrowDown',
      escape: 'Escape',
      tab: 'Tab',
      space: 'Space',
    };

    const convertedKey = keyMap[lowerKey] || key;
    logger.info('convertedKey', convertedKey);
    return convertedKey as KeyInput;
  }

  async scrollToText(text: string, nth: number = 1): Promise<boolean> {
    const puppeteerPage = await this._ensurePuppeteerPage();

    try {
      const found = await puppeteerPage.evaluate(
        ({ targetText, targetNth }) => {
          const lowerCaseText = targetText.toLowerCase();
          const nodes = Array.from(document.querySelectorAll<HTMLElement>('body *'));
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
        },
        { targetText: text, targetNth: nth },
      );
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
    await this._ensurePuppeteerPage();

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
    await this._ensurePuppeteerPage();

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

  private async _resolveBackendObjectId(elementNode: EnhancedDOMTreeNode): Promise<string> {
    const backendNodeId = elementNode.backendNodeId;
    if (!backendNodeId) {
      throw new Error('Missing backendNodeId');
    }
    const cdp = this.getCDPSession();
    if (!cdp) {
      throw new Error('CDP session unavailable');
    }
    const resolved = await cdp.send('DOM.resolveNode', { backendNodeId });
    const objectId = resolved.object?.objectId;
    if (!objectId) {
      throw new Error(`Failed to resolve backendNodeId: ${backendNodeId}`);
    }
    return objectId;
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
    const objectId = await this._resolveBackendObjectId(elementNode);
    try {
      const result = await cdp.send('Runtime.callFunctionOn', {
        objectId,
        functionDeclaration,
        arguments: args.map(value => ({ value })),
        returnByValue,
        awaitPromise: true,
      });
      return result.result?.value;
    } finally {
      await cdp.send('Runtime.releaseObject', { objectId }).catch(() => undefined);
    }
  }

  async isElementVisibleByBackendNode(elementNode: EnhancedDOMTreeNode): Promise<boolean> {
    await this._ensurePuppeteerPage();
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
    await this._ensurePuppeteerPage();
    const cdp = this.getCDPSession();
    const waitForNetworkAfterPasteMs = 3000;
    let networkTrackingStarted = false;
    let networkDetected = false;
    let networkCompletedCount = 0;
    const seenRequestIds = new Set<string>();

    const onRequestWillBeSent = (event: { requestId?: string; request?: { url?: string } }) => {
      if (!networkTrackingStarted) return;
      const requestId = event.requestId;
      const url = event.request?.url ?? '';
      if (!requestId || !url || url.startsWith('data:')) return;
      networkDetected = true;
      seenRequestIds.add(requestId);
      logger.info('pasteImage network request detected', {
        tabId: this._tabId,
        requestId,
        url,
      });
    };

    const onLoadingFinished = (event: { requestId?: string }) => {
      if (!networkTrackingStarted) return;
      const requestId = event.requestId;
      if (!requestId) return;
      if (seenRequestIds.has(requestId)) {
        networkCompletedCount += 1;
        logger.info('pasteImage network request finished', {
          tabId: this._tabId,
          requestId,
          networkCompletedCount,
        });
      }
    };

    const onLoadingFailed = (event: { requestId?: string }) => {
      if (!networkTrackingStarted) return;
      const requestId = event.requestId;
      if (!requestId) return;
      if (seenRequestIds.has(requestId)) {
        networkCompletedCount += 1;
        logger.warning('pasteImage network request failed', {
          tabId: this._tabId,
          requestId,
          networkCompletedCount,
        });
      }
    };

    const waitForNetworkCompletion = async (): Promise<boolean> => {
      const deadline = Date.now() + waitForNetworkAfterPasteMs;
      while (Date.now() < deadline) {
        if (networkDetected && networkCompletedCount > 0) {
          return true;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return networkDetected && networkCompletedCount > 0;
    };

    try {
      if (cdp) {
        await cdp.send('Network.enable').catch(() => undefined);
        cdp.on('Network.requestWillBeSent', onRequestWillBeSent);
        cdp.on('Network.loadingFinished', onLoadingFinished);
        cdp.on('Network.loadingFailed', onLoadingFailed);
      }

      const response = await fetch(imageUrl);
      if (!response.ok) {
        return {
          success: false,
          outputLength: 0,
          dispatch: false,
          final: false,
          networkDetected,
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
      networkTrackingStarted = true;
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
            dataTransfer.setData('text/plain', '');
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
          networkDetected,
          networkCompleted: false,
          error: 'Image paste CDP function returned invalid result',
        };
      }

      const networkCompleted = await waitForNetworkCompletion();
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
        networkDetected,
        networkCompletedCount,
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
        networkDetected,
        networkCompleted,
        error: success
          ? undefined
          : (result.error ??
            (networkDetected
              ? 'Paste dispatched but no tracked network request completed before timeout'
              : 'No DOM insertion and no tracked network request after paste')),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        outputLength: 0,
        dispatch: false,
        final: false,
        networkDetected,
        networkCompleted: false,
        error: `Image paste failed: ${message}`,
      };
    } finally {
      networkTrackingStarted = false;
      if (cdp) {
        cdp.off('Network.requestWillBeSent', onRequestWillBeSent);
        cdp.off('Network.loadingFinished', onLoadingFinished);
        cdp.off('Network.loadingFailed', onLoadingFailed);
      }
    }
  }

  async inputTextElementNode(
    elementNode: EnhancedDOMTreeNode,
    text: string,
    inputMode: 'override' | 'append' = 'override',
  ): Promise<void> {
    await this._ensurePuppeteerPage();

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
          const currentValue =
            el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
              ? el.value
              : el.isContentEditable
                ? (el.textContent || '')
                : (el.textContent || '');
          const nextValue = shouldAppend ? (currentValue + value) : value;
          if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
            el.value = nextValue;
            const len = el.value.length;
            if (typeof el.setSelectionRange === 'function') {
              el.setSelectionRange(len, len);
            }
          } else {
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
    await this._ensurePuppeteerPage();

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
    await this._ensurePuppeteerPage();

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
    await this._puppeteerPage?.waitForNavigation({ timeout: timeoutValue });
  }

  private async _waitForStableNetwork() {
    const puppeteerPage = await this._ensurePuppeteerPage();

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
      // Analytics and tracking
      'analytics',
      'tracking',
      'telemetry',
      'beacon',
      'metrics',
      // Ad-related
      'doubleclick',
      'adsystem',
      'adserver',
      'advertising',
      // Social media widgets
      'facebook.com/plugins',
      'platform.twitter',
      'linkedin.com/embed',
      // Live chat and support
      'livechat',
      'zendesk',
      'intercom',
      'crisp.chat',
      'hotjar',
      // Push notifications
      'push-notifications',
      'onesignal',
      'pushwoosh',
      // Background sync/heartbeat
      'heartbeat',
      'ping',
      'alive',
      // WebRTC and streaming
      'webrtc',
      'rtmp://',
      'wss://',
      // Common CDNs
      'cloudfront.net',
      'fastly.net',
    ]);

    const pendingRequests = new Set();
    let lastActivity = Date.now();

    const onRequest = (request: HTTPRequest) => {
      // Filter by resource type
      const resourceType = request.resourceType();
      if (!RELEVANT_RESOURCE_TYPES.has(resourceType)) {
        return;
      }

      // Filter out streaming, websocket, and other real-time requests
      if (['websocket', 'media', 'eventsource', 'manifest', 'other'].includes(resourceType)) {
        return;
      }

      // Filter out by URL patterns
      const url = request.url().toLowerCase();
      if (Array.from(IGNORED_URL_PATTERNS).some(pattern => url.includes(pattern))) {
        return;
      }

      // Filter out data URLs and blob URLs
      if (url.startsWith('data:') || url.startsWith('blob:')) {
        return;
      }

      // Filter out requests with certain headers
      const headers = request.headers();
      if (
        // biome-ignore lint/complexity/useLiteralKeys: <explanation>
        headers['purpose'] === 'prefetch' ||
        headers['sec-fetch-dest'] === 'video' ||
        headers['sec-fetch-dest'] === 'audio'
      ) {
        return;
      }

      pendingRequests.add(request);
      lastActivity = Date.now();
    };

    const onResponse = (response: HTTPResponse) => {
      const request = response.request();
      if (!pendingRequests.has(request)) {
        return;
      }

      // Filter by content type
      const contentType = response.headers()['content-type']?.toLowerCase() || '';

      // Skip streaming content
      if (
        ['streaming', 'video', 'audio', 'webm', 'mp4', 'event-stream', 'websocket', 'protobuf'].some(t =>
          contentType.includes(t),
        )
      ) {
        pendingRequests.delete(request);
        return;
      }

      // Only process relevant content types
      if (!Array.from(RELEVANT_CONTENT_TYPES).some(ct => contentType.includes(ct))) {
        pendingRequests.delete(request);
        return;
      }

      // Skip large responses
      const contentLength = response.headers()['content-length'];
      if (contentLength && Number.parseInt(contentLength) > 5 * 1024 * 1024) {
        // 5MB
        pendingRequests.delete(request);
        return;
      }

      pendingRequests.delete(request);
      lastActivity = Date.now();
    };

    // Add event listeners
    puppeteerPage.on('request', onRequest);
    puppeteerPage.on('response', onResponse);

    try {
      const startTime = Date.now();

      // eslint-disable-next-line no-constant-condition
      while (true) {
        await new Promise(resolve => setTimeout(resolve, 100));

        const now = Date.now();
        const timeSinceLastActivity = (now - lastActivity) / 1000; // Convert to seconds

        if (pendingRequests.size === 0 && timeSinceLastActivity >= this._config.waitForNetworkIdlePageLoadTime) {
          break;
        }

        const elapsedTime = (now - startTime) / 1000; // Convert to seconds
        if (elapsedTime > this._config.maximumWaitPageLoadTime) {
          console.debug(
            `Network timeout after ${this._config.maximumWaitPageLoadTime}s with ${pendingRequests.size} pending requests:`,
            Array.from(pendingRequests).map(r => (r as HTTPRequest).url()),
          );
          break;
        }
      }
    } finally {
      // Clean up event listeners
      puppeteerPage.off('request', onRequest);
      puppeteerPage.off('response', onResponse);
    }
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
