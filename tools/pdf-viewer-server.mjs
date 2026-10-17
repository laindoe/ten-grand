// A viewer-only preview server; Jekyll remains the production site builder.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.pdf': 'application/pdf', '.wasm': 'application/wasm', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' };
export function createViewerServer(base = '/ten-grand', publication = {}) {
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      if (!url.pathname.startsWith(`${base}/`)) { response.writeHead(404).end(); return; }
      const pathname = decodeURIComponent(url.pathname.slice(base.length));
      if (pathname === '/') {
        response.setHeader('Content-Type', 'text/html');
        response.end(`<title>Ten Grand local preview</title><a href="${base}/grand-scheme/">Open The Grand Scheme viewer</a><p>Use Jekyll to preview the complete site.</p>`); return;
      }
      if (pathname === '/grand-scheme/' || pathname === '/grand-scheme') {
        let html = await readFile(path.join(root, 'grand-scheme/index.html'), 'utf8');
        const settings = await readFile(path.join(root, '_data/grand_scheme.yml'), 'utf8');
        const pdf = settings.match(/^PDF_URL:\s*(.+)$/m)?.[1].trim().replace(/^['"]|['"]$/g, '');
        if (!pdf) throw new Error('Missing PDF_URL');
        const relative = (value) => /^https?:\/\//.test(value) ? value : `${base}/${value.replace(/^\//, '')}`;
        html = html.replace(/^---\n[\s\S]*?\n---\n/, '')
          .replace(/\{\{\s*'([^']+)'\s*\|\s*relative_url\s*\}\}/g, (_, value) => relative(value))
          .replace(/\{\{\s*site.github.build_revision.*?\}\}/g, publication.revision || 'local-preview')
          .replace(/\{\{\s*site.data.grand_scheme.PDF_URL\s*\|\s*relative_url\s*\}\}/g, relative(pdf));
        response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(html); return;
      }
      if (pathname === '/assets/pdfs/grand-scheme.pdf' && publication.pdf) {
        const bytes = publication.pdf();
        const { createHash } = await import('node:crypto');
        const etag = '"' + createHash('sha256').update(bytes).digest('hex') + '"';
        response.setHeader('ETag', etag);
        response.setHeader('Cache-Control', 'public, max-age=600');
        publication.requests?.push({ validator: request.headers['if-none-match'], etag, url: request.url });
        if (request.headers['if-none-match'] === etag) { response.writeHead(304).end(); return; }
        response.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Length': bytes.length });
        response.end(bytes); return;
      }
      const target = path.resolve(root, `.${pathname}`);
      if (!target.startsWith(`${root}${path.sep}`) || pathname.includes('/node_modules/') || pathname.includes('/.git/')) { response.writeHead(403).end(); return; }
      const info = await stat(target);
      if (!info.isFile()) { response.writeHead(404).end(); return; }
      response.setHeader('Content-Type', mime[path.extname(target)] || 'application/octet-stream');
      response.setHeader('Accept-Ranges', 'bytes');
      const range = request.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
      if (range) {
        const start = Number(range[1]), end = Math.min(Number(range[2] || info.size - 1), info.size - 1);
        if (start > end || start >= info.size) { response.writeHead(416).end(); return; }
        response.writeHead(206, { 'Content-Range': `bytes ${start}-${end}/${info.size}`, 'Content-Length': end - start + 1 });
        createReadStream(target, { start, end }).pipe(response);
      } else {
        response.writeHead(200, { 'Content-Length': info.size }); createReadStream(target).pipe(response);
      }
    } catch { response.writeHead(404).end('Not found'); }
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 4173);
  createViewerServer().listen(port, '127.0.0.1', () => console.log(`Viewer preview: http://127.0.0.1:${port}/ten-grand/grand-scheme/`));
}
