# Community 97: .goBack()

**Members:** 5

## Nodes

- **.goBack()** (`chrome_extension_src_background_browser_page_ts_page_goback`, Method, degree: 2)
- **.goForward()** (`chrome_extension_src_background_browser_page_ts_page_goforward`, Method, degree: 2)
- **.navigateTo()** (`chrome_extension_src_background_browser_page_ts_page_navigateto`, Method, degree: 2)
- **.refreshPage()** (`chrome_extension_src_background_browser_page_ts_page_refreshpage`, Method, degree: 2)
- **.waitForPageAndFramesLoad()** (`chrome_extension_src_background_browser_page_ts_page_waitforpageandframesload`, Method, degree: 10)

## Relationships

- chrome_extension_src_background_browser_page_ts_page_navigateto → chrome_extension_src_background_browser_page_ts_page_waitforpageandframesload (calls)
- chrome_extension_src_background_browser_page_ts_page_refreshpage → chrome_extension_src_background_browser_page_ts_page_waitforpageandframesload (calls)
- chrome_extension_src_background_browser_page_ts_page_goback → chrome_extension_src_background_browser_page_ts_page_waitforpageandframesload (calls)
- chrome_extension_src_background_browser_page_ts_page_goforward → chrome_extension_src_background_browser_page_ts_page_waitforpageandframesload (calls)

