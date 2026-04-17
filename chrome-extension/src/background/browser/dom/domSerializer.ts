import type { EnhancedDOMTreeNode, DOMRect } from './domService';
import { NodeType } from './domService';
import { SerializedDOMState } from './serializedDOMState';
import { ClickableElementDetector } from './clickableElementDetector';

// 禁用元素集合
const DISABLED_ELEMENTS = new Set(['style', 'script', 'head', 'meta', 'link', 'title', 'noscript', '#comment']);

// SVG 子元素集合（装饰性元素，无交互价值）
const SVG_ELEMENTS = new Set([
  'path',
  'rect',
  'g',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'use',
  'defs',
  'clipPath',
  'mask',
  'pattern',
  'image',
  'text',
  'tspan',
]);

// 选择器映射表
export type DOMSelectorMap = Map<number, EnhancedDOMTreeNode>;

// 传播边界
export interface PropagatingBounds {
  tag: string;
  bounds: DOMRect;
  nodeId: number;
  depth: number;
}

// 复合组件子元素信息
export interface CompoundChildInfo {
  role: string;
  name: string;
  valuemin: number | null;
  valuemax: number | null;
  valuenow: string | number | null;
  optionsCount?: number;
  firstOptions?: string[];
  formatHint?: string;
}

// 简化节点
export class SimplifiedNode {
  originalNode: EnhancedDOMTreeNode;
  children: SimplifiedNode[] = [];
  isShadowHost: boolean = false;
  isInteractive: boolean = false;
  isNew: boolean = false;
  isCompoundComponent: boolean = false;
  excludedByParent: boolean = false;
  ignoredByPaintOrder: boolean = false;
  shouldDisplay: boolean = true;

  constructor(originalNode: EnhancedDOMTreeNode, children: SimplifiedNode[] = []) {
    this.originalNode = originalNode;
    this.children = children;
  }

  /**
   * 递归清理 originalNode 的 JSON，移除 childrenNodes 和 shadowRoots
   * 避免与 SimplifiedNode.children 重复
   */
  private _cleanOriginalNodeJson(nodeJson: Record<string, any>): Record<string, any> {
    // 移除不需要的字段
    if ('childrenNodes' in nodeJson) {
      delete nodeJson.childrenNodes;
    }
    if ('shadowRoots' in nodeJson) {
      delete nodeJson.shadowRoots;
    }

    // 清理嵌套的 contentDocument（如果存在）
    if (nodeJson.contentDocument) {
      nodeJson.contentDocument = this._cleanOriginalNodeJson(nodeJson.contentDocument);
    }

    return nodeJson;
  }

  /**
   * 将 SimplifiedNode 序列化为 JSON
   */
  toJSON(): Record<string, unknown> {
    const originalNodeJson = this.originalNode.toJSON();
    // 移除 childrenNodes 和 shadowRoots，避免与 SimplifiedNode.children 重复
    const cleanedOriginalNodeJson = this._cleanOriginalNodeJson(originalNodeJson);

    return {
      shouldDisplay: this.shouldDisplay,
      isInteractive: this.isInteractive,
      ignoredByPaintOrder: this.ignoredByPaintOrder,
      excludedByParent: this.excludedByParent,
      isShadowHost: this.isShadowHost,
      isNew: this.isNew,
      isCompoundComponent: this.isCompoundComponent,
      originalNode: cleanedOriginalNodeJson,
      children: this.children.map(c => c.toJSON()),
    };
  }
}

// 工具函数：限制文本长度
function capTextLength(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength) + '...';
}

// EnhancedDOMTreeNode 现在是一个类，已经包含了这些属性和方法

export class DOMTreeSerializer {
  // 配置 - 传播边界到子元素的元素
  private static readonly PROPAGATING_ELEMENTS = [
    { tag: 'a', role: null },
    { tag: 'button', role: null },
    { tag: 'div', role: 'button' },
    { tag: 'div', role: 'combobox' },
    { tag: 'span', role: 'button' },
    { tag: 'span', role: 'combobox' },
    { tag: 'input', role: 'combobox' },
  ];

  private static readonly DEFAULT_CONTAINMENT_THRESHOLD = 0.99; // 99% 包含度

  private rootNode: EnhancedDOMTreeNode;
  private _interactiveCounter: number = 1;
  private _selectorMap: DOMSelectorMap = new Map();
  private _previousCachedSelectorMap: DOMSelectorMap | null = null;
  private timingInfo: Record<string, number> = {};
  private _clickableCache: Map<number, boolean> = new Map();

  private containmentThreshold: number;

  private sessionId: string | null = null;

  constructor(
    rootNode: EnhancedDOMTreeNode,
    previousCachedState: SerializedDOMState | null = null,
    _enableBboxFiltering: boolean = true,
    containmentThreshold: number | null = null,
    _paintOrderFiltering: boolean = true,
    sessionId: string | null = null,
  ) {
    this.rootNode = rootNode;
    this._previousCachedSelectorMap = previousCachedState?.selectorMap || null;

    this.containmentThreshold = containmentThreshold ?? DOMTreeSerializer.DEFAULT_CONTAINMENT_THRESHOLD;

    this.sessionId = sessionId;
    void _enableBboxFiltering;
    void _paintOrderFiltering;
  }

