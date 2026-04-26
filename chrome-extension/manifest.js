import fs from 'node:fs';
import deepmerge from 'deepmerge';

const packageJson = JSON.parse(fs.readFileSync('../package.json', 'utf8'));
const EXTENSION_PUBLIC_KEY = `MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAog67VgsXWI8tSWRfJfeK
1/3rOM7CB7ypLFCQgkhurydtPSr/kZlB5A9WvQhRzhxBmVdv25OC76idKfIzKEvk
1kZ8c/HEm59bsrrGSrYhW4ul9zDg6iCOvPYGQLar9xZvPttg+OrtljuutOyCP5j/
G93g/uNMDKkaa0ouJecm/MqIoGFCPMgxBYUDXzlxVLTTBhRj9fRr1cjF4HDEKI2U
+n8Vo/cxsVlU8x1YS4XbVC+g8v/Z3gNi6ciBz5rXAbfwez8yXMpks3tluRY5eICQ
hyhmkz4uHSVKtWEGk4ZXUG0PXQcPQ6vM4PtQ4VD1t0vkT0Ik8B2JAIWQGNeCr5Zz
aQIDAQAB`.replace(/\s+/g, '');

const isFirefox = process.env.__FIREFOX__ === 'true';
const isOpera = process.env.__OPERA__ === 'true';

/**
 * If you want to disable the sidePanel, you can delete withSidePanel function and remove the sidePanel HoC on the manifest declaration.
 *
 * ```js
 * const manifest = { // remove `withSidePanel()`
 * ```
 */
function withSidePanel(manifest) {
  // Firefox does not support sidePanel
  if (isFirefox) {
    return manifest;
  }
  return deepmerge(manifest, {
    side_panel: {
      default_path: 'side-panel/index.html',
    },
    permissions: ['sidePanel'],
  });
}

/**
 * Adds Opera sidebar support using the sidebar_action API.
 * This is compatible with Chrome extensions and won't break Chrome Web Store validation.
 */
function withOperaSidebar(manifest) {
  // Only add Opera sidebar_action if building specifically for Opera
  if (isFirefox || !isOpera) {
    return manifest;
  }

  return deepmerge(manifest, {
    sidebar_action: {
      default_panel: 'side-panel/index.html',
      default_title: 'iBB8',
      default_icon: 'logo-32.png',
    },
  });
}

/** Chrome-only: allow trusted web pages to call chrome.runtime.sendMessage(extensionId, …). */
function withExternallyConnectableHzgm(manifest) {
  if (isFirefox) {
    return manifest;
  }
  return deepmerge(manifest, {
    externally_connectable: {
      matches: ['https://*.hzgm.tech/*', 'https://hzgm.tech/*'],
    },
  });
}

/**
 * After changing, please reload the extension at `chrome://extensions`
 * @type {chrome.runtime.ManifestV3}
 */
const manifest = withExternallyConnectableHzgm(
  withOperaSidebar(
    withSidePanel({
      manifest_version: 3,
      default_locale: 'zh_CN',
      /**
       * if you want to support multiple languages, you can use the following reference
       * https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Internationalization
       */
      name: '__MSG_app_metadata_name__',
      version: packageJson.version,
      description: '__MSG_app_metadata_description__',
      key: EXTENSION_PUBLIC_KEY,
      host_permissions: ['<all_urls>'],
      permissions: [
        'storage',
        'scripting',
        'tabs',
        'activeTab',
        'debugger',
        'unlimitedStorage',
        'webNavigation',
        'identity',
      ],
      options_page: 'options/index.html',
      background: {
        service_worker: 'background.iife.js',
        type: 'module',
      },
      action: {
        default_icon: 'logo-32.png',
      },
      icons: {
        128: 'logo-128.png',
      },
      content_scripts: [
        {
          matches: ['http://*/*', 'https://*/*', '<all_urls>'],
          all_frames: true,
          js: ['content/index.iife.js'],
        },
      ],
      web_accessible_resources: [
        {
          resources: ['*.js', '*.css', '*.svg', 'logo-128.png', 'permission/index.html', 'permission/permission.js'],
          matches: ['*://*/*'],
        },
      ],
    }),
  ),
);

export default manifest;
