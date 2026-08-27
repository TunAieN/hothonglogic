import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const manifest = JSON.parse(readFileSync(resolve(root, "manifest.json"), "utf8"));

const referencedFiles = new Set([
  manifest.background?.service_worker,
  manifest.side_panel?.default_path,
  ...(manifest.content_scripts ?? []).flatMap((entry) => entry.js ?? []),
  ...Object.values(manifest.icons ?? {}),
  ...Object.values(manifest.action?.default_icon ?? {}),
].filter(Boolean));

for (const file of referencedFiles) {
  readFileSync(resolve(root, file));
}

for (const size of [16, 48, 128]) {
  const file = `icons/icon${size}.png`;
  const image = readFileSync(resolve(root, file));
  const signature = image.subarray(1, 4).toString("ascii");
  const width = image.readUInt32BE(16);
  const height = image.readUInt32BE(20);

  if (signature !== "PNG" || width !== size || height !== size) {
    throw new Error(`${file} must be a ${size}x${size} PNG, received ${width}x${height}.`);
  }
}

console.log("Extension manifest, references, and icon dimensions are valid.");
