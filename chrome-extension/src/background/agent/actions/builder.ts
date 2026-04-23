import { ActionResult, type AgentContext } from '@src/background/agent/types';
import { t } from '@extension/i18n';
import {
  clickElementActionSchema,
  hoverElementActionSchema,
  doneActionSchema,
  goBackActionSchema,
  goToUrlActionSchema,
  inputTextActionSchema,
  openTabActionSchema,
  searchGoogleActionSchema,
  switchTabActionSchema,
  type ActionSchema,
  sendKeysActionSchema,
  scrollToTextActionSchema,
  cacheContentActionSchema,
  downloadImageToBase64ActionSchema,
  selectDropdownOptionActionSchema,
  getDropdownOptionsActionSchema,
  closeTabActionSchema,
  waitActionSchema,
  waitForElementActionSchema,
  previousPageActionSchema,
  scrollToPercentActionSchema,
  nextPageActionSchema,
  scrollToTopActionSchema,
  scrollToBottomActionSchema,
} from './schemas';
import { z } from 'zod';
import { createLogger } from '@src/background/log';
import { ExecutionState, Actors } from '../event/types';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { wrapUntrustedContent } from '../messages/utils';

const logger = createLogger('Action');
const LOG_PREVIEW_LIMIT = 300;

function previewForLog(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.length > LOG_PREVIEW_LIMIT ? `${value.slice(0, LOG_PREVIEW_LIMIT)}...[truncated]` : value;
  }
  if (Array.isArray(value)) {
    return value.map(previewForLog);
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = previewForLog(v);
    }
    return out;
  }
  return value;
}

function summarizeActionResult(result: ActionResult) {
  return {
    isDone: result.isDone ?? false,
    hasError: Boolean(result.error),
    includeInMemory: result.includeInMemory ?? false,
    extractedContentPreview: result.extractedContent?.slice(0, LOG_PREVIEW_LIMIT),
    errorPreview: result.error?.slice(0, LOG_PREVIEW_LIMIT),
  };
}

function logIndexedElementNode(
  actionName: string,
  requestedIndex: number,
  elementNode: unknown,
  resolvedIndex?: number,
) {
  logger.debug(`[${actionName}] key.index.elementNode`, {
    requestedIndex,
    resolvedIndex: resolvedIndex ?? requestedIndex,
    elementNode,
  });
}

export class InvalidInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidInputError';
  }
}

/**
 * An action is a function that takes an input and returns an ActionResult
 */
