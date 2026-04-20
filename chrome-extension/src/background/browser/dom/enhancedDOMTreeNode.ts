import type { DOMRect, EnhancedAXNode, SnapshotNode } from './domService';
import { NodeType } from './domService';
import type { CompoundChildInfo } from './compoundChildInfo';

/** toJSON() 产出的可序列化节点形状（无 parent 环） */
export interface EnhancedDOMTreeNodeJSON {
  nodeId: number;
  backendNodeId: number;
  nodeType: string;
  nodeName: string;
  nodeValue: string | null;
  isVisible: boolean | null;
  attributes: Record<string, string>;
  isScrollable: boolean | null;
  sessionId: string | null;
  targetId: string;
  frameId: string | null;
  contentDocument: EnhancedDOMTreeNodeJSON | null;
  shadowRootType: string | null;
  axNode: EnhancedAXNode | null;
  snapshotNode: SnapshotNode | null;
  shadowRoots: EnhancedDOMTreeNodeJSON[];
  childrenNodes: EnhancedDOMTreeNodeJSON[];
}

/** get scrollInfo 返回的数值摘要 */
export interface ElementScrollInfo {
  scrollTop: number;
  scrollLeft: number;
  scrollableHeight: number;
  scrollableWidth: number;
  visibleHeight: number;
  visibleWidth: number;
  contentAbove: number;
  contentBelow: number;
  contentLeft: number;
  contentRight: number;
  verticalScrollPercentage: number;
  horizontalScrollPercentage: number;
  pagesAbove: number;
  pagesBelow: number;
  totalPages: number;
  canScrollUp: boolean;
  canScrollDown: boolean;
  canScrollLeft: boolean;
  canScrollRight: boolean;
}

/** SHA-256 十六进制摘要的前 16 个字符解析为 number（与 Node createHash 行为一致） */
async function sha256DigestPrefixToInt(input: string): Promise<number> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const digest = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return parseInt(digest.substring(0, 16), 16);
}

// 静态属性列表（用于哈希计算）
const STATIC_ATTRIBUTES = new Set(['id', 'name', 'type', 'role', 'class', 'data-testid', 'data-cy', 'data-id']);

/**
 * 增强的 DOM 树节点类
 * 包含来自 AX、DOM 和 Snapshot 树的信息
 */
export class EnhancedDOMTreeNode {
  nodeId: number;
  backendNodeId: number;
  nodeType: NodeType;
  nodeName: string;
  nodeValue: string | null;
  attributes: Record<string, string>;
  isScrollable: boolean | null;
  isVisible: boolean | null;
  isNew: boolean;
  absolutePosition: DOMRect | null;
  targetId: string;
  frameId: string | null;
  sessionId: string | null;
  contentDocument: EnhancedDOMTreeNode | null;
  shadowRootType: string | null;
  shadowRoots: EnhancedDOMTreeNode[] | null;
  parentNode: EnhancedDOMTreeNode | null;
  childrenNodes: EnhancedDOMTreeNode[] | null;
  axNode: EnhancedAXNode | null;
  snapshotNode: SnapshotNode | null;
  _compoundChildren: CompoundChildInfo[] = [];
  uuid: string;

  constructor(data: {
    nodeId: number;
    backendNodeId: number;
    nodeType: NodeType;
    nodeName: string;
    nodeValue: string | null;
    attributes: Record<string, string>;
    isScrollable: boolean | null;
    isVisible: boolean | null;
    absolutePosition: DOMRect | null;
    targetId: string;
    frameId: string | null;
    sessionId: string | null;
    contentDocument?: EnhancedDOMTreeNode | null;
    shadowRootType?: string | null;
    shadowRoots?: EnhancedDOMTreeNode[] | null;
    parentNode?: EnhancedDOMTreeNode | null;
    childrenNodes?: EnhancedDOMTreeNode[] | null;
    axNode?: EnhancedAXNode | null;
    snapshotNode?: SnapshotNode | null;
    _compoundChildren?: CompoundChildInfo[];
    uuid?: string;
  }) {
    this.nodeId = data.nodeId;
    this.backendNodeId = data.backendNodeId;
    this.nodeType = data.nodeType;
    this.nodeName = data.nodeName;
    this.nodeValue = data.nodeValue;
    this.attributes = data.attributes;
    this.isScrollable = data.isScrollable;
    this.isVisible = data.isVisible;
    this.absolutePosition = data.absolutePosition;
    this.targetId = data.targetId;
    this.frameId = data.frameId;
    this.sessionId = data.sessionId;
    this.contentDocument = data.contentDocument ?? null;
    this.shadowRootType = data.shadowRootType ?? null;
    this.shadowRoots = data.shadowRoots ?? null;
    this.parentNode = data.parentNode ?? null;
    this.childrenNodes = data.childrenNodes ?? null;
    this.axNode = data.axNode ?? null;
    this.snapshotNode = data.snapshotNode ?? null;
    this._compoundChildren = data._compoundChildren ?? [];
    this.uuid = data.uuid ?? this._generateUUID();
    this.isNew = false;
  }

