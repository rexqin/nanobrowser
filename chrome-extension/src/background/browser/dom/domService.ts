import type { Page, CDPSession } from 'puppeteer-core';

import { EnhancedDOMTreeNode } from './enhancedDOMTreeNode';
import { buildSnapshotLookup, REQUIRED_COMPUTED_STYLES } from './enhancedSnapshot';
import { DOMTreeSerializer } from './domSerializer';
import type { SerializedDOMState } from './serializedDOMState';

export interface DOMRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export enum NodeType {
  ELEMENT_NODE = 1,
  ATTRIBUTE_NODE = 2,
  TEXT_NODE = 3,
  CDATA_SECTION_NODE = 4,
  ENTITY_REFERENCE_NODE = 5,
  ENTITY_NODE = 6,
  PROCESSING_INSTRUCTION_NODE = 7,
  COMMENT_NODE = 8,
  DOCUMENT_NODE = 9,
  DOCUMENT_TYPE_NODE = 10,
  DOCUMENT_FRAGMENT_NODE = 11,
  NOTATION_NODE = 12,
}

export interface EnhancedAXProperty {
  name: string;
  value: any;
}

export interface EnhancedAXNode {
  axNodeId: number;
  ignored: boolean;
  role: string | null;
  name: string | null;
  description: string | null;
  properties: EnhancedAXProperty[] | null;
  childIds: number[] | null;
}

export interface SnapshotNode {
  bounds: DOMRect | null;
  computedStyles: Record<string, string> | null;
  scrollRects: DOMRect | null;
  clientRects: DOMRect | null;
  isClickable: boolean;
  cursorStyle?: string | null;
  paintOrder?: number | null;
  stackingContexts?: any;
}

// EnhancedDOMTreeNode 现在是一个类，定义在 enhancedDOMTreeNode.ts 中
export { EnhancedDOMTreeNode } from './enhancedDOMTreeNode';

export interface TargetAllTrees {
  snapshot: any;
  domTree: any;
  axTree: any;
  devicePixelRatio: number;
  cdpTiming: {
    iframeScrollDetectionMs: number;
    cdpParallelCallsMs: number;
    snapshotProcessingMs: number;
  };
}

// SerializedDOMState 现在是一个类，定义在 serializedDOMState.ts 中
// 这里保留类型引用以便向后兼容
export type { SerializedDOMState } from './serializedDOMState.js';

export interface TimingInfo {
  [key: string]: number;
}

export interface PaginationButton {
  buttonType: 'next' | 'prev' | 'first' | 'last' | 'page_number';
  backendNodeId: number;
  text: string;
  selector: string;
  isDisabled: boolean;
}

// 导出 REQUIRED_COMPUTED_STYLES
export { REQUIRED_COMPUTED_STYLES } from './enhancedSnapshot';

export class DomService {
  declare readonly _serviceBrand: undefined;
  // @ts-expect-error - 将在未来用于跨域 iframe 处理
  private _crossOriginIframes: boolean = false;
  // @ts-expect-error - 将在未来用于绘制顺序过滤
  private _paintOrderFiltering: boolean = true;
  private maxIframes: number = 100;
  // @ts-expect-error - 将在未来用于限制 iframe 深度
  private _maxIframeDepth: number = 5;

  constructor(
    crossOriginIframes: boolean = false,
    paintOrderFiltering: boolean = true,
    maxIframes: number = 100,
    maxIframeDepth: number = 5,
  ) {
    this._crossOriginIframes = crossOriginIframes;
    this._paintOrderFiltering = paintOrderFiltering;
    this.maxIframes = maxIframes;
    this._maxIframeDepth = maxIframeDepth;
  }

  /**
   * 构建增强的 AX 节点
   */
  private buildEnhancedAXNode(axNode: any): EnhancedAXNode {
    let properties: EnhancedAXProperty[] | null = null;

    if (axNode.properties && Array.isArray(axNode.properties)) {
      properties = [];
      for (const prop of axNode.properties) {
        try {
          properties.push({
            name: prop.name,
            value: prop.value?.value ?? null,
          });
        } catch {
          // 忽略无效的属性
        }
      }
    }

    return {
      axNodeId: axNode.nodeId,
      ignored: axNode.ignored ?? false,
      role: axNode.role?.value ?? null,
      name: axNode.name?.value ?? null,
      description: axNode.description?.value ?? null,
      properties: properties,
      childIds: axNode.childIds ?? null,
    };
  }

