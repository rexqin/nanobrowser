# 📊 Graph Analysis Report

**Root:** `.`

## Summary

| Metric | Value |
|--------|-------|
| Nodes | 1368 |
| Edges | 1724 |
| Communities | 165 |
| Hyperedges | 0 |

### Confidence Breakdown

| Level | Count | Percentage |
|-------|-------|------------|
| EXTRACTED | 1234 | 71.6% |
| INFERRED | 490 | 28.4% |
| AMBIGUOUS | 0 | 0.0% |

## 🌟 God Nodes (Most Connected)

| Node | Degree | Community |
|------|--------|-----------|
| Page | 0 | – |
| navigator | 0 | – |
| builder | 0 | – |
| SidePanel | 0 | – |
| executor | 0 | – |
| ModelSettings | 0 | – |
| SecurityGuardrails | 0 | – |
| service | 0 | – |
| chrome-extension::index | 0 | – |
| page | 0 | – |

## 🔮 Surprising Connections

- **chrome_extension_src_background_browser_dom_service_ts_builddomtree** → **chrome_extension_src_background_browser_dom_service_ts_logcdptreesindev** (calls)
- **chrome_extension_src_background_browser_dom_service_ts_builddomtree** → **chrome_extension_src_background_browser_dom_service_ts_constructdomtree** (calls)
- **chrome_extension_src_background_browser_dom_service_ts_builddomtree** → **chrome_extension_src_background_browser_dom_service_ts_injectbuilddomtreescripts** (calls)
- **chrome_extension_src_background_agent_executor_ts** → **chrome_extension_src_background_agent_executor_ts_isrequestcancelledlike** (defines)
- **chrome_extension_src_background_agent_executor_ts** → **chrome_extension_src_background_agent_executor_ts_executor** (defines)

## 🏘️ Communities

### Community 0 — navigator (43 nodes, cohesion: 0.05)

- navigator
- ../actions/builder/Action
- ../actions/builder/buildDynamicActionSchema
- ./base/BaseAgent
- ./base/BaseAgentOptions
- ./base/ExtraAgentOptions
- ./errors/ChatModelAuthError
- ./errors/ChatModelBadRequestError
- ./errors/ChatModelForbiddenError
- ./errors/EXTENSION_CONFLICT_ERROR_MESSAGE
- ./errors/ExtensionConflictError
- ./errors/isAbortedError
- ./errors/isAuthenticationError
- ./errors/isBadRequestError
- ./errors/isExtensionConflictError
- ./errors/isForbiddenError
- ./errors/LLM_FORBIDDEN_ERROR_MESSAGE
- ./errors/RequestCancelledError
- ./errors/ResponseParseError
- ../event/types/Actors
- _…and 23 more_

### Community 1 — builder (39 nodes, cohesion: 0.05)

- builder
- ActionBuilder
- .buildDefaultActions()
- .constructor()
- ../event/types/Actors
- ../event/types/ExecutionState
- @extension/i18n/t
- @langchain/core/language_models/chat_models/BaseChatModel
- ../messages/utils/wrapUntrustedContent
- ./schemas/ActionSchema
- ./schemas/cacheContentActionSchema
- ./schemas/clickElementActionSchema
- ./schemas/closeTabActionSchema
- ./schemas/doneActionSchema
- ./schemas/downloadImageToBase64ActionSchema
- ./schemas/getDropdownOptionsActionSchema
- ./schemas/goBackActionSchema
- ./schemas/goToUrlActionSchema
- ./schemas/hoverElementActionSchema
- ./schemas/inputTextActionSchema
- _…and 19 more_

### Community 2 — SidePanel (37 nodes, cohesion: 0.06)

- SidePanel
- formatDurationSuffix()
- handleBackToPlanList()
- handleCreatePlan()
- handleExecutePlan()
- handleLoadHistory()
- handlePlanDelete()
- handlePlanSelect()
- handleResumeTask()
- handleStopTask()
- ./components/PlanBuilder/PlanBuilder
- ./components/PlanBuilder/PlanStepActivityLine
- ./components/PlanHistoryList/PlanHistoryList
- ./components/PlanListSidebar/PlanListSidebar
- @extension/i18n/t
- @extension/shared/sidePanelExecutionAgentEventSchema
- @extension/shared/SidePanelInternalMessage
- @extension/shared/sidePanelInternalMessageSchema
- @extension/storage/Actors
- @extension/storage/agentModelStore
- _…and 17 more_

### Community 3 — build_initial_state() (35 nodes, cohesion: 0.09)

- build_initial_state()
- isCdpEvaluationBlockedUrl()
- Page
- ._addAntiDetectionScripts()
- .attached()
- .attachPuppeteer()
- ._checkAndHandleNavigation()
- .clickElementNode()
- .constructor()
- ._convertKey()
- .detachPuppeteer()
- .getCachedState()
- .getClickableElements()
- .getContent()
- .getDomElementByIndex()
- .getDropdownOptions()
- .getElementByIndex()
- ._getMainCdpSession()
- .getSelectorMap()
- .getState()
- _…and 15 more_

### Community 4 — executor (35 nodes, cohesion: 0.06)

- executor
- ./actions/builder/ActionBuilder
- ./agents/errors/ChatModelAuthError
- ./agents/errors/ChatModelBadRequestError
- ./agents/errors/ChatModelForbiddenError
- ./agents/errors/ExtensionConflictError
- ./agents/errors/MaxFailuresReachedError
- ./agents/errors/MaxStepsReachedError
- ./agents/errors/RequestCancelledError
- ./agents/navigator/NavigatorActionRegistry
- ./agents/navigator/NavigatorAgent
- ./agents/planner/PlannerAgent
- ./agents/planner/PlannerOutput
- ../browser/context/BrowserContext
- ../browser/views/URLNotAllowedError
- ./event/manager/EventManager
- ./event/types/Actors
- ./event/types/EventCallback
- ./event/types/EventType
- ./event/types/ExecutionState
- _…and 15 more_

### Community 5 — ModelSettings (35 nodes, cohesion: 0.07)

- ModelSettings
- addModel()
- getButtonProps()
- handleApiKeyChange()
- handleCancelProvider()
- handleDelete()
- handleKeyDown()
- handleModelChange()
- handleModelsChange()
- handleNameChange()
- handleParameterChange()
- handleReasoningEffortChange()
- handleSave()
- handleSpeechToTextModelChange()
- @extension/i18n/t
- @extension/storage/agentModelStore
- @extension/storage/AgentNameEnum
- @extension/storage/getDefaultAgentModelParams
- @extension/storage/getDefaultDisplayNameFromProviderId
- @extension/storage/getDefaultProviderConfig
- _…and 15 more_

