import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "..");
const extensionRoot = resolve(repositoryRoot, "extension-src");
const manifest = JSON.parse(readFileSync(resolve(extensionRoot, "manifest.json"), "utf8"));
JSON.parse(readFileSync(resolve(extensionRoot, "config/manifest.production.example.json"), "utf8"));

function requireFile(path, source = "manifest.json") {
  const absolutePath = resolve(extensionRoot, path);
  if (!existsSync(absolutePath)) throw new Error(`${source} references missing file: ${path}`);
  return absolutePath;
}

const references = new Set([
  manifest.background?.service_worker,
  manifest.side_panel?.default_path,
  ...(manifest.content_scripts ?? []).flatMap((entry) => entry.js ?? []),
  ...Object.values(manifest.icons ?? {}),
  ...Object.values(manifest.action?.default_icon ?? {}),
].filter(Boolean));
for (const file of references) requireFile(file);

for (const size of [16, 48, 128]) {
  const file = `icons/icon${size}.png`;
  const image = readFileSync(requireFile(file));
  const signature = image.subarray(1, 4).toString("ascii");
  const width = image.readUInt32BE(16);
  const height = image.readUInt32BE(20);
  if (signature !== "PNG" || width !== size || height !== size) {
    throw new Error(`${file} must be a ${size}x${size} PNG, received ${width}x${height}.`);
  }
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

for (const htmlPath of walk(extensionRoot).filter((file) => extname(file) === ".html")) {
  const html = readFileSync(htmlPath, "utf8");
  for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
    const reference = match[1];
    if (!reference.startsWith("http") && !reference.startsWith("#")) {
      const absoluteReference = resolve(dirname(htmlPath), reference);
      if (!existsSync(absoluteReference)) throw new Error(`${htmlPath} references missing file: ${reference}`);
    }
  }
}

for (const scriptPath of walk(extensionRoot).filter((file) => extname(file) === ".js")) {
  const source = readFileSync(scriptPath, "utf8");
  for (const match of source.matchAll(/(?:import|export)\s+(?:[^"']+\s+from\s+)?["'](\.[^"']+)["']/g)) {
    const reference = resolve(dirname(scriptPath), match[1]);
    if (!existsSync(reference)) {
      throw new Error(`${scriptPath} imports missing module: ${match[1]}`);
    }
  }
}

for (const file of ["manifest.json", "background.js", "content.js", "popup.js", "popup.html", "popup.css", "login.js", "login.html"]) {
  if (existsSync(resolve(repositoryRoot, file))) {
    throw new Error(`Duplicate extension entrypoint remains at repository root: ${file}`);
  }
}

console.log("Extension manifest, references, HTML assets, and icon dimensions are valid.");
