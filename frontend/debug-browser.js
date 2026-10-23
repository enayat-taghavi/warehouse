const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  const chromePath = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  ].find(p => fs.existsSync(p));

  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: chromePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  console.log('1. Navigating to /login...');
  await page.goto('http://localhost:4200/login', { waitUntil: 'networkidle2' });

  console.log('2. Entering credentials...');
  await page.waitForSelector('#login-username');
  await page.type('#login-username', 'saman_admin');
  await page.type('#login-password', '123456');

  console.log('3. Clicking submit...');
  await page.click('form button[type="submit"]');

  console.log('4. Waiting 3 seconds for login transition...');
  await new Promise(r => setTimeout(r, 3000));

  const url = page.url();
  console.log('Current URL after login:', url);

  const title = await page.title();
  console.log('Page title:', title);

  const html = await page.content();
  console.log('Contains app-role-switcher?', html.includes('app-role-switcher'));
  console.log('Contains layout header?', html.includes('اتوماسیون انبار'));

  console.log('5. Navigating to /attendance...');
  await page.goto('http://localhost:4200/attendance', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));
  console.log('Attendance URL:', page.url());
  const attContent = await page.content();
  console.log('Contains attendance title?', attContent.includes('کارکرد پرسنل') || attContent.includes('ثبت و بازبینی'));

  console.log('6. Navigating to /finance-cartable...');
  await page.goto('http://localhost:4200/finance-cartable', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));
  console.log('Finance Cartable URL:', page.url());

  console.log('7. Navigating to /treasury-cartable...');
  await page.goto('http://localhost:4200/treasury-cartable', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));
  console.log('Treasury Cartable URL:', page.url());

  await browser.close();
})();
