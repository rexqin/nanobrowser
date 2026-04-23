import { z } from 'zod';

export interface ActionSchema {
  name: string;
  description: string;
  schema: z.ZodType;
}

export const doneActionSchema: ActionSchema = {
  name: 'done',
  description: '完成任务（仅需 text：总结结果与发现）',
  schema: z.object({
    text: z.string(),
  }),
};

// 基础导航动作
export const searchGoogleActionSchema: ActionSchema = {
  name: 'search_google',
  description: '在当前标签页中使用 Google 搜索。查询词应像人类搜索一样具体，不要模糊或过长，优先聚焦最关键的信息。',
  schema: z.object({
    intent: z.string().default('').describe('此动作的目的'),
    query: z.string(),
  }),
};

export const goToUrlActionSchema: ActionSchema = {
  name: 'go_to_url',
  description: '在当前标签页导航到指定 URL',
  schema: z.object({
    intent: z.string().default('').describe('此动作的目的'),
    url: z.string(),
  }),
};

export const goBackActionSchema: ActionSchema = {
  name: 'go_back',
  description: '返回上一页',
  schema: z.object({
    intent: z.string().default('').describe('此动作的目的'),
  }),
};

export const clickElementActionSchema: ActionSchema = {
  name: 'click_element',
  description: '通过索引点击元素',
  schema: z.object({
    intent: z.string().default('').describe('此动作的目的'),
    index: z.number().int().describe('元素索引'),
    xpath: z.string().nullable().optional().describe('元素的 xpath'),
  }),
};

export const hoverElementActionSchema: ActionSchema = {
  name: 'hover_element',
  description: '通过索引悬停元素',
  schema: z.object({
    intent: z.string().default('').describe('此动作的目的'),
    index: z.number().int().describe('元素索引'),
    xpath: z.string().nullable().optional().describe('元素的 xpath'),
  }),
};

export const inputTextActionSchema: ActionSchema = {
  name: 'input_text',
  description: '向可交互输入元素写入文本',
  schema: z.object({
    intent: z.string().default('').describe('此动作的目的'),
    index: z.number().int().describe('元素索引'),
    text: z.string().describe('要输入的文本'),
    input_mode: z
      .enum(['override', 'append'])
      .default('override')
      .describe('文本输入模式：override 覆盖现有内容，append 在末尾追加'),
    xpath: z.string().nullable().optional().describe('元素的 xpath'),
  }),
};

export const openTabActionSchema: ActionSchema = {
  name: 'open_tab',
  description: '在新标签页打开 URL',
  schema: z.object({
    intent: z.string().default('').describe('此动作的目的'),
    url: z.string().describe('要打开的 url'),
  }),
};

export const closeTabActionSchema: ActionSchema = {
  name: 'close_tab',
  description: '通过 tab id 关闭标签页',
  schema: z.object({
    intent: z.string().default('').describe('此动作的目的'),
    tab_id: z.number().int().describe('标签页 id'),
  }),
};

// 内容相关动作（当前未使用）
// export const extractContentActionSchema: ActionSchema = {
//   name: 'extract_content',
//   description:
//     '提取页面内容以获取特定信息，例如公司名称列表、指定描述、结构化公司信息或链接等',
//   schema: z.object({
//     goal: z.string(),
//   }),
// };

// 缓存动作
export const cacheContentActionSchema: ActionSchema = {
  name: 'cache_content',
  description: '缓存当前页面已找到的信息供后续使用',
  schema: z.object({
    intent: z.string().default('').describe('此动作的目的'),
    content: z.string().default('').describe('要缓存的内容'),
  }),
};

export const downloadImageToBase64ActionSchema: ActionSchema = {
  name: 'download_image_to_base64',
  description: '从 URL 下载图片并转换为 base64，通过粘贴事件插入到指定索引的编辑器元素（不要将 base64 作为纯文本输入）',
  schema: z.object({
    intent: z.string().default('').describe('此动作的目的'),
    index: z.number().int().nullable().optional().describe('目标可交互输入/编辑器元素索引'),
    url: z.string().describe('要下载的图片 url'),
    as_data_uri: z.boolean().default(true).describe('为 true 时返回 data:image/*;base64,...，否则返回纯 base64'),
    mime_type: z.string().nullable().optional().describe('覆盖 mime type，例如 image/png；为空时尝试从响应头推断'),
    max_output_chars: z.number().int().optional().describe('将输出截断到最多 N 个字符'),
  }),
};