  private _generateUUID(): string {
    // 简单的 UUID 生成（可以使用更复杂的实现）
    return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * 获取父节点（别名）
   */
  get parent(): EnhancedDOMTreeNode | null {
    return this.parentNode;
  }

  /**
   * 获取子节点列表（别名）
   */
  get children(): EnhancedDOMTreeNode[] {
    return this.childrenNodes || [];
  }

  /**
   * 返回所有子节点，包括 shadow roots
   */
  get childrenAndShadowRoots(): EnhancedDOMTreeNode[] {
    // 重要：创建副本以避免修改原始的 childrenNodes 列表
    const children = this.childrenNodes ? [...this.childrenNodes] : [];
    if (this.shadowRoots) {
      children.push(...this.shadowRoots);
    }
    return children;
  }

  /**
   * 获取标签名（小写）
   */
  get tagName(): string {
    return this.nodeName.toLowerCase();
  }

  /**
   * 生成此 DOM 节点的 XPath，在 shadow 边界或 iframe 处停止
   */
  get xpath(): string {
    const segments: string[] = [];
    const buildXPath = (start: EnhancedDOMTreeNode | null) => {
      let currentElement: EnhancedDOMTreeNode | null = start;

      while (
        currentElement &&
        (currentElement.nodeType === NodeType.ELEMENT_NODE ||
          currentElement.nodeType === NodeType.DOCUMENT_FRAGMENT_NODE)
      ) {
        // 跳过 shadow roots
        if (currentElement.nodeType === NodeType.DOCUMENT_FRAGMENT_NODE) {
          currentElement = currentElement.parentNode;
          continue;
        }

        // 如果遇到 iframe，停止
        if (currentElement.parentNode && currentElement.parentNode.nodeName.toLowerCase() === 'iframe') {
          break;
        }

        const position = this._getElementPosition(currentElement);
        const tagName = currentElement.nodeName.toLowerCase();
        const xpathIndex = position > 0 ? `[${position}]` : '';
        segments.unshift(`${tagName}${xpathIndex}`);

        currentElement = currentElement.parentNode;
      }
    };

    buildXPath(this);

    return segments.join('/');
  }

  /**
   * 获取元素在其同类型兄弟元素中的位置
   * 如果它是唯一的一个，返回 0，否则返回基于 1 的索引
   */
  private _getElementPosition(element: EnhancedDOMTreeNode): number {
    if (!element.parentNode || !element.parentNode.childrenNodes) {
      return 0;
    }

    const sameTagSiblings = element.parentNode.childrenNodes.filter(
      child =>
        child.nodeType === NodeType.ELEMENT_NODE && child.nodeName.toLowerCase() === element.nodeName.toLowerCase(),
    );

    if (sameTagSiblings.length <= 1) {
      return 0; // 如果只有一个，不需要索引
    }

    const index = sameTagSiblings.indexOf(element);
    return index >= 0 ? index + 1 : 0; // XPath 是基于 1 的索引
  }

  /**
   * 将节点及其后代序列化为字典，省略父引用
   */
  toJSON(): EnhancedDOMTreeNodeJSON {
    return {
      nodeId: this.nodeId,
      backendNodeId: this.backendNodeId,
      nodeType: NodeType[this.nodeType],
      nodeName: this.nodeName,
      nodeValue: this.nodeValue,
      isVisible: this.isVisible,
      attributes: this.attributes,
      isScrollable: this.isScrollable,
      sessionId: this.sessionId,
      targetId: this.targetId,
      frameId: this.frameId,
      contentDocument: this.contentDocument?.toJSON() || null,
      shadowRootType: this.shadowRootType,
      axNode: this.axNode,
      snapshotNode: this.snapshotNode,
      shadowRoots: this.shadowRoots?.map(r => r.toJSON()) || [],
      childrenNodes: this.childrenNodes?.map(c => c.toJSON()) || [],
    };
  }

  /**
   * 获取所有子节点的文本
   */
  getAllChildrenText(maxDepth: number = -1): string {
    const textParts: string[] = [];

    const collectText = (node: EnhancedDOMTreeNode, currentDepth: number): void => {
      if (maxDepth !== -1 && currentDepth > maxDepth) {
        return;
      }

      if (node.nodeType === NodeType.TEXT_NODE) {
        textParts.push(node.nodeValue || '');
      } else if (node.nodeType === NodeType.ELEMENT_NODE) {
        for (const child of node.children) {
          collectText(child, currentDepth + 1);
        }
      }
    };

    collectText(this, 0);
    return textParts.join('\n').trim();
  }

  /**
   * 获取 LLM 实际看到的此元素的有意义文本内容
   * 这与 DOMTreeSerializer 输出中的内容完全匹配
   */
  getMeaningfulTextForLlm(): string {
    let meaningfulText = '';

    if (this.attributes) {
      // 优先级顺序：value, aria-label, title, placeholder, alt, 文本内容
      for (const attr of ['value', 'aria-label', 'title', 'placeholder', 'alt']) {
        if (this.attributes[attr] && this.attributes[attr].trim()) {
          meaningfulText = this.attributes[attr];
          break;
        }
      }
    }

    // 如果没有有意义的属性，回退到文本内容
    if (!meaningfulText) {
      meaningfulText = this.getAllChildrenText();
    }

    return meaningfulText.trim();
  }

  /**
   * 限制文本长度
   */
  private _capTextLength(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }
    return text.substring(0, maxLength) + '...';
  }