### Community 6 — errors (29 nodes, cohesion: 0.07)

- errors
- ChatModelAuthError
- .constructor()
- .toString()
- ChatModelBadRequestError
- .constructor()
- .toString()
- ChatModelForbiddenError
- .constructor()
- .toString()
- ExtensionConflictError
- .constructor()
- .toString()
- isAbortedError()
- isAuthenticationError()
- isBadRequestError()
- isExtensionConflictError()
- isForbiddenError()
- MaxFailuresReachedError
- .constructor()
- _…and 9 more_

### Community 7 — planner (28 nodes, cohesion: 0.07)

- planner
- ./base/BaseAgent
- ./base/BaseAgentOptions
- ./base/ExtraAgentOptions
- ./errors/ChatModelAuthError
- ./errors/ChatModelBadRequestError
- ./errors/ChatModelForbiddenError
- ./errors/isAbortedError
- ./errors/isAuthenticationError
- ./errors/isBadRequestError
- ./errors/isForbiddenError
- ./errors/LLM_FORBIDDEN_ERROR_MESSAGE
- ./errors/RequestCancelledError
- ../event/types/Actors
- ../event/types/ExecutionState
- @extension/i18n/t
- @langchain/core/messages/AIMessage
- @langchain/core/messages/BaseMessage
- @langchain/core/messages/HumanMessage
- @langchain/core/messages/ToolMessage
- _…and 8 more_

### Community 8 — page (26 nodes, cohesion: 0.08)

- page
- CachedStateClickableElementsHashes
- .constructor()
- ./dom/clickable/service/ClickableElementProcessor
- ./dom/service/getClickableElements
- ./dom/service/getScrollInfo
- ./dom/service/removeHighlights
- ./dom/views/DOMElementNode
- ./dom/views/DOMState
- puppeteer-core/lib/esm/puppeteer/api/Browser.js/Browser
- puppeteer-core/lib/esm/puppeteer/api/ElementHandle.js/ElementHandle
- puppeteer-core/lib/esm/puppeteer/api/Frame.js/Frame
- puppeteer-core/lib/esm/puppeteer/api/Page.js/Page
- puppeteer-core/lib/esm/puppeteer/puppeteer-core-browser.js/connect
- puppeteer-core/lib/esm/puppeteer/puppeteer-core-browser.js/ExtensionTransport
- puppeteer-core/lib/esm/puppeteer/puppeteer-core-browser.js/HTTPRequest
- puppeteer-core/lib/esm/puppeteer/puppeteer-core-browser.js/HTTPResponse
- puppeteer-core/lib/esm/puppeteer/puppeteer-core-browser.js/KeyInput
- puppeteer-core/lib/esm/puppeteer/puppeteer-core-browser.js/ProtocolType
- @src/background/log/createLogger
- _…and 6 more_

### Community 9 — helper (25 nodes, cohesion: 0.10)

- helper
- ChatLlama
- .completionWithRetry()
- .constructor()
- createAzureChatModel()
- createChatModel()
- createOpenAIChatModel()
- extractInstanceNameFromUrl()
- @extension/storage/ModelConfig
- @extension/storage/ProviderConfig
- @extension/storage/ProviderTypeEnum
- @langchain/anthropic/ChatAnthropic
- @langchain/cerebras/ChatCerebras
- @langchain/core/language_models/chat_models/BaseChatModel
- @langchain/deepseek/ChatDeepSeek
- @langchain/google-genai/ChatGoogleGenerativeAI
- @langchain/groq/ChatGroq
- @langchain/ollama/ChatOllama
- @langchain/openai/AzureChatOpenAI
- @langchain/openai/ChatOpenAI
- _…and 5 more_

### Community 10 — EnhancedDOMTreeNode (24 nodes, cohesion: 0.12)

- EnhancedDOMTreeNode
- ._capTextLength()
- .children()
- .childrenAndShadowRoots()
- .constructor()
- .elementHash()
- ._findHtmlInContentDocument()
- ._generateUUID()
- .getAllChildrenText()
- ._getElementPosition()
- .getMeaningfulTextForLlm()
- ._getParentBranchPath()
- .getScrollInfoText()
- .hash()
- .isActuallyScrollable()
- .llmRepresentation()
- .parent()
- .parentBranchHash()
- .scrollInfo()
- .shouldShowScrollInfo()
- _…and 4 more_

### Community 11 — index (24 nodes, cohesion: 0.08)

- index
- ./agent/executor/Executor
- ./agent/helper/createChatModel
- ./agent/types/DEFAULT_AGENT_OPTIONS
- ./browser/context/BrowserContext
- ./browser/dom/service/injectBuildDomTreeScripts
- ./executor-lifecycle/shouldCleanupExecutorOnTerminalEvent
- @extension/i18n/t
- @extension/shared/ExternalIncomingMessage
- @extension/shared/externalIncomingMessageSchema
- @extension/shared/ExternalPublishMessage
- @extension/shared/externalPublishMessageSchema
- @extension/shared/SidePanelPublishReceivedMessage
- @extension/storage/agentModelStore
- @extension/storage/AgentNameEnum
- @extension/storage/analyticsSettingsStore
- @extension/storage/firewallStore
- @extension/storage/generalSettingsStore
- @extension/storage/llmProviderStore
- @langchain/core/language_models/chat_models/BaseChatModel
- _…and 4 more_

### Community 12 — base (23 nodes, cohesion: 0.11)

- base
- constructor()
- getModelName()
- ../actions/builder/Action
- ./errors/isAbortedError
- ./errors/ResponseParseError
- @extension/storage/ProviderTypeEnum
- @langchain/core/language_models/chat_models/BaseChatModel
- @langchain/core/messages/BaseMessage
- ../messages/utils/convertInputMessages
- ../messages/utils/extractJsonFromModelOutput
- ../messages/utils/removeThinkTags
- ../prompts/base/BasePrompt
- @src/background/log/createLogger
- ../types/AgentContext
- ../types/AgentOutput
- zod/z
- invoke()
- isLlamaModel()
- manuallyParseResponse()
- _…and 3 more_

### Community 13 — service (23 nodes, cohesion: 0.10)

- service
- _constructDomTree()
- countCdpDomNodes()
- getMarkdownContent()
- getReadabilityContent()
- getScrollInfo()
- ./history/view/ViewportInfo
- ./raw_types/BuildDomTreeArgs
- ./raw_types/BuildDomTreeResult
- ./raw_types/RawDomElementNode
- ./raw_types/RawDomTreeNode
- @src/background/log/createLogger
- ../util/isNewTabPage
- ./views/DOMBaseNode
- ./views/DOMElementNode
- ./views/DOMState
- ./views/DOMTextNode
- injectBuildDomTreeScripts()
- isNotNull()
- logCdpTreesInDev()
- _…and 3 more_