export const scrollToPercentActionSchema: ActionSchema = {
  name: 'scroll_to_percent',
  description: '滚动到文档或元素的指定垂直百分比；如果未提供元素索引，则滚动整个文档。',
  schema: z.object({
    intent: z.string().default('').describe('此动作的目的'),
    yPercent: z.number().int().describe('滚动目标百分比：最小 0，最大 100；0 为顶部，100 为底部'),
    index: z.number().int().nullable().optional().describe('元素索引'),
  }),
};

export const scrollToTopActionSchema: ActionSchema = {
  name: 'scroll_to_top',
  description: '将窗口文档或指定元素滚动到顶部',
  schema: z.object({
    intent: z.string().default('').describe('此动作的目的'),
    index: z.number().int().nullable().optional().describe('元素索引'),
  }),
};

export const scrollToBottomActionSchema: ActionSchema = {
  name: 'scroll_to_bottom',
  description: '将窗口文档或指定元素滚动到底部',
  schema: z.object({
    intent: z.string().default('').describe('此动作的目的'),
    index: z.number().int().nullable().optional().describe('元素索引'),
  }),
};

export const previousPageActionSchema: ActionSchema = {
  name: 'previous_page',
  description: '将窗口文档或指定元素向上翻一页；如果未提供索引，则滚动整个文档。',
  schema: z.object({
    intent: z.string().default('').describe('此动作的目的'),
    index: z.number().int().nullable().optional().describe('元素索引'),
  }),
};

export const nextPageActionSchema: ActionSchema = {
  name: 'next_page',
  description: '将窗口文档或指定元素向下翻一页；如果未提供索引，则滚动整个文档。',
  schema: z.object({
    intent: z.string().default('').describe('此动作的目的'),
    index: z.number().int().nullable().optional().describe('元素索引'),
  }),
};

export const scrollToTextActionSchema: ActionSchema = {
  name: 'scroll_to_text',
  description: '当在当前视口找不到要交互的内容时，尝试滚动到对应文本位置',
  schema: z.object({
    intent: z.string().default('').describe('此动作的目的'),
    text: z.string().describe('要滚动定位的文本'),
    nth: z.number().int().min(1).default(1).describe('滚动到第几个匹配文本（从 1 开始，默认 1）'),
  }),
};

export const sendKeysActionSchema: ActionSchema = {
  name: 'send_keys',
  description:
    '发送特殊按键序列，例如 Backspace、Insert、PageDown、Delete、Enter。也支持快捷键组合，如 `Control+o`、`Control+Shift+T`。用于键盘按键操作，需注意不同操作系统的快捷键差异。',
  schema: z.object({
    intent: z.string().default('').describe('此动作的目的'),
    keys: z.string().describe('要发送的按键序列'),
  }),
};

export const getDropdownOptionsActionSchema: ActionSchema = {
  name: 'get_dropdown_options',
  description: '获取原生下拉框中的所有选项',
  schema: z.object({
    intent: z.string().default('').describe('此动作的目的'),
    index: z.number().int().describe('下拉框元素索引'),
  }),
};

export const selectDropdownOptionActionSchema: ActionSchema = {
  name: 'select_dropdown_option',
  description: '按选项文本为指定索引的交互元素选择下拉项',
  schema: z.object({
    intent: z.string().default('').describe('此动作的目的'),
    index: z.number().int().describe('下拉框元素索引'),
    text: z.string().describe('选项文本'),
  }),
};

export const waitActionSchema: ActionSchema = {
  name: 'wait',
  description:
    '等待页面完成加载（loadEventFired + network idle），并至少等待指定秒数（默认 3 秒）；在导航类或下载类动作后可使用',
  schema: z.object({
    intent: z.string().default('').describe('此动作的目的'),
    seconds: z.number().int().default(3).describe('最小等待秒数（同时作为最大加载等待超时的基准）'),
  }),
};

export const waitForElementActionSchema: ActionSchema = {
  name: 'wait_for_element',
  description: '等待指定索引的交互元素在超时前变为可用/可见',
  schema: z.object({
    intent: z.string().default('').describe('此动作的目的'),
    index: z.number().int().describe('目标交互元素索引'),
    timeout_ms: z.number().int().default(5000).describe('最大等待时长（毫秒）'),
    poll_interval_ms: z.number().int().default(250).describe('轮询间隔（毫秒）'),
  }),
};