  private _safeParseNumber(valueStr: string, defaultVal: number): number {
    try {
      return parseFloat(valueStr);
    } catch {
      return defaultVal;
    }
  }

  private _safeParseOptionalNumber(valueStr: string | null | undefined): number | null {
    if (!valueStr) {
      return null;
    }
    try {
      return parseFloat(valueStr);
    } catch {
      return null;
    }
  }

  serializeAccessibleElements(): [SerializedDOMState, Record<string, number>] {
    const startTotal = Date.now();

    // 重置状态
    this._interactiveCounter = 1;
    this._selectorMap = new Map();
    this._clickableCache.clear();

    // 步骤 1: 创建简化树（包括点击元素检测）
    const startStep1 = Date.now();
    const simplifiedTree = this._createSimplifiedTree(this.rootNode);
    this.timingInfo.createSimplifiedTree = Date.now() - startStep1;

    const startStep2 = Date.now();
    const optimizedTree = this._optimizeTree(simplifiedTree);
    this.timingInfo.optimizeTree = Date.now() - startStep2;

    const startStep3 = Date.now();
    const filteredTree = this._applyBoundingBoxFiltering(optimizedTree);
    this.timingInfo.bboxFiltering = Date.now() - startStep3;

    const startStep4 = Date.now();
    this._assignInteractiveIndicesAndMarkNewNodes(filteredTree);
    this.timingInfo.assignInteractiveIndicesAndMarkNewNodes = Date.now() - startStep4;

    const endTotal = Date.now();
    this.timingInfo.serializeAccessibleElementsTotalMs = endTotal - startTotal;

    return [new SerializedDOMState(filteredTree, this._selectorMap), this.timingInfo];
  }

  private _addCompoundComponents(simplified: SimplifiedNode, node: EnhancedDOMTreeNode): void {
    const tagName = node.tagName?.toLowerCase();
    if (!tagName || !['input', 'select', 'details', 'audio', 'video'].includes(tagName)) {
      return;
    }

    if (!node._compoundChildren) {
      node._compoundChildren = [];
    }

    if (tagName === 'input') {
      const inputType = node.attributes?.type || '';
      if (
        !['date', 'time', 'datetime-local', 'month', 'week', 'range', 'number', 'color', 'file'].includes(inputType)
      ) {
        return;
      }

      if (inputType === 'range') {
        const minVal = node.attributes?.min || '0';
        const maxVal = node.attributes?.max || '100';
        node._compoundChildren.push({
          role: 'slider',
          name: 'Value',
          valuemin: this._safeParseNumber(minVal, 0),
          valuemax: this._safeParseNumber(maxVal, 100),
          valuenow: null,
        });
        simplified.isCompoundComponent = true;
      } else if (inputType === 'number') {
        const minVal = node.attributes?.min;
        const maxVal = node.attributes?.max;
        node._compoundChildren.push(
          { role: 'button', name: 'Increment', valuemin: null, valuemax: null, valuenow: null },
          { role: 'button', name: 'Decrement', valuemin: null, valuemax: null, valuenow: null },
          {
            role: 'textbox',
            name: 'Value',
            valuemin: this._safeParseOptionalNumber(minVal),
            valuemax: this._safeParseOptionalNumber(maxVal),
            valuenow: null,
          },
        );
        simplified.isCompoundComponent = true;
      } else if (inputType === 'color') {
        node._compoundChildren.push(
          { role: 'textbox', name: 'Hex Value', valuemin: null, valuemax: null, valuenow: null },
          { role: 'button', name: 'Color Picker', valuemin: null, valuemax: null, valuenow: null },
        );
        simplified.isCompoundComponent = true;
      } else if (inputType === 'file') {
        const multiple = node.attributes?.multiple !== undefined;
        let currentValue = 'None';

        if (node.axNode?.properties) {
          for (const prop of node.axNode.properties) {
            if (prop.name === 'valuetext' && prop.value) {
              const valueStr = String(prop.value).trim();
              if (valueStr && !['', 'no file chosen', 'no file selected'].includes(valueStr.toLowerCase())) {
                currentValue = valueStr;
                break;
              }
            } else if (prop.name === 'value' && prop.value) {
              const valueStr = String(prop.value).trim();
              if (valueStr) {
                currentValue = valueStr.includes('\\') ? valueStr.split('\\').pop()! : valueStr.split('/').pop()!;
                break;
              }
            }
          }
        }

        node._compoundChildren.push(
          { role: 'button', name: 'Browse Files', valuemin: null, valuemax: null, valuenow: null },
          {
            role: 'textbox',
            name: multiple ? 'Files' : 'File Selected',
            valuemin: null,
            valuemax: null,
            valuenow: currentValue,
          },
        );
        simplified.isCompoundComponent = true;
      }
    } else if (tagName === 'select') {
      const baseComponents: CompoundChildInfo[] = [
        { role: 'button', name: 'Dropdown Toggle', valuemin: null, valuemax: null, valuenow: null },
      ];

      const optionsInfo = this._extractSelectOptions(node);
      if (optionsInfo) {
        const optionsComponent: CompoundChildInfo = {
          role: 'listbox',
          name: 'Options',
          valuemin: null,
          valuemax: null,
          valuenow: null,
          optionsCount: optionsInfo.count,
          firstOptions: optionsInfo.firstOptions,
        };
        if (optionsInfo.formatHint) {
          optionsComponent.formatHint = optionsInfo.formatHint;
        }
        baseComponents.push(optionsComponent);
      } else {
        baseComponents.push({
          role: 'listbox',
          name: 'Options',
          valuemin: null,
          valuemax: null,
          valuenow: null,
        });
      }

      node._compoundChildren.push(...baseComponents);
      simplified.isCompoundComponent = true;
    } else if (tagName === 'details') {
      node._compoundChildren.push(
        { role: 'button', name: 'Toggle Disclosure', valuemin: null, valuemax: null, valuenow: null },
        { role: 'region', name: 'Content Area', valuemin: null, valuemax: null, valuenow: null },
      );
      simplified.isCompoundComponent = true;
    } else if (tagName === 'audio') {
      node._compoundChildren.push(
        { role: 'button', name: 'Play/Pause', valuemin: null, valuemax: null, valuenow: null },
        { role: 'slider', name: 'Progress', valuemin: 0, valuemax: 100, valuenow: null },
        { role: 'button', name: 'Mute', valuemin: null, valuemax: null, valuenow: null },
        { role: 'slider', name: 'Volume', valuemin: 0, valuemax: 100, valuenow: null },
      );
      simplified.isCompoundComponent = true;
    } else if (tagName === 'video') {
      node._compoundChildren.push(
        { role: 'button', name: 'Play/Pause', valuemin: null, valuemax: null, valuenow: null },
        { role: 'slider', name: 'Progress', valuemin: 0, valuemax: 100, valuenow: null },
        { role: 'button', name: 'Mute', valuemin: null, valuemax: null, valuenow: null },
        { role: 'slider', name: 'Volume', valuemin: 0, valuemax: 100, valuenow: null },
        { role: 'button', name: 'Fullscreen', valuemin: null, valuemax: null, valuenow: null },
      );
      simplified.isCompoundComponent = true;
    }
  }

