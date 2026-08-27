# Hothonglogic Chrome Extension

Vanilla JavaScript Chrome Extension (Manifest V3) used to extract product data from Taobao/Tmall, maintain a local cart, authenticate against the existing GraphQL API, and open the Admin Panel external-order form with the current draft payload.

## Architecture

```text
manifest.json
├── background/    service worker and message routing
├── content/       product scraper plus thin content-script entrypoint
├── popup/         side-panel orchestration, product UI, cart UI, shared UI helpers
├── login/         authentication page
├── api/           GraphQL transport and domain operations
├── auth/          authentication session storage
├── storage/       settings/cart persistence
├── config/        development and production endpoint defaults
├── shared/        message types, storage keys, shared constants
└── icons/         declared 16, 48, and 128 pixel PNG assets
```

The extension has no bundler and no framework. ES modules are used by extension pages and the service worker. Chrome content scripts remain classic scripts, so `content/scraper.js` exposes a single frozen scraper API consumed by `content/content.js`.

## Load unpacked

1. Start the Laravel API and Admin Panel.
2. Open `chrome://extensions/` and enable **Developer mode**.
3. Choose **Load unpacked** and select this `extension-src/` directory.
4. Open a supported Taobao/Tmall product page.
5. Click the extension action to open its side panel.

## Configuration

Endpoint defaults live only in `config/config.js`:

- `development`: local GraphQL and Admin Panel URLs.
- `production`: placeholder HTTPS URLs that must be replaced during release preparation.

`ACTIVE_ENVIRONMENT` selects the defaults used for a new installation. Users may override the GraphQL endpoint and Admin Panel URL in extension settings; those values are persisted in `chrome.storage.local`.

For production, replace the `.invalid` origins, select `production`, and copy `config/manifest.production.example.json` to `manifest.json` in the release directory. Do not ship localhost host permissions or real credentials.

## Permissions

- `storage`: settings, authentication session, current product, and cart.
- `tabs`: inspect the active tab, react to navigation, and open Admin Panel/product pages.
- `scripting` and `activeTab`: recover by injecting scraper scripts when a supported product tab has not received the declared content scripts.
- `sidePanel`: open and close the extension side panel.
- `host_permissions`: Taobao/Tmall scraping, Google Translate requests, and configured development API/Admin origins.

No remote JavaScript is executed. Authentication tokens stay in extension-local storage and must never be logged or committed.

## Validation

From the repository root:

```bash
node --check extension-src/background/background.js
node --check extension-src/content/content.js
node --check extension-src/content/scraper.js
node --check extension-src/login/login.js
node --check extension-src/popup/popup.js
node scripts/validate-extension.mjs
```

The validator checks manifest references, HTML assets, icon dimensions, and confirms that duplicate legacy entrypoints did not return to the repository root.
