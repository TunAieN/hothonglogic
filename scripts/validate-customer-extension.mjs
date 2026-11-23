import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseExplicitOrigins } from "../config/local-development.mjs";

const root = resolve(process.argv[2] || "build/customer-extension");
const manifest = JSON.parse(readFileSync(resolve(root, "manifest.json"), "utf8"));
const required = [manifest.background?.service_worker, ...(manifest.content_scripts || []).flatMap((entry) => entry.js || []), ...Object.values(manifest.icons || {})];
for (const file of required) if (!file || !existsSync(resolve(root, file))) throw new Error(`Customer Extension missing ${file}`);
if (!manifest.externally_connectable?.matches?.length || manifest.externally_connectable.matches.some((match) => /^\*|:\/\/\*/.test(match))) throw new Error("Customer Extension website origins must be explicit.");
const expectedOrigins = parseExplicitOrigins(process.env.CUSTOMER_EXTENSION_ORIGINS);
const expectedMatches = [...new Set(expectedOrigins.map((origin) => {
  const url = new URL(origin);
  return `${url.protocol}//${url.hostname}/*`;
}))];
if (JSON.stringify(manifest.externally_connectable.matches) !== JSON.stringify(expectedMatches)) {
  throw new Error(`Customer Extension manifest origins do not match: ${expectedMatches.join(", ")}`);
}
const allowedOriginsPath = resolve(root, "config/allowed-origins.js");
const allowedOriginsModule = await import(`${pathToFileURL(allowedOriginsPath).href}?validation=${Date.now()}`);
if (JSON.stringify(allowedOriginsModule.ALLOWED_WEBSITE_ORIGINS) !== JSON.stringify(expectedOrigins)) {
  throw new Error(`Customer Extension runtime origins do not match: ${expectedOrigins.join(", ")}`);
}
const background = readFileSync(resolve(root, manifest.background.service_worker), "utf8");
if (/graphql|sanctum|adminOrder|AUTH_TOKEN|Bearer\s/i.test(background)) throw new Error("Customer Extension background must not contain Staff/Admin authentication code.");
console.log("Customer Extension manifest, origin allowlist, assets, and privilege boundary are valid.");