  private _extractSelectOptions(
    selectNode: EnhancedDOMTreeNode,
  ): { count: number; firstOptions: string[]; formatHint?: string } | null {
    if (!selectNode.childrenNodes) {
      return null;
    }

    const options: Array<{ text: string; value: string }> = [];
    const optionValues: string[] = [];

    const extractOptionsRecursive = (node: EnhancedDOMTreeNode): void => {
      const tagName = node.tagName?.toLowerCase() || node.nodeName.toLowerCase();
      if (tagName === 'option') {
        let optionText = '';
        let optionValue = '';

        if (node.attributes?.value) {
          optionValue = String(node.attributes.value).trim();
        }

        // 获取直接文本内容
        if (node.childrenNodes) {
          for (const child of node.childrenNodes) {
            if (child.nodeType === NodeType.TEXT_NODE && child.nodeValue) {
              optionText += child.nodeValue.trim() + ' ';
            }
          }
        }
        optionText = optionText.trim();

        if (!optionValue && optionText) {
          optionValue = optionText;
        }

        if (optionText || optionValue) {
          options.push({ text: optionText, value: optionValue });
          optionValues.push(optionValue);
        }
      } else if (tagName === 'optgroup') {
        if (node.childrenNodes) {
          for (const child of node.childrenNodes) {
            extractOptionsRecursive(child);
          }
        }
      } else {
        if (node.childrenNodes) {
          for (const child of node.childrenNodes) {
            extractOptionsRecursive(child);
          }
        }
      }
    };

    for (const child of selectNode.childrenNodes) {
      extractOptionsRecursive(child);
    }

    if (options.length === 0) {
      return null;
    }

    const firstOptions: string[] = [];
    for (const option of options.slice(0, 4)) {
      const displayText = option.text || option.value;
      if (displayText) {
        const text = displayText.length > 30 ? displayText.substring(0, 30) + '...' : displayText;
        firstOptions.push(text);
      }
    }

    if (options.length > 4) {
      firstOptions.push(`... ${options.length - 4} more options...`);
    }

    let formatHint: string | undefined;
    if (optionValues.length >= 2) {
      const firstFive = optionValues.slice(0, 5).filter(v => v);
      if (firstFive.every(v => /^\d+$/.test(v))) {
        formatHint = 'numeric';
      } else if (firstFive.every(v => v.length === 2 && /^[A-Z]+$/.test(v))) {
        formatHint = 'country/state codes';
      } else if (firstFive.some(v => v.includes('/') || v.includes('-'))) {
        formatHint = 'date/path format';
      } else if (firstFive.some(v => v.includes('@'))) {
        formatHint = 'email addresses';
      }
    }

    return { count: options.length, firstOptions: firstOptions, formatHint: formatHint };
  }

  private _isInteractiveCached(node: EnhancedDOMTreeNode): boolean {
    if (!this._clickableCache.has(node.nodeId)) {
      const startTime = Date.now();
      const result = ClickableElementDetector.isInteractive(node);
      const endTime = Date.now();

      if (!this.timingInfo.clickableDetectionTime) {
        this.timingInfo.clickableDetectionTime = 0;
      }
      this.timingInfo.clickableDetectionTime += endTime - startTime;
      this._clickableCache.set(node.nodeId, result);
    }
    return this._clickableCache.get(node.nodeId)!;
  }