  /**
   * LLM 友好的节点表示
   */
  llmRepresentation(maxTextLength: number = 100): string {
    return `<${this.tagName}>${this._capTextLength(this.getAllChildrenText(), maxTextLength) || ''}`;
  }

  /**
   * 增强的滚动检测，结合 CDP 检测和 CSS 分析
   * 检测 Chrome CDP 可能遗漏的可滚动元素，这在 iframe 和动态调整大小的容器中很常见
   */
  get isActuallyScrollable(): boolean {
    // 首先检查 CDP 是否已检测到可滚动
    if (this.isScrollable) {
      return true;
    }

    // 增强检测 CDP 遗漏的元素
    if (!this.snapshotNode) {
      return false;
    }

    // 检查滚动 vs 客户端矩形 - 这是最可靠的指标
    const scrollRects = this.snapshotNode.scrollRects;
    const clientRects = this.snapshotNode.clientRects;

    if (scrollRects && clientRects) {
      // 内容大于可见区域 = 可滚动
      const hasVerticalScroll = scrollRects.height > clientRects.height + 1; // +1 用于舍入
      const hasHorizontalScroll = scrollRects.width > clientRects.width + 1;

      if (hasVerticalScroll || hasHorizontalScroll) {
        // 还要检查 CSS 以确保允许滚动
        if (this.snapshotNode.computedStyles) {
          const styles = this.snapshotNode.computedStyles;
          const overflow = (styles.overflow || 'visible').toLowerCase();
          const overflowX = (styles['overflow-x'] || overflow).toLowerCase();
          const overflowY = (styles['overflow-y'] || overflow).toLowerCase();

          // 只有当 overflow 明确设置为 auto、scroll 或 overlay 时才允许滚动
          // 不要将 'visible' overflow 视为可滚动
          const allowsScroll =
            ['auto', 'scroll', 'overlay'].includes(overflow) ||
            ['auto', 'scroll', 'overlay'].includes(overflowX) ||
            ['auto', 'scroll', 'overlay'].includes(overflowY);

          return allowsScroll;
        } else {
          // 没有 CSS 信息，但内容溢出 - 更保守
          // 只有当它是常见的可滚动容器元素时才认为可滚动
          const scrollableTags = new Set(['div', 'main', 'section', 'article', 'aside', 'body', 'html']);
          return scrollableTags.has(this.tagName.toLowerCase());
        }
      }
    }

    return false;
  }