### Community 14 — BrowserContext (22 nodes, cohesion: 0.18)

- BrowserContext
- .cleanup()
- .closeTab()
- .constructor()
- .detachPage()
- .ensureNavigableTabForNavigation()
- .findFallbackWebTab()
- .getAllTabIds()
- .getCachedState()
- .getConfig()
- .getCurrentPage()
- .getState()
- .getTabInfos()
- .navigateTo()
- .openTab()
- .removeAttachedPage()
- .removeHighlight()
- .updateConfig()
- .updateCurrentTabId()
- .waitForTabNavigationComplete()
- _…and 2 more_

### Community 15 — utils (19 nodes, cohesion: 0.14)

- utils
- convertInputMessages()
- convertMessagesForNonFunctionCallingModels()
- extractJsonFromModelOutput()
- filterExternalContent()
- filterExternalContentWithReport()
- ../agents/errors/ResponseParseError
- @langchain/core/messages/AIMessage
- @langchain/core/messages/BaseMessage
- @langchain/core/messages/HumanMessage
- @langchain/core/messages/SystemMessage
- @langchain/core/messages/ToolMessage
- @src/background/services/guardrails/guardrails
- mergeSuccessiveMessages()
- removeThinkTags()
- splitUserTextAndAttachments()
- wrapAttachments()
- wrapUntrustedContent()
- wrapUserRequest()

### Community 16 — types (18 nodes, cohesion: 0.11)

- types
- ActionResult
- .constructor()
- AgentStepInfo
- .constructor()
- ../browser/context/BrowserContext
- ../browser/dom/history/view/DOMHistoryElement
- ../browser/dom/views/DEFAULT_INCLUDE_ATTRIBUTES
- ./event/manager/EventManager
- ./event/types/Actors
- ./event/types/AgentEvent
- ./event/types/ExecutionState
- ./history/AgentStepHistory
- ./messages/service/MessageManager
- zod/z
- StepMetadata
- .constructor()
- .durationSeconds()

### Community 17 — llmProviders (18 nodes, cohesion: 0.16)

- llmProviders
- ensureBackwardCompatibility()
- getAllProviders()
- getDefaultAgentModelParams()
- getDefaultDisplayNameFromProviderId()
- getDefaultProviderConfig()
- getProvider()
- getProviderTypeByProviderId()
- hasProvider()
- ../base/base/createStorage
- ../base/enums/StorageEnum
- ../base/types/BaseStorage
- ./types/AgentNameEnum
- ./types/llmProviderModelNames
- ./types/llmProviderParameters
- ./types/ProviderTypeEnum
- removeProvider()
- setProvider()

### Community 18 — Options (17 nodes, cohesion: 0.12)

- Options
- handleTabClick()
- ./components/AnalyticsSettings/AnalyticsSettings
- ./components/FirewallSettings/FirewallSettings
- ./components/GeneralSettings/GeneralSettings
- ./components/ModelSettings/ModelSettings
- @extension/i18n/t
- @extension/shared/withErrorBoundary
- @extension/shared/withSuspense
- @extension/ui/Button
- react-icons/fi/FiCpu
- react-icons/fi/FiSettings
- react-icons/fi/FiShield
- react-icons/fi/FiTrendingUp
- react/useState
- @src/Options.css
- renderTabContent()

### Community 19 — PlanBuilder (17 nodes, cohesion: 0.13)

- PlanBuilder
- actorDisplayName()
- addStep()
- createStep()
- handleExecute()
- handleSave()
- @extension/i18n/t
- @extension/storage/Actors
- @extension/storage/PlanSession
- @extension/storage/PlanStep
- react/useEffect
- react/useMemo
- react/useRef
- react/useState
- removeStep()
- reorderSteps()
- updateStep()

### Community 20 — capTextLength() (17 nodes, cohesion: 0.21)

- capTextLength()
- DOMTreeSerializer
- ._addCompoundComponents()
- ._assignInteractiveIndicesAndMarkNewNodes()
- ._buildAttributesString()
- .constructor()
- ._extractSelectOptions()
- ._filterTreeRecursive()
- ._hasInteractiveDescendants()
- ._isContained()
- ._isInsideShadowDOM()
- ._isInteractiveCached()
- ._isPropagatingElement()
- ._safeParseNumber()
- ._safeParseOptionalNumber()
- .serializeTree()
- ._shouldExcludeChild()

### Community 21 — BookmarkList (16 nodes, cohesion: 0.13)

- BookmarkList
- handleCancelEdit()
- handleDragEnd()
- handleDragOver()
- handleDragStart()
- handleDrop()
- handleEditClick()
- handleSaveEdit()
- @extension/i18n/t
- react-icons/fa/FaCheck
- react-icons/fa/FaPen
- react-icons/fa/FaTimes
- react-icons/fa/FaTrash
- react/useEffect
- react/useRef
- react/useState

### Community 22 — service (15 nodes, cohesion: 0.13)

- service
- @langchain/core/messages/AIMessage
- @langchain/core/messages/BaseMessage
- @langchain/core/messages/HumanMessage
- @langchain/core/messages/SystemMessage
- @langchain/core/messages/ToolMessage
- @src/background/agent/messages/utils/filterExternalContent
- @src/background/agent/messages/utils/splitUserTextAndAttachments
- @src/background/agent/messages/utils/wrapAttachments
- @src/background/agent/messages/utils/wrapUserRequest
- @src/background/agent/messages/views/MessageHistory
- @src/background/agent/messages/views/MessageMetadata
- @src/background/log/createLogger
- MessageManagerSettings
- .constructor()

### Community 23 — service (15 nodes, cohesion: 0.29)

- service
- _attributesHash()
- compareHistoryElementAndDomElement()
- convertDomElementToHistoryElement()
- _createSHA256Hash()
- findHistoryElementInTree()
- _getParentBranchPath()
- hashDomElement()
- hashDomHistoryElement()
- ./view/DOMHistoryElement
- ./view/HashedDomElement
- ../views/DOMElementNode
- _parentBranchPathHash()
- _textHash()
- _xpathHash()

### Community 24 — history (15 nodes, cohesion: 0.18)

