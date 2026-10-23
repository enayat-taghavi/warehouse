const path = require('path');
let puppeteer;
try {
  puppeteer = require('puppeteer');
} catch (e) {
  puppeteer = require(path.join(__dirname, '..', '..', 'frontend', 'node_modules', 'puppeteer'));
}

const fs = require('fs');

const SCREENSHOT_DIR = path.join(__dirname, '..', '..', 'Documents', 'Browser_E2E_Comprehensive_Testing', 'screenshots');
const BRAIN_SCREENSHOT_DIR = path.join('C:', 'Users', 'Payandeh', '.gemini', 'antigravity-ide', 'brain', '9895c218-8cfc-4133-b5d3-ec95fa17e527');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

function getExecutablePath() {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return undefined;
}

async function createBrowser() {
  const executablePath = getExecutablePath();
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath,
    defaultViewport: { width: 1440, height: 900 },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security']
  });
  return browser;
}

async function loginViaApi(page, username, password = 'Password123!') {
  await page.goto('http://localhost:4200/login', { waitUntil: 'networkidle0', timeout: 30000 });
  
  const res = await page.evaluate(async (u, p) => {
    try {
      const res = await fetch('/api/auth/login/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, password: p })
      });
      if (!res.ok) return { success: false, status: res.status };
      const data = await res.json();
      const token = data.tokens ? data.tokens.access : (data.access || data.token);
      const refresh = data.tokens ? data.tokens.refresh : data.refresh;
      
      localStorage.setItem('wh_access_token', token);
      if (refresh) localStorage.setItem('wh_refresh_token', refresh);
      localStorage.setItem('wh_user_profile', JSON.stringify(data.user || data.profile || data));

      // Get Shiraz warehouse id
      const whRes = await fetch('/api/warehouses/', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const whData = await whRes.json();
      const list = whData.results || whData;
      const shiraz = list.find(w => w.name && w.name.includes('شیراز')) || list[0];
      if (shiraz) {
        localStorage.setItem('wh_active_id', String(shiraz.id));
      }

      return { success: true, token, whId: shiraz?.id, user: data.user };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }, username, password);

  return res;
}

async function captureScreenshot(page, name) {
  const filePath1 = path.join(SCREENSHOT_DIR, `${name}.png`);
  const filePath2 = path.join(BRAIN_SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: filePath1, fullPage: true });
  try {
    fs.copyFileSync(filePath1, filePath2);
  } catch (e) {}
  console.log(`[Screenshot Saved] -> ${name}.png`);
  return filePath1;
}

module.exports = {
  createBrowser,
  loginViaApi,
  captureScreenshot,
  SCREENSHOT_DIR
};
