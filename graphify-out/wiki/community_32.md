# Community 32: firewall

**Members:** 12

## Nodes

- **firewall** (`packages_storage_lib_settings_firewall_ts`, File, degree: 11)
- **addToAllowList()** (`packages_storage_lib_settings_firewall_ts_addtoallowlist`, Function, degree: 4)
- **addToDenyList()** (`packages_storage_lib_settings_firewall_ts_addtodenylist`, Function, degree: 4)
- **getFirewall()** (`packages_storage_lib_settings_firewall_ts_getfirewall`, Function, degree: 5)
- **../base/base/createStorage** (`packages_storage_lib_settings_firewall_ts_import_base_base_createstorage`, Module, degree: 1)
- **../base/enums/StorageEnum** (`packages_storage_lib_settings_firewall_ts_import_base_enums_storageenum`, Module, degree: 1)
- **../base/types/BaseStorage** (`packages_storage_lib_settings_firewall_ts_import_base_types_basestorage`, Module, degree: 1)
- **normalizeUrl()** (`packages_storage_lib_settings_firewall_ts_normalizeurl`, Function, degree: 5)
- **removeFromAllowList()** (`packages_storage_lib_settings_firewall_ts_removefromallowlist`, Function, degree: 4)
- **removeFromDenyList()** (`packages_storage_lib_settings_firewall_ts_removefromdenylist`, Function, degree: 4)
- **resetToDefaults()** (`packages_storage_lib_settings_firewall_ts_resettodefaults`, Function, degree: 1)
- **updateFirewall()** (`packages_storage_lib_settings_firewall_ts_updatefirewall`, Function, degree: 5)

## Relationships

- packages_storage_lib_settings_firewall_ts → packages_storage_lib_settings_firewall_ts_import_base_enums_storageenum (imports)
- packages_storage_lib_settings_firewall_ts → packages_storage_lib_settings_firewall_ts_import_base_base_createstorage (imports)
- packages_storage_lib_settings_firewall_ts → packages_storage_lib_settings_firewall_ts_import_base_types_basestorage (imports)
- packages_storage_lib_settings_firewall_ts → packages_storage_lib_settings_firewall_ts_normalizeurl (defines)
- packages_storage_lib_settings_firewall_ts → packages_storage_lib_settings_firewall_ts_updatefirewall (defines)
- packages_storage_lib_settings_firewall_ts → packages_storage_lib_settings_firewall_ts_getfirewall (defines)
- packages_storage_lib_settings_firewall_ts → packages_storage_lib_settings_firewall_ts_resettodefaults (defines)
- packages_storage_lib_settings_firewall_ts → packages_storage_lib_settings_firewall_ts_addtoallowlist (defines)
- packages_storage_lib_settings_firewall_ts → packages_storage_lib_settings_firewall_ts_removefromallowlist (defines)
- packages_storage_lib_settings_firewall_ts → packages_storage_lib_settings_firewall_ts_addtodenylist (defines)
- packages_storage_lib_settings_firewall_ts → packages_storage_lib_settings_firewall_ts_removefromdenylist (defines)
- packages_storage_lib_settings_firewall_ts_addtoallowlist → packages_storage_lib_settings_firewall_ts_normalizeurl (calls)
- packages_storage_lib_settings_firewall_ts_addtoallowlist → packages_storage_lib_settings_firewall_ts_getfirewall (calls)
- packages_storage_lib_settings_firewall_ts_addtoallowlist → packages_storage_lib_settings_firewall_ts_updatefirewall (calls)
- packages_storage_lib_settings_firewall_ts_removefromallowlist → packages_storage_lib_settings_firewall_ts_normalizeurl (calls)
- packages_storage_lib_settings_firewall_ts_removefromallowlist → packages_storage_lib_settings_firewall_ts_getfirewall (calls)
- packages_storage_lib_settings_firewall_ts_removefromallowlist → packages_storage_lib_settings_firewall_ts_updatefirewall (calls)
- packages_storage_lib_settings_firewall_ts_addtodenylist → packages_storage_lib_settings_firewall_ts_normalizeurl (calls)
- packages_storage_lib_settings_firewall_ts_addtodenylist → packages_storage_lib_settings_firewall_ts_getfirewall (calls)
- packages_storage_lib_settings_firewall_ts_addtodenylist → packages_storage_lib_settings_firewall_ts_updatefirewall (calls)
- packages_storage_lib_settings_firewall_ts_removefromdenylist → packages_storage_lib_settings_firewall_ts_normalizeurl (calls)
- packages_storage_lib_settings_firewall_ts_removefromdenylist → packages_storage_lib_settings_firewall_ts_getfirewall (calls)
- packages_storage_lib_settings_firewall_ts_removefromdenylist → packages_storage_lib_settings_firewall_ts_updatefirewall (calls)