- history
- createChatHistoryStorage()
- getCurrentTimestamp()
- getSessionAgentStepHistoryKey()
- getSessionAgentStepHistoryStorage()
- getSessionMessagesKey()
- getSessionMessagesStorage()
- ../base/base/createStorage
- ../base/enums/StorageEnum
- ./types/ChatAgentStepHistory
- ./types/ChatHistoryStorage
- ./types/ChatMessage
- ./types/ChatSession
- ./types/ChatSessionMetadata
- ./types/Message

### Community 25 — .getAction() (14 nodes, cohesion: 0.27)

- .getAction()
- NavigatorAgent
- .addModelOutputToMemory()
- .addStateMessageToMemory()
- .doMultiAction()
- .execute()
- .executeHistoryActions()
- .executeHistoryStep()
- .fixActions()
- .getPostActionDelayMs()
- .invoke()
- .parseHistoryModelOutput()
- .removeLastStateMessageFromMemory()
- .updateActionIndices()

### Community 26 — views (14 nodes, cohesion: 0.14)

- views
- calcBranchPathHashSet()
- constructor()
- .hash()
- domElementNodeToDict()
- DOMTextNode
- .constructor()
- .isParentInViewport()
- .isParentTopElement()
- ./history/service/HistoryTreeProcessor
- ./history/view/CoordinateSet
- ./history/view/HashedDomElement
- ./history/view/ViewportInfo
- ../util/capTextLength

### Community 27 — MessageManager (13 nodes, cohesion: 0.26)

- MessageManager
- .addMessageWithTokens()
- .addNewTask()
- .addPlan()
- .addStateMessage()
- .constructor()
- ._countTextTokens()
- ._countTokens()
- .cutMessages()
- ._filterSensitiveData()
- .getMessages()
- .length()
- .removeLastStateMessage()

### Community 28 — history (13 nodes, cohesion: 0.19)

- history
- createPlanHistoryStorage()
- getPlanStepsKey()
- getPlanStepsStorage()
- ../base/base/createStorage
- ../base/enums/StorageEnum
- ./types/PlanHistoryStorage
- ./types/PlanRun
- ./types/PlanRunStatus
- ./types/PlanSession
- ./types/PlanSessionMetadata
- ./types/PlanStep
- now()

### Community 29 — analytics (13 nodes, cohesion: 0.17)

- analytics
- AnalyticsService
- .categorizeError()
- .init()
- .trackDomainVisit()
- .trackTaskCancelled()
- .trackTaskComplete()
- .trackTaskFailed()
- .trackTaskStart()
- .updateSettings()
- @extension/storage/analyticsSettingsStore
- ../log/createLogger
- posthog-js/dist/module.no-external

### Community 30 — context (12 nodes, cohesion: 0.17)

- context
- ./page/build_initial_state
- ./page/Page
- ../services/analytics/analytics
- @src/background/log/createLogger
- ./util/isUrlAllowed
- ./views/BrowserContextConfig
- ./views/BrowserState
- ./views/DEFAULT_BROWSER_CONTEXT_CONFIG
- ./views/TabInfo
- ./views/URLNotAllowedError
- webextension-polyfill

### Community 31 — make-manifest-plugin (12 nodes, cohesion: 0.20)

- make-manifest-plugin
- addRefreshContentScript()
- getManifestWithCacheBurst()
- @extension/dev-utils/colorLog
- @extension/dev-utils/dist/lib/manifest-parser/type/Manifest
- @extension/dev-utils/ManifestParser
- node:fs/fs
- node:path/resolve
- node:process/process
- node:url/pathToFileURL
- vite/PluginOption
- makeManifestPlugin()

### Community 32 — firewall (12 nodes, cohesion: 0.35)

- firewall
- addToAllowList()
- addToDenyList()
- getFirewall()
- ../base/base/createStorage
- ../base/enums/StorageEnum
- ../base/types/BaseStorage
- normalizeUrl()
- removeFromAllowList()
- removeFromDenyList()
- resetToDefaults()
- updateFirewall()

### Community 33 — service (11 nodes, cohesion: 0.36)

- service
- _attributesHash()
- createSHA256Hash()
- getClickableElements()
- getClickableElementsHashes()
- _getParentBranchPath()
- hashDomElement()
- _hashString()
- ../views/DOMElementNode
- _parentBranchPathHash()
- _xpathHash()

### Community 34 — navigator (11 nodes, cohesion: 0.18)

- navigator
- ./base/BasePrompt
- @langchain/core/messages/HumanMessage
- @langchain/core/messages/SystemMessage
- @src/background/agent/types/AgentContext
- @src/background/log/createLogger
- ./templates/navigator/navigatorSystemPromptTemplate
- NavigatorPrompt
- .constructor()
- .getSystemMessage()
- .getUserMessage()

### Community 35 — SecurityGuardrails (11 nodes, cohesion: 2.25)

- SecurityGuardrails
- .cleanEmptyTags()
- .constructor()
- .detectThreats()
- .detectThreatsStrict()
- .sanitize()
- .sanitizeStrict()
- .setEnabled()
- .setStrictMode()
- .validate()
- .validateStrict()

### Community 36 — speechToText (11 nodes, cohesion: 0.18)

- speechToText
- @extension/i18n/t
- @extension/storage/ProviderConfig
- @extension/storage/speechToTextModelStore
- @langchain/core/messages/HumanMessage
- @langchain/google-genai/ChatGoogleGenerativeAI
- ../log/createLogger
- SpeechToTextService
- .constructor()
- .create()
- .transcribeAudio()

### Community 37 — Executor (11 nodes, cohesion: 0.18)

- Executor
- .addFollowUpTask()
- .cancel()
- .checkTaskCompletion()
- .cleanup()
- .clearExecutionEvents()
- .constructor()
- .getCurrentTaskId()
- .pause()
- .replayHistory()
- .subscribeExecutionEvents()

### Community 38 — guardrails.test (11 nodes, cohesion: 0.18)

- guardrails.test
- ../../../agent/messages/utils/filterExternalContent
- ../../../agent/messages/utils/filterExternalContentWithReport
- ../../../agent/messages/utils/wrapUntrustedContent
- ../index/cleanEmptyTags
- ../index/guardrails
- ../index/sanitizeContent
- ../index/ThreatType
- vitest/describe
- vitest/expect
- vitest/it

### Community 39 — withErrorBoundary (10 nodes, cohesion: 0.20)

- withErrorBoundary
- ErrorBoundary
- .componentDidCatch()
- .getDerivedStateFromError()
- .render()
- react/Component
- react/ComponentType
- react/ErrorInfo
- react/ReactElement
- withErrorBoundary()

### Community 40 — utils (10 nodes, cohesion: 0.24)

