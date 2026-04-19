# Community 36: speechToText

**Members:** 11

## Nodes

- **speechToText** (`chrome_extension_src_background_services_speechtotext_ts`, File, degree: 7)
- **@extension/i18n/t** (`chrome_extension_src_background_services_speechtotext_ts_import_extension_i18n_t`, Module, degree: 1)
- **@extension/storage/ProviderConfig** (`chrome_extension_src_background_services_speechtotext_ts_import_extension_storage_providerconfig`, Module, degree: 1)
- **@extension/storage/speechToTextModelStore** (`chrome_extension_src_background_services_speechtotext_ts_import_extension_storage_speechtotextmodelstore`, Module, degree: 1)
- **@langchain/core/messages/HumanMessage** (`chrome_extension_src_background_services_speechtotext_ts_import_langchain_core_messages_humanmessage`, Module, degree: 1)
- **@langchain/google-genai/ChatGoogleGenerativeAI** (`chrome_extension_src_background_services_speechtotext_ts_import_langchain_google_genai_chatgooglegenerativeai`, Module, degree: 1)
- **../log/createLogger** (`chrome_extension_src_background_services_speechtotext_ts_import_log_createlogger`, Module, degree: 1)
- **SpeechToTextService** (`chrome_extension_src_background_services_speechtotext_ts_speechtotextservice`, Class, degree: 4)
- **.constructor()** (`chrome_extension_src_background_services_speechtotext_ts_speechtotextservice_constructor`, Method, degree: 1)
- **.create()** (`chrome_extension_src_background_services_speechtotext_ts_speechtotextservice_create`, Method, degree: 1)
- **.transcribeAudio()** (`chrome_extension_src_background_services_speechtotext_ts_speechtotextservice_transcribeaudio`, Method, degree: 1)

## Relationships

- chrome_extension_src_background_services_speechtotext_ts → chrome_extension_src_background_services_speechtotext_ts_import_langchain_google_genai_chatgooglegenerativeai (imports)
- chrome_extension_src_background_services_speechtotext_ts → chrome_extension_src_background_services_speechtotext_ts_import_langchain_core_messages_humanmessage (imports)
- chrome_extension_src_background_services_speechtotext_ts → chrome_extension_src_background_services_speechtotext_ts_import_log_createlogger (imports)
- chrome_extension_src_background_services_speechtotext_ts → chrome_extension_src_background_services_speechtotext_ts_import_extension_storage_providerconfig (imports)
- chrome_extension_src_background_services_speechtotext_ts → chrome_extension_src_background_services_speechtotext_ts_import_extension_storage_speechtotextmodelstore (imports)
- chrome_extension_src_background_services_speechtotext_ts → chrome_extension_src_background_services_speechtotext_ts_import_extension_i18n_t (imports)
- chrome_extension_src_background_services_speechtotext_ts → chrome_extension_src_background_services_speechtotext_ts_speechtotextservice (defines)
- chrome_extension_src_background_services_speechtotext_ts_speechtotextservice → chrome_extension_src_background_services_speechtotext_ts_speechtotextservice_constructor (defines)
- chrome_extension_src_background_services_speechtotext_ts_speechtotextservice → chrome_extension_src_background_services_speechtotext_ts_speechtotextservice_create (defines)
- chrome_extension_src_background_services_speechtotext_ts_speechtotextservice → chrome_extension_src_background_services_speechtotext_ts_speechtotextservice_transcribeaudio (defines)

