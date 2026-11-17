import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.argv[2] || "build/customer-extension");
const manifest = JSON.parse(readFileSync(resolve(root, "manifest.json"), "utf8"));
const required = [manifest.background?.service_worker, ...(manifest.content_scripts || []).flatMap((entry) => entry.js || []), ...Object.values(manifest.icons || {})];
for (const file of required) if (!file || !existsSync(resolve(root, file))) throw new Error(`Customer Extension missing ${file}`);
if (!manifest.externally_connectable?.matches?.length || manifest.externally_connectable.matches.some((match) => /^\*|:\/\/\*/.test(match))) throw new Error("Customer Extension website origins must be explicit.");
const background = readFileSync(resolve(root, manifest.background.service_worker), "utf8");
if (/graphql|sanctum|adminOrder|AUTH_TOKEN|Bearer\s/i.test(background)) throw new Error("Customer Extension background must not contain Staff/Admin authentication code.");
console.log("Customer Extension manifest, origin allowlist, assets, and privilege boundary are valid.");
