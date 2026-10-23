const puppeteer = require('puppeteer');

(async () => {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();

  // Listen to all console messages and errors
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.type().toUpperCase(), msg.text()));
  page.on('pageerror', err => console.log('BROWSER PAGE ERROR:', err.message));
  page.on('requestfailed', req => console.log('BROWSER NETWORK FAILED:', req.url(), req.failure()?.errorText));

  console.log('Navigating to login...');
  await page.goto('http://localhost:4200/login', { waitUntil: 'networkidle2' });

  console.log('Logging in...');
  await page.type('input[type="text"]', 'admin');
  await page.type('input[type="password"]', '123');
  await page.click('button[type="submit"]');

  console.log('Waiting for navigation to dashboard...');
  await page.waitForNavigation({ waitUntil: 'networkidle2' });

  console.log('Navigating to counter dashboard...');
  await page.goto('http://localhost:4200/counter', { waitUntil: 'networkidle2' });

  console.log('Waiting on counter dashboard for 5 seconds...');
  await new Promise(r => setTimeout(r, 5000));

  console.log('Taking screenshot and dumping state...');
  await page.screenshot({ path: 'debug_screenshot.png' });
  
  const content = await page.content();
  if (content.includes('animate-spin')) {
    console.log('SPINNER IS STILL IN DOM');
  } else {
    console.log('SPINNER IS GONE');
  }

  await browser.close();
  console.log('Done.');
})();
