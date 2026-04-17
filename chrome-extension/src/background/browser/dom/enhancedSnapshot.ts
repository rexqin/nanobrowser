import type { DOMRect, SnapshotNode } from './domService';

// 仅用于交互性和可见性检测的基本计算样式
export const REQUIRED_COMPUTED_STYLES = [
  // 仅代码中实际访问的样式（防止 Chrome 在重网站上崩溃）
  'display', // 在 service.ts 中用于可见性检测
  'visibility', // 在 service.ts 中用于可见性检测
  'opacity', // 在 service.ts 中用于可见性检测
  'overflow', // 在 views.py 中用于可滚动性检测
  'overflow-x', // 在 views.py 中用于可滚动性检测
  'overflow-y', // 在 views.py 中用于可滚动性检测
  'cursor', // 在 enhanced_snapshot.py 中用于光标提取
  'pointer-events', // 用于可点击性逻辑
  'position', // 用于可见性逻辑
  'background-color', // 用于可见性逻辑
];

/**
 * 解析稀有布尔数据
 */
function parseRareBooleanData(rareData: any, index: number): boolean | null {
  if (!rareData || !rareData.index) {
    return null;
  }
  return rareData.index.includes(index);
}

/**
 * 使用字符串索引从布局树解析计算样式
 */
function parseComputedStyles(strings: string[], styleIndices: number[]): Record<string, string> {
  const styles: Record<string, string> = {};
  for (let i = 0; i < styleIndices.length && i < REQUIRED_COMPUTED_STYLES.length; i++) {
    const styleIndex = styleIndices[i];
    if (styleIndex >= 0 && styleIndex < strings.length) {
      styles[REQUIRED_COMPUTED_STYLES[i]] = strings[styleIndex];
    }
  }
  return styles;
}

/**
 * 构建后端节点 ID 到增强快照数据的查找表，预先计算所有内容
 */
export function buildSnapshotLookup(snapshot: any, devicePixelRatio: number = 1.0): Map<number, SnapshotNode> {
  const snapshotLookup = new Map<number, SnapshotNode>();

  if (!snapshot || !snapshot.documents) {
    return snapshotLookup;
  }

  const strings = snapshot.strings || [];

  for (const document of snapshot.documents) {
    const nodes = document.nodes;
    const layout = document.layout;

    if (!nodes || !layout) {
      continue;
    }

    // 构建后端节点 ID 到快照索引的查找表
    const backendNodeToSnapshotIndex = new Map<number, number>();
    if (nodes.backendNodeId) {
      for (let i = 0; i < nodes.backendNodeId.length; i++) {
        backendNodeToSnapshotIndex.set(nodes.backendNodeId[i], i);
      }
    }

    // 性能优化：预先构建布局索引映射以消除 O(n²) 双重查找
    // 保留原始行为：对重复项使用第一次出现
    const layoutIndexMap = new Map<number, number>();
    if (layout.nodeIndex) {
      for (let layoutIdx = 0; layoutIdx < layout.nodeIndex.length; layoutIdx++) {
        const nodeIndex = layout.nodeIndex[layoutIdx];
        if (!layoutIndexMap.has(nodeIndex)) {
          // 仅存储第一次出现
          layoutIndexMap.set(nodeIndex, layoutIdx);
        }
      }
    }

    // 为每个后端节点 ID 构建快照查找表
    for (const [backendNodeId, snapshotIndex] of backendNodeToSnapshotIndex.entries()) {
      let isClickable: boolean | null = null;
      if (nodes.isClickable) {
        isClickable = parseRareBooleanData(nodes.isClickable, snapshotIndex);
      }

      // 查找对应的布局节点
      let cursorStyle: string | null = null;
      let boundingBox: DOMRect | null = null;
      let computedStyles: Record<string, string> = {};
      let paintOrder: number | null = null;
      let clientRects: DOMRect | null = null;
      let scrollRects: DOMRect | null = null;

      // 查找与此快照节点对应的布局树节点
      if (layoutIndexMap.has(snapshotIndex)) {
        const layoutIdx = layoutIndexMap.get(snapshotIndex)!;

        // 解析边界框
        if (layout.bounds && layoutIdx < layout.bounds.length) {
          const bounds = layout.bounds[layoutIdx];
          if (bounds && bounds.length >= 4) {
            // 重要：CDP 坐标是设备像素，通过除以设备像素比转换为 CSS 像素
            const rawX = bounds[0];
            const rawY = bounds[1];
            const rawWidth = bounds[2];
            const rawHeight = bounds[3];

            // 应用设备像素比缩放以将设备像素转换为 CSS 像素
            boundingBox = {
              x: rawX / devicePixelRatio,
              y: rawY / devicePixelRatio,
              width: rawWidth / devicePixelRatio,
              height: rawHeight / devicePixelRatio,
            };
          }
        }

        // 解析此布局节点的计算样式
        if (layout.styles && layoutIdx < layout.styles.length) {
          const styleIndices = layout.styles[layoutIdx];
          computedStyles = parseComputedStyles(strings, styleIndices);
          cursorStyle = computedStyles.cursor || null;
        }

        // 提取绘制顺序（如果可用）
        if (layout.paintOrders && layoutIdx < layout.paintOrders.length) {
          paintOrder = layout.paintOrders[layoutIdx];
        }

        // 提取客户端矩形（如果可用）
        if (layout.clientRects && layoutIdx < layout.clientRects.length) {
          const clientRectData = layout.clientRects[layoutIdx];
          if (clientRectData && clientRectData.length >= 4) {
            clientRects = {
              x: clientRectData[0] / devicePixelRatio,
              y: clientRectData[1] / devicePixelRatio,
              width: clientRectData[2] / devicePixelRatio,
              height: clientRectData[3] / devicePixelRatio,
            };
          }
        }

        // 提取滚动矩形（如果可用）
        if (layout.scrollRects && layoutIdx < layout.scrollRects.length) {
          const scrollRectData = layout.scrollRects[layoutIdx];
          if (scrollRectData && scrollRectData.length >= 4) {
            scrollRects = {
              x: scrollRectData[0] / devicePixelRatio,
              y: scrollRectData[1] / devicePixelRatio,
              width: scrollRectData[2] / devicePixelRatio,
              height: scrollRectData[3] / devicePixelRatio,
            };
          }
        }
      }

      snapshotLookup.set(backendNodeId, {
        isClickable: isClickable ?? false,
        cursorStyle: cursorStyle,
        bounds: boundingBox,
        clientRects: clientRects,
        scrollRects: scrollRects,
        computedStyles: Object.keys(computedStyles).length > 0 ? computedStyles : null,
        paintOrder: paintOrder,
        stackingContexts: null, // TODO: 如果需要可以实现
      });
    }
  }

  return snapshotLookup;
}