  private _getChildrenAndShadowRoots(node: EnhancedDOMTreeNode): EnhancedDOMTreeNode[] {
    // 使用类的 getter 方法
    return node.childrenAndShadowRoots;
  }

  private _createSimplifiedTree(node: EnhancedDOMTreeNode, depth: number = 0): SimplifiedNode | null {
    // 过滤注释节点 - 注释节点对 LLM 分析没有价值，应该被完全排除
    if (node.nodeType === NodeType.COMMENT_NODE) {
      return null;
    }

    // 过滤其他不需要的节点类型（这些节点类型对 LLM 分析没有价值）
    if (
      node.nodeType === NodeType.ATTRIBUTE_NODE ||
      node.nodeType === NodeType.CDATA_SECTION_NODE ||
      node.nodeType === NodeType.ENTITY_REFERENCE_NODE ||
      node.nodeType === NodeType.ENTITY_NODE ||
      node.nodeType === NodeType.PROCESSING_INSTRUCTION_NODE ||
      node.nodeType === NodeType.DOCUMENT_TYPE_NODE ||
      node.nodeType === NodeType.NOTATION_NODE
    ) {
      return null;
    }

    if (node.nodeType === NodeType.DOCUMENT_NODE) {
      const children = this._getChildrenAndShadowRoots(node);
      for (const child of children) {
        const simplifiedChild = this._createSimplifiedTree(child, depth + 1);
        if (simplifiedChild) {
          return simplifiedChild;
        }
      }
      return null;
    }

    if (node.nodeType === NodeType.DOCUMENT_FRAGMENT_NODE) {
      const simplified = new SimplifiedNode(node, []);
      const children = this._getChildrenAndShadowRoots(node);
      for (const child of children) {
        const simplifiedChild = this._createSimplifiedTree(child, depth + 1);
        if (simplifiedChild) {
          simplified.children.push(simplifiedChild);
        }
      }
      return simplified.children.length > 0 ? simplified : new SimplifiedNode(node, []);
    }

    if (node.nodeType === NodeType.ELEMENT_NODE) {
      const nodeName = node.nodeName.toLowerCase();
      if (DISABLED_ELEMENTS.has(nodeName)) {
        return null;
      }
      if (SVG_ELEMENTS.has(nodeName)) {
        return null;
      }

      const attributes = node.attributes || {};
      let excludeAttr: string | undefined;

      if (this.sessionId) {
        const sessionSpecificAttr = `data-browser-use-exclude-${this.sessionId}`;
        excludeAttr = attributes[sessionSpecificAttr];
      }

      if (!excludeAttr) {
        excludeAttr = attributes['data-browser-use-exclude'];
      }

      if (excludeAttr?.toLowerCase() === 'true') {
        return null;
      }

      if (node.nodeName === 'IFRAME' || node.nodeName === 'FRAME') {
        if (node.contentDocument) {
          const simplified = new SimplifiedNode(node, []);
          if (node.contentDocument.childrenNodes) {
            for (const child of node.contentDocument.childrenNodes) {
              const simplifiedChild = this._createSimplifiedTree(child, depth + 1);
              if (simplifiedChild !== null) {
                simplified.children.push(simplifiedChild);
              }
            }
          }
          return simplified;
        }
      }

      const isVisible = node.isVisible;
      const isScrollable = node.isScrollable || false;
      const children = this._getChildrenAndShadowRoots(node);
      const hasShadowContent = children.some(child => child.nodeType === NodeType.DOCUMENT_FRAGMENT_NODE);
      const isShadowHost = hasShadowContent;

      let finalIsVisible = isVisible;
      if (!finalIsVisible && node.attributes) {
        const hasValidationAttrs = Object.keys(node.attributes).some(
          attr => attr.startsWith('aria-') || attr.startsWith('pseudo'),
        );
        if (hasValidationAttrs) {
          finalIsVisible = true;
        }
      }

      const isFileInput = node.tagName?.toLowerCase() === 'input' && node.attributes?.type === 'file';

      if (!finalIsVisible && isFileInput) {
        finalIsVisible = true;
      }

      if (finalIsVisible || isScrollable || children.length > 0 || isShadowHost) {
        const simplified = new SimplifiedNode(node, []);
        simplified.isShadowHost = isShadowHost;

        for (const child of children) {
          const simplifiedChild = this._createSimplifiedTree(child, depth + 1);
          if (simplifiedChild) {
            simplified.children.push(simplifiedChild);
          }
        }

        this._addCompoundComponents(simplified, node);

        if (isShadowHost && simplified.children.length > 0) {
          return simplified;
        }

        if (finalIsVisible || isScrollable || simplified.children.length > 0) {
          return simplified;
        }
      }
    } else if (node.nodeType === NodeType.TEXT_NODE) {
      if (node.nodeValue && node.nodeValue.trim().length > 1) {
        return new SimplifiedNode(node, []);
      }
    }

    return null;
  }

