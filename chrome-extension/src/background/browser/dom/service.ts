import { createLogger } from '@src/background/log';
import { DomService, EnhancedDOMTreeNode, NodeType } from './domService';
import { SerializedDOMState } from './serializedDOMState';
import type { AutomationCDPSession } from '../automation/types';
const logger = createLogger('DOMService');

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

export interface EnhancedDOMState {
  elementTree: EnhancedDOMTreeNode;
  serializedDomState: SerializedDOMState;
}

/**
 * Get the clickable elements for the current page.
 * @param tabId - The ID of the tab to get the clickable elements for.
 * @param url - The URL of the page.
 * @param showHighlightElements - Whether to show the highlight elements.
 * @param focusElement - The element to focus on.
 * @param viewportExpansion - The viewport expansion to use.
 * @returns EnhancedDOMState containing tree and serialized state for current page.
 */
export async function getClickableElements(
  tabId: number,
  url: string,
  focusElement = -1,
  viewportExpansion = 0,
  debugMode = false,
  cdpSession?: AutomationCDPSession,
): Promise<EnhancedDOMState> {
  if (!cdpSession) {
    throw new Error('Failed to get CDP session (page missing or not connected)');
  }

  const [enhancedDomTree, serializedDomState] = await _buildDomTree(
    tabId,
    url,
    focusElement,
    viewportExpansion,
    debugMode,
    cdpSession,
  );

  logger.debug('getClickableElements done', {
    selectorMapSize: serializedDomState.selectorMap.size,
    elementTreeTagName: enhancedDomTree.tagName,
  });

  return {
    elementTree: enhancedDomTree,
    serializedDomState: serializedDomState,
  };
}

async function _buildDomTree(
  tabId: number,
  url: string,

  focusElement = -1,
  viewportExpansion = 0,
  debugMode = false,
  cdpSession?: AutomationCDPSession,
): Promise<[EnhancedDOMTreeNode, SerializedDOMState]> {
  void focusElement;
  void viewportExpansion;

  if (!cdpSession) {
    throw new Error('Failed to create CDP session');
  }

  // Only return an empty DOM state for invalid URL values.
  if (!url.trim()) {
    const elementTree = new EnhancedDOMTreeNode({
      nodeId: 0,
      backendNodeId: 0,
      nodeType: NodeType.ELEMENT_NODE,
      nodeName: 'body',
      nodeValue: null,
      attributes: {},
      isScrollable: null,
      isVisible: false,
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
    });
    return [elementTree, new SerializedDOMState(null, new Map())];
  }

  const domService = new DomService();
  const [serializedDomState, enhancedDomTree, timingInfo] = await domService.getSerializedDomTree(
    cdpSession,
    tabId.toString(),
  );

  if (debugMode) {
    logger.debug('getSerializedDomTree timing', timingInfo);
  }

  return [enhancedDomTree, serializedDomState];
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
