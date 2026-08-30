import { readdir, readFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";

const outputRoot = join(process.cwd(), "mcp", "dist");

async function javascriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await javascriptFiles(entryPath)));
    else if (entry.name.endsWith(".js")) files.push(entryPath);
  }
  return files;
}

const files = await javascriptFiles(outputRoot);
const localImport = /(from\s+["'])(\.{1,2}\/[^"']+)(["'])/g;

for (const file of files) {
  const source = await readFile(file, "utf8");
  const rewritten = source.replace(localImport, (match, prefix, specifier, suffix) => {
    if (extname(specifier)) return match;
    return `${prefix}${specifier}.js${suffix}`;
  });
  if (rewritten !== source) await writeFile(file, rewritten, "utf8");
}