  private _optimizeTree(node: SimplifiedNode | null): SimplifiedNode | null {
    if (!node) {
      return null;
    }

    const optimizedChildren: SimplifiedNode[] = [];
    for (const child of node.children) {
      const optimizedChild = this._optimizeTree(child);
      if (optimizedChild) {
        optimizedChildren.push(optimizedChild);
      }
    }
    node.children = optimizedChildren;

    const isVisible = node.originalNode.snapshotNode && node.originalNode.isVisible;
    const isFileInput =
      node.originalNode.tagName?.toLowerCase() === 'input' && node.originalNode.attributes?.type === 'file';

    if (
      isVisible ||
      node.originalNode.isScrollable ||
      node.originalNode.nodeType === NodeType.TEXT_NODE ||
      node.children.length > 0 ||
      isFileInput
    ) {
      return node;
    }

    return null;
  }

  private _isInsideShadowDOM(node: SimplifiedNode): boolean {
    let current = node.originalNode.parentNode;
    while (current != null) {
      if (current.nodeType === NodeType.DOCUMENT_FRAGMENT_NODE && !current.shadowRoots) {
        return true;
      }
      current = current.parentNode;
    }

    return false;
  }

  private _hasInteractiveDescendants(node: SimplifiedNode): boolean {
    for (const child of node.children) {
      if (this._isInteractiveCached(child.originalNode)) {
        return true;
      }
      if (this._hasInteractiveDescendants(child)) {
        return true;
      }
    }
    return false;
  }

  private _assignInteractiveIndicesAndMarkNewNodes(node: SimplifiedNode | null): void {
    if (!node) {
      return;
    }

    if (!node.excludedByParent && !node.ignoredByPaintOrder) {
      const isInteractiveAssign = this._isInteractiveCached(node.originalNode);
      const isVisible = node.originalNode.snapshotNode && node.originalNode.isVisible;
      const isScrollable = node.originalNode.isScrollable || false;
      const isFileInput =
        node.originalNode.tagName?.toLowerCase() === 'input' && node.originalNode.attributes?.type === 'file';
      const isShadowDomElement =
        isInteractiveAssign &&
        node.originalNode.tagName && ['input', 'button', 'select', 'textarea', 'a'] &&
        this._isInsideShadowDOM(node);

      let shouldMakeInteractive = false;

      if (isScrollable) {
        const hasInteractiveDesc = this._hasInteractiveDescendants(node);
        if (!hasInteractiveDesc) {
          shouldMakeInteractive = true;
        }
      } else if (isInteractiveAssign && (isVisible || isFileInput || isShadowDomElement)) {
        shouldMakeInteractive = true;
      }

      if (shouldMakeInteractive) {
        node.isInteractive = true;
        this._selectorMap.set(node.originalNode.backendNodeId, node.originalNode);
        this._interactiveCounter += 1;

        if (node.isCompoundComponent) {
          node.isNew = true;
        } else if (this._previousCachedSelectorMap) {
          const previousBackendNodeIds = new Set(
            Array.from(this._previousCachedSelectorMap.values()).map(n => n.backendNodeId),
          );
          if (!previousBackendNodeIds.has(node.originalNode.backendNodeId)) {
            node.isNew = true;
          }
        }
      }
    }

    for (const child of node.children) {
      this._assignInteractiveIndicesAndMarkNewNodes(child);
    }
  }

  private _applyBoundingBoxFiltering(node: SimplifiedNode | null): SimplifiedNode | null {
    if (!node) {
      return null;
    }

    this._filterTreeRecursive(node, null, 0);
    return node;
  }

  private _filterTreeRecursive(
    node: SimplifiedNode,
    activeBounds: PropagatingBounds | null = null,
    depth: number = 0,
  ): void {
    if (activeBounds && this._shouldExcludeChild(node, activeBounds)) {
      node.excludedByParent = true;
    }

    let newBounds: PropagatingBounds | null = null;
    const tag = node.originalNode.tagName?.toLowerCase() || '';
    const role = node.originalNode.attributes?.role || null;

    if (this._isPropagatingElement({ tag, role })) {
      if (node.originalNode.snapshotNode?.bounds) {
        newBounds = {
          tag,
          bounds: node.originalNode.snapshotNode.bounds,
          nodeId: node.originalNode.nodeId,
          depth,
        };
      }
    }

    const propagateBounds = newBounds || activeBounds;
    for (const child of node.children) {
      this._filterTreeRecursive(child, propagateBounds, depth + 1);
    }
  }

  private _shouldExcludeChild(node: SimplifiedNode, activeBounds: PropagatingBounds): boolean {
    if (node.originalNode.nodeType === NodeType.TEXT_NODE) {
      return false;
    }

    if (!node.originalNode.snapshotNode?.bounds) {
      return false;
    }

    const childBounds = node.originalNode.snapshotNode.bounds;
    if (!this._isContained(childBounds, activeBounds.bounds, this.containmentThreshold)) {
      return false;
    }

    const childTag = node.originalNode.tagName?.toLowerCase() || '';
    const childRole = node.originalNode.attributes?.role || null;

    if (['input', 'select', 'textarea', 'label'].includes(childTag)) {
      return false;
    }

    if (this._isPropagatingElement({ tag: childTag, role: childRole })) {
      return false;
    }

    if (node.originalNode.attributes?.onclick) {
      return false;
    }

    const ariaLabel = node.originalNode.attributes?.['aria-label'];
    if (ariaLabel && ariaLabel.trim()) {
      return false;
    }

    const role = node.originalNode.attributes?.role;
    if (['button', 'link', 'checkbox', 'radio', 'tab', 'menuitem', 'option'].includes(role || '')) {
      return false;
    }

    return true;
  }

