# VietTrung Customer Extension

Customer Extension is built separately from the Staff Extension and contains no GraphQL endpoint, Admin token, or customer identity. Both extensions consume the single shared extractor source in `extension-src/shared/sku-extractor.js`, `extension-src/shared/product-contract.js`, and `extension-src/content/scraper.js`.

## Development build

From the repository root:

```powershell
$env:CUSTOMER_EXTENSION_ORIGINS='http://localhost:5173,http://127.0.0.1:5173'
node scripts/build-customer-extension.mjs
node scripts/validate-customer-extension.mjs build/customer-extension
```

The default local origins come from the same `config/local-development.mjs` source used by the Customer Web Vite server. The manifest limits external messaging to the two local hosts; because Chrome match patterns do not support ports, the service worker additionally checks the complete sender origin and accepts only port `5173`. Admin Panel on `5174` is therefore rejected.

Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `build/customer-extension`. Copy the resulting extension ID into `customer-web/.env.local` as `VITE_CUSTOMER_EXTENSION_IDS`. Restart Vite after changing the environment file.

After rebuilding an already loaded unpacked extension, click **Reload** for that extension in `chrome://extensions` before testing again.

The customer only needs to log in to the marketplace and VietTrung Order in the same browser profile. Pasting a supported product URL starts extraction automatically; the extension popup never needs to be opened.

## Variant QA

Use real, currently available Taobao, Tmall, and 1688 products while logged in to the marketplace. Verify all of the following:

- Every attribute group is shown with the marketplace label, including non-color/size groups such as `净含量`, `套装`, or `版本`.
- Only combinations carrying a verified marketplace SKU ID are selectable. Missing combinations are never synthesized as a Cartesian product.
- Selecting a valid combination updates its price and image when the marketplace provides them. An unavailable combination is disabled only when availability is verified.
- On 1688, changing quantity applies the highest matching quantity-price tier.
- A verified product with no variant controls remains a normal simple product. A page that exposes variant groups but not complete SKU combinations remains partial and asks for manual details instead of pretending the product has no variants.

For timing-sensitive pages, the scraper waits for product state to settle before returning. A late response from an older pasted URL must not replace the current URL's product.

## QA and production

Build each channel with its explicit HTTPS origin. Do not use wildcards and do not reuse an unpacked extension ID in production:

```powershell
$env:CUSTOMER_EXTENSION_ORIGINS='https://qa.example.vn,https://order.example.vn'
$env:CUSTOMER_EXTENSION_OUTPUT='build/customer-extension-release'
node scripts/build-customer-extension.mjs
```

Set the stable QA/production extension IDs in `VITE_CUSTOMER_EXTENSION_IDS` at Customer Web build time. Replace the example origins with the approved real domains before publishing.

## User action cases

The extension keeps its created tab in the background when Taobao, Tmall, or 1688 requires login, CAPTCHA, or interactive verification. VietTrung Order tells the customer to open that tab, complete the required marketplace action, and retry. The extension does not bypass verification.
