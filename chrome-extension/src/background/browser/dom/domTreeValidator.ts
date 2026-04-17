import { NodeType } from './domService.js';
import type { EnhancedDOMTreeNode } from './domService.js';
import { SimplifiedNode } from './domSerializer.js';

/**
 * DOM 树验证结果
 */
export interface DOMTreeValidationResult {
  /** 是否通过验证 */
  isValid: boolean;
  /** 验证错误列表 */
  errors: ValidationError[];
  /** 统计信息 */
  statistics: TreeStatistics;
  /** 警告列表 */
  warnings: ValidationWarning[];
}

/**
 * 验证错误
 */
export interface ValidationError {
  type: 'forbidden_node_type' | 'missing_required_property' | 'invalid_structure' | 'orphan_node';
  message: string;
  nodeType?: NodeType;
  nodeName?: string;
  backendNodeId?: number;
  path?: string;
}

/**
 * 验证警告
 */
export interface ValidationWarning {
  type: 'suspicious_node' | 'large_tree' | 'missing_interactive_element';
  message: string;
  nodeType?: NodeType;
  nodeName?: string;
  backendNodeId?: number;
}

/**
 * 树统计信息
 */
export interface TreeStatistics {
  /** 总节点数 */
  totalNodes: number;
  /** 各类型节点数量 */
  nodeTypeCounts: Record<string, number>;
  /** 交互元素数量 */
  interactiveElementsCount: number;
  /** 可见元素数量 */
  visibleElementsCount: number;
  /** 最大深度 */
  maxDepth: number;
  /** 平均子节点数 */
  avgChildrenPerNode: number;
  /** 禁用元素数量 */
  disabledElementsCount: number;
  /** Shadow DOM 主机数量 */
  shadowHostsCount: number;
  /** 复合组件数量 */
  compoundComponentsCount: number;
}

/**
 * DOM 树验证器
 * 用于验证简化后的 DOM 树是否正确
 */
export class DOMTreeValidator {
  /**
   * 验证简化后的 DOM 树
   */
  static validateSimplifiedTree(root: SimplifiedNode | null): DOMTreeValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const statistics: TreeStatistics = {
      totalNodes: 0,
      nodeTypeCounts: {},
      interactiveElementsCount: 0,
      visibleElementsCount: 0,
      maxDepth: 0,
      avgChildrenPerNode: 0,
      disabledElementsCount: 0,
      shadowHostsCount: 0,
      compoundComponentsCount: 0,
    };

    if (!root) {
      errors.push({
        type: 'invalid_structure',
        message: '简化后的树根节点为空',
      });
      return {
        isValid: false,
        errors,
        statistics,
        warnings,
      };
    }

    // 禁止的节点类型（不应该出现在简化后的树中）
    const forbiddenNodeTypes = new Set([
      NodeType.COMMENT_NODE,
      NodeType.ATTRIBUTE_NODE,
      NodeType.CDATA_SECTION_NODE,
      NodeType.ENTITY_REFERENCE_NODE,
      NodeType.ENTITY_NODE,
      NodeType.PROCESSING_INSTRUCTION_NODE,
      NodeType.DOCUMENT_TYPE_NODE,
      NodeType.NOTATION_NODE,
    ]);

    // 禁止的元素名称（不应该出现在简化后的树中）
    const forbiddenElementNames = new Set(['style', 'script', 'head', 'meta', 'link', 'title', 'noscript', '#comment']);

