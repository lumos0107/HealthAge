// 7개 섹션을 실계정으로 순회하며 스크린샷을 남긴다.
// 사용: DEMO_EMAIL=... DEMO_PASSWORD=... node capture_sections.mjs  (dev 서버와 백엔드가 켜져 있어야 함)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const EMAIL = process.env.DEMO_EMAIL;
const PASSWORD = process.env.DEMO_PASSWORD;
if (!EMAIL || !PASSWORD) {
  console.error('DEMO_EMAIL / DEMO_PASSWORD 환경변수가 필요합니다. 예: DEMO_EMAIL=... DEMO_PASSWORD=... node capture_sections.mjs');
  process.exit(1);
}
const SECTIONS = ['대시보드', '종합 분석', '히스토리', '검진 기록', '업로드·입력', '도구·참고', '내 정보'];

mkdirSync('screenshots', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

await page.goto('http://127.0.0.1:5173');
await page.fill('input[type=email]', EMAIL);
await page.fill('input[type=password]', PASSWORD);
await page.click('button:has-text("로그인")');
await page.waitForSelector('nav button', { timeout: 20000 });
await page.waitForTimeout(3000); // 전역 데이터 로드 대기

for (const [i, label] of SECTIONS.entries()) {
  await page.click(`nav button:has-text("${label}")`);
  await page.waitForTimeout(1500);
  const file = `screenshots/${String(i + 1).padStart(2, '0')}-${label.replace(/[·\s]/g, '')}.png`;
  await page.screenshot({ path: file, fullPage: true });
  console.log('saved', file);
}

await browser.close();
