import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const source = path.join(root, 'node_modules/pdfjs-dist');
const target = path.join(root, 'assets/pdfjs');
const { version } = JSON.parse(await readFile(path.join(source, 'package.json'), 'utf8'));
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
for (const name of ['pdf.min.mjs', 'pdf.worker.min.mjs']) {
  await cp(path.join(source, 'legacy/build', name), path.join(target, name));
}
for (const name of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
  await cp(path.join(source, name), path.join(target, name), { recursive: true });
}
await cp(path.join(source, 'web/pdf_viewer.css'), path.join(target, 'pdf_viewer.css'));
await cp(path.join(source, 'web/images'), path.join(target, 'images'), { recursive: true });
await cp(path.join(source, 'LICENSE'), path.join(target, 'LICENSE'));
await writeFile(path.join(target, 'version.json'), JSON.stringify({ version }, null, 2) + '\n');
console.log(`Vendored PDF.js ${version} (legacy browser build and matching worker).`);