- utils
- addTitlesToProperties()
- capitalizeFirstLetter()
- convertZodToJsonSchema()
- getCurrentTimestampStr()
- jsonrepair/jsonrepair
- @src/background/log/createLogger
- zod-to-json-schema/zodToJsonSchema
- zod/z
- repairJsonString()

### Community 41 — watch-rebuild-plugin (10 nodes, cohesion: 0.20)

- watch-rebuild-plugin
- ../constant/BUILD_COMPLETE
- ../constant/LOCAL_RELOAD_SOCKET_URL
- ../interpreter/MessageInterpreter
- node:fs/fs
- node:path/path
- ../types/PluginConfig
- vite/PluginOption
- ws/WebSocket
- watchRebuildPlugin()

### Community 42 — index (10 nodes, cohesion: 0.20)

- index
- fast-glob/glob
- fflate/AsyncZipDeflate
- fflate/Zip
- node:fs/createReadStream
- node:fs/createWriteStream
- node:fs/existsSync
- node:fs/mkdirSync
- node:path/posix
- node:path/resolve

### Community 43 — initReloadServer (10 nodes, cohesion: 0.20)

- initReloadServer
- ../constant/BUILD_COMPLETE
- ../constant/DO_UPDATE
- ../constant/DONE_UPDATE
- ../constant/LOCAL_RELOAD_SOCKET_PORT
- ../constant/LOCAL_RELOAD_SOCKET_URL
- ../interpreter/MessageInterpreter
- ws/WebSocket
- ws/WebSocketServer
- initReloadServer()

### Community 44 — domSerializer (10 nodes, cohesion: 0.22)

- domSerializer
- ./clickableElementDetector/ClickableElementDetector
- ./domService/DOMRect
- ./domService/EnhancedDOMTreeNode
- ./domService/NodeType
- ./serializedDOMState/SerializedDOMState
- SimplifiedNode
- ._cleanOriginalNodeJson()
- .constructor()
- .toJSON()

### Community 45 — DOMElementNode (10 nodes, cohesion: 0.27)

- DOMElementNode
- .clearHashCache()
- .clickableElementsToString()
- .constructor()
- .convertSimpleXPathToCssSelector()
- .enhancedCssSelectorForElement()
- .getAllTextTillNextClickableElement()
- .getEnhancedCssSelector()
- .getFileUploadElement()
- .hasParentWithHighlightIndex()

### Community 46 — domTreeValidator (10 nodes, cohesion: 0.22)

- domTreeValidator
- DOMTreeValidator
- ._countTotalChildren()
- .generateReport()
- .quickCheck()
- .validateOriginalTree()
- .validateSimplifiedTree()
- ./domSerializer.js/SimplifiedNode
- ./domService.js/EnhancedDOMTreeNode
- ./domService.js/NodeType

### Community 47 — DomService (10 nodes, cohesion: 0.33)

- DomService
- .buildEnhancedAXNode()
- .constructor()
- .detectPaginationButtons()
- .getAllTrees()
- .getAXTreeForAllFrames()
- .getDomTree()
- .getSerializedDomTree()
- .getViewportRatio()
- .isElementVisibleAccordingToAllParents()

### Community 48 — FirewallSettings (10 nodes, cohesion: 0.20)

- FirewallSettings
- handleAddUrl()
- handleRemoveUrl()
- handleToggleFirewall()
- @extension/i18n/t
- @extension/storage/firewallStore
- @extension/ui/Button
- react/useCallback
- react/useEffect
- react/useState

### Community 49 — EventManager (9 nodes, cohesion: 0.31)

- EventManager
- .attachDurations()
- .clearSubscribers()
- .constructor()
- .emit()
- .getOrCreateTaskState()
- .getTotalPausedMs()
- .subscribe()
- .unsubscribe()

### Community 50 — base (9 nodes, cohesion: 0.28)

- base
- checkStoragePermission()
- createStorage()
- ./enums/SessionAccessLevelEnum
- ./enums/StorageEnum
- ./types/BaseStorage
- ./types/StorageConfig
- ./types/ValueOrUpdate
- updateCache()

### Community 51 — serializedDOMState (9 nodes, cohesion: 0.25)

- serializedDOMState
- ./domSerializer/DOMSelectorMap
- ./domSerializer/DOMTreeSerializer
- ./domSerializer/SimplifiedNode
- SerializedDOMState
- .constructor()
- .evalRepresentation()
- ._getEvalAttributes()
- .llmRepresentation()

### Community 52 — views (9 nodes, cohesion: 0.22)

- views
- BrowserError
- .constructor()
- BrowserStateHistory
- .constructor()
- ./dom/history/view/DOMHistoryElement
- ./dom/views/DOMState
- URLNotAllowedError
- .constructor()

### Community 53 — planner (9 nodes, cohesion: 0.22)

- planner
- ./base/BasePrompt
- @langchain/core/messages/HumanMessage
- @langchain/core/messages/SystemMessage
- @src/background/agent/types/AgentContext
- ./templates/planner/plannerSystemPromptTemplate
- PlannerPrompt
- .getSystemMessage()
- .getUserMessage()

### Community 54 — user (8 nodes, cohesion: 0.32)

- user
- createProfile()
- getProfile()
- getUserId()
- ../base/base/createStorage
- ../base/enums/StorageEnum
- ../base/types/BaseStorage
- updateProfile()

### Community 55 — domService (8 nodes, cohesion: 0.25)

- domService
- ./domSerializer/DOMTreeSerializer
- ./enhancedDOMTreeNode/EnhancedDOMTreeNode
- ./enhancedSnapshot/buildSnapshotLookup
- ./enhancedSnapshot/REQUIRED_COMPUTED_STYLES
- puppeteer-core/CDPSession
- puppeteer-core/Page
- ./serializedDOMState/SerializedDOMState

### Community 56 — ._findNearestScrollableElement() (8 nodes, cohesion: 0.46)

- ._findNearestScrollableElement()
- .getElementScrollInfo()
- .locateElement()
- .scrollBy()
- .scrollToNextPage()
- .scrollToPercent()
- .scrollToPreviousPage()
- ._wrapElementEvaluateForDebug()

### Community 57 — _buildDomTree() (8 nodes, cohesion: 0.39)

- _buildDomTree()
- constructFrameTree()
- getClickableElements()
- _getMaxHighlighIndex()
- _getMaxID()
- _getRawDomTreeNodes()
- _locateMatchingIframeNode()
- _visibleIFramesFailedLoading()

### Community 58 — agentModels (8 nodes, cohesion: 0.25)

- agentModels
- getModelParameters()
- ../base/base/createStorage
- ../base/enums/StorageEnum
- ../base/types/BaseStorage
- ./types/AgentNameEnum
- ./types/llmProviderParameters
- validateModelConfig()

