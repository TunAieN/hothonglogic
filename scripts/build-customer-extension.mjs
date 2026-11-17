import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = resolve(root, "customer-extension-src");
const output = resolve(root, process.env.CUSTOMER_EXTENSION_OUTPUT || "build/customer-extension");
const origins = (process.env.CUSTOMER_EXTENSION_ORIGINS || "http://localhost:5173,http://127.0.0.1:5173")
  .split(",").map((value) => new URL(value.trim()).origin);
if (!origins.length || origins.some((origin) => origin.includes("*"))) throw new Error("Customer website origins must be explicit origins.");

if (existsSync(output)) rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
cpSync(source, output, { recursive: true });
for (const directory of ["shared", "content", "icons"]) mkdirSync(resolve(output, directory), { recursive: true });
cpSync(resolve(root, "extension-src/shared/product-contract.js"), resolve(output, "shared/product-contract.js"));
cpSync(resolve(root, "extension-src/shared/sku-extractor.js"), resolve(output, "shared/sku-extractor.js"));
cpSync(resolve(root, "extension-src/content/scraper.js"), resolve(output, "content/scraper.js"));
cpSync(resolve(root, "extension-src/content/content.js"), resolve(output, "content/content.js"));
for (const size of [16, 48, 128]) cpSync(resolve(root, `extension-src/icons/icon${size}.png`), resolve(output, `icons/icon${size}.png`));

const manifestPath = resolve(output, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
manifest.externally_connectable.matches = [...new Set(origins.map((origin) => {
  const url = new URL(origin);
  return `${url.protocol}//${url.hostname}/*`;
}))];
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
writeFileSync(resolve(output, "config/allowed-origins.js"), `export const ALLOWED_WEBSITE_ORIGINS = Object.freeze(${JSON.stringify(origins)});\n`);
console.log(`Customer Extension built at ${output} for ${origins.join(", ")}`);
