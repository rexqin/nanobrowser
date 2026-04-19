# Community 107: executor-lifecycle

**Members:** 4

## Nodes

- **executor-lifecycle** (`chrome_extension_src_background_executor_lifecycle_ts`, File, degree: 3)
- **./agent/event/types/ExecutionState** (`chrome_extension_src_background_executor_lifecycle_ts_import_agent_event_types_executionstate`, Module, degree: 1)
- **isTerminalTaskExecutionState()** (`chrome_extension_src_background_executor_lifecycle_ts_isterminaltaskexecutionstate`, Function, degree: 2)
- **shouldCleanupExecutorOnTerminalEvent()** (`chrome_extension_src_background_executor_lifecycle_ts_shouldcleanupexecutoronterminalevent`, Function, degree: 2)

## Relationships

- chrome_extension_src_background_executor_lifecycle_ts → chrome_extension_src_background_executor_lifecycle_ts_import_agent_event_types_executionstate (imports)
- chrome_extension_src_background_executor_lifecycle_ts → chrome_extension_src_background_executor_lifecycle_ts_isterminaltaskexecutionstate (defines)
- chrome_extension_src_background_executor_lifecycle_ts → chrome_extension_src_background_executor_lifecycle_ts_shouldcleanupexecutoronterminalevent (defines)
- chrome_extension_src_background_executor_lifecycle_ts_shouldcleanupexecutoronterminalevent → chrome_extension_src_background_executor_lifecycle_ts_isterminaltaskexecutionstate (calls)