    // 递归验证节点
    const validateNode = (node: SimplifiedNode, depth: number = 0, path: string = '/'): void => {
      statistics.totalNodes++;
      statistics.maxDepth = Math.max(statistics.maxDepth, depth);

      const originalNode = node.originalNode;
      const nodeTypeName = NodeType[originalNode.nodeType] || `UNKNOWN_${originalNode.nodeType}`;
      statistics.nodeTypeCounts[nodeTypeName] = (statistics.nodeTypeCounts[nodeTypeName] || 0) + 1;

      // 检查禁止的节点类型
      if (forbiddenNodeTypes.has(originalNode.nodeType)) {
        errors.push({
          type: 'forbidden_node_type',
          message: `发现禁止的节点类型: ${nodeTypeName}`,
          nodeType: originalNode.nodeType,
          nodeName: originalNode.nodeName,
          backendNodeId: originalNode.backendNodeId,
          path,
        });
      }

      // 检查禁止的元素名称
      if (
        originalNode.nodeType === NodeType.ELEMENT_NODE &&
        forbiddenElementNames.has(originalNode.nodeName.toLowerCase())
      ) {
        errors.push({
          type: 'forbidden_node_type',
          message: `发现禁止的元素: ${originalNode.nodeName}`,
          nodeType: originalNode.nodeType,
          nodeName: originalNode.nodeName,
          backendNodeId: originalNode.backendNodeId,
          path,
        });
      }

      // 检查必需的属性
      if (!originalNode.backendNodeId) {
        errors.push({
          type: 'missing_required_property',
          message: '节点缺少 backendNodeId',
          nodeType: originalNode.nodeType,
          nodeName: originalNode.nodeName,
          path,
        });
      }

      // 统计信息收集
      if (node.isInteractive) {
        statistics.interactiveElementsCount++;
      }

      if (originalNode.isVisible) {
        statistics.visibleElementsCount++;
      }

      if (node.isShadowHost) {
        statistics.shadowHostsCount++;
      }

      if (node.isCompoundComponent) {
        statistics.compoundComponentsCount++;
      }

      // 检查可疑节点
      if (
        originalNode.nodeType === NodeType.ELEMENT_NODE &&
        !originalNode.isVisible &&
        !node.isShadowHost &&
        node.children.length === 0
      ) {
        warnings.push({
          type: 'suspicious_node',
          message: `发现不可见且无子节点的元素: ${originalNode.nodeName}`,
          nodeType: originalNode.nodeType,
          nodeName: originalNode.nodeName,
          backendNodeId: originalNode.backendNodeId,
        });
      }

      // 递归验证子节点
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        const childPath = `${path}${originalNode.nodeName || 'UNKNOWN'}[${i}]/`;
        validateNode(child, depth + 1, childPath);
      }
    };

    validateNode(root);

    // 计算平均子节点数
    if (statistics.totalNodes > 0) {
      const totalChildren = this._countTotalChildren(root);
      statistics.avgChildrenPerNode = totalChildren / statistics.totalNodes;
    }

    // 检查树大小警告
    if (statistics.totalNodes > 1000) {
      warnings.push({
        type: 'large_tree',
        message: `简化后的树包含大量节点 (${statistics.totalNodes})，可能影响 LLM 处理性能`,
      });
    }

    // 检查是否有交互元素
    if (statistics.interactiveElementsCount === 0 && statistics.totalNodes > 10) {
      warnings.push({
        type: 'missing_interactive_element',
        message: '简化后的树中没有发现交互元素，可能遗漏了重要的可点击元素',
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      statistics,
      warnings,
    };
  }

  /**
   * 统计总子节点数
   */
  private static _countTotalChildren(node: SimplifiedNode): number {
    let count = node.children.length;
    for (const child of node.children) {
      count += this._countTotalChildren(child);
    }
    return count;
  }

  /**
   * 验证原始 DOM 树（用于对比）
   */
  static validateOriginalTree(root: EnhancedDOMTreeNode | null): {
    totalNodes: number;
    nodeTypeCounts: Record<string, number>;
    commentNodesCount: number;
  } {
    const result = {
      totalNodes: 0,
      nodeTypeCounts: {} as Record<string, number>,
      commentNodesCount: 0,
    };

    if (!root) {
      return result;
    }

    const traverse = (node: EnhancedDOMTreeNode): void => {
      result.totalNodes++;
      const nodeTypeName = NodeType[node.nodeType] || `UNKNOWN_${node.nodeType}`;
      result.nodeTypeCounts[nodeTypeName] = (result.nodeTypeCounts[nodeTypeName] || 0) + 1;

      if (node.nodeType === NodeType.COMMENT_NODE) {
        result.commentNodesCount++;
      }

      // 遍历子节点
      if (node.childrenNodes) {
        for (const child of node.childrenNodes) {
          traverse(child);
        }
      }

      // 遍历 Shadow Roots
      if (node.shadowRoots) {
        for (const shadowRoot of node.shadowRoots) {
          traverse(shadowRoot);
        }
      }

      // 遍历 contentDocument
      if (node.contentDocument) {
        traverse(node.contentDocument);
      }
    };

    traverse(root);
    return result;
  }

  /**
   * 生成验证报告（人类可读格式）
   */
  static generateReport(validationResult: DOMTreeValidationResult): string {
    const lines: string[] = [];
    lines.push('='.repeat(60));
    lines.push('DOM 树验证报告');
    lines.push('='.repeat(60));
    lines.push('');

    // 验证状态
    lines.push(`验证状态: ${validationResult.isValid ? '✅ 通过' : '❌ 失败'}`);
    lines.push('');

    // 统计信息
    lines.push('📊 统计信息:');
    lines.push(`  总节点数: ${validationResult.statistics.totalNodes}`);
    lines.push(`  交互元素数: ${validationResult.statistics.interactiveElementsCount}`);
    lines.push(`  可见元素数: ${validationResult.statistics.visibleElementsCount}`);
    lines.push(`  最大深度: ${validationResult.statistics.maxDepth}`);
    lines.push(`  平均子节点数: ${validationResult.statistics.avgChildrenPerNode.toFixed(2)}`);
    lines.push(`  Shadow DOM 主机数: ${validationResult.statistics.shadowHostsCount}`);
    lines.push(`  复合组件数: ${validationResult.statistics.compoundComponentsCount}`);
    lines.push('');

    // 节点类型统计
    if (Object.keys(validationResult.statistics.nodeTypeCounts).length > 0) {
      lines.push('📋 节点类型分布:');
      for (const [type, count] of Object.entries(validationResult.statistics.nodeTypeCounts)) {
        lines.push(`  ${type}: ${count}`);
      }
      lines.push('');
    }

    // 错误信息
    if (validationResult.errors.length > 0) {
      lines.push(`❌ 错误 (${validationResult.errors.length}):`);
      for (const error of validationResult.errors) {
        lines.push(`  [${error.type}] ${error.message}`);
        if (error.nodeType !== undefined) {
          lines.push(`    节点类型: ${NodeType[error.nodeType]}`);
        }
        if (error.nodeName) {
          lines.push(`    节点名称: ${error.nodeName}`);
        }
        if (error.backendNodeId) {
          lines.push(`    Backend Node ID: ${error.backendNodeId}`);
        }
        if (error.path) {
          lines.push(`    路径: ${error.path}`);
        }
      }
      lines.push('');
    }

    // 警告信息
    if (validationResult.warnings.length > 0) {
      lines.push(`⚠️  警告 (${validationResult.warnings.length}):`);
      for (const warning of validationResult.warnings) {
        lines.push(`  [${warning.type}] ${warning.message}`);
        if (warning.nodeName) {
          lines.push(`    节点名称: ${warning.nodeName}`);
        }
        if (warning.backendNodeId) {
          lines.push(`    Backend Node ID: ${warning.backendNodeId}`);
        }
      }
      lines.push('');
    }

    lines.push('='.repeat(60));
    return lines.join('\n');
  }

  /**
   * 快速检查（只检查关键错误）
   */
  static quickCheck(root: SimplifiedNode | null): boolean {
    if (!root) {
      return false;
    }

    const forbiddenNodeTypes = new Set([NodeType.COMMENT_NODE, NodeType.ATTRIBUTE_NODE, NodeType.CDATA_SECTION_NODE]);

    const checkNode = (node: SimplifiedNode): boolean => {
      const originalNode = node.originalNode;

      // 检查禁止的节点类型
      if (forbiddenNodeTypes.has(originalNode.nodeType)) {
        return false;
      }

      // 检查禁止的元素名称
      if (
        originalNode.nodeType === NodeType.ELEMENT_NODE &&
        ['style', 'script', 'head', 'meta'].includes(originalNode.nodeName.toLowerCase())
      ) {
        return false;
      }

      // 递归检查子节点
      for (const child of node.children) {
        if (!checkNode(child)) {
          return false;
        }
      }

      return true;
    };

    return checkNode(root);
  }
}