  private _isContained(child: DOMRect, parent: DOMRect, threshold: number): boolean {
    const xOverlap = Math.max(
      0,
      Math.min(child.x + child.width, parent.x + parent.width) - Math.max(child.x, parent.x),
    );
    const yOverlap = Math.max(
      0,
      Math.min(child.y + child.height, parent.y + parent.height) - Math.max(child.y, parent.y),
    );
    const intersectionArea = xOverlap * yOverlap;
    const childArea = child.width * child.height;

    if (childArea === 0) {
      return false;
    }

    const containmentRatio = intersectionArea / childArea;
    return containmentRatio >= threshold;
  }

  private _isPropagatingElement(attributes: { tag: string; role: string | null }): boolean {
    for (const pattern of DOMTreeSerializer.PROPAGATING_ELEMENTS) {
      const tagMatch = pattern.tag === attributes.tag;
      const roleMatch = pattern.role === null || pattern.role === attributes.role;
      if (tagMatch && roleMatch) {
        return true;
      }
    }
    return false;
  }

  static serializeTree(node: SimplifiedNode | null, includeAttributes: string[], depth: number = 0): string {
    if (!node) {
      return '';
    }

    if (node.excludedByParent) {
      const formattedText: string[] = [];
      for (const child of node.children) {
        const childText = DOMTreeSerializer.serializeTree(child, includeAttributes, depth);
        if (childText) {
          formattedText.push(childText);
        }
      }
      return formattedText.join('\n');
    }

    const formattedText: string[] = [];
    const depthStr = '\t'.repeat(depth);
    let nextDepth = depth;

    if (node.originalNode.nodeType === NodeType.ELEMENT_NODE) {
      if (!node.shouldDisplay) {
        for (const child of node.children) {
          const childText = DOMTreeSerializer.serializeTree(child, includeAttributes, depth);
          if (childText) {
            formattedText.push(childText);
          }
        }
        return formattedText.join('\n');
      }

      const tagName = node.originalNode.tagName?.toLowerCase() || '';
      if (tagName === 'svg') {
        let shadowPrefix = '';
        if (node.isShadowHost) {
          const hasClosedShadow = node.children.some(
            child =>
              child.originalNode.nodeType === NodeType.DOCUMENT_FRAGMENT_NODE &&
              child.originalNode.shadowRootType?.toLowerCase() === 'closed',
          );
          shadowPrefix = hasClosedShadow ? '|SHADOW(closed)|' : '|SHADOW(open)|';
        }

        let line = depthStr + shadowPrefix;
        if (node.isInteractive) {
          const newPrefix = node.isNew ? '*' : '';
          line += `${newPrefix}[${node.originalNode.backendNodeId}]`;
        }
        line += '<svg';
        const attributesHtmlStr = DOMTreeSerializer._buildAttributesString(node.originalNode, includeAttributes, '');
        if (attributesHtmlStr) {
          line += ` ${attributesHtmlStr}`;
        }
        line += ' /> <!-- SVG content collapsed -->';
        formattedText.push(line);
        return formattedText.join('\n');
      }

      // const isAnyScrollable = node.originalNode.isScrollable || false;
      const shouldShowScroll = false; // TODO: 实现 shouldShowScrollInfo

      // if (node.isInteractive || isAnyScrollable || node.originalNode.nodeName.toUpperCase() === 'IFRAME' || node.originalNode.nodeName.toUpperCase() === 'FRAME') {
      nextDepth += 1;

      const textContent = '';
      let attributesHtmlStr = DOMTreeSerializer._buildAttributesString(
        node.originalNode,
        includeAttributes,
        textContent,
      );

      if (node.originalNode._compoundChildren) {
        const compoundInfo: string[] = [];
        for (const childInfo of node.originalNode._compoundChildren) {
          const parts: string[] = [];
          if (childInfo.name) {
            parts.push(`name=${childInfo.name}`);
          }
          if (childInfo.role) {
            parts.push(`role=${childInfo.role}`);
          }
          if (childInfo.valuemin !== null && childInfo.valuemin !== undefined) {
            parts.push(`min=${childInfo.valuemin}`);
          }
          if (childInfo.valuemax !== null && childInfo.valuemax !== undefined) {
            parts.push(`max=${childInfo.valuemax}`);
          }
          if (childInfo.valuenow !== null && childInfo.valuenow !== undefined) {
            parts.push(`current=${childInfo.valuenow}`);
          }
          if (childInfo.optionsCount !== undefined) {
            parts.push(`count=${childInfo.optionsCount}`);
          }
          if (childInfo.firstOptions) {
            const optionsStr = childInfo.firstOptions.slice(0, 4).join('|');
            parts.push(`options=${optionsStr}`);
          }
          if (childInfo.formatHint) {
            parts.push(`format=${childInfo.formatHint}`);
          }
          if (parts.length > 0) {
            compoundInfo.push(`(${parts.join(',')})`);
          }
        }
        if (compoundInfo.length > 0) {
          const compoundAttr = `compound_components=${compoundInfo.join(',')}`;
          attributesHtmlStr = attributesHtmlStr ? `${attributesHtmlStr} ${compoundAttr}` : compoundAttr;
        }
      }

      let shadowPrefix = '';
      if (node.isShadowHost) {
        const hasClosedShadow = node.children.some(
          child =>
            child.originalNode.nodeType === NodeType.DOCUMENT_FRAGMENT_NODE &&
            child.originalNode.shadowRootType?.toLowerCase() === 'closed',
        );
        shadowPrefix = hasClosedShadow ? '|SHADOW(closed)|' : '|SHADOW(open)|';
      }

      let line = '';
      if (shouldShowScroll && !node.isInteractive) {
        line = `${depthStr}${shadowPrefix}|SCROLL|<${node.originalNode.tagName || node.originalNode.nodeName}`;
      } else if (node.isInteractive) {
        const newPrefix = node.isNew ? '*' : '';
        const scrollPrefix = shouldShowScroll ? '|SCROLL[' : '[';
        line = `${depthStr}${shadowPrefix}${newPrefix}${scrollPrefix}${node.originalNode.backendNodeId}]<${node.originalNode.tagName || node.originalNode.nodeName}`;
      } else if (node.originalNode.nodeName.toUpperCase() === 'IFRAME') {
        line = `${depthStr}${shadowPrefix}|IFRAME|<${node.originalNode.tagName || node.originalNode.nodeName}`;
      } else if (node.originalNode.nodeName.toUpperCase() === 'FRAME') {
        line = `${depthStr}${shadowPrefix}|FRAME|<${node.originalNode.tagName || node.originalNode.nodeName}`;
      } else {
        line = `${depthStr}${shadowPrefix}<${node.originalNode.tagName || node.originalNode.nodeName}`;
      }

      if (attributesHtmlStr) {
        line += ` ${attributesHtmlStr}`;
      }
      line += ' />';
      formattedText.push(line);
      // }
    } else if (node.originalNode.nodeType === NodeType.DOCUMENT_FRAGMENT_NODE) {
      if (node.originalNode.shadowRootType?.toLowerCase() === 'closed') {
        formattedText.push(`${depthStr}Closed Shadow`);
      } else {
        formattedText.push(`${depthStr}Open Shadow`);
      }
      nextDepth += 1;

      for (const child of node.children) {
        const childText = DOMTreeSerializer.serializeTree(child, includeAttributes, nextDepth);
        if (childText) {
          formattedText.push(childText);
        }
      }

      // if (node.children.length > 0) {
      formattedText.push(`${depthStr}Shadow End`);
      // }
    } else if (node.originalNode.nodeType === NodeType.TEXT_NODE) {
      if (node.originalNode.nodeValue && node.originalNode.nodeValue.trim().length > 1) {
        formattedText.push(`${depthStr}${node.originalNode.nodeValue.trim()}`);
      }
    }

    if (node.originalNode.nodeType !== NodeType.DOCUMENT_FRAGMENT_NODE) {
      for (const child of node.children) {
        const childText = DOMTreeSerializer.serializeTree(child, includeAttributes, nextDepth);
        if (childText) {
          formattedText.push(childText);
        }
      }
    }

    return formattedText.join('\n');
  }

