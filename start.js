// 더블클릭 실행용: 키 입력(.env) → 연결 점검 → 대시보드 열기
import fs from 'node:fs';
import readline from 'node:readline';
import { spawnSync, exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
process.chdir(ROOT);
const ENV = path.join(ROOT, '.env');

function readEnv() {
  const env = {};
  if (fs.existsSync(ENV)) {
    for (const line of fs.readFileSync(ENV, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m) env[m[1]] = m[2];
    }
  }
  return env;
}

const env = readEnv();
if (!env.COUPANG_VENDOR_ID || !env.COUPANG_ACCESS_KEY || !env.COUPANG_SECRET_KEY) {
  console.log('\n처음 실행입니다. 쿠팡 Wing에서 발급받은 값을 붙여넣고 Enter를 누르세요.\n');
  const rl = readline.createInterface({ input: process.stdin });
  const lines = rl[Symbol.asyncIterator]();
  const ask = async (q) => { process.stdout.write(q); return ((await lines.next()).value ?? '').trim(); };
  env.COUPANG_VENDOR_ID = await ask('업체코드 (예: A00123456): ');
  env.COUPANG_ACCESS_KEY = await ask('Access Key: ');
  env.COUPANG_SECRET_KEY = await ask('Secret Key: ');
  rl.close();
  fs.writeFileSync(ENV, Object.entries({ PORT: '3000', ...env }).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
  console.log('\n저장했습니다. (이 폴더의 .env 파일 — 키를 바꾸려면 이 파일을 지우고 다시 실행)\n');
}

try {
  const ip = (await (await fetch('https://api.ipify.org', { signal: AbortSignal.timeout(5000) })).text()).trim();
  if (/^[\d.:a-f]+$/i.test(ip)) console.log(`이 PC의 공인 IP: ${ip}  ← 쿠팡 Wing OPEN API 설정에 이 IP가 등록돼 있어야 합니다.\n`);
} catch {}

console.log('쿠팡 API 연결을 점검합니다...\n');
spawnSync(process.execPath, ['check.js'], { stdio: 'inherit' });

const port = env.PORT || process.env.PORT || 3000;
const url = `http://localhost:${port}`;
await import('./server.js');
const opener = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
setTimeout(() => exec(opener), 800);
console.log(`\n대시보드가 브라우저에서 열립니다. 이 창을 닫으면 대시보드도 꺼집니다.`);
