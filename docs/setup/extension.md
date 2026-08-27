# Chrome Extension Setup and Validation

The extension is Vanilla JavaScript using Chrome Manifest V3. Its only loadable source tree is `extension-src/`; do not load the repository root.

## Load for development

1. Start the Laravel backend and Admin Panel.
2. Open `chrome://extensions/` and enable **Developer mode**.
3. Click **Load unpacked** and select `extension-src/`.
4. Open a supported Taobao or Tmall product page.
5. Open the extension side panel and verify endpoint values in Settings.

Do not use a shared or production admin account for extension testing. The login form has no default credentials.

## Manual checks

- Product title, price, image, seller, URL, color, and size are extracted when available.
- Adding, editing, selecting, removing, and clearing cart entries persists correctly.
- Login/logout updates the customer selector without exposing the token.
- Creating an external order opens the configured Admin Panel route with the existing draft payload contract.
- Reloading the extension preserves saved settings and cart state.

## Static validation

```bash
node --check extension-src/background/background.js
node --check extension-src/content/content.js
node --check extension-src/content/scraper.js
node --check extension-src/login/login.js
node --check extension-src/popup/popup.js
node scripts/validate-extension.mjs
```

Environment defaults live in `extension-src/config/config.js`. Before packaging production, replace the `.invalid` placeholder origins, select the production environment, and use `extension-src/config/manifest.production.example.json` as the release `manifest.json`. Never ship the development manifest as a production package.
