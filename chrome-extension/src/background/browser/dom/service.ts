import { createLogger } from '@src/background/log';
import type { BuildDomTreeArgs, RawDomTreeNode } from './raw_types';
import { type DOMState, type DOMBaseNode, DOMElementNode, DOMTextNode } from './views';

import { isNewTabPage } from '../util';
import { DomService, NodeType } from './domService';
import type { SimplifiedNode } from './domSerializer';
import type { Page as PuppeteerPage, CDPSession as PuppeteerCDPSession } from 'puppeteer-core';
const logger = createLogger('DOMService');

/** Page 的主 CDP 客户端；公开类型不含 `_client`，扩展里也不能用 `createCDPSession()` */
function getPuppeteerPageMainClient(page: PuppeteerPage | null | undefined): PuppeteerCDPSession | null {
  if (page == null) {
    return null;
  }
  const client = (page as unknown as { _client?: () => PuppeteerCDPSession })._client?.();
  return client ?? null;
}

export interface ReadabilityResult {
  title: string;
  content: string;
  textContent: string;
  length: number;
  excerpt: string;
  byline: string;
  dir: string;
  siteName: string;
  lang: string;
  publishedTime: string;
}

export interface FrameInfo {
  frameId: number;
  computedHeight: number;
  computedWidth: number;
  href: string | null;
  name: string | null;
  title: string | null;
}

declare global {
  interface Window {
    buildDomTree: (args: BuildDomTreeArgs) => RawDomTreeNode | null;
    turn2Markdown: (selector?: string) => string;
    parserReadability: () => ReadabilityResult | null;
  }
}

/**
 * Get the markdown content for the current page.
 * @param tabId - The ID of the tab to get the markdown content for.
 * @param selector - The selector to get the markdown content for. If not provided, the body of the entire page will be converted to markdown.
 * @returns The markdown content for the selected element on the current page.
 */
export async function getMarkdownContent(tabId: number, selector?: string): Promise<string> {
  const results = await chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: sel => {
      return window.turn2Markdown(sel);
    },
    args: [selector || ''], // Pass the selector as an argument
  });

  const result = results[0]?.result;
  if (!result) {
    throw new Error('Failed to get markdown content');
  }
  return result as string;
}

/**
 * Get the readability content for the current page.
 * @param tabId - The ID of the tab to get the readability content for.
 * @returns The readability content for the current page.
 */
export async function getReadabilityContent(tabId: number): Promise<ReadabilityResult> {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      return window.parserReadability();
    },
  });
  const result = results[0]?.result;
  if (!result) {
    throw new Error('Failed to get readability content');
  }
  return result as ReadabilityResult;
}

/**
 * Get the clickable elements for the current page.
 * @param tabId - The ID of the tab to get the clickable elements for.
 * @param url - The URL of the page.
 * @param showHighlightElements - Whether to show the highlight elements.
 * @param focusElement - The element to focus on.
 * @param viewportExpansion - The viewport expansion to use.
 * @returns A DOMState object containing the clickable elements for the current page.
 */
export async function getClickableElements(
  tabId: number,
  url: string,
  focusElement = -1,
  viewportExpansion = 0,
  debugMode = false,
  page?: PuppeteerPage,
): Promise<DOMState> {
  const cdpSession = getPuppeteerPageMainClient(page);
  if (!cdpSession) {
    throw new Error('Failed to get CDP session (page missing or not connected)');
  }

  const [elementTree, selectorMap] = await _buildDomTree(
    tabId,
    url,
    focusElement,
    viewportExpansion,
    debugMode,
    cdpSession,
    page,
  );

  logger.debug('getClickableElements done', {
    selectorMapSize: selectorMap.size,
    elementTreeTagName: elementTree.tagName,
  });

  return { elementTree, selectorMap };
}

/**
 * 将 `SerializedDOMState` 的简化树转为 `DOMElementNode` 树，并构建与 LLM 中 `[backendNodeId]` 一致的 selectorMap。
 */