  /**
   * 获取视口比例（设备像素比）
   */
  private async getViewportRatio(page: Page, cdpSession: CDPSession): Promise<number> {
    try {
      const metrics = await cdpSession.send('Page.getLayoutMetrics');
      const visualViewport = metrics.visualViewport || {};
      const cssVisualViewport = metrics.cssVisualViewport || {};
      const cssLayoutViewport = metrics.cssLayoutViewport || {};

      const width = cssVisualViewport.clientWidth ?? cssLayoutViewport.clientWidth ?? 1920.0;
      const deviceWidth = visualViewport.clientWidth ?? width;
      const devicePixelRatio = deviceWidth / width > 0 ? deviceWidth / width : 1.0;

      return devicePixelRatio;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.debug(`Viewport size detection failed: ${error}`);
      return 1.0;
    }
  }

  /**
   * 检查元素是否在所有父级 HTML 框架中可见
   */
  static isElementVisibleAccordingToAllParents(node: EnhancedDOMTreeNode, htmlFrames: EnhancedDOMTreeNode[]): boolean {
    if (!node.snapshotNode) {
      return false;
    }

    const computedStyles = node.snapshotNode.computedStyles || {};
    const display = (computedStyles.display || '').toLowerCase();
    const visibility = (computedStyles.visibility || '').toLowerCase();
    const opacity = computedStyles.opacity || '1';

    if (display === 'none' || visibility === 'hidden') {
      return false;
    }

    try {
      if (parseFloat(opacity) <= 0) {
        return false;
      }
    } catch {
      // 忽略解析错误
    }

    let currentBounds = node.snapshotNode.bounds;
    if (!currentBounds) {
      return false;
    }

    // 反向遍历 HTML 框架
    for (let i = htmlFrames.length - 1; i >= 0; i--) {
      const frame = htmlFrames[i];

      if (
        frame.nodeType === NodeType.ELEMENT_NODE &&
        (frame.nodeName.toUpperCase() === 'IFRAME' || frame.nodeName.toUpperCase() === 'FRAME') &&
        frame.snapshotNode &&
        frame.snapshotNode.bounds
      ) {
        const iframeBounds = frame.snapshotNode.bounds;
        currentBounds = {
          x: currentBounds.x + iframeBounds.x,
          y: currentBounds.y + iframeBounds.y,
          width: currentBounds.width,
          height: currentBounds.height,
        };
      }

      if (
        frame.nodeType === NodeType.ELEMENT_NODE &&
        frame.nodeName === 'HTML' &&
        frame.snapshotNode &&
        frame.snapshotNode.scrollRects &&
        frame.snapshotNode.clientRects
      ) {
        const viewportLeft = 0;
        const viewportTop = 0;
        const viewportRight = frame.snapshotNode.clientRects.width;
        const viewportBottom = frame.snapshotNode.clientRects.height;

        const adjustedX: number = currentBounds.x - frame.snapshotNode.scrollRects.x;
        const adjustedY: number = currentBounds.y - frame.snapshotNode.scrollRects.y;

        const frameIntersects =
          adjustedX < viewportRight &&
          adjustedX + currentBounds.width > viewportLeft &&
          adjustedY < viewportBottom + 1000 &&
          adjustedY + currentBounds.height > viewportTop - 1000;

        if (!frameIntersects) {
          return false;
        }

        currentBounds = {
          x: adjustedX,
          y: adjustedY,
          width: currentBounds.width,
          height: currentBounds.height,
        };
      }
    }

    return true;
  }

  /**
   * 获取所有框架的可访问性树
   */
  private async getAXTreeForAllFrames(page: Page, cdpSession: CDPSession): Promise<any> {
    const frameTree = await cdpSession.send('Page.getFrameTree');

    const collectAllFrameIds = (frameTreeNode: any): string[] => {
      const frameIds = [frameTreeNode.frame.id];
      if (frameTreeNode.childFrames && Array.isArray(frameTreeNode.childFrames)) {
        for (const childFrame of frameTreeNode.childFrames) {
          frameIds.push(...collectAllFrameIds(childFrame));
        }
      }
      return frameIds;
    };

    const allFrameIds = collectAllFrameIds(frameTree.frameTree);

    const axTreeRequests = allFrameIds.map(frameId => cdpSession.send('Accessibility.getFullAXTree', { frameId }));

    const axTrees = await Promise.all(axTreeRequests);

    const mergedNodes: any[] = [];
    for (const axTree of axTrees) {
      if (axTree.nodes && Array.isArray(axTree.nodes)) {
        mergedNodes.push(...axTree.nodes);
      }
    }

    return { nodes: mergedNodes };
  }

