# Community 29: analytics

**Members:** 13

## Nodes

- **analytics** (`chrome_extension_src_background_services_analytics_ts`, File, degree: 4)
- **AnalyticsService** (`chrome_extension_src_background_services_analytics_ts_analyticsservice`, Class, degree: 9)
- **.categorizeError()** (`chrome_extension_src_background_services_analytics_ts_analyticsservice_categorizeerror`, Method, degree: 1)
- **.init()** (`chrome_extension_src_background_services_analytics_ts_analyticsservice_init`, Method, degree: 2)
- **.trackDomainVisit()** (`chrome_extension_src_background_services_analytics_ts_analyticsservice_trackdomainvisit`, Method, degree: 1)
- **.trackTaskCancelled()** (`chrome_extension_src_background_services_analytics_ts_analyticsservice_tracktaskcancelled`, Method, degree: 1)
- **.trackTaskComplete()** (`chrome_extension_src_background_services_analytics_ts_analyticsservice_tracktaskcomplete`, Method, degree: 1)
- **.trackTaskFailed()** (`chrome_extension_src_background_services_analytics_ts_analyticsservice_tracktaskfailed`, Method, degree: 1)
- **.trackTaskStart()** (`chrome_extension_src_background_services_analytics_ts_analyticsservice_tracktaskstart`, Method, degree: 1)
- **.updateSettings()** (`chrome_extension_src_background_services_analytics_ts_analyticsservice_updatesettings`, Method, degree: 2)
- **@extension/storage/analyticsSettingsStore** (`chrome_extension_src_background_services_analytics_ts_import_extension_storage_analyticssettingsstore`, Module, degree: 1)
- **../log/createLogger** (`chrome_extension_src_background_services_analytics_ts_import_log_createlogger`, Module, degree: 1)
- **posthog-js/dist/module.no-external** (`chrome_extension_src_background_services_analytics_ts_import_posthog_js_dist_module_no_external`, Module, degree: 1)

## Relationships

- chrome_extension_src_background_services_analytics_ts → chrome_extension_src_background_services_analytics_ts_import_posthog_js_dist_module_no_external (imports)
- chrome_extension_src_background_services_analytics_ts → chrome_extension_src_background_services_analytics_ts_import_extension_storage_analyticssettingsstore (imports)
- chrome_extension_src_background_services_analytics_ts → chrome_extension_src_background_services_analytics_ts_import_log_createlogger (imports)
- chrome_extension_src_background_services_analytics_ts → chrome_extension_src_background_services_analytics_ts_analyticsservice (defines)
- chrome_extension_src_background_services_analytics_ts_analyticsservice → chrome_extension_src_background_services_analytics_ts_analyticsservice_init (defines)
- chrome_extension_src_background_services_analytics_ts_analyticsservice → chrome_extension_src_background_services_analytics_ts_analyticsservice_tracktaskstart (defines)
- chrome_extension_src_background_services_analytics_ts_analyticsservice → chrome_extension_src_background_services_analytics_ts_analyticsservice_tracktaskcomplete (defines)
- chrome_extension_src_background_services_analytics_ts_analyticsservice → chrome_extension_src_background_services_analytics_ts_analyticsservice_tracktaskfailed (defines)
- chrome_extension_src_background_services_analytics_ts_analyticsservice → chrome_extension_src_background_services_analytics_ts_analyticsservice_tracktaskcancelled (defines)
- chrome_extension_src_background_services_analytics_ts_analyticsservice → chrome_extension_src_background_services_analytics_ts_analyticsservice_trackdomainvisit (defines)
- chrome_extension_src_background_services_analytics_ts_analyticsservice → chrome_extension_src_background_services_analytics_ts_analyticsservice_categorizeerror (defines)
- chrome_extension_src_background_services_analytics_ts_analyticsservice → chrome_extension_src_background_services_analytics_ts_analyticsservice_updatesettings (defines)
- chrome_extension_src_background_services_analytics_ts_analyticsservice_updatesettings → chrome_extension_src_background_services_analytics_ts_analyticsservice_init (calls)

