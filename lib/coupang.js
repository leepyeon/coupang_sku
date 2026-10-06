// 쿠팡 Wing Open API 클라이언트 (HMAC-SHA256 서명)
import crypto from 'node:crypto';

export const API_HOST = 'https://api-gateway.coupang.com';
const BASE = '/v2/providers/seller_api/apis/api/v1/marketplace';

// 쿠팡 문서와 다르면 이 경로만 고치면 됩니다.
export const PATHS = {
  // 상품 아이템별 수량/가격/상태 조회
  inventory: (vendorItemId) => `${BASE}/vendor-items/${vendorItemId}/inventories`,
  // 상품 조회 (sellerProductId → 하위 아이템 vendorItemId 목록)
  sellerProduct: (sellerProductId) => `${BASE}/seller-products/${sellerProductId}`,
};

/** signed-date 형식: yyMMdd'T'HHmmss'Z' (UTC) */
export function signedDate(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return (
    p(now.getUTCFullYear() % 100) + p(now.getUTCMonth() + 1) + p(now.getUTCDate()) +
    'T' + p(now.getUTCHours()) + p(now.getUTCMinutes()) + p(now.getUTCSeconds()) + 'Z'
  );
}

/** Authorization 헤더 생성. message = signedDate + method + path + query */
export function authorization({ method, path, query = '', accessKey, secretKey, now }) {
  const dt = signedDate(now);
  const message = dt + method.toUpperCase() + path + query;
  const signature = crypto.createHmac('sha256', secretKey).update(message).digest('hex');
  return `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${dt}, signature=${signature}`;
}

export class CoupangClient {
  constructor({ accessKey, secretKey, vendorId, timeoutMs = 10000 }) {
    this.accessKey = accessKey;
    this.secretKey = secretKey;
    this.vendorId = vendorId;
    this.timeoutMs = timeoutMs;
  }

  async request(method, path, params = {}) {
    const query = new URLSearchParams(params).toString();
    const headers = {
      Authorization: authorization({
        method, path, query, accessKey: this.accessKey, secretKey: this.secretKey,
      }),
      'Content-Type': 'application/json;charset=UTF-8',
    };
    if (this.vendorId) headers['X-Requested-By'] = this.vendorId;

    const res = await fetch(API_HOST + path + (query ? `?${query}` : ''), {
      method, headers, signal: AbortSignal.timeout(this.timeoutMs),
    });
    const text = await res.text();
    let body;
    try { body = JSON.parse(text); } catch { body = { message: text }; }
    if (!res.ok || (body.code && body.code !== 'SUCCESS' && body.code !== 200)) {
      const err = new Error(body.message || `HTTP ${res.status}`);
      err.status = res.status;
      err.body = body;
      throw err;
    }
    return body;
  }

  /** 아이템별 수량/가격/상태 → { vendorItemId, amountInStock, salePrice, onSale } */
  async getInventory(vendorItemId) {
    const body = await this.request('GET', PATHS.inventory(vendorItemId));
    return normalizeInventory(vendorItemId, body.data ?? body);
  }

  /** 등록상품의 하위 아이템 목록 */
  async getSellerProductItems(sellerProductId) {
    const body = await this.request('GET', PATHS.sellerProduct(sellerProductId));
    const d = body.data ?? {};
    return (d.items ?? []).map((it) => ({
      vendorItemId: it.vendorItemId,
      itemName: it.itemName,
      sellerProductId: d.sellerProductId ?? sellerProductId,
      sellerProductName: d.sellerProductName,
    })).filter((it) => it.vendorItemId);
  }
}

export function normalizeInventory(vendorItemId, d = {}) {
  return {
    vendorItemId: String(d.vendorItemId ?? d.sellerItemId ?? vendorItemId),
    amountInStock: d.amountInStock == null ? null : Number(d.amountInStock),
    salePrice: d.salePrice == null ? null : Number(d.salePrice),
    onSale: typeof d.onSale === 'boolean' ? d.onSale : d.onSale === 'true',
  };
}

/** API 키 없이 화면을 확인하기 위한 가짜 클라이언트 */
export class MockClient {
  async getInventory(vendorItemId) {
    const n = [...String(vendorItemId)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
    await new Promise((r) => setTimeout(r, 50 + (n % 150)));
    if (n % 17 === 0) {
      const err = new Error('존재하지 않는 vendorItemId 입니다. (mock)');
      err.status = 400;
      throw err;
    }
    return normalizeInventory(vendorItemId, {
      amountInStock: n % 9 === 0 ? 0 : n % 120,
      salePrice: 1000 * (5 + (n % 95)),
      onSale: n % 7 !== 0,
    });
  }

  async getSellerProductItems(sellerProductId) {
    return Array.from({ length: 4 }, (_, i) => ({
      vendorItemId: String(Number(sellerProductId) * 10 + i + 1),
      itemName: `옵션 ${i + 1}`,
      sellerProductId: String(sellerProductId),
      sellerProductName: `Mock 상품 ${sellerProductId}`,
    }));
  }
}
