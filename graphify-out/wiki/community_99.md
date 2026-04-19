# Community 99: .addModelOutput()

**Members:** 5

## Nodes

- **.addModelOutput()** (`chrome_extension_src_background_agent_messages_service_ts_messagemanager_addmodeloutput`, Method, degree: 4)
- **.addToolMessage()** (`chrome_extension_src_background_agent_messages_service_ts_messagemanager_addtoolmessage`, Method, degree: 5)
- **.initTaskMessages()** (`chrome_extension_src_background_agent_messages_service_ts_messagemanager_inittaskmessages`, Method, degree: 5)
- **.nextToolId()** (`chrome_extension_src_background_agent_messages_service_ts_messagemanager_nexttoolid`, Method, degree: 4)
- **.taskInstructions()** (`chrome_extension_src_background_agent_messages_service_ts_messagemanager_taskinstructions`, Method, degree: 2)

## Relationships

- chrome_extension_src_background_agent_messages_service_ts_messagemanager_inittaskmessages → chrome_extension_src_background_agent_messages_service_ts_messagemanager_addtoolmessage (calls)
- chrome_extension_src_background_agent_messages_service_ts_messagemanager_inittaskmessages → chrome_extension_src_background_agent_messages_service_ts_messagemanager_taskinstructions (calls)
- chrome_extension_src_background_agent_messages_service_ts_messagemanager_inittaskmessages → chrome_extension_src_background_agent_messages_service_ts_messagemanager_nexttoolid (calls)
- chrome_extension_src_background_agent_messages_service_ts_messagemanager_addmodeloutput → chrome_extension_src_background_agent_messages_service_ts_messagemanager_addtoolmessage (calls)
- chrome_extension_src_background_agent_messages_service_ts_messagemanager_addmodeloutput → chrome_extension_src_background_agent_messages_service_ts_messagemanager_nexttoolid (calls)
- chrome_extension_src_background_agent_messages_service_ts_messagemanager_addtoolmessage → chrome_extension_src_background_agent_messages_service_ts_messagemanager_nexttoolid (calls)

