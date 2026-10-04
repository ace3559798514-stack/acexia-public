import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderSiteHeader } from './shared/site-shell.mjs';

const root = fileURLToPath(new URL('./', import.meta.url));
const files = new Map([
  ['/shared/site-shell.css', ['shared/site-shell.css', 'text/css; charset=utf-8']],
  ['/shared/site-shell.mjs', ['shared/site-shell.mjs', 'text/javascript; charset=utf-8']],
  ['/shared/home-destinations.mjs', ['shared/home-destinations.mjs', 'text/javascript; charset=utf-8']],
  ['/contact.css', ['contact.css', 'text/css; charset=utf-8']],
  ['/contact.js', ['contact.js', 'text/javascript; charset=utf-8']],
]);
const demoRoutes = new Map([
  ['/', 'home'], ['/play/', 'play'], ['/radar/', 'radar'], ['/connect/', 'call'],
  ['/connect/mailbox/', 'mailbox'], ['/files/', 'files'], ['/companion/', 'companion'],
  ['/support/', 'support'],
]);

export function createPreviewServer() {
  return http.createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.setHeader('Cache-Control', 'no-store');
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Static preview only.');
      return;
    }
    let pathname;
    try { pathname = new URL(request.url, 'http://127.0.0.1').pathname; }
    catch { response.writeHead(400); response.end('Invalid request.'); return; }
    if (pathname !== '/' && !path.extname(pathname) && !pathname.endsWith('/')) {
      const canonical = pathname + '/';
      if (demoRoutes.has(canonical) || canonical === '/about/') {
        response.writeHead(302, { Location: canonical }); response.end(); return;
      }
    }
    try {
      let bytes;
      let contentType;
      if (demoRoutes.has(pathname)) {
        const active = demoRoutes.get(pathname);
        let html = await fs.readFile(path.join(root, 'index.html'), 'utf8');
        html = html.replace(/<header\b[^>]*>[\s\S]*?<\/header>/, renderSiteHeader({ active }));
        bytes = Buffer.from(html);
        contentType = 'text/html; charset=utf-8';
      } else if (pathname === '/about/' || pathname === '/about/index.html') {
        bytes = await fs.readFile(path.join(root, 'about/index.html'));
        contentType = 'text/html; charset=utf-8';
      } else if (files.has(pathname)) {
        const [filename, type] = files.get(pathname);
        bytes = await fs.readFile(path.join(root, filename));
        contentType = type;
      } else {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Not included in this public display package.');
        return;
      }
      response.writeHead(200, { 'Content-Type': contentType, 'Content-Length': bytes.length });
      response.end(request.method === 'HEAD' ? undefined : bytes);
    } catch {
      response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Preview unavailable.');
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = process.argv[2] === undefined ? 4173 : Number(process.argv[2]);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid preview port');
  const server = createPreviewServer();
  server.listen(port, '127.0.0.1', () => {
    console.info('Public display preview: http://127.0.0.1:' + server.address().port + '/');
  });
}
