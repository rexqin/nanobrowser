import type { SimplifiedNode, DOMSelectorMap } from './domSerializer';
import { DOMTreeSerializer } from './domSerializer';

// 默认包含的属性列表
export const DEFAULT_INCLUDE_ATTRIBUTES = [
  'title',
  'type',
  'checked',
  'class',
  'id',
  'name',
  'role',
  'value',
  'placeholder',
  'data-date-format',
  'alt',
  'aria-label',
  'aria-expanded',
  'data-state',
  'aria-checked',
  'aria-valuemin',
  'aria-valuemax',
  'aria-valuenow',
  'aria-placeholder',
  'pattern',
  'min',
  'max',
  'minlength',
  'maxlength',
  'step',
  'accept',
  'multiple',
  'inputmode',
  'autocomplete',
  'data-mask',
  'data-inputmask',
  'data-datepicker',
  'format',
  'expected_format',
  'contenteditable',
  'pseudo',
  'checked',
  'selected',
  'expanded',
  'pressed',
  'disabled',
  'invalid',
  'valuemin',
  'valuemax',
  'valuenow',
  'keyshortcuts',
  'haspopup',
  'multiselectable',
  'readonly',
  'required',
  'valuetext',
  'level',
  'busy',
  'live',
  'ax_name',
];

/**
 * 序列化后的 DOM 状态类
 */
export class SerializedDOMState {
  _root: SimplifiedNode | null;
  selectorMap: DOMSelectorMap;

  constructor(root: SimplifiedNode | null, selectorMap: DOMSelectorMap) {
    this._root = root;
    this.selectorMap = selectorMap;
  }

  /**
   * 获取 LLM 表示（用于 LLM 消费的字符串格式）
   * @param includeAttributes 要包含的属性列表，如果为 null 则使用默认属性列表
   * @returns DOM 树的字符串表示
   */
  llmRepresentation(includeAttributes: string[] | null = null): string {
    if (!this._root) {
      return 'Empty DOM tree (you might have to wait for the page to load)';
    }

    const attributes = includeAttributes || DEFAULT_INCLUDE_ATTRIBUTES;
    return DOMTreeSerializer.serializeTree(this._root, attributes);
  }

  /**
   * 评估表示（用于评估/判断上下文的 DOM 表示，不包含交互索引）
   * 这个序列化器设计用于评估/判断上下文，其中：
   * - 不需要交互索引（我们不点击）
   * - 应该保留完整的 HTML 结构以提供上下文
   * - 更多属性信息有帮助
   * - 文本内容对于理解页面结构很重要
   * @param includeAttributes 要包含的属性列表，如果为 null 则使用扩展的属性列表
   * @returns DOM 树的字符串表示（评估版本）
   */
  evalRepresentation(includeAttributes: string[] | null = null): string {
    if (!this._root) {
      return 'Empty DOM tree (you might have to wait for the page to load)';
    }

    // 对于评估版本，使用扩展的属性列表（包含更多信息）
    // 注意：evalRepresentation 不使用交互索引，但当前的 serializeTree 实现已经处理了这一点
    // 如果需要完全不同的序列化逻辑，可以创建 DOMEvalSerializer 类
    const evalAttributes = includeAttributes || this._getEvalAttributes();
    return DOMTreeSerializer.serializeTree(this._root, evalAttributes);
  }

  /**
   * 获取评估用的属性列表（包含所有 data-* 和 aria-* 属性）
   */
  private _getEvalAttributes(): string[] {
    // 扩展的属性列表，包含所有常见的 data-* 和 aria-* 属性
    // 注意：实际的属性过滤会在 _buildAttributesString 中处理通配符
    return [
      ...DEFAULT_INCLUDE_ATTRIBUTES,
      // 添加更多评估相关的属性
      'data-testid',
      'data-cy',
      'data-id',
      'data-name',
      'data-value',
      'data-label',
      'aria-labelledby',
      'aria-controls',
      'aria-owns',
      'aria-live',
      'aria-atomic',
      'aria-relevant',
      'aria-busy',
      'aria-current',
      'aria-posinset',
      'aria-setsize',
      'aria-level',
      'aria-orientation',
      'aria-sort',
      'aria-valuemin',
      'aria-valuemax',
      'aria-valuenow',
      'aria-valuetext',
    ];
  }
}