  private static _buildAttributesString(node: EnhancedDOMTreeNode, includeAttributes: string[], text: string): string {
    const attributesToInclude: Record<string, string> = {};

    // 检查是否包含通配符模式
    const includeAllDataAttrs = includeAttributes.some(attr => attr === 'data-*' || attr.startsWith('data-'));
    const includeAllAriaAttrs = includeAttributes.some(attr => attr === 'aria-*' || attr.startsWith('aria-'));

    if (node.attributes) {
      for (const [key, value] of Object.entries(node.attributes)) {
        const valueStr = String(value).trim();
        if (valueStr === undefined || valueStr === null) {
          continue;
        }

        // 检查是否在包含列表中
        if (includeAttributes.includes(key)) {
          attributesToInclude[key] = valueStr;
        } else if (includeAllDataAttrs && key.startsWith('data-')) {
          // 包含所有 data-* 属性
          attributesToInclude[key] = valueStr;
        } else if (includeAllAriaAttrs && key.startsWith('aria-')) {
          // 包含所有 aria-* 属性
          attributesToInclude[key] = valueStr;
        }
      }
    }

    const tagName = node.tagName?.toLowerCase();
    if (tagName === 'input' && node.attributes) {
      const inputType = node.attributes.type?.toLowerCase() || '';
      const formatMap: Record<string, string> = {
        date: 'YYYY-MM-DD',
        time: 'HH:MM',
        'datetime-local': 'YYYY-MM-DDTHH:MM',
        month: 'YYYY-MM',
        week: 'YYYY-W##',
      };

      if (inputType in formatMap) {
        attributesToInclude.format = formatMap[inputType];
      }

      if (includeAttributes.includes('placeholder') && !attributesToInclude.placeholder) {
        if (inputType === 'date') {
          attributesToInclude.placeholder = 'YYYY-MM-DD';
        } else if (inputType === 'time') {
          attributesToInclude.placeholder = 'HH:MM';
        } else if (inputType === 'datetime-local') {
          attributesToInclude.placeholder = 'YYYY-MM-DDTHH:MM';
        } else if (inputType === 'month') {
          attributesToInclude.placeholder = 'YYYY-MM';
        } else if (inputType === 'week') {
          attributesToInclude.placeholder = 'YYYY-W##';
        } else if (inputType === 'tel' && !attributesToInclude.pattern) {
          attributesToInclude.placeholder = '123-456-7890';
        } else if (inputType === 'text' || inputType === '') {
          const classAttr = node.attributes.class?.toLowerCase() || '';
          if (node.attributes['uib-datepicker-popup']) {
            const dateFormat = node.attributes['uib-datepicker-popup'];
            if (dateFormat) {
              attributesToInclude.expected_format = dateFormat;
              attributesToInclude.format = dateFormat;
            }
          } else if (
            ['datepicker', 'datetimepicker', 'daterangepicker'].some(indicator => classAttr.includes(indicator))
          ) {
            const dateFormat = node.attributes['data-date-format'] || '';
            if (dateFormat) {
              attributesToInclude.placeholder = dateFormat;
              attributesToInclude.format = dateFormat;
            } else {
              attributesToInclude.placeholder = 'mm/dd/yyyy';
              attributesToInclude.format = 'mm/dd/yyyy';
            }
          } else if (node.attributes['data-datepicker']) {
            const dateFormat = node.attributes['data-date-format'] || '';
            if (dateFormat) {
              attributesToInclude.placeholder = dateFormat;
              attributesToInclude.format = dateFormat;
            } else {
              attributesToInclude.placeholder = 'mm/dd/yyyy';
              attributesToInclude.format = 'mm/dd/yyyy';
            }
          }
        }
      }
    }

    if (node.axNode?.properties) {
      for (const prop of node.axNode.properties) {
        try {
          if (includeAttributes.includes(prop.name) && prop.value !== null && prop.value !== undefined) {
            if (typeof prop.value === 'boolean') {
              attributesToInclude[prop.name] = String(prop.value).toLowerCase();
            } else {
              const propValueStr = String(prop.value).trim();
              if (propValueStr) {
                attributesToInclude[prop.name] = propValueStr;
              }
            }
          }
        } catch {
          continue;
        }
      }
    }

    if (tagName && ['input', 'textarea', 'select'].includes(tagName)) {
      if (node.axNode?.properties) {
        for (const prop of node.axNode.properties) {
          if (prop.name === 'valuetext' && prop.value) {
            const valueStr = String(prop.value).trim();
            if (valueStr) {
              attributesToInclude.value = valueStr;
              break;
            }
          } else if (prop.name === 'value' && prop.value) {
            const valueStr = String(prop.value).trim();
            if (valueStr) {
              attributesToInclude.value = valueStr;
              break;
            }
          }
        }
      }
    }

    if (Object.keys(attributesToInclude).length === 0) {
      return '';
    }

    const orderedKeys = includeAttributes.filter(key => key in attributesToInclude);
    if (orderedKeys.length > 1) {
      const keysToRemove = new Set<string>();
      const seenValues: Record<string, string> = {};
      const protectedAttrs = new Set(['format', 'expected_format', 'placeholder', 'value', 'aria-label', 'title']);

      for (const key of orderedKeys) {
        const value = attributesToInclude[key];
        if (value.length > 5 && !protectedAttrs.has(key)) {
          if (value in seenValues) {
            keysToRemove.add(key);
          } else {
            seenValues[value] = key;
          }
        }
      }

      for (const key of keysToRemove) {
        delete attributesToInclude[key];
      }
    }

    const role = node.axNode?.role;
    if (role && node.nodeName === role) {
      delete attributesToInclude.role;
    }

    if (attributesToInclude.type?.toLowerCase() === node.nodeName.toLowerCase()) {
      delete attributesToInclude.type;
    }

    if (attributesToInclude.invalid?.toLowerCase() === 'false') {
      delete attributesToInclude.invalid;
    }

    const booleanAttrs = ['required'];
    for (const attr of booleanAttrs) {
      if (['false', '0', 'no'].includes(attributesToInclude[attr]?.toLowerCase() || '')) {
        delete attributesToInclude[attr];
      }
    }

    if (attributesToInclude.expanded && attributesToInclude['aria-expanded']) {
      delete attributesToInclude['aria-expanded'];
    }

    const attrsToRemoveIfTextMatches = ['aria-label', 'placeholder', 'title'];
    for (const attr of attrsToRemoveIfTextMatches) {
      if (attributesToInclude[attr]?.trim().toLowerCase() === text.trim().toLowerCase()) {
        delete attributesToInclude[attr];
      }
    }

    if (Object.keys(attributesToInclude).length === 0) {
      return '';
    }

    const formattedAttrs: string[] = [];
    for (const [key, value] of Object.entries(attributesToInclude)) {
      const cappedValue = capTextLength(value, 100);
      if (!cappedValue) {
        formattedAttrs.push(`${key}=''`);
      } else {
        formattedAttrs.push(`${key}=${cappedValue}`);
      }
    }

    return formattedAttrs.join(' ');
  }
}
