// 대시보드 서버: 정적 파일 제공 + 쿠팡 API 프록시 (시크릿 키는 서버에만 보관)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CoupangClient, MockClient } from './lib/coupang.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
loadDotEnv(path.join(ROOT, '.env'));

const { COUPANG_ACCESS_KEY, COUPANG_SECRET_KEY, COUPANG_VENDOR_ID } = process.env;
const PORT = Number(process.env.PORT || 3000);
const MOCK = process.env.MOCK === '1' || !COUPANG_ACCESS_KEY || !COUPANG_SECRET_KEY;
const MAX_IDS = 500;
const CONCURRENCY = 3; // 쿠팡 API 호출 제한을 고려해 동시 요청 수를 낮게 유지

const client = MOCK
  ? new MockClient()
  : new CoupangClient({
      accessKey: COUPANG_ACCESS_KEY,
      secretKey: COUPANG_SECRET_KEY,
      vendorId: COUPANG_VENDOR_ID,
    });

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

function parseIds(raw = '') {
  return [...new Set(raw.split(/[\s,]+/).filter((s) => /^\d+$/.test(s)))];
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

function serveStatic(res, pathname) {
  const file = path.normalize(path.join(ROOT, 'public', pathname === '/' ? 'index.html' : pathname));
  if (!file.startsWith(path.join(ROOT, 'public')) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end('Not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': `${MIME[path.extname(file)] || 'application/octet-stream'}; charset=utf-8` });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname === '/api/config') {
      return sendJson(res, 200, { mock: MOCK, vendorId: COUPANG_VENDOR_ID || null });
    }

    // GET /api/inventories?ids=1,2,3
    if (url.pathname === '/api/inventories') {
      const ids = parseIds(url.searchParams.get('ids') || '');
      if (!ids.length) return sendJson(res, 400, { error: 'ids 파라미터에 vendorItemId를 입력하세요.' });
      if (ids.length > MAX_IDS) return sendJson(res, 400, { error: `한 번에 최대 ${MAX_IDS}개까지 조회할 수 있습니다.` });

      const items = await mapLimit(ids, CONCURRENCY, async (id) => {
        try {
          return { ...(await client.getInventory(id)), ok: true };
        } catch (e) {
          return { vendorItemId: id, ok: false, error: e.message, status: e.status ?? null };
        }
      });
      return sendJson(res, 200, { fetchedAt: new Date().toISOString(), mock: MOCK, items });
    }

    // GET /api/seller-products/:sellerProductId/items
    const m = url.pathname.match(/^\/api\/seller-products\/(\d+)\/items$/);
    if (m) {
      return sendJson(res, 200, { items: await client.getSellerProductItems(m[1]) });
    }

    if (url.pathname.startsWith('/api/')) return sendJson(res, 404, { error: 'Not found' });
    serveStatic(res, url.pathname);
  } catch (e) {
    sendJson(res, e.status && e.status < 500 ? e.status : 502, { error: e.message });
  }
});

server.listen(PORT, () => {
  console.log(`쿠팡 SKU 대시보드: http://localhost:${PORT}${MOCK ? '  (MOCK 모드 - API 키 미설정)' : ''}`);
});