### Community 59 — GeneralSettings (8 nodes, cohesion: 0.25)

- GeneralSettings
- @extension/i18n/t
- @extension/storage/DEFAULT_GENERAL_SETTINGS
- @extension/storage/GeneralSettingsConfig
- @extension/storage/generalSettingsStore
- react/useEffect
- react/useState
- updateSetting()

### Community 60 — views (8 nodes, cohesion: 0.25)

- views
- @langchain/core/messages/BaseMessage
- @langchain/core/messages/HumanMessage
- @langchain/core/messages/SystemMessage
- ManagedMessage
- .constructor()
- MessageMetadata
- .constructor()

### Community 61 — analyticsSettings (8 nodes, cohesion: 0.32)

- analyticsSettings
- generateAnonymousUserId()
- getSettings()
- ../base/base/createStorage
- ../base/enums/StorageEnum
- ../base/types/BaseStorage
- resetToDefaults()
- updateSettings()

### Community 62 — sanitizer (8 nodes, cohesion: 0.29)

- sanitizer
- cleanEmptyTags()
- detectThreats()
- ./patterns/getPatterns
- @src/background/log/createLogger
- ./types/SanitizationResult
- ./types/ThreatType
- sanitizeContent()

### Community 63 — i18n (8 nodes, cohesion: 0.64)

- i18n
- ./getMessageFromLocale/defaultLocale
- ./getMessageFromLocale/getMessageFromLocale
- ./type/DevLocale
- ./type/MessageKey
- removePlaceholder()
- t()
- translate()

### Community 64 — history (8 nodes, cohesion: 0.25)

- history
- AgentStepHistory
- .constructor()
- AgentStepRecord
- .constructor()
- ../browser/views/BrowserStateHistory
- ./types/ActionResult
- ./types/StepMetadata

### Community 65 — index (8 nodes, cohesion: 0.25)

- index
- ./sanitizer/cleanEmptyTags
- ./sanitizer/detectThreats
- ./sanitizer/sanitizeContent
- @src/background/log/createLogger
- ./types/SanitizationResult
- ./types/ThreatType
- ./types/ValidationResult

### Community 66 — Action (8 nodes, cohesion: 0.29)

- Action
- .call()
- .constructor()
- .getIndexArg()
- .name()
- .prompt()
- .setIndexArg()
- buildDynamicActionSchema()

### Community 67 — base (7 nodes, cohesion: 0.29)

- base
- buildBrowserStateUserMessage()
- @langchain/core/messages/HumanMessage
- @langchain/core/messages/SystemMessage
- ../messages/utils/wrapUntrustedContent
- @src/background/agent/types/AgentContext
- @src/background/log/createLogger

### Community 68 — refresh (7 nodes, cohesion: 0.43)

- refresh
- addRefresh()
- initClient()
- MessageInterpreter
- .constructor()
- .receive()
- .send()

### Community 69 — AnalyticsSettings (7 nodes, cohesion: 0.29)

- AnalyticsSettings
- handleToggleAnalytics()
- @extension/i18n/t
- @extension/storage/AnalyticsSettingsConfig
- @extension/storage/analyticsSettingsStore
- react/useEffect
- react/useState

### Community 70 — MessageHistory (7 nodes, cohesion: 0.29)

- MessageHistory
- .addMessage()
- .getMessages()
- .getTotalTokens()
- .removeLastStateMessage()
- .removeMessage()
- .removeOldestMessage()

### Community 71 — helper (7 nodes, cohesion: 0.57)

- helper
- convertOpenAISchemaToGemini()
- dereferenceJsonSchema()
- processPropertiesForGemini()
- processPropertyForGemini()
- processSchemaNode()
- stringifyCustom()

### Community 72 — index (7 nodes, cohesion: 0.86)

- index
- ../types/SerializedMessage
- ../types/WebSocketMessage
- MessageInterpreter
- .constructor()
- .receive()
- .send()

### Community 73 — .execute() (7 nodes, cohesion: 0.48)

- .execute()
- .navigate()
- .resume()
- .runPlanner()
- .shouldStop()
- .waitUntilUserResume()
- isRequestCancelledLike()

### Community 74 — generalSettings (7 nodes, cohesion: 0.29)

- generalSettings
- getSettings()
- ../base/base/createStorage
- ../base/enums/StorageEnum
- ../base/types/BaseStorage
- resetToDefaults()
- updateSettings()

### Community 75 — index (6 nodes, cohesion: 0.33)

- index
- @extension/ui/dist/global.css
- react-dom/client/createRoot
- @src/index.css
- @src/Options/Options
- init()

### Community 76 — initClient (6 nodes, cohesion: 0.33)

- initClient
- ../constant/DO_UPDATE
- ../constant/DONE_UPDATE
- ../constant/LOCAL_RELOAD_SOCKET_URL
- ../interpreter/MessageInterpreter
- initClient()

### Community 77 — enhancedDOMTreeNode (6 nodes, cohesion: 0.33)

- enhancedDOMTreeNode
- crypto/createHash
- ./domService/DOMRect
- ./domService/EnhancedAXNode
- ./domService/NodeType
- ./domService/SnapshotNode

### Community 78 — executor-lifecycle.test (6 nodes, cohesion: 0.33)

- executor-lifecycle.test
- ../../background/agent/event/types/ExecutionState
- ../executor-lifecycle/shouldCleanupExecutorOnTerminalEvent
- vitest/describe
- vitest/expect
- vitest/it

### Community 79 — manifest (6 nodes, cohesion: 0.33)

- manifest
- deepmerge/deepmerge
- node:fs/fs
- withExternallyConnectableHzgm()
- withOperaSidebar()
- withSidePanel()

### Community 80 — AgentContext (6 nodes, cohesion: 0.33)

- AgentContext
- .constructor()
- .emitEvent()
- .pause()
- .resume()
- .stop()

### Community 81 — getMessageFromLocale (6 nodes, cohesion: 0.33)

- getMessageFromLocale
- getMessageFromLocale()
- ../locales/en/messages.json/enMessage
- ../locales/pt_BR/messages.json/pt_BRMessage
- ../locales/zh_CN/messages.json/zh_CNMessage
- ../locales/zh_TW/messages.json/zh_TWMessage

### Community 82 — make-entry-point-plugin (6 nodes, cohesion: 0.40)

- make-entry-point-plugin
- extractContentDir()
- node:fs/fs
- node:path/path
- vite/PluginOption
- makeEntryPointPlugin()

### Community 83 — manager (6 nodes, cohesion: 0.33)

