# Community 68: refresh

**Members:** 7

## Nodes

- **refresh** (`chrome_extension_utils_refresh_js`, File, degree: 3)
- **addRefresh()** (`chrome_extension_utils_refresh_js_addrefresh`, Function, degree: 2)
- **initClient()** (`chrome_extension_utils_refresh_js_initclient`, Function, degree: 4)
- **MessageInterpreter** (`chrome_extension_utils_refresh_js_messageinterpreter`, Class, degree: 4)
- **.constructor()** (`chrome_extension_utils_refresh_js_messageinterpreter_constructor`, Method, degree: 1)
- **.receive()** (`chrome_extension_utils_refresh_js_messageinterpreter_receive`, Method, degree: 2)
- **.send()** (`chrome_extension_utils_refresh_js_messageinterpreter_send`, Method, degree: 2)

## Relationships

- chrome_extension_utils_refresh_js → chrome_extension_utils_refresh_js_messageinterpreter (defines)
- chrome_extension_utils_refresh_js_messageinterpreter → chrome_extension_utils_refresh_js_messageinterpreter_constructor (defines)
- chrome_extension_utils_refresh_js_messageinterpreter → chrome_extension_utils_refresh_js_messageinterpreter_send (defines)
- chrome_extension_utils_refresh_js_messageinterpreter → chrome_extension_utils_refresh_js_messageinterpreter_receive (defines)
- chrome_extension_utils_refresh_js → chrome_extension_utils_refresh_js_initclient (defines)
- chrome_extension_utils_refresh_js → chrome_extension_utils_refresh_js_addrefresh (defines)
- chrome_extension_utils_refresh_js_initclient → chrome_extension_utils_refresh_js_messageinterpreter_receive (calls)
- chrome_extension_utils_refresh_js_initclient → chrome_extension_utils_refresh_js_messageinterpreter_send (calls)
- chrome_extension_utils_refresh_js_addrefresh → chrome_extension_utils_refresh_js_initclient (calls)