  /**
   * 获取所有树（快照、DOM、AX、视口比例）
   */
  private async getAllTrees(page: Page, cdpSession: CDPSession): Promise<TargetAllTrees> {
    const startIframeScroll = Date.now();

    // 获取 iframe 滚动位置（用于调试）
    try {
      const scrollResult = await cdpSession.send('Runtime.evaluate', {
        expression: `
					(() => {
						const scrollData = {};
						const iframes = document.querySelectorAll('iframe');
						iframes.forEach((iframe, index) => {
							try {
								const doc = iframe.contentDocument || iframe.contentWindow.document;
								if (doc) {
									scrollData[index] = {
										scrollTop: doc.documentElement.scrollTop || doc.body.scrollTop || 0,
										scrollLeft: doc.documentElement.scrollLeft || doc.body.scrollLeft || 0
									};
								}
							} catch (e) {
								// Cross-origin iframe, can't access
							}
						});
						return scrollData;
					})()
				`,
        returnByValue: true,
      });

      if (scrollResult.result?.value) {
        // 可以在这里记录 iframe 滚动位置用于调试
        // eslint-disable-next-line no-console
        console.debug(`Iframe scroll positions: ${JSON.stringify(scrollResult.result.value)}`);
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.debug(`Failed to get iframe scroll positions: ${error}`);
    }

    const iframeScrollMs = Date.now() - startIframeScroll;

    // 并行获取所有 CDP 数据
    const startCdpCalls = Date.now();

    const [snapshot, domTree, axTree, devicePixelRatio] = await Promise.all([
      cdpSession.send('DOMSnapshot.captureSnapshot', {
        computedStyles: REQUIRED_COMPUTED_STYLES,
        includePaintOrder: true,
        includeDOMRects: true,
        includeBlendedBackgroundColors: false,
        includeTextColorOpacities: false,
      }),
      cdpSession.send('DOM.getDocument', {
        depth: -1,
        pierce: true,
      }),
      this.getAXTreeForAllFrames(page, cdpSession),
      this.getViewportRatio(page, cdpSession),
    ]);

    const cdpCallsMs = Date.now() - startCdpCalls;

    const startSnapshotProcessing = Date.now();

    // 限制文档数量以防止爆炸
    if (snapshot.documents && snapshot.documents.length > this.maxIframes) {
      // eslint-disable-next-line no-console
      console.warn(
        `⚠️ Limiting processing of ${snapshot.documents.length} iframes on page to only first ${this.maxIframes} to prevent crashes!`,
      );
      snapshot.documents = snapshot.documents.slice(0, this.maxIframes);
    }

    const snapshotProcessingMs = Date.now() - startSnapshotProcessing;

    return {
      snapshot,
      domTree: domTree,
      axTree: axTree,
      devicePixelRatio: devicePixelRatio,
      cdpTiming: {
        iframeScrollDetectionMs: iframeScrollMs,
        cdpParallelCallsMs: cdpCallsMs,
        snapshotProcessingMs: snapshotProcessingMs,
      },
    };
  }

  /**
   * 获取 DOM 树
   */
  async getDomTree(
    page: Page,
    cdpSession: CDPSession,
    targetId: string,
    initialHtmlFrames: EnhancedDOMTreeNode[] | null = null,
    initialTotalFrameOffset: DOMRect | null = null,
    _iframeDepth: number = 0,
  ): Promise<[EnhancedDOMTreeNode, TimingInfo]> {
    void _iframeDepth;
    const timingInfo: TimingInfo = {};
    const timingStartTotal = Date.now();

    const startGetTrees = Date.now();
    const trees = await this.getAllTrees(page, cdpSession);
    const getTreesMs = Date.now() - startGetTrees;

    timingInfo.getAllTreesTotalMs = getTreesMs;
    Object.assign(timingInfo, trees.cdpTiming);

    const { snapshot, domTree, axTree, devicePixelRatio } = trees;

    // 构建 AX 树查找表
    const startAx = Date.now();
    const axTreeLookup = new Map<number, any>();
    if (axTree.nodes && Array.isArray(axTree.nodes)) {
      for (const axNode of axTree.nodes) {
        if (axNode.backendDOMNodeId) {
          axTreeLookup.set(axNode.backendDOMNodeId, axNode);
        }
      }
    }
    timingInfo.buildAxLookupMs = Date.now() - startAx;

    const enhancedDomTreeNodeLookup = new Map<number, EnhancedDOMTreeNode>();

    // 构建快照查找表
    const startSnapshot = Date.now();
    const snapshotLookup = buildSnapshotLookup(snapshot, devicePixelRatio);
    timingInfo.buildSnapshotLookupMs = Date.now() - startSnapshot;

    const constructEnhancedNode = async (
      node: any,
      htmlFrames: EnhancedDOMTreeNode[] | null,
      totalFrameOffset: DOMRect | null,
    ): Promise<EnhancedDOMTreeNode> => {
      if (htmlFrames === null) {
        htmlFrames = [];
      }

      if (totalFrameOffset === null) {
        totalFrameOffset = { x: 0, y: 0, width: 0, height: 0 };
      } else {
        totalFrameOffset = {
          x: totalFrameOffset.x,
          y: totalFrameOffset.y,
          width: totalFrameOffset.width,
          height: totalFrameOffset.height,
        };
      }

      // 检查是否已存在
      if (enhancedDomTreeNodeLookup.has(node.nodeId)) {
        return enhancedDomTreeNodeLookup.get(node.nodeId)!;
      }

      const axNode = axTreeLookup.get(node.backendNodeId);
      const enhancedAxNode = axNode ? this.buildEnhancedAXNode(axNode) : null;

      // 解析属性
      const attributes: Record<string, string> = {};
      if (node.attributes && Array.isArray(node.attributes)) {
        for (let i = 0; i < node.attributes.length; i += 2) {
          attributes[node.attributes[i]] = node.attributes[i + 1] || '';
        }
      }

      const shadowRootType = node.shadowRootType || null;

      // 获取快照数据并计算绝对位置
      const snapshotData = snapshotLookup.get(node.backendNodeId) || null;
      let absolutePosition: DOMRect | null = null;

      if (snapshotData && snapshotData.bounds) {
        absolutePosition = {
          x: snapshotData.bounds.x + totalFrameOffset.x,
          y: snapshotData.bounds.y + totalFrameOffset.y,
          width: snapshotData.bounds.width,
          height: snapshotData.bounds.height,
        };
      }

      const sessionId = cdpSession.id();

      const domTreeNode = new EnhancedDOMTreeNode({
        nodeId: node.nodeId,
        backendNodeId: node.backendNodeId,
        nodeType: node.nodeType,
        nodeName: node.nodeName,
        nodeValue: node.nodeValue || null,
        attributes,
        isScrollable: node.isScrollable || null,
        frameId: node.frameId || null,
        sessionId: sessionId,
        targetId: targetId,
        contentDocument: null,
        shadowRootType: shadowRootType,
        shadowRoots: null,
        parentNode: null,
        childrenNodes: null,
        axNode: enhancedAxNode,
        snapshotNode: snapshotData,
        isVisible: null,
        absolutePosition: absolutePosition,
      });

      enhancedDomTreeNodeLookup.set(node.nodeId, domTreeNode);

      if (node.parentId) {
        const parentNode = enhancedDomTreeNodeLookup.get(node.parentId);
        if (parentNode) {
          domTreeNode.parentNode = parentNode;
        }
      }

      // 检查是否是 HTML 框架节点
      const updatedHtmlFrames = [...htmlFrames];
      if (
        node.nodeType === NodeType.ELEMENT_NODE &&
        node.nodeName === 'HTML' &&
        node.frameId !== null &&
        node.frameId !== undefined
      ) {
        updatedHtmlFrames.push(domTreeNode);
        if (snapshotData && snapshotData.scrollRects) {
          totalFrameOffset.x -= snapshotData.scrollRects.x;
          totalFrameOffset.y -= snapshotData.scrollRects.y;
        }
      }

      // 计算 iframe 偏移量
      if (
        (node.nodeName.toUpperCase() === 'IFRAME' || node.nodeName.toUpperCase() === 'FRAME') &&
        snapshotData &&
        snapshotData.bounds
      ) {
        updatedHtmlFrames.push(domTreeNode);
        totalFrameOffset.x += snapshotData.bounds.x;
        totalFrameOffset.y += snapshotData.bounds.y;
      }

      // 处理 contentDocument
      if (node.contentDocument) {
        domTreeNode.contentDocument = await constructEnhancedNode(
          node.contentDocument,
          updatedHtmlFrames,
          totalFrameOffset,
        );
        domTreeNode.contentDocument.parentNode = domTreeNode;
      }

      // 处理 shadowRoots
      if (node.shadowRoots && Array.isArray(node.shadowRoots)) {
        domTreeNode.shadowRoots = [];
        for (const shadowRoot of node.shadowRoots) {
          const shadowRootNode = await constructEnhancedNode(shadowRoot, updatedHtmlFrames, totalFrameOffset);
          shadowRootNode.parentNode = domTreeNode;
          domTreeNode.shadowRoots.push(shadowRootNode);
        }
      }

      // 处理子节点
      if (node.children && Array.isArray(node.children)) {
        domTreeNode.childrenNodes = [];

        // 构建 shadow root 节点 ID 集合以过滤
        const shadowRootNodeIds = new Set<number>();
        if (node.shadowRoots && Array.isArray(node.shadowRoots)) {
          for (const shadowRoot of node.shadowRoots) {
            shadowRootNodeIds.add(shadowRoot.nodeId);
          }
        }

        for (const child of node.children) {
          // 跳过 shadow roots
          if (shadowRootNodeIds.has(child.nodeId)) {
            continue;
          }
          domTreeNode.childrenNodes.push(await constructEnhancedNode(child, updatedHtmlFrames, totalFrameOffset));
        }
      }

      // 设置可见性
      domTreeNode.isVisible = DomService.isElementVisibleAccordingToAllParents(domTreeNode, updatedHtmlFrames);

      return domTreeNode;
    };

    const startConstruct = Date.now();
    const enhancedDomTreeNode = await constructEnhancedNode(domTree.root, initialHtmlFrames, initialTotalFrameOffset);
    timingInfo.constructEnhancedTreeMs = Date.now() - startConstruct;

    const totalGetDomTreeMs = Date.now() - timingStartTotal;
    timingInfo.getDomTreeTotalMs = totalGetDomTreeMs;

    // 计算 get_dom_tree 中的开销（未被子操作计入的时间）
    const trackedSubOperationsMs =
      (timingInfo.getAllTreesTotalMs || 0) +
      (timingInfo.buildAxLookupMs || 0) +
      (timingInfo.buildSnapshotLookupMs || 0) +
      (timingInfo.constructEnhancedTreeMs || 0);
    const getDomTreeOverheadMs = totalGetDomTreeMs - trackedSubOperationsMs;
    if (getDomTreeOverheadMs > 0.1) {
      timingInfo.getDomTreeOverheadMs = getDomTreeOverheadMs;
    }

    return [enhancedDomTreeNode, timingInfo];
  }

  /**
   * 获取序列化的 DOM 树表示（用于 LLM 消费）
   * @param page Puppeteer Page 对象
   * @param cdpSession CDP 会话
   * @param targetId 目标 ID
   * @param previousCachedState 之前缓存的序列化状态（可选）
   * @param sessionId 会话 ID（可选）
   * @returns 返回序列化的 DOM 状态、增强的 DOM 树根节点和计时信息
   */
  async getSerializedDomTree(
    page: Page,
    cdpSession: CDPSession,
    targetId: string,
    previousCachedState: SerializedDOMState | null = null,
    sessionId: string | null = null,
  ): Promise<[SerializedDOMState, EnhancedDOMTreeNode, TimingInfo]> {
    const timingInfo: TimingInfo = {};
    const startTotal = Date.now();

    // 构建 DOM 树（包括 CDP 调用以获取快照、DOM、AX 树）
    // 注意：all_frames 在 get_dom_tree 内部延迟获取，仅在需要跨域 iframe 时获取
    const [enhancedDomTree, domTreeTiming] = await this.getDomTree(
      page,
      cdpSession,
      targetId,
      null, // initialHtmlFrames
      null, // initialTotalFrameOffset
      0, // iframeDepth
    );

    // 添加 DOM 树构建的子计时
    Object.assign(timingInfo, domTreeTiming);

    // 序列化 DOM 树以供 LLM 使用
    const startSerialize = Date.now();

    const [serializedDomState, serializerTiming] = new DOMTreeSerializer(
      enhancedDomTree,
      previousCachedState,
      true, // enable_bbox_filtering
      null, // containment_threshold
      this._paintOrderFiltering,
      sessionId,
    ).serializeAccessibleElements();

    const totalSerializationMs = Date.now() - startSerialize;

    // 添加序列化器子计时（转换为毫秒）
    for (const [key, value] of Object.entries(serializerTiming)) {
      timingInfo[`${key}_ms`] = value;
    }

    // 计算序列化中未跟踪的时间
    const trackedSerializationMs = Object.values(serializerTiming).reduce((sum, val) => sum + val, 0);
    const serializationOverheadMs = totalSerializationMs - trackedSerializationMs;
    if (serializationOverheadMs > 0.1) {
      // 仅在显著时记录
      timingInfo.serializationOverheadMs = serializationOverheadMs;
    }

    // 计算 get_serialized_dom_tree 的总时间
    const totalGetSerializedDomTreeMs = Date.now() - startTotal;
    timingInfo.getSerializedDomTreeTotalMs = totalGetSerializedDomTreeMs;

    // 计算 get_serialized_dom_tree 中的开销（未计入的时间）
    const trackedMajorOperationsMs = (timingInfo.getDomTreeTotalMs || 0) + totalSerializationMs;
    const getSerializedOverheadMs = totalGetSerializedDomTreeMs - trackedMajorOperationsMs;
    if (getSerializedOverheadMs > 0.1) {
      timingInfo.getSerializedDomTreeOverheadMs = getSerializedOverheadMs;
    }

    return [serializedDomState, enhancedDomTree, timingInfo];
  }

  /**
   * 检测分页按钮
   */
  static detectPaginationButtons(selectorMap: Map<number, EnhancedDOMTreeNode>): PaginationButton[] {
    const paginationButtons: PaginationButton[] = [];

    const nextPatterns = ['next', '>', '»', '→', 'siguiente', 'suivant', 'weiter', 'volgende'];
    const prevPatterns = ['prev', 'previous', '<', '«', '←', 'anterior', 'précédent', 'zurück', 'vorige'];
    const firstPatterns = ['first', '⇤', '«', 'primera', 'première', 'erste', 'eerste'];
    const lastPatterns = ['last', '⇥', '»', 'última', 'dernier', 'letzte', 'laatste'];

    for (const [index, node] of selectorMap.entries()) {
      if (!node.snapshotNode || !node.snapshotNode.isClickable) {
        continue;
      }

      // 获取元素文本和属性
      const nodeText = node.getAllChildrenText();
      const text = nodeText.toLowerCase().trim();
      const ariaLabel = (node.attributes['aria-label'] || '').toLowerCase();
      const title = (node.attributes.title || '').toLowerCase();
      const className = (node.attributes.class || '').toLowerCase();
      const role = (node.attributes.role || '').toLowerCase();

      const allText = `${text} ${ariaLabel} ${title} ${className}`.trim();

      const isDisabled =
        node.attributes.disabled === 'true' ||
        node.attributes['aria-disabled'] === 'true' ||
        className.includes('disabled');

      let buttonType: PaginationButton['buttonType'] | null = null;

      if (nextPatterns.some(pattern => allText.includes(pattern))) {
        buttonType = 'next';
      } else if (prevPatterns.some(pattern => allText.includes(pattern))) {
        buttonType = 'prev';
      } else if (firstPatterns.some(pattern => allText.includes(pattern))) {
        buttonType = 'first';
      } else if (lastPatterns.some(pattern => allText.includes(pattern))) {
        buttonType = 'last';
      } else if (/^\d{1,2}$/.test(text) && (role === 'button' || role === 'link' || role === '')) {
        buttonType = 'page_number';
      }

      if (buttonType) {
        paginationButtons.push({
          buttonType: buttonType,
          backendNodeId: index,
          text: nodeText.trim() || ariaLabel || title || '',
          selector: node.xpath || '',
          isDisabled: isDisabled,
        });
      }
    }

    return paginationButtons;
  }
}