- manager
- ../../log/createLogger
- ./types/AgentEvent
- ./types/EventCallback
- ./types/EventType
- ./types/ExecutionState

### Community 84 — view (6 nodes, cohesion: 0.33)

- view
- DOMHistoryElement
- .constructor()
- .toDict()
- HashedDomElement
- .constructor()

### Community 85 — enhancedSnapshot (6 nodes, cohesion: 0.47)

- enhancedSnapshot
- buildSnapshotLookup()
- ./domService/DOMRect
- ./domService/SnapshotNode
- parseComputedStyles()
- parseRareBooleanData()

### Community 86 — .attachPage() (6 nodes, cohesion: 0.53)

- .attachPage()
- .attachToTabInBackground()
- ._getOrCreatePage()
- .openInactiveTab()
- .switchTab()
- .waitForTabEvents()

### Community 87 — closePlanDedicatedTabIfAny() (5 nodes, cohesion: 2.00)

- closePlanDedicatedTabIfAny()
- isHzgmTechSenderUrl()
- isScriptableTabUrl()
- setupExecutor()
- subscribeToExecutorEvents()

### Community 88 — useStorage (5 nodes, cohesion: 0.50)

- useStorage
- @extension/storage/BaseStorage
- react/useSyncExternalStore
- useStorage()
- wrapPromise()

### Community 89 — index (5 nodes, cohesion: 0.40)

- index
- react-dom/client/createRoot
- @src/index.css
- @src/SidePanel/SidePanel
- init()

### Community 90 — ensureBuildDirectoryExists() (5 nodes, cohesion: 2.40)

- ensureBuildDirectoryExists()
- logPackageSize()
- streamFileToZip()
- toMB()
- zipBundle()

### Community 91 — ._applyBoundingBoxFiltering() (5 nodes, cohesion: 0.40)

- ._applyBoundingBoxFiltering()
- ._createSimplifiedTree()
- ._getChildrenAndShadowRoots()
- ._optimizeTree()
- .serializeAccessibleElements()

### Community 92 — withSuspense (5 nodes, cohesion: 0.40)

- withSuspense
- react/ComponentType
- react/ReactElement
- react/Suspense
- withSuspense()

### Community 93 — patterns (5 nodes, cohesion: 0.40)

- patterns
- getPatterns()
- ./types/SecurityPattern
- ./types/ThreatType
- isPreserveTag()

### Community 94 — speechToText (5 nodes, cohesion: 0.40)

- speechToText
- ../base/base/createStorage
- ../base/enums/StorageEnum
- ../base/types/BaseStorage
- validateSpeechToTextModelConfig()

### Community 95 — utils (5 nodes, cohesion: 0.40)

- utils
- cn()
- clsx/ClassValue
- clsx/clsx
- tailwind-merge/twMerge

### Community 96 — .getScrollInfo() (5 nodes, cohesion: 0.40)

- .getScrollInfo()
- .removeHighlight()
- .takeScreenshot()
- .title()
- ._updateState()

### Community 97 — .goBack() (5 nodes, cohesion: 0.40)

- .goBack()
- .goForward()
- .navigateTo()
- .refreshPage()
- .waitForPageAndFramesLoad()

### Community 98 — favorites (5 nodes, cohesion: 0.40)

- favorites
- createFavoritesStorage()
- ../base/base/createStorage
- ../base/enums/StorageEnum
- ../base/types/BaseStorage

### Community 99 — .addModelOutput() (5 nodes, cohesion: 0.60)

- .addModelOutput()
- .addToolMessage()
- .initTaskMessages()
- .nextToolId()
- .taskInstructions()

### Community 100 — type (5 nodes, cohesion: 0.40)

- type
- ../locales/en/messages.json/enMessage
- ../locales/pt_BR/messages.json/pt_BRMessage
- ../locales/zh_CN/messages.json/zh_CNMessage
- ../locales/zh_TW/messages.json/zh_TWMessage

### Community 101 — clickableElementDetector (5 nodes, cohesion: 0.40)

- clickableElementDetector
- ClickableElementDetector
- .isInteractive()
- ./domService/NodeType
- ./enhancedDOMTreeNode/EnhancedDOMTreeNode

### Community 102 — withUI (4 nodes, cohesion: 0.50)

- withUI
- deepmerge/deepmerge
- tailwindcss/types/config/Config
- withUI()

### Community 103 — types (4 nodes, cohesion: 0.50)

- types
- ./constant/BUILD_COMPLETE
- ./constant/DO_UPDATE
- ./constant/DONE_UPDATE

### Community 104 — convert (4 nodes, cohesion: 0.50)

- convert
- ../lib/helper.js/convertOpenAISchemaToGemini
- ../lib/helper.js/stringifyCustom
- ../lib/json_schema.js/jsonNavigatorOutputSchema

### Community 105 — Button (4 nodes, cohesion: 0.50)

- Button
- Button()
- react/ComponentPropsWithoutRef
- ../utils/cn

### Community 106 — flatten (4 nodes, cohesion: 0.50)

- flatten
- ../lib/helper.js/dereferenceJsonSchema
- ../lib/helper.js/stringifyCustom
- ../lib/json_schema.js/jsonNavigatorOutputSchema

### Community 107 — executor-lifecycle (4 nodes, cohesion: 0.67)

- executor-lifecycle
- ./agent/event/types/ExecutionState
- isTerminalTaskExecutionState()
- shouldCleanupExecutorOnTerminalEvent()

### Community 108 — event (4 nodes, cohesion: 0.50)

- event
- AgentEvent
- .constructor()
- @extension/storage/Actors

### Community 109 — watch-public-plugin (4 nodes, cohesion: 0.50)

- watch-public-plugin
- fast-glob/fg
- vite/PluginOption
- watchPublicPlugin()

### Community 110 — impl (4 nodes, cohesion: 0.50)

- impl
- convertToFirefoxCompatibleManifest()
- ./type/Manifest
- ./type/ManifestParserInterface

### Community 111 — i18n-prod (4 nodes, cohesion: 0.50)

- i18n-prod
- ./type/DevLocale
- ./type/MessageKey
- t()

### Community 112 — util (4 nodes, cohesion: 0.50)

- util
- capTextLength()
- isNewTabPage()
- isUrlAllowed()

### Community 113 — index (3 nodes, cohesion: 0.67)

- index
- ./lib/zip-bundle/zipBundle
- node:path/resolve

### Community 114 — logger (3 nodes, cohesion: 0.67)

- logger
- colorLog()
- @extension/shared/ValueOf

### Community 115 — index (3 nodes, cohesion: 0.67)

- index
- ./withErrorBoundary/withErrorBoundary
- ./withSuspense/withSuspense