export class Action {
  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private readonly handler: (input: any) => Promise<ActionResult>,
    public readonly schema: ActionSchema,
    // Whether this action has an index argument
    public readonly hasIndex: boolean = false,
  ) {}

  async call(input: unknown): Promise<ActionResult> {
    const actionName = this.name();
    const startedAt = Date.now();

    // Validate input before calling the handler
    const schema = this.schema.schema;

    // check if the schema is schema: z.object({}), if so, ignore the input
    const isEmptySchema =
      schema instanceof z.ZodObject &&
      Object.keys((schema as z.ZodObject<Record<string, z.ZodTypeAny>>).shape || {}).length === 0;

    if (isEmptySchema) {
      const result = await this.handler({});

      return result;
    }

    const parsedArgs = this.schema.schema.safeParse(input);
    if (!parsedArgs.success) {
      const errorMessage = parsedArgs.error.message;

      throw new InvalidInputError(errorMessage);
    }

    try {
      const result = await this.handler(parsedArgs.data);
      return result;
    } catch (error) {
      logger.error(`[${actionName}] call.error`, {
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  name() {
    return this.schema.name;
  }

  /**
   * Returns the prompt for the action
   * @returns {string} The prompt for the action
   */
  prompt() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const schemaShape = (this.schema.schema as z.ZodObject<any>).shape || {};
    const schemaProperties = Object.entries(schemaShape).map(([key, value]) => {
      const zodValue = value as z.ZodTypeAny;
      return `'${key}': {'type': '${zodValue.description}', ${zodValue.isOptional() ? "'optional': true" : "'required': true"}}`;
    });

    const schemaStr =
      schemaProperties.length > 0 ? `{${this.name()}: {${schemaProperties.join(', ')}}}` : `{${this.name()}: {}}`;

    return `${this.schema.description}:\n${schemaStr}`;
  }

  /**
   * Get the index argument from the input if this action has an index
   * @param input The input to extract the index from
   * @returns The index value if found, null otherwise
   */
  getIndexArg(input: unknown): number | null {
    if (!this.hasIndex) {
      return null;
    }
    if (input && typeof input === 'object' && 'index' in input) {
      return (input as { index: number }).index;
    }
    return null;
  }

  /**
   * Set the index argument in the input if this action has an index
   * @param input The input to update the index in
   * @param newIndex The new index value to set
   * @returns Whether the index was set successfully
   */
  setIndexArg(input: unknown, newIndex: number): boolean {
    if (!this.hasIndex) {
      return false;
    }
    if (input && typeof input === 'object') {
      (input as { index: number }).index = newIndex;
      return true;
    }
    return false;
  }
}

// TODO: can not make every action optional, don't know why
export function buildDynamicActionSchema(actions: Action[]): z.ZodType {
  let schema = z.object({});
  for (const action of actions) {
    // create a schema for the action, it could be action.schema.schema or null
    // but don't use default: null as it causes issues with Google Generative AI
    const actionSchema = action.schema.schema;
    schema = schema.extend({
      [action.name()]: actionSchema.nullable().optional().describe(action.schema.description),
    });
  }
  return schema;
}

export class ActionBuilder {
  private readonly context: AgentContext;
  private readonly extractorLLM: BaseChatModel;

  constructor(context: AgentContext, extractorLLM: BaseChatModel) {
    this.context = context;
    this.extractorLLM = extractorLLM;
  }

  buildDefaultActions() {
    const actions = [];
    const resolveIndexedNode = (
      state: { serializedDomState?: { selectorMap: Map<number, unknown> } } | null | undefined,
      index: number,
    ): { resolvedIndex: number; node: unknown; usedOrdinalFallback: boolean } | null => {
      const map = state?.serializedDomState?.selectorMap;
      if (!map || map.size === 0) {
        return null;
      }

      const direct = map.get(index);
      if (direct) {
        return { resolvedIndex: index, node: direct, usedOrdinalFallback: false };
      }

      // Backward compatibility: some model outputs still use 1-based ordinal index
      // while selectorMap keys are backendNodeId.
      if (Number.isInteger(index) && index > 0 && index <= map.size) {
        const entry = Array.from(map.entries())[index - 1];
        if (entry) {
          return { resolvedIndex: entry[0], node: entry[1], usedOrdinalFallback: true };
        }
      }

      return null;
    };

    const done = new Action(async (input: z.infer<typeof doneActionSchema.schema>) => {
      logger.debug('[done] action.input', { input: previewForLog(input) });
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, doneActionSchema.name);
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, input.text);
      const result = new ActionResult({
        isDone: true,
        extractedContent: input.text,
      });
      logger.debug('[done] action.output', { result: summarizeActionResult(result) });
      return result;
    }, doneActionSchema);
    actions.push(done);

    const searchGoogle = new Action(async (input: z.infer<typeof searchGoogleActionSchema.schema>) => {
      logger.debug('[search_google] action.input', { input: previewForLog(input) });
      const context = this.context;
      const intent = input.intent || t('act_searchGoogle_start', [input.query]);
      context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);

      await context.browserContext.navigateTo(`https://www.google.com/search?q=${input.query}`);
      logger.debug('[search_google] key.navigateTo.done', { query: input.query });

      const msg2 = t('act_searchGoogle_ok', [input.query]);
      context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg2);
      const result = new ActionResult({
        extractedContent: msg2,
        includeInMemory: true,
      });
      logger.debug('[search_google] action.output', { result: summarizeActionResult(result) });
      return result;
    }, searchGoogleActionSchema);
    actions.push(searchGoogle);

    const goToUrl = new Action(async (input: z.infer<typeof goToUrlActionSchema.schema>) => {
      logger.debug('[go_to_url] action.input', { input: previewForLog(input) });
      const intent = input.intent || t('act_goToUrl_start', [input.url]);
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);

      await this.context.browserContext.navigateTo(input.url);
      logger.debug('[go_to_url] key.navigateTo.done', { url: input.url });
      const msg2 = t('act_goToUrl_ok', [input.url]);
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg2);
      const result = new ActionResult({
        extractedContent: msg2,
        includeInMemory: true,
      });
      logger.debug('[go_to_url] action.output', { result: summarizeActionResult(result) });
      return result;
    }, goToUrlActionSchema);
    actions.push(goToUrl);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const goBack = new Action(async (input: z.infer<typeof goBackActionSchema.schema>) => {
      logger.debug('[go_back] action.input', { input: previewForLog(input) });
      const intent = input.intent || t('act_goBack_start');
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);

      const page = await this.context.browserContext.getCurrentPage();
      await page.goBack();
      logger.debug('[go_back] key.goBack.done');
      const msg2 = t('act_goBack_ok');
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg2);
      const result = new ActionResult({
        extractedContent: msg2,
        includeInMemory: true,
      });
      logger.debug('[go_back] action.output', { result: summarizeActionResult(result) });
      return result;
    }, goBackActionSchema);
    actions.push(goBack);

    const wait = new Action(async (input: z.infer<typeof waitActionSchema.schema>) => {
      logger.debug('[wait] action.input', { input: previewForLog(input) });
      const seconds = input.seconds || 3;
      const intent = input.intent || t('act_wait_start', [seconds.toString()]);
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);
      const timeoutMs = Math.max(8000, Math.floor(seconds * 1000));
      const page = await this.context.browserContext.getCurrentPage();
      logger.debug('[wait] key.waitForPageLoadState.start', { timeoutMs });
      try {
        await page.waitForPageLoadState(timeoutMs);
        logger.debug('[wait] key.waitForPageLoadState.done', { timeoutMs });
      } catch (error) {
        logger.warning('[wait] key.waitForPageLoadState.timeoutOrFailed', {
          timeoutMs,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      logger.debug('[wait] key.waitForPageAndFramesLoad.start', { minWaitSeconds: seconds });
      await page.waitForPageAndFramesLoad(seconds);
      logger.debug('[wait] key.waitForPageAndFramesLoad.done', { minWaitSeconds: seconds });
      const msg = t('act_wait_ok', [seconds.toString()]);
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
      const result = new ActionResult({ extractedContent: msg, includeInMemory: true });
      logger.debug('[wait] action.output', { result: summarizeActionResult(result) });
      return result;
    }, waitActionSchema);
    actions.push(wait);

    const waitForElement = new Action(async (input: z.infer<typeof waitForElementActionSchema.schema>) => {
      logger.debug('[wait_for_element] action.input', { input: previewForLog(input) });
      const timeoutMs = Math.max(200, input.timeout_ms ?? 5000);
      const pollMs = Math.max(50, input.poll_interval_ms ?? 250);
      const intent = input.intent || `Wait for element ${input.index}`;
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);

      const deadline = Date.now() + timeoutMs;
      let attempts = 0;

      while (Date.now() <= deadline) {
        attempts++;
        try {
          const page = await this.context.browserContext.getCurrentPage();
          const state = await page.getState();
          const resolved = resolveIndexedNode(state, input.index);
          logger.debug('[wait_for_element] key.resolveIndexedNode', {
            attempts,
            requestedIndex: input.index,
            resolvedIndex: resolved?.resolvedIndex,
            usedOrdinalFallback: resolved?.usedOrdinalFallback,
          });
          if (resolved?.node) {
            const elementNode = resolved.node as Parameters<typeof page.isElementVisibleByBackendNode>[0];
            logIndexedElementNode(waitForElementActionSchema.name, input.index, elementNode, resolved.resolvedIndex);
            const visible = await page.isElementVisibleByBackendNode(elementNode);
            if (visible) {
              const msg = `Element ${input.index} is available`;
              this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
              const result = new ActionResult({ extractedContent: msg, includeInMemory: true });
              logger.debug('[wait_for_element] action.output', { result: summarizeActionResult(result) });
              return result;
            }
          }
        } catch (error) {
          if (import.meta.env.DEV) {
            logger.debug('wait_for_element poll error', {
              index: input.index,
              attempts,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        await new Promise(resolve => setTimeout(resolve, pollMs));
      }

      const msg = `Element ${input.index} not available within ${timeoutMs}ms`;
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_FAIL, msg);
      const result = new ActionResult({ error: msg, includeInMemory: true });
      logger.debug('[wait_for_element] action.output', { result: summarizeActionResult(result) });
      return result;
    }, waitForElementActionSchema);
    actions.push(waitForElement);

    // Element Interaction Actions
    const clickElement = new Action(
      async (input: z.infer<typeof clickElementActionSchema.schema>) => {
        logger.debug('[click_element] action.input', { input: previewForLog(input) });
        const intent = input.intent || t('act_click_start', [input.index.toString()]);
        this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);

        const page = await this.context.browserContext.getCurrentPage();
        const state = await page.getState();
        const resolved = resolveIndexedNode(state, input.index);
        logger.debug('[click_element] key.resolveIndexedNode', {
          requestedIndex: input.index,
          resolvedIndex: resolved?.resolvedIndex,
          usedOrdinalFallback: resolved?.usedOrdinalFallback,
        });
        const elementNode = resolved?.node as Parameters<typeof page.clickElementNode>[0] | undefined;
        if (!elementNode) {
          throw new Error(t('act_errors_elementNotExist', [input.index.toString()]));
        }
        logIndexedElementNode(clickElementActionSchema.name, input.index, elementNode, resolved?.resolvedIndex);

        // Check if element is a file uploader
        if (page.isFileUploader(elementNode)) {
          const msg = t('act_click_fileUploader', [input.index.toString()]);
          logger.info(msg);
          return new ActionResult({
            extractedContent: msg,
            includeInMemory: true,
          });
        }

        try {
          const initialTabIds = await this.context.browserContext.getAllTabIds();
          await page.clickElementNode(elementNode);
          logger.debug('[click_element] key.clickElementNode.done', { beforeTabCount: initialTabIds.size });
          let msg = t('act_click_ok', [input.index.toString(), elementNode.getAllChildrenText(2)]);
          logger.info(msg);

          // TODO: could be optimized by chrome extension tab api
          const currentTabIds = await this.context.browserContext.getAllTabIds();
          if (currentTabIds.size > initialTabIds.size) {
            const newTabMsg = t('act_click_newTabOpened');
            msg += ` - ${newTabMsg}`;
            logger.info(newTabMsg);
            // find the tab id that is not in the initial tab ids
            const newTabId = Array.from(currentTabIds).find(id => !initialTabIds.has(id));
            if (newTabId) {
              await this.context.browserContext.switchTab(newTabId);
              logger.debug('[click_element] key.switchTab.done', { newTabId });
            }
          }
          this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
          const result = new ActionResult({ extractedContent: msg, includeInMemory: true });
          logger.debug('[click_element] action.output', { result: summarizeActionResult(result) });
          return result;
        } catch (error) {
          const msg = t('act_errors_elementNoLongerAvailable', [input.index.toString()]);
          this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_FAIL, msg);
          const result = new ActionResult({
            error: error instanceof Error ? error.message : String(error),
          });
          logger.debug('[click_element] action.output', { result: summarizeActionResult(result) });
          return result;
        }
      },
      clickElementActionSchema,
      true,
    );
    actions.push(clickElement);

    const hoverElement = new Action(
      async (input: z.infer<typeof hoverElementActionSchema.schema>) => {
        logger.debug('[hover_element] action.input', { input: previewForLog(input) });
        const intent = input.intent || `悬停索引为 ${input.index} 的元素`;
        this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);

        const page = await this.context.browserContext.getCurrentPage();
        const state = await page.getState();
        const resolved = resolveIndexedNode(state, input.index);
        logger.debug('[hover_element] key.resolveIndexedNode', {
          requestedIndex: input.index,
          resolvedIndex: resolved?.resolvedIndex,
          usedOrdinalFallback: resolved?.usedOrdinalFallback,
        });
        const elementNode = resolved?.node as Parameters<typeof page.hoverElementNode>[0] | undefined;
        if (!elementNode) {
          throw new Error(t('act_errors_elementNotExist', [input.index.toString()]));
        }
        logIndexedElementNode(hoverElementActionSchema.name, input.index, elementNode, resolved?.resolvedIndex);

        await page.hoverElementNode(elementNode);
        logger.debug('[hover_element] key.hoverElementNode.done');
        const msg = `已悬停索引为 ${input.index} 的元素`;
        this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
        const result = new ActionResult({ extractedContent: msg, includeInMemory: true });
        logger.debug('[hover_element] action.output', { result: summarizeActionResult(result) });
        return result;
      },
      hoverElementActionSchema,
      true,
    );
    actions.push(hoverElement);

    const inputText = new Action(
      async (input: z.infer<typeof inputTextActionSchema.schema>) => {
        logger.debug('[input_text] action.input', {
          input: previewForLog({
            ...input,
            text: input.text?.slice(0, LOG_PREVIEW_LIMIT),
            textLength: input.text?.length ?? 0,
          }),
        });
        const intent = input.intent || t('act_inputText_start', [input.index.toString()]);
        this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);

        const page = await this.context.browserContext.getCurrentPage();
        const state = await page.getState();

        const targetIndex = input.index;
        const resolved = resolveIndexedNode(state, input.index);
        logger.debug('[input_text] key.resolveIndexedNode', {
          requestedIndex: input.index,
          resolvedIndex: resolved?.resolvedIndex,
          usedOrdinalFallback: resolved?.usedOrdinalFallback,
        });
        const elementNode = resolved?.node as Parameters<typeof page.inputTextElementNode>[0] | undefined;
        if (resolved?.usedOrdinalFallback) {
          logger.info('input_text used ordinal index fallback', {
            requestedIndex: input.index,
            resolvedIndex: resolved.resolvedIndex,
          });
        }
        if (!elementNode) {
          throw new Error(t('act_errors_elementNotExist', [input.index.toString()]));
        }
        logIndexedElementNode(inputTextActionSchema.name, input.index, elementNode, resolved?.resolvedIndex);

        await page.inputTextElementNode(elementNode, input.text, input.input_mode ?? 'override');
        logger.debug('[input_text] key.inputTextElementNode.done', {
          targetIndex,
          inputMode: input.input_mode ?? 'override',
        });
        const msg = t('act_inputText_ok', [input.text, targetIndex.toString()]);
        this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
        const result = new ActionResult({ extractedContent: msg, includeInMemory: true });
        logger.debug('[input_text] action.output', { result: summarizeActionResult(result) });
        return result;
      },
      inputTextActionSchema,
      true,
    );
    actions.push(inputText);

    // Tab Management Actions
    const switchTab = new Action(async (input: z.infer<typeof switchTabActionSchema.schema>) => {
      logger.debug('[switch_tab] action.input', { input: previewForLog(input) });
      const intent = input.intent || t('act_switchTab_start', [input.tab_id.toString()]);
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);
      await this.context.browserContext.switchTab(input.tab_id);
      logger.debug('[switch_tab] key.switchTab.done', { tabId: input.tab_id });
      const msg = t('act_switchTab_ok', [input.tab_id.toString()]);
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
      const result = new ActionResult({ extractedContent: msg, includeInMemory: true });
      logger.debug('[switch_tab] action.output', { result: summarizeActionResult(result) });
      return result;
    }, switchTabActionSchema);
    actions.push(switchTab);

    const openTab = new Action(async (input: z.infer<typeof openTabActionSchema.schema>) => {
      logger.debug('[open_tab] action.input', { input: previewForLog(input) });
      const intent = input.intent || t('act_openTab_start', [input.url]);
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);
      await this.context.browserContext.openTab(input.url);
      logger.debug('[open_tab] key.openTab.done', { url: input.url });
      const msg = t('act_openTab_ok', [input.url]);
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
      const result = new ActionResult({ extractedContent: msg, includeInMemory: true });
      logger.debug('[open_tab] action.output', { result: summarizeActionResult(result) });
      return result;
    }, openTabActionSchema);
    actions.push(openTab);

    const closeTab = new Action(async (input: z.infer<typeof closeTabActionSchema.schema>) => {
      logger.debug('[close_tab] action.input', { input: previewForLog(input) });
      const intent = input.intent || t('act_closeTab_start', [input.tab_id.toString()]);
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);
      await this.context.browserContext.closeTab(input.tab_id);
      logger.debug('[close_tab] key.closeTab.done', { tabId: input.tab_id });
      const msg = t('act_closeTab_ok', [input.tab_id.toString()]);
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
      const result = new ActionResult({ extractedContent: msg, includeInMemory: true });
      logger.debug('[close_tab] action.output', { result: summarizeActionResult(result) });
      return result;
    }, closeTabActionSchema);
    actions.push(closeTab);

    // cache content for future use
    const cacheContent = new Action(async (input: z.infer<typeof cacheContentActionSchema.schema>) => {
      logger.debug('[cache_content] action.input', {
        input: previewForLog({ ...input, contentLength: input.content?.length ?? 0 }),
      });
      const intent = input.intent || t('act_cache_start', [input.content]);
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);

      // cache content is untrusted content, it is not instructions
      const rawMsg = t('act_cache_ok', [input.content]);
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, rawMsg);

      const msg = wrapUntrustedContent(rawMsg);
      const result = new ActionResult({ extractedContent: msg, includeInMemory: true });
      logger.debug('[cache_content] action.output', { result: summarizeActionResult(result) });
      return result;
    }, cacheContentActionSchema);
    actions.push(cacheContent);

    // Download an image, convert to base64 and paste it into the target element.
    // This is mainly used when the editor requires embedded base64 rather than a raw URL.
    const downloadImageToBase64 = new Action(
      async (input: z.infer<typeof downloadImageToBase64ActionSchema.schema>) => {
        logger.debug('[download_image_to_base64] action.input', { input: previewForLog(input) });
        const intent = input.intent || 'Download image and convert to base64';
        this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);

        try {
          const page = await this.context.browserContext.getCurrentPage();
          const state = await page.getState();
          const targetIndex = input.index ?? null;
          const targetNode = targetIndex !== null ? state?.serializedDomState.selectorMap.get(targetIndex) : undefined;
          if (targetIndex !== null) {
            logIndexedElementNode(
              downloadImageToBase64ActionSchema.name,
              input.index ?? targetIndex,
              targetNode,
              targetIndex,
            );
          }
          logger.debug('[download_image_to_base64] key.resolveTarget', {
            targetIndex,
            hasTargetNode: Boolean(targetNode),
            contenteditable: targetNode?.attributes?.['contenteditable'],
          });
          if (!targetNode || targetIndex === null || targetNode.attributes['contenteditable'] !== 'true') {
            throw new Error(t('act_errors_elementNotExist', [String(input.index)]));
          }

          const pasteResult = await page.pasteImageDataToElementNode(targetNode, input.url);
          logger.debug('[download_image_to_base64] key.pasteImageDataToElementNode.result', {
            pasteResult: previewForLog(pasteResult),
          });
          if (!pasteResult.success) {
            const errorMsg = pasteResult.error
              ? `Image paste failed (index=${targetIndex}): ${pasteResult.error}`
              : `Image paste dispatchEvent was cancelled or failed (index=${targetIndex})`;
            this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_FAIL, errorMsg);
            const result = new ActionResult({ error: errorMsg, includeInMemory: true });
            logger.debug('[download_image_to_base64] action.output', { result: summarizeActionResult(result) });
            return result;
          }

          const msg = `Downloaded image and pasted to editor index ${targetIndex} (bytes=${pasteResult.outputLength}, dispatch=${pasteResult.dispatch}, final=${pasteResult.final}, networkDetected=${pasteResult.networkDetected}, networkCompleted=${pasteResult.networkCompleted})`;
          this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);

          const result = new ActionResult({ extractedContent: msg, includeInMemory: true });
          logger.debug('[download_image_to_base64] action.output', { result: summarizeActionResult(result) });
          return result;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_FAIL, errorMessage);
          const result = new ActionResult({ error: errorMessage, includeInMemory: true });
          logger.debug('[download_image_to_base64] action.output', { result: summarizeActionResult(result) });
          return result;
        }
      },
      downloadImageToBase64ActionSchema,
    );
    actions.push(downloadImageToBase64);

    // Scroll to percent
    const scrollToPercent = new Action(async (input: z.infer<typeof scrollToPercentActionSchema.schema>) => {
      logger.debug('[scroll_to_percent] action.input', { input: previewForLog(input) });
      const intent = input.intent || t('act_scrollToPercent_start');
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);
      const page = await this.context.browserContext.getCurrentPage();

      if (input.index) {
        const state = await page.getCachedState();
        const elementNode = state?.serializedDomState.selectorMap.get(input.index);
        if (!elementNode) {
          const errorMsg = t('act_errors_elementNotExist', [input.index.toString()]);
          this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_FAIL, errorMsg);
          return new ActionResult({ error: errorMsg, includeInMemory: true });
        }
        logIndexedElementNode(scrollToPercentActionSchema.name, input.index, elementNode);
        logger.info(`Scrolling to percent: ${input.yPercent} with elementNode: ${elementNode.xpath}`);
        await page.scrollToPercent(input.yPercent, elementNode);
      } else {
        await page.scrollToPercent(input.yPercent);
      }
      logger.debug('[scroll_to_percent] key.scrollToPercent.done', { index: input.index, yPercent: input.yPercent });
      const msg = t('act_scrollToPercent_ok', [input.yPercent.toString()]);
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
      const result = new ActionResult({ extractedContent: msg, includeInMemory: true });
      logger.debug('[scroll_to_percent] action.output', { result: summarizeActionResult(result) });
      return result;
    }, scrollToPercentActionSchema);
    actions.push(scrollToPercent);

    // Scroll to top
    const scrollToTop = new Action(async (input: z.infer<typeof scrollToTopActionSchema.schema>) => {
      logger.debug('[scroll_to_top] action.input', { input: previewForLog(input) });
      const intent = input.intent || t('act_scrollToTop_start');
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);
      const page = await this.context.browserContext.getCurrentPage();
      if (input.index) {
        const state = await page.getCachedState();
        const elementNode = state?.serializedDomState.selectorMap.get(input.index);
        if (!elementNode) {
          const errorMsg = t('act_errors_elementNotExist', [input.index.toString()]);
          this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_FAIL, errorMsg);
          return new ActionResult({ error: errorMsg, includeInMemory: true });
        }
        logIndexedElementNode(scrollToTopActionSchema.name, input.index, elementNode);
        await page.scrollToPercent(0, elementNode);
      } else {
        await page.scrollToPercent(0);
      }
      logger.debug('[scroll_to_top] key.scroll.done', { index: input.index });
      const msg = t('act_scrollToTop_ok');
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
      const result = new ActionResult({ extractedContent: msg, includeInMemory: true });
      logger.debug('[scroll_to_top] action.output', { result: summarizeActionResult(result) });
      return result;
    }, scrollToTopActionSchema);
    actions.push(scrollToTop);

    // Scroll to bottom
    const scrollToBottom = new Action(async (input: z.infer<typeof scrollToBottomActionSchema.schema>) => {
      logger.debug('[scroll_to_bottom] action.input', { input: previewForLog(input) });
      const intent = input.intent || t('act_scrollToBottom_start');
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);
      const page = await this.context.browserContext.getCurrentPage();
      if (input.index) {
        const state = await page.getCachedState();
        const elementNode = state?.serializedDomState.selectorMap.get(input.index);
        if (!elementNode) {
          const errorMsg = t('act_errors_elementNotExist', [input.index.toString()]);
          this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_FAIL, errorMsg);
          return new ActionResult({ error: errorMsg, includeInMemory: true });
        }
        logIndexedElementNode(scrollToBottomActionSchema.name, input.index, elementNode);
        await page.scrollToPercent(100, elementNode);
      } else {
        await page.scrollToPercent(100);
      }
      logger.debug('[scroll_to_bottom] key.scroll.done', { index: input.index });
      const msg = t('act_scrollToBottom_ok');
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
      const result = new ActionResult({ extractedContent: msg, includeInMemory: true });
      logger.debug('[scroll_to_bottom] action.output', { result: summarizeActionResult(result) });
      return result;
    }, scrollToBottomActionSchema);
    actions.push(scrollToBottom);

    // Scroll to previous page
    const previousPage = new Action(async (input: z.infer<typeof previousPageActionSchema.schema>) => {
      logger.debug('[previous_page] action.input', { input: previewForLog(input) });
      const intent = input.intent || t('act_previousPage_start');
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);
      const page = await this.context.browserContext.getCurrentPage();

      if (input.index) {
        const state = await page.getCachedState();
        const elementNode = state?.serializedDomState.selectorMap.get(input.index);
        if (!elementNode) {
          const errorMsg = t('act_errors_elementNotExist', [input.index.toString()]);
          this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_FAIL, errorMsg);
          return new ActionResult({ error: errorMsg, includeInMemory: true });
        }
        logIndexedElementNode(previousPageActionSchema.name, input.index, elementNode);

        // Check if element is already at top of its scrollable area
        try {
          const [elementScrollTop] = await page.getElementScrollInfo(elementNode);
          if (elementScrollTop === 0) {
            const msg = t('act_errors_alreadyAtTop', [input.index.toString()]);
            this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
            return new ActionResult({ extractedContent: msg, includeInMemory: true });
          }
        } catch (error) {
          // If we can't get scroll info, let the scrollToPreviousPage method handle it
          logger.warning(
            `Could not get element scroll info: ${error instanceof Error ? error.message : String(error)}`,
          );
        }

        await page.scrollToPreviousPage(elementNode);
      } else {
        // Check if page is already at top
        const [initialScrollY] = await page.getScrollInfo();
        if (initialScrollY === 0) {
          const msg = t('act_errors_pageAlreadyAtTop');
          this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
          return new ActionResult({ extractedContent: msg, includeInMemory: true });
        }

        await page.scrollToPreviousPage();
      }
      logger.debug('[previous_page] key.scrollToPreviousPage.done', { index: input.index });
      const msg = t('act_previousPage_ok');
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
      const result = new ActionResult({ extractedContent: msg, includeInMemory: true });
      logger.debug('[previous_page] action.output', { result: summarizeActionResult(result) });
      return result;
    }, previousPageActionSchema);
    actions.push(previousPage);

    // Scroll to next page
    const nextPage = new Action(async (input: z.infer<typeof nextPageActionSchema.schema>) => {
      logger.debug('[next_page] action.input', { input: previewForLog(input) });
      const intent = input.intent || t('act_nextPage_start');
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);
      const page = await this.context.browserContext.getCurrentPage();

      if (input.index) {
        const state = await page.getCachedState();
        const elementNode = state?.serializedDomState.selectorMap.get(input.index);
        if (!elementNode) {
          const errorMsg = t('act_errors_elementNotExist', [input.index.toString()]);
          this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_FAIL, errorMsg);
          return new ActionResult({ error: errorMsg, includeInMemory: true });
        }
        logIndexedElementNode(nextPageActionSchema.name, input.index, elementNode);

        // Check if element is already at bottom of its scrollable area
        try {
          const [elementScrollTop, elementClientHeight, elementScrollHeight] =
            await page.getElementScrollInfo(elementNode);
          if (elementScrollTop + elementClientHeight >= elementScrollHeight) {
            const msg = t('act_errors_alreadyAtBottom', [input.index.toString()]);
            this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
            return new ActionResult({ extractedContent: msg, includeInMemory: true });
          }
        } catch (error) {
          // If we can't get scroll info, let the scrollToNextPage method handle it
          logger.warning(
            `Could not get element scroll info: ${error instanceof Error ? error.message : String(error)}`,
          );
        }

        await page.scrollToNextPage(elementNode);
      } else {
        // Check if page is already at bottom
        const [initialScrollY, initialVisualViewportHeight, initialScrollHeight] = await page.getScrollInfo();
        if (initialScrollY + initialVisualViewportHeight >= initialScrollHeight) {
          const msg = t('act_errors_pageAlreadyAtBottom');
          this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
          return new ActionResult({ extractedContent: msg, includeInMemory: true });
        }

        await page.scrollToNextPage();
      }
      logger.debug('[next_page] key.scrollToNextPage.done', { index: input.index });
      const msg = t('act_nextPage_ok');
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
      const result = new ActionResult({ extractedContent: msg, includeInMemory: true });
      logger.debug('[next_page] action.output', { result: summarizeActionResult(result) });
      return result;
    }, nextPageActionSchema);
    actions.push(nextPage);

    // Scroll to text
    const scrollToText = new Action(async (input: z.infer<typeof scrollToTextActionSchema.schema>) => {
      logger.debug('[scroll_to_text] action.input', { input: previewForLog(input) });
      const intent = input.intent || t('act_scrollToText_start', [input.text, input.nth.toString()]);
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);

      const page = await this.context.browserContext.getCurrentPage();

      try {
        const scrolled = await page.scrollToText(input.text, input.nth);
        logger.debug('[scroll_to_text] key.scrollToText.result', { scrolled });
        const msg = scrolled
          ? t('act_scrollToText_ok', [input.text, input.nth.toString()])
          : t('act_scrollToText_notFound', [input.text, input.nth.toString()]);
        this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
        const result = new ActionResult({ extractedContent: msg, includeInMemory: true });
        logger.debug('[scroll_to_text] action.output', { result: summarizeActionResult(result) });
        return result;
      } catch (error) {
        const msg = t('act_scrollToText_failed', [error instanceof Error ? error.message : String(error)]);
        this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_FAIL, msg);
        const result = new ActionResult({ error: msg, includeInMemory: true });
        logger.debug('[scroll_to_text] action.output', { result: summarizeActionResult(result) });
        return result;
      }
    }, scrollToTextActionSchema);
    actions.push(scrollToText);

    // Keyboard Actions
    const sendKeys = new Action(async (input: z.infer<typeof sendKeysActionSchema.schema>) => {
      logger.debug('[send_keys] action.input', { input: previewForLog(input) });
      const intent = input.intent || t('act_sendKeys_start', [input.keys]);
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);

      const page = await this.context.browserContext.getCurrentPage();
      await page.sendKeys(input.keys);
      logger.debug('[send_keys] key.sendKeys.done', { keys: input.keys });
      const msg = t('act_sendKeys_ok', [input.keys]);
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
      const result = new ActionResult({ extractedContent: msg, includeInMemory: true });
      logger.debug('[send_keys] action.output', { result: summarizeActionResult(result) });
      return result;
    }, sendKeysActionSchema);
    actions.push(sendKeys);

    // Get all options from a native dropdown
    const getDropdownOptions = new Action(
      async (input: z.infer<typeof getDropdownOptionsActionSchema.schema>) => {
        logger.debug('[get_dropdown_options] action.input', { input: previewForLog(input) });
        const intent = input.intent || t('act_getDropdownOptions_start', [input.index.toString()]);
        this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);

        const page = await this.context.browserContext.getCurrentPage();
        const state = await page.getState();

        const elementNode = state?.serializedDomState.selectorMap.get(input.index);
        if (!elementNode) {
          const errorMsg = t('act_errors_elementNotExist', [input.index.toString()]);
          this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_FAIL, errorMsg);
          return new ActionResult({
            error: errorMsg,
            includeInMemory: true,
          });
        }
        logIndexedElementNode(getDropdownOptionsActionSchema.name, input.index, elementNode);

        try {
          // Use the existing getDropdownOptions method
          const options = await page.getDropdownOptions(input.index);
          logger.debug('[get_dropdown_options] key.getDropdownOptions.result', { count: options?.length ?? 0 });

          if (options && options.length > 0) {
            // Format options for display
            const formattedOptions: string[] = options.map(opt => {
              // Encoding ensures AI uses the exact string in select_dropdown_option
              const encodedText = JSON.stringify(opt.text);
              return `${opt.index}: text=${encodedText}`;
            });

            let msg = formattedOptions.join('\n');
            msg += '\n' + t('act_getDropdownOptions_useExactText');
            this.context.emitEvent(
              Actors.NAVIGATOR,
              ExecutionState.ACT_OK,
              t('act_getDropdownOptions_ok', [options.length.toString()]),
            );
            const result = new ActionResult({
              extractedContent: msg,
              includeInMemory: true,
            });
            logger.debug('[get_dropdown_options] action.output', { result: summarizeActionResult(result) });
            return result;
          }

          // This code should not be reached as getDropdownOptions throws an error when no options found
          // But keeping as fallback
          const msg = t('act_getDropdownOptions_noOptions');
          this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
          const result = new ActionResult({
            extractedContent: msg,
            includeInMemory: true,
          });
          logger.debug('[get_dropdown_options] action.output', { result: summarizeActionResult(result) });
          return result;
        } catch (error) {
          const errorMsg = t('act_getDropdownOptions_failed', [error instanceof Error ? error.message : String(error)]);
          this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_FAIL, errorMsg);
          const result = new ActionResult({
            error: errorMsg,
            includeInMemory: true,
          });
          logger.debug('[get_dropdown_options] action.output', { result: summarizeActionResult(result) });
          return result;
        }
      },
      getDropdownOptionsActionSchema,
      true,
    );
    actions.push(getDropdownOptions);

    // Select dropdown option for interactive element index by the text of the option you want to select'
    const selectDropdownOption = new Action(
      async (input: z.infer<typeof selectDropdownOptionActionSchema.schema>) => {
        logger.debug('[select_dropdown_option] action.input', { input: previewForLog(input) });
        const intent = input.intent || t('act_selectDropdownOption_start', [input.text, input.index.toString()]);
        this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);

        const page = await this.context.browserContext.getCurrentPage();
        const state = await page.getState();

        const elementNode = state?.serializedDomState.selectorMap.get(input.index);
        if (!elementNode) {
          const errorMsg = t('act_errors_elementNotExist', [input.index.toString()]);
          this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_FAIL, errorMsg);
          return new ActionResult({
            error: errorMsg,
            includeInMemory: true,
          });
        }
        logIndexedElementNode(selectDropdownOptionActionSchema.name, input.index, elementNode);

        // Validate that we're working with a select element
        if (!elementNode.tagName || elementNode.tagName.toLowerCase() !== 'select') {
          const errorMsg = t('act_selectDropdownOption_notSelect', [
            input.index.toString(),
            elementNode.tagName || 'unknown',
          ]);
          this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_FAIL, errorMsg);
          return new ActionResult({
            error: errorMsg,
            includeInMemory: true,
          });
        }

        logger.debug(`Attempting to select '${input.text}' using xpath: ${elementNode.xpath}`);

        try {
          const result = await page.selectDropdownOption(input.index, input.text);
          logger.debug('[select_dropdown_option] key.selectDropdownOption.result', {
            resultPreview: String(result).slice(0, LOG_PREVIEW_LIMIT),
          });
          const msg = t('act_selectDropdownOption_ok', [input.text, input.index.toString()]);
          this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
          const actionResult = new ActionResult({
            extractedContent: result,
            includeInMemory: true,
          });
          logger.debug('[select_dropdown_option] action.output', { result: summarizeActionResult(actionResult) });
          return actionResult;
        } catch (error) {
          const errorMsg = t('act_selectDropdownOption_failed', [
            error instanceof Error ? error.message : String(error),
          ]);
          this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_FAIL, errorMsg);
          const result = new ActionResult({
            error: errorMsg,
            includeInMemory: true,
          });
          logger.debug('[select_dropdown_option] action.output', { result: summarizeActionResult(result) });
          return result;
        }
      },
      selectDropdownOptionActionSchema,
      true,
    );
    actions.push(selectDropdownOption);

    return actions;
  }
}