  /**
   * 简单检查：仅当此元素可滚动且没有可滚动的父元素时显示滚动信息（避免嵌套滚动垃圾信息）
   * iframe 特殊情况：始终显示滚动信息，因为 Chrome 可能不总是正确检测 iframe 可滚动性
   */
  get shouldShowScrollInfo(): boolean {
    // 特殊情况：始终为 iframe 元素显示滚动信息
    // 即使未检测为可滚动，它们也可能有可滚动的内容
    if (this.tagName.toLowerCase() === 'iframe') {
      return true;
    }

    // 对于非 iframe 元素，必须首先可滚动
    if (!(this.isScrollable || this.isActuallyScrollable)) {
      return false;
    }

    // 始终为 iframe 内容文档（body/html）显示
    if (['body', 'html'].includes(this.tagName.toLowerCase())) {
      return true;
    }

    // 如果父元素已经可滚动，则不显示（避免嵌套垃圾信息）
    if (this.parentNode && (this.parentNode.isScrollable || this.parentNode.isActuallyScrollable)) {
      return false;
    }

    return true;
  }

  /**
   * 在内容文档中查找 HTML 元素
   */
  private _findHtmlInContentDocument(): EnhancedDOMTreeNode | null {
    if (!this.contentDocument) {
      return null;
    }

    // 检查内容文档本身是否是 HTML
    if (this.contentDocument.tagName.toLowerCase() === 'html') {
      return this.contentDocument;
    }

    // 在子元素中查找 HTML 元素
    if (this.contentDocument.childrenNodes) {
      for (const child of this.contentDocument.childrenNodes) {
        if (child.tagName.toLowerCase() === 'html') {
          return child;
        }
      }
    }

    return null;
  }

  /**
   * 计算此元素的滚动信息（如果可滚动）
   */
  get scrollInfo(): ElementScrollInfo | null {
    if (!this.isActuallyScrollable || !this.snapshotNode) {
      return null;
    }

    // 从快照数据获取滚动和客户端矩形
    const scrollRects = this.snapshotNode.scrollRects;
    const clientRects = this.snapshotNode.clientRects;

    if (!scrollRects || !clientRects) {
      return null;
    }

    // 计算滚动位置和百分比
    const scrollTop = scrollRects.y;
    const scrollLeft = scrollRects.x;

    // 总可滚动高度和宽度
    const scrollableHeight = scrollRects.height;
    const scrollableWidth = scrollRects.width;

    // 可见（客户端）尺寸
    const visibleHeight = clientRects.height;
    const visibleWidth = clientRects.width;

    // 计算当前视图上方/下方/左侧/右侧有多少内容
    const contentAbove = Math.max(0, scrollTop);
    const contentBelow = Math.max(0, scrollableHeight - visibleHeight - scrollTop);
    const contentLeft = Math.max(0, scrollLeft);
    const contentRight = Math.max(0, scrollableWidth - visibleWidth - scrollLeft);

    // 计算滚动百分比
    let verticalScrollPercentage = 0;
    let horizontalScrollPercentage = 0;

    if (scrollableHeight > visibleHeight) {
      const maxScrollTop = scrollableHeight - visibleHeight;
      verticalScrollPercentage = maxScrollTop > 0 ? (scrollTop / maxScrollTop) * 100 : 0;
    }

    if (scrollableWidth > visibleWidth) {
      const maxScrollLeft = scrollableWidth - visibleWidth;
      horizontalScrollPercentage = maxScrollLeft > 0 ? (scrollLeft / maxScrollLeft) * 100 : 0;
    }

    // 计算页面等效值（使用可见高度作为页面单位）
    const pagesAbove = visibleHeight > 0 ? contentAbove / visibleHeight : 0;
    const pagesBelow = visibleHeight > 0 ? contentBelow / visibleHeight : 0;
    const totalPages = visibleHeight > 0 ? scrollableHeight / visibleHeight : 1;

    return {
      scrollTop: scrollTop,
      scrollLeft: scrollLeft,
      scrollableHeight: scrollableHeight,
      scrollableWidth: scrollableWidth,
      visibleHeight: visibleHeight,
      visibleWidth: visibleWidth,
      contentAbove: contentAbove,
      contentBelow: contentBelow,
      contentLeft: contentLeft,
      contentRight: contentRight,
      verticalScrollPercentage: Math.round(verticalScrollPercentage * 10) / 10,
      horizontalScrollPercentage: Math.round(horizontalScrollPercentage * 10) / 10,
      pagesAbove: Math.round(pagesAbove * 10) / 10,
      pagesBelow: Math.round(pagesBelow * 10) / 10,
      totalPages: Math.round(totalPages * 10) / 10,
      canScrollUp: contentAbove > 0,
      canScrollDown: contentBelow > 0,
      canScrollLeft: contentLeft > 0,
      canScrollRight: contentRight > 0,
    };
  }

