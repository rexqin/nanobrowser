import type { EnhancedDOMTreeNode } from './enhancedDOMTreeNode';
import { NodeType } from './domService';

/**
 * 可点击元素检测器
 * 使用增强评分检查节点是否可点击/交互
 */
export class ClickableElementDetector {
  /**
   * 检查此节点是否可点击/交互
   * @param node 增强的 DOM 树节点
   * @returns 如果节点是可交互的，返回 true
   */
  static isInteractive(node: EnhancedDOMTreeNode): boolean {
    // 跳过非元素节点
    if (node.nodeType !== NodeType.ELEMENT_NODE) {
      return false;
    }

    // 移除 html 和 body 节点
    const tagName = node.tagName?.toLowerCase();
    if (tagName === 'html' || tagName === 'body') {
      return false;
    }

    // IFRAME 元素如果足够大（> 100x100px），应该是交互式的，因为它们可能需要滚动
    // 小的 iframe（< 100px 宽或高）不太可能有可滚动内容
    if (tagName === 'iframe' || tagName === 'frame') {
      if (node.snapshotNode?.bounds) {
        const width = node.snapshotNode.bounds.width;
        const height = node.snapshotNode.bounds.height;
        // 只包含大于 100x100px 的 iframe
        if (width > 100 && height > 100) {
          return true;
        }
      }
    }

    // 放宽的大小检查：允许所有元素，包括大小为 0 的元素（它们可能是交互式覆盖层等）
    // 注意：大小为 0 的元素仍然可以是交互式的（例如，不可见的可点击覆盖层）
    // 可见性由 CSS 样式单独确定，而不仅仅是边界框大小

    // 搜索元素检测：检查搜索相关的类和属性
    if (node.attributes) {
      const searchIndicators = new Set([
        'search',
        'magnify',
        'glass',
        'lookup',
        'find',
        'query',
        'search-icon',
        'search-btn',
        'search-button',
        'searchbox',
      ]);

      // 检查类名中的搜索指示器
      const classList = (node.attributes.class || '').toLowerCase().split(/\s+/);
      if (classList.some(cls => Array.from(searchIndicators).some(indicator => cls.includes(indicator)))) {
        return true;
      }

      // 检查 id 中的搜索指示器
      const elementId = (node.attributes.id || '').toLowerCase();
      if (Array.from(searchIndicators).some(indicator => elementId.includes(indicator))) {
        return true;
      }

      // 检查数据属性中的搜索功能
      for (const [attrName, attrValue] of Object.entries(node.attributes)) {
        if (attrName.startsWith('data-') && typeof attrValue === 'string') {
          const lowerValue = attrValue.toLowerCase();
          if (Array.from(searchIndicators).some(indicator => lowerValue.includes(indicator))) {
            return true;
          }
        }
      }
    }

    // 增强的可访问性属性检查 - 仅直接明确的指示器
    if (node.axNode?.properties) {
      for (const prop of node.axNode.properties) {
        try {
          // aria disabled
          if (prop.name === 'disabled' && prop.value) {
            return false;
          }

          // aria hidden
          if (prop.name === 'hidden' && prop.value) {
            return false;
          }

          // 直接交互性指示器
          if (['focusable', 'editable', 'settable'].includes(prop.name) && prop.value) {
            return true;
          }

          // 交互式状态属性（存在表示交互式小部件）
          if (['checked', 'expanded', 'pressed', 'selected'].includes(prop.name)) {
            // 这些属性只存在于交互式元素上
            return true;
          }

          // 表单相关的交互性
          if (['required', 'autocomplete'].includes(prop.name) && prop.value) {
            return true;
          }

          // 有键盘快捷键的元素是交互式的
          if (prop.name === 'keyshortcuts' && prop.value) {
            return true;
          }
        } catch {
          // 跳过无法处理的属性
          continue;
        }
      }
    }

    // 增强的标签检查：包含真正交互式的元素
    // 注意：'label' 已移除 - 标签由下面的其他属性检查处理
    // 否则带有 "for" 属性的标签可能会破坏 apartments.com 上的真正可点击元素
    const interactiveTags = new Set([
      'button',
      'input',
      'select',
      'textarea',
      'a',
      'details',
      'summary',
      'option',
      'optgroup',
    ]);
    // 使用不区分大小写的比较进行检查
    if (tagName && interactiveTags.has(tagName.toLowerCase())) {
      return true;
    }

    // 第三级检查：具有交互式属性的元素
    if (node.attributes) {
      // 检查事件处理器或交互式属性
      const interactiveAttributes = new Set([
        'onclick',
        'onmousedown',
        'onmouseup',
        'onkeydown',
        'onkeyup',
        'tabindex',
      ]);
      if (Object.keys(node.attributes).some(attr => interactiveAttributes.has(attr.toLowerCase()))) {
        return true;
      }

      // 检查交互式 ARIA 角色
      if (node.attributes.role) {
        const interactiveRoles = new Set([
          'button',
          'link',
          'menuitem',
          'option',
          'radio',
          'checkbox',
          'tab',
          'textbox',
          'combobox',
          'slider',
          'spinbutton',
          'search',
          'searchbox',
        ]);
        if (interactiveRoles.has(node.attributes.role.toLowerCase())) {
          return true;
        }
      }
    }

    // 第四级检查：可访问性树角色
    if (node.axNode?.role) {
      const interactiveAxRoles = new Set([
        'button',
        'link',
        'menuitem',
        'option',
        'radio',
        'checkbox',
        'tab',
        'textbox',
        'combobox',
        'slider',
        'spinbutton',
        'listbox',
        'search',
        'searchbox',
      ]);
      if (interactiveAxRoles.has(node.axNode.role.toLowerCase())) {
        return true;
      }
    }

    // 图标和小元素检查：可能是图标的元素
    if (
      node.snapshotNode?.bounds &&
      10 <= node.snapshotNode.bounds.width &&
      node.snapshotNode.bounds.width <= 50 && // 图标大小的元素
      10 <= node.snapshotNode.bounds.height &&
      node.snapshotNode.bounds.height <= 50
    ) {
      // 检查这个小元素是否有交互式属性
      if (node.attributes) {
        // 具有这些属性的小元素可能是交互式图标
        const iconAttributes = new Set(['class', 'role', 'onclick', 'data-action', 'aria-label']);
        if (Object.keys(node.attributes).some(attr => iconAttributes.has(attr.toLowerCase()))) {
          return true;
        }
      }
    }

    // 最终回退：光标样式表示交互性（对于 Chrome 遗漏的情况）
    if (node.snapshotNode?.cursorStyle && node.snapshotNode.cursorStyle === 'pointer') {
      return true;
    }

    return false;
  }
}
