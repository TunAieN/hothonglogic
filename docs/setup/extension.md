# Chrome Extension Setup and Validation

The extension is Vanilla JavaScript using Chrome Manifest V3 and is currently loaded directly from the repository root.

## Load for development

1. Start the Laravel backend and admin panel.
2. Open `chrome://extensions/` and enable **Developer mode**.
3. Click **Load unpacked** and select the repository root.
4. Open a supported Taobao or Tmall product page.
5. Open the extension side panel and verify the endpoint values in Settings.

Do not use a shared or production admin account for extension testing. The login form intentionally has no default credentials.

## Manual checks

- Product title, price, image, seller, and URL are extracted when available.
- Adding, removing, and clearing cart entries updates persisted cart state.
- Authentication errors do not expose stored tokens.
- Creating an external order opens the configured admin route.
- Reloading the extension does not lose saved settings unexpectedly.

## Static validation

```bash
node --check background.js
node --check content.js
node --check login.js
node --check popup.js
node scripts/validate-extension.mjs
```

Also validate that every file referenced by `manifest.json` exists, icon files match their declared dimensions, and `permissions`/`host_permissions` cover only APIs and origins used by the current source.

Production packages must use production HTTPS endpoints and matching host permissions; they must not depend on localhost.

Environment defaults live in `extension-src/config/environment.js`. Development is the active source configuration. Before packaging production, replace the `.invalid` placeholder origins in both the production configuration and `extension-src/config/manifest.production.example.json`, then use that manifest as the root `manifest.json` in the release artifact. Never ship the development manifest as a production package.
