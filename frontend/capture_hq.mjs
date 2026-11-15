import { chromium } from 'playwright';
const OUT = process.env.OUT;
const wait = (ms)=>new Promise(r=>setTimeout(r,ms));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1040 }, deviceScaleFactor: 3 });
const log = (...a)=>console.log(...a);
try {
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle', timeout: 30000 });
  await wait(1200);
  const openLogin = async () => {
    const direct = page.getByRole('button', { name: /로그인.*회원가입|로그인 \/ 회원가입/ });
    if (await direct.count()) { await direct.first().click(); return true; }
    const menuBtns = await page.getByRole('button').all();
    for (const b of menuBtns) { try { await b.click({timeout:500}); } catch{}
      const d = page.getByText('로그인 / 회원가입'); if (await d.count()){ await d.first().click(); return true; } }
    return false;
  };
  await openLogin();
  await wait(600);
  const loginTab = page.getByRole('button', { name: '로그인', exact: true });
  if (await loginTab.count()) { try{ await loginTab.first().click({timeout:1500}); }catch{} }
  await wait(300);
  await page.locator('input[type="email"]').fill('webdemo40680@example.com');
  await page.locator('input[type="password"]').fill(process.env.DEMO_PASSWORD);
  await page.getByRole('button', { name: /^로그인$|처리 중/ }).last().click();
  await wait(3500);
  log('로그인 시도 완료, 현재 URL:', page.url());

  const tabs = [['dashboard','대시보드'],['records','검진결과 조회'],['history','히스토리'],['analysis','건강분석']];
  for (const [key,label] of tabs){
    try{
      const t = page.getByRole('button', { name: label, exact: false });
      await t.first().click({ timeout: 3000 });
      await wait(2800);
      await page.screenshot({ path: `${OUT}/앱_${key}.png`, fullPage: true });
      log('캡처:', key);
    }catch(e){ log('탭 실패', key, e.message); }
  }
} catch(e){ log('ERR', e.message); await page.screenshot({ path: `${OUT}/_error.png` }).catch(()=>{}); }
await browser.close();