function domStateFromSerializedRoot(
  root: SimplifiedNode | null,
): [DOMElementNode, Map<number, DOMElementNode>] {
  const selectorMap = new Map<number, DOMElementNode>();

  const convert = (node: SimplifiedNode, parent: DOMElementNode | null): DOMBaseNode => {
    const orig = node.originalNode;

    if (orig.nodeType === NodeType.TEXT_NODE) {
      const text = orig.nodeValue ?? '';
      const visible = orig.isVisible !== false;
      return new DOMTextNode(text, visible, parent ?? undefined);
    }

    const snap = orig.snapshotNode;
    const isVisible =
      orig.isVisible !== false &&
      (snap?.clientRects != null || orig.nodeType === NodeType.ELEMENT_NODE || orig.nodeType === NodeType.DOCUMENT_FRAGMENT_NODE);

    const domEl = new DOMElementNode({
      tagName: orig.tagName || null,
      xpath: orig.xpath,
      attributes: { ...orig.attributes },
      children: [],
      isVisible: Boolean(isVisible),
      isInteractive: node.isInteractive,
      isTopElement: false,
      isInViewport: Boolean(snap?.bounds && snap.bounds.width > 0 && snap.bounds.height > 0),
      shadowRoot: Boolean(orig.shadowRootType),
      highlightIndex: node.isInteractive ? orig.backendNodeId : null,
      isNew: node.isNew,
      parent,
    });

    for (const child of node.children) {
      domEl.children.push(convert(child, domEl));
    }

    if (node.isInteractive) {
      selectorMap.set(orig.backendNodeId, domEl);
    }

    return domEl;
  };

  if (!root) {
    const elementTree = new DOMElementNode({
      tagName: 'body',
      xpath: '',
      attributes: {},
      children: [],
      isVisible: false,
      isInteractive: false,
      isTopElement: false,
      isInViewport: false,
      parent: null,
    });
    return [elementTree, selectorMap];
  }

  const built = convert(root, null);
  if (built instanceof DOMElementNode) {
    return [built, selectorMap];
  }

  const elementTree = new DOMElementNode({
    tagName: 'body',
    xpath: '',
    attributes: {},
    children: [built],
    isVisible: true,
    isInteractive: false,
    isTopElement: false,
    isInViewport: false,
    parent: null,
  });
  built.parent = elementTree;
  return [elementTree, selectorMap];
}

async function _buildDomTree(
  tabId: number,
  url: string,

  focusElement = -1,
  viewportExpansion = 0,
  debugMode = false,
  cdpSession?: PuppeteerCDPSession,
  page?: PuppeteerPage,
): Promise<[DOMElementNode, Map<number, DOMElementNode>]> {
  void focusElement;
  void viewportExpansion;

  if (!cdpSession || !page) {
    throw new Error('Failed to create CDP session or page');
  }

  // If URL is provided and it's about:blank, return a minimal DOM tree
  if (isNewTabPage(url) || url.startsWith('chrome://')) {
    const elementTree = new DOMElementNode({
      tagName: 'body',
      xpath: '',
      attributes: {},
      children: [],
      isVisible: false,
      isInteractive: false,
      isTopElement: false,
      isInViewport: false,
      parent: null,
    });
    return [elementTree, new Map<number, DOMElementNode>()];
  }

  const domService = new DomService();
  const [serializedDomState, , timingInfo] = await domService.getSerializedDomTree(
    page,
    cdpSession,
    tabId.toString(),
  );

  if (debugMode) {
    logger.debug('getSerializedDomTree timing', timingInfo);
  }

  return domStateFromSerializedRoot(serializedDomState._root);
}

export async function getScrollInfo(tabId: number): Promise<[number, number, number]> {
  const results = await chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: () => {
      const scrollY = window.scrollY;
      const visualViewportHeight = window.visualViewport?.height || window.innerHeight;
      const scrollHeight = document.body.scrollHeight;
      return {
        scrollY: scrollY,
        visualViewportHeight: visualViewportHeight,
        scrollHeight: scrollHeight,
      };
    },
  });

  const result = results[0]?.result;
  if (!result) {
    throw new Error('Failed to get scroll information');
  }
  return [result.scrollY, result.visualViewportHeight, result.scrollHeight];
}

/** 在可脚本化页面注入 `buildDomTree.js`，提供 `window.buildDomTree`（供自动化 DOM 采集使用） */
export async function injectBuildDomTreeScripts(tabId: number): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['buildDomTree.js'],
    });
  } catch (e) {
    logger.debug('injectBuildDomTreeScripts failed', tabId, e);
  }
}
