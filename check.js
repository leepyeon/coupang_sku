// 연결 점검: npm run check
// .env의 키로 상품 목록 → 아이템 → 수량/가격/상태 조회를 차례로 호출해 봅니다.
import fs from 'node:fs';
import { CoupangClient } from './lib/coupang.js';

if (fs.existsSync('.env')) {
  for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const { COUPANG_ACCESS_KEY: accessKey, COUPANG_SECRET_KEY: secretKey, COUPANG_VENDOR_ID: vendorId } = process.env;
if (!accessKey || !secretKey || !vendorId) {
  console.error('✗ .env에 COUPANG_ACCESS_KEY / COUPANG_SECRET_KEY / COUPANG_VENDOR_ID를 모두 입력하세요.');
  process.exit(1);
}

const client = new CoupangClient({ accessKey, secretKey, vendorId });
const fail = (step, e) => {
  console.error(`✗ ${step} 실패: ${e.message}${e.status ? ` (HTTP ${e.status})` : ''}`);
  if (e.body) console.error(JSON.stringify(e.body, null, 2));
  if (e.status === 401 || e.status === 403) {
    console.error('→ 키 오타, Wing에 이 PC의 공인 IP가 등록됐는지, PC 시계가 정확한지 확인하세요.');
  }
  process.exit(1);
};

console.log(`업체코드 ${vendorId}로 점검합니다.\n`);

let products;
try { products = await client.listSellerProducts(5); } catch (e) { fail('1) 상품 목록 조회', e); }
console.log(`✓ 1) 인증 성공, 상품 ${products.length}개 확인`);
products.forEach((p) => console.log(`   - ${p.sellerProductId}  ${p.sellerProductName ?? ''}`));
if (!products.length) process.exit(0);

let items;
try { items = await client.getSellerProductItems(products[0].sellerProductId); } catch (e) { fail('2) 상품 아이템 조회', e); }
console.log(`✓ 2) 상품 ${products[0].sellerProductId}의 아이템 ${items.length}개`);
if (!items.length) process.exit(0);

try {
  const inv = await client.getInventory(items[0].vendorItemId);
  console.log('✓ 3) 수량/가격/상태 조회 성공');
  console.log(`   vendorItemId ${inv.vendorItemId} · 재고 ${inv.amountInStock} · 판매가 ${inv.salePrice} · 판매중 ${inv.onSale}`);
} catch (e) { fail('3) 수량/가격/상태 조회', e); }

console.log('\n모두 정상입니다. npm start 후 대시보드에서 조회하세요.');
