const puppeteer = require('puppeteer');
const { performance } = require('perf_hooks');

(async () => {
  console.log('Starting Puppeteer...');
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  try {
    console.log('Navigating to http://localhost:4200/login ...');
    await page.goto('http://localhost:4200/login');
    
    // Login
    console.log('Typing credentials...');
    await page.waitForSelector('input[type="text"]');
    const inputs = await page.$$('input');
    await inputs[0].type('ali');
    await inputs[1].type('123456');
    await page.click('button[type="submit"]');
    
    console.log('Waiting for login to complete...');
    await page.waitForNavigation({ waitUntil: 'networkidle0' });
    
    console.log('Navigating to Counter Dashboard if not already there...');
    // If not on counter dashboard, we might need to click the tab
    // Let's just go directly to the URL if possible, or wait for the tabs
    await page.goto('http://localhost:4200/counter');
    await page.waitForSelector('button', { timeout: 10000 });
    
    // Wait for tasks to load (find the text "همه تسک‌ها")
    console.log('Waiting for tasks to load...');
    await page.waitForFunction(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.some(b => b.textContent.includes('همه تسک‌ها'));
    });
    
    // Measure time to click "باقیمانده‌ها"
    console.log('Clicking "باقیمانده‌ها"...');
    let start = performance.now();
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('باقیمانده‌ها'));
      if(btn) btn.click();
    });
    // Wait for Angular to render
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve))); // Wait 2 frames
    let end = performance.now();
    console.log(`Time taken to switch to 'remaining': ${(end - start).toFixed(2)} ms`);
    
    // Measure time to click "شمرده شده‌ها"
    console.log('Clicking "شمرده شده‌ها"...');
    start = performance.now();
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('شمرده شده‌ها'));
      if(btn) btn.click();
    });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
    end = performance.now();
    console.log(`Time taken to switch to 'completed': ${(end - start).toFixed(2)} ms`);
    
    // Count items in DOM
    const itemsCount = await page.evaluate(() => {
      // Find cards
      return document.querySelectorAll('div.bg-white.rounded-xl.p-4.border.transition-all').length;
    });
    console.log(`Currently displaying ${itemsCount} items in the DOM.`);
    
    // Check console logs
    console.log('Checking if there were any console errors...');
  } catch (err) {
    console.error('Error during script:', err);
  } finally {
    await browser.close();
  }
})();
