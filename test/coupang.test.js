import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { signedDate, authorization, normalizeInventory, PATHS } from '../lib/coupang.js';

const now = new Date(Date.UTC(2026, 9, 6, 7, 5, 9));

test('signedDate는 yyMMddTHHmmssZ(UTC) 형식', () => {
  assert.equal(signedDate(now), '261006T070509Z');
});

test('authorization 헤더 서명 = HMAC(signedDate + method + path + query)', () => {
  const path = PATHS.inventory('123');
  const h = authorization({ method: 'get', path, query: '', accessKey: 'AK', secretKey: 'SK', now });
  const sig = crypto.createHmac('sha256', 'SK').update('261006T070509ZGET' + path).digest('hex');
  assert.equal(h, `CEA algorithm=HmacSHA256, access-key=AK, signed-date=261006T070509Z, signature=${sig}`);
});

test('normalizeInventory는 응답 필드를 정규화', () => {
  assert.deepEqual(normalizeInventory('1', { amountInStock: '3', salePrice: 12900, onSale: true }),
    { vendorItemId: '1', amountInStock: 3, salePrice: 12900, onSale: true });
});