  enhancedCssSelectorForElement(includeDynamicAttributes = true): string {
    try {
      if (!this.xpath) {
        return '';
      }

      // Get base selector from XPath
      let cssSelector = this.convertSimpleXPathToCssSelector(this.xpath);

      // Handle class attributes
      const classValue = this.attributes.class;
      if (classValue && includeDynamicAttributes) {
        // Define a regex pattern for valid class names in CSS
        const validClassNamePattern = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;

        // Iterate through the class attribute values
        const classes = classValue.trim().split(/\s+/);
        for (const className of classes) {
          // Skip empty class names
          if (!className.trim()) {
            continue;
          }

          // Check if the class name is valid
          if (validClassNamePattern.test(className)) {
            // Append the valid class name to the CSS selector
            cssSelector += `.${className}`;
          }
        }
      }

      // Expanded set of safe attributes that are stable and useful for selection
      const SAFE_ATTRIBUTES = new Set([
        // Data attributes (if they're stable in your application)
        'id',
        // Standard HTML attributes
        'name',
        'type',
        'placeholder',
        // Accessibility attributes
        'aria-label',
        'aria-labelledby',
        'aria-describedby',
        'role',
        // Common form attributes
        'for',
        'autocomplete',
        'required',
        'readonly',
        // Media attributes
        'alt',
        'title',
        'src',
        // Custom stable attributes
        'href',
        'target',
      ]);

      // Handle other attributes
      if (includeDynamicAttributes) {
        SAFE_ATTRIBUTES.add('data-id');
        SAFE_ATTRIBUTES.add('data-qa');
        SAFE_ATTRIBUTES.add('data-cy');
        SAFE_ATTRIBUTES.add('data-testid');
      }

      // Handle other attributes
      for (const [attribute, value] of Object.entries(this.attributes)) {
        if (attribute === 'class') {
          continue;
        }

        // Skip invalid attribute names
        if (!attribute.trim()) {
          continue;
        }

        if (!SAFE_ATTRIBUTES.has(attribute)) {
          continue;
        }

        // Escape special characters in attribute names
        const safeAttribute = attribute.replace(':', '\\:');

        // Handle different value cases
        if (value === '') {
          cssSelector += `[${safeAttribute}]`;
        } else if (/["'<>`\n\r\t]/.test(value)) {
          // Use contains for values with special characters
          // Regex-substitute any whitespace with a single space, then trim
          const collapsedValue = value.replace(/\s+/g, ' ').trim();
          // Escape embedded double-quotes
          const safeValue = collapsedValue.replace(/"/g, '\\"');
          cssSelector += `[${safeAttribute}*="${safeValue}"]`;
        } else {
          cssSelector += `[${safeAttribute}="${value}"]`;
        }
      }

      return cssSelector;
    } catch (error) {
      // Fallback to a more basic selector if something goes wrong
      const tagName = this.tagName || '*';
      return `${tagName}`;
    }
  }

  convertSimpleXPathToCssSelector(xpath: string): string {
    if (!xpath) {
      return '';
    }

    // Remove leading slash if present
    const cleanXpath = xpath.replace(/^\//, '');

    // Split into parts
    const parts = cleanXpath.split('/');
    const cssParts: string[] = [];

    for (const part of parts) {
      if (!part) {
        continue;
      }

      // Handle custom elements with colons by escaping them
      if (part.includes(':') && !part.includes('[')) {
        const basePart = part.replace(/:/g, '\\:');
        cssParts.push(basePart);
        continue;
      }

      // Handle index notation [n]
      if (part.includes('[')) {
        const bracketIndex = part.indexOf('[');
        let basePart = part.substring(0, bracketIndex);

        // Handle custom elements with colons in the base part
        if (basePart.includes(':')) {
          basePart = basePart.replace(/:/g, '\\:');
        }

        const indexPart = part.substring(bracketIndex);

        // Handle multiple indices
        const indices = indexPart
          .split(']')
          .slice(0, -1)
          .map(i => i.replace('[', ''));

        for (const idx of indices) {
          // Handle numeric indices
          if (/^\d+$/.test(idx)) {
            try {
              const index = Number.parseInt(idx, 10) - 1;
              basePart += `:nth-of-type(${index + 1})`;
            } catch (error) {
              // continue
            }
          }
          // Handle last() function
          else if (idx === 'last()') {
            basePart += ':last-of-type';
          }
          // Handle position() functions
          else if (idx.includes('position()')) {
            if (idx.includes('>1')) {
              basePart += ':nth-of-type(n+2)';
            }
          }
        }

        cssParts.push(basePart);
      } else {
        cssParts.push(part);
      }
    }

    const baseSelector = cssParts.join(' > ');
    return baseSelector;
  }

  /**
   * 获取此元素的人类可读滚动信息文本
   */
  getScrollInfoText(): string {
    // iframe 特殊情况：检查内容文档的滚动信息
    if (this.tagName.toLowerCase() === 'iframe') {
      // 尝试从 iframe 内的 HTML 文档获取滚动信息
      if (this.contentDocument) {
        // 在内容文档中查找 HTML 元素
        const htmlElement = this._findHtmlInContentDocument();
        if (htmlElement && htmlElement.scrollInfo) {
          const info = htmlElement.scrollInfo;
          // 提供最小但有用的滚动信息
          const pagesBelow = info.pagesBelow || 0;
          const pagesAbove = info.pagesAbove || 0;
          const vPct = Math.round(info.verticalScrollPercentage || 0);

          if (pagesBelow > 0 || pagesAbove > 0) {
            return `scroll: ${pagesAbove.toFixed(1)}↑ ${pagesBelow.toFixed(1)}↓ ${vPct}%`;
          }
        }
      }

      return 'scroll';
    }

    const scrollInfo = this.scrollInfo;
    if (!scrollInfo) {
      return '';
    }

    const parts: string[] = [];

    // 垂直滚动信息（简洁格式）
    if (scrollInfo.scrollableHeight > scrollInfo.visibleHeight) {
      parts.push(`${scrollInfo.pagesAbove.toFixed(1)} pages above, ${scrollInfo.pagesBelow.toFixed(1)} pages below`);
    }

    // 水平滚动信息（简洁格式）
    if (scrollInfo.scrollableWidth > scrollInfo.visibleWidth) {
      parts.push(`horizontal ${Math.round(scrollInfo.horizontalScrollPercentage)}%`);
    }

    return parts.join(' ');
  }

  /**
   * 基于父分支路径和属性对元素进行哈希
   */
  get elementHash(): Promise<number> {
    return this.hash();
  }

  /**
   * 字符串表示
   */
  toString(): string {
    const frameIdSuffix = this.frameId ? this.frameId.slice(-4) : '?';
    return `[<${this.tagName}>#${frameIdSuffix}:${this.backendNodeId}]`;
  }

  /**
   * 基于父分支路径和属性对元素进行哈希
   */
  async hash(): Promise<number> {
    // 获取父分支路径
    const parentBranchPath = this._getParentBranchPath();
    const parentBranchPathString = parentBranchPath.join('/');

    const attributesString = Object.entries(this.attributes)
      .filter(([key]) => STATIC_ATTRIBUTES.has(key))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('');

    // 组合两者进行最终哈希
    const combinedString = `${parentBranchPathString}|${attributesString}`;
    return sha256DigestPrefixToInt(combinedString);
  }

  /**
   * 基于父分支路径对元素进行哈希
   */
  async parentBranchHash(): Promise<number> {
    const parentBranchPath = this._getParentBranchPath();
    const parentBranchPathString = parentBranchPath.join('/');
    return sha256DigestPrefixToInt(parentBranchPathString);
  }

  /**
   * 获取父分支路径作为从根到当前元素的标签名列表
   */
  private _getParentBranchPath(): string[] {
    const parents: EnhancedDOMTreeNode[] = [];
    const collectParents = (start: EnhancedDOMTreeNode | null) => {
      let currentNode: EnhancedDOMTreeNode | null = start;

      while (currentNode !== null) {
        if (currentNode.nodeType === NodeType.ELEMENT_NODE) {
          parents.push(currentNode);
        }
        currentNode = currentNode.parentNode;
      }
    };

    collectParents(this);

    parents.reverse();
    return parents.map(parent => parent.tagName);
  }
}