### Community 116 — raw_types (3 nodes, cohesion: 0.67)

- raw_types
- ./history/view/CoordinateSet
- ./history/view/ViewportInfo

### Community 117 — PlanListSidebar (3 nodes, cohesion: 0.67)

- PlanListSidebar
- @extension/i18n/t
- @extension/storage/PlanSessionMetadata

### Community 118 — tailwind.config (3 nodes, cohesion: 0.67)

- tailwind.config
- @extension/tailwindcss-config/baseConfig
- tailwindcss/types/config/Config

### Community 119 — index (3 nodes, cohesion: 0.67)

- index
- ./lib/i18n-dev/t
- ./lib/i18n/t

### Community 120 — utils (3 nodes, cohesion: 0.67)

- utils
- generateNewTaskId()
- getCurrentTimestampStr()

### Community 121 — tailwind.config (3 nodes, cohesion: 0.67)

- tailwind.config
- @extension/tailwindcss-config/baseConfig
- @extension/ui/withUI

### Community 122 — reload (3 nodes, cohesion: 0.67)

- reload
- addReload()
- ../initializers/initClient/initClient

### Community 123 — internal (3 nodes, cohesion: 0.67)

- internal
- ./external/externalPublishMessageSchema
- zod/z

### Community 124 — refresh (3 nodes, cohesion: 0.67)

- refresh
- addRefresh()
- ../initializers/initClient/initClient

### Community 125 — types (3 nodes, cohesion: 0.67)

- types
- AgentEvent
- .constructor()

### Community 126 — PlanHistoryList (3 nodes, cohesion: 0.67)

- PlanHistoryList
- @extension/storage/PlanRun
- @extension/storage/PlanSessionMetadata

### Community 127 — planner (2 nodes, cohesion: 1.00)

- planner
- ./common/commonSecurityRules

### Community 128 — tailwind.config (2 nodes, cohesion: 1.00)

- tailwind.config
- tailwindcss/types/config/Config

### Community 129 — external (2 nodes, cohesion: 1.00)

- external
- zod/z

### Community 130 — log (2 nodes, cohesion: 1.00)

- log
- createLogger()

### Community 131 — navigator (2 nodes, cohesion: 1.00)

- navigator
- ./common/commonSecurityRules

### Community 132 — index (2 nodes, cohesion: 1.00)

- index
- ./impl/ManifestParserImpl

### Community 133 — types (2 nodes, cohesion: 1.00)

- types
- ./enums/StorageEnum

### Community 134 — schemas (2 nodes, cohesion: 1.00)

- schemas
- zod/z

### Community 135 — index (1 nodes, cohesion: 1.00)

- index

### Community 136 — vite-env.d (1 nodes, cohesion: 1.00)

- vite-env.d

### Community 137 — index (1 nodes, cohesion: 1.00)

- index

### Community 138 — common (1 nodes, cohesion: 1.00)

- common

### Community 139 — manager (1 nodes, cohesion: 1.00)

- manager

### Community 140 — types (1 nodes, cohesion: 1.00)

- types

### Community 141 — index (1 nodes, cohesion: 1.00)

- index

### Community 142 — message (1 nodes, cohesion: 1.00)

- message

### Community 143 — enums (1 nodes, cohesion: 1.00)

- enums

### Community 144 — shared-types (1 nodes, cohesion: 1.00)

- shared-types

### Community 145 — index (1 nodes, cohesion: 1.00)

- index

### Community 146 — index (1 nodes, cohesion: 1.00)

- index

### Community 147 — constant (1 nodes, cohesion: 1.00)

- constant

### Community 148 — index (1 nodes, cohesion: 1.00)

- index

### Community 149 — index (1 nodes, cohesion: 1.00)

- index

### Community 150 — index (1 nodes, cohesion: 1.00)

- index

### Community 151 — json_schema (1 nodes, cohesion: 1.00)

- json_schema

### Community 152 — index (1 nodes, cohesion: 1.00)

- index

### Community 153 — index (1 nodes, cohesion: 1.00)

- index

### Community 154 — index (1 nodes, cohesion: 1.00)

- index

### Community 155 — type (1 nodes, cohesion: 1.00)

- type

### Community 156 — index (1 nodes, cohesion: 1.00)

- index

### Community 157 — buildDomTree (1 nodes, cohesion: 1.00)

- buildDomTree

### Community 158 — types (1 nodes, cohesion: 1.00)

- types

### Community 159 — index (1 nodes, cohesion: 1.00)

- index

### Community 160 — permission (1 nodes, cohesion: 1.00)

- permission

### Community 161 — types (1 nodes, cohesion: 1.00)

- types

### Community 162 — index (1 nodes, cohesion: 1.00)

- index

### Community 163 — index (1 nodes, cohesion: 1.00)

- index

### Community 164 — types (1 nodes, cohesion: 1.00)

- types

## 🕳️ Knowledge Gaps

**Isolated nodes** (30):
- buildDomTree
- permission
- common
- manager
- types
- vite-env.d
- index
- index
- constant
- index
- index
- shared-types
- index
- index
- index
- types
- index
- types
- index
- types
- _…and 10 more_

**Thin communities** (< 3 nodes): 38 communities

## 💰 Token Cost

| File | Tokens |
|------|--------|
| output | 0 |
| input | 0 |
| **Total** | **0** |

## ❓ Suggested Questions

1. How does 'chrome_extension_src_background_browser_page_ts_page_inputtextelementnode' relate to 4 different communities (._findNearestScrollableElement(), .getScrollInfo(), build_initial_state(), .goBack())?
1. How does 'chrome_extension_src_background_browser_dom_domserializer_ts_domtreeserializer' relate to 3 different communities (domSerializer, capTextLength(), ._applyBoundingBoxFiltering())?
1. How does 'chrome_extension_src_background_agent_executor_ts_executor' relate to 3 different communities (Executor, executor, .execute())?
1. How does 'chrome_extension_src_background_browser_page_ts_page' relate to 5 different communities (build_initial_state(), ._findNearestScrollableElement(), .goBack(), page, .getScrollInfo())?
1. How does 'chrome_extension_src_background_agent_executor_ts' relate to 3 different communities (executor, Executor, .execute())?
1. How does 'chrome_extension_src_background_browser_page_ts_page_clickelementnode' relate to 3 different communities (.getScrollInfo(), ._findNearestScrollableElement(), build_initial_state())?
1. How does 'chrome_extension_src_background_browser_page_ts_iscdpevaluationblockedurl' relate to 3 different communities (build_initial_state(), page, .getScrollInfo())?

---
_Generated by graphify-rs_
