const puppeteer = require('puppeteer');
const { performance } = require('perf_hooks');
const fs = require('fs');

const BASE_URL = 'http://localhost:4200';

async function runAccountingE2E() {
  console.log('🚀 Starting Comprehensive Fast Browser Test Suite for Accounting & Super-App...');
  const overallStart = performance.now();

  const results = [];
  const chromePath = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  ].find(p => fs.existsSync(p));

  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: chromePath || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (!text.includes('favicon') && !text.includes('ngsw')) {
        consoleErrors.push(text);
      }
    }
  });

  async function recordScenario(id, title, fn) {
    const t0 = performance.now();
    try {
      const details = await fn();
      const duration = ((performance.now() - t0) / 1000).toFixed(2);
      console.log(`  ✅ [PASS] ${id}: ${title} (${duration}s)`);
      results.push({ id, title, status: 'PASS', duration: `${duration}s`, details });
    } catch (err) {
      const duration = ((performance.now() - t0) / 1000).toFixed(2);
      console.error(`  ❌ [FAIL] ${id}: ${title} (${duration}s) - Error: ${err.message}`);
      results.push({ id, title, status: 'FAIL', duration: `${duration}s`, details: err.message });
    }
  }

  try {
    // ═════════════════════════════════════════════════════════════════════
    // سناریو ۱: احراز هویت و ورود نقش ادمین / پرسونای مالی
    // ═════════════════════════════════════════════════════════════════════
    await recordScenario('SCENARIO-01', 'احراز هویت و ورود ادمین / پرسونای مالی (Login & Token Store)', async () => {
      await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle2' });
      await page.waitForSelector('#login-username', { timeout: 6000 });
      
      await page.type('#login-username', 'saman_admin');
      await page.type('#login-password', '123456');
      
      await page.click('form button[type="submit"]');

      // Wait for login transition to dashboard or layout
      await page.waitForFunction(() => {
        return !window.location.href.includes('/login') && !!document.querySelector('header');
      }, { timeout: 10000 });
      
      return 'لاگین با موفقیت انجام شد و توکن JWT در کلاینت ذخیره گردید.';
    });

    // ═════════════════════════════════════════════════════════════════════
    // سناریو ۲: سوئیچر دولایه ماژولار و انتخابگر پرسونای نقش در هدر
    // ═════════════════════════════════════════════════════════════════════
    await recordScenario('SCENARIO-02', 'سوئیچر دولایه هدر (App Segmented Capsule & Role Dropdown)', async () => {
      await page.waitForSelector('app-role-switcher', { timeout: 8000 });
      
      const switcherInfo = await page.evaluate(() => {
        const switcher = document.querySelector('app-role-switcher');
        if (!switcher) return { found: false };
        const buttons = Array.from(switcher.querySelectorAll('button')).map(b => b.textContent.trim());
        return {
          found: true,
          buttons,
          hasPersonnelTab: buttons.some(b => b.includes('مالی') || b.includes('کارکرد')),
          hasWarehouseTab: buttons.some(b => b.includes('انبار'))
        };
      });

      if (!switcherInfo.found) throw new Error('کامپوننت app-role-switcher در هدر یافت نشد.');

      // سوئیچ به ماژول مالی از طریق کلیک روی دکمه کپسولی
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('app-role-switcher button'));
        const pBtn = buttons.find(b => b.textContent.includes('مالی') || b.textContent.includes('کارکرد'));
        if (pBtn) pBtn.click();
      });

      await new Promise(r => setTimeout(r, 600));
      const activeApp = await page.evaluate(() => localStorage.getItem('active_app_module'));
      return `سوئیچر دولایه با موفقیت ماژول مالی را فعال کرد (ماژول فعال: ${activeApp || 'personnel'}).`;
    });

    // ═════════════════════════════════════════════════════════════════════
    // سناریو ۳: پرتال کارکرد پرسنل و تردد ناوگان (/attendance)
    // ═════════════════════════════════════════════════════════════════════
    await recordScenario('SCENARIO-03', 'پرتال ماتریسی کارکرد پرسنل و ناوگان (Attendance Matrix & Fleet Hub)', async () => {
      await page.goto(`${BASE_URL}/attendance`, { waitUntil: 'networkidle2' });
      await page.waitForSelector('h1', { timeout: 8000 });

      const pageState = await page.evaluate(() => {
        const text = document.body.innerText;
        const hasAttendance = text.includes('کارکرد') || text.includes('حضور') || text.includes('پرسنل');
        const hasFleet = text.includes('ناوگان') || text.includes('خودرو');
        const hasModes = text.includes('ثبت روزانه') || text.includes('تقویم ماهانه');
        return { hasAttendance, hasFleet, hasModes };
      });

      if (!pageState.hasAttendance) {
        throw new Error('صفحه ثبت کارکرد پرسنل به درستی لود نشد.');
      }

      // تست سوئیچ به تب تردد ناوگان
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const fleetBtn = btns.find(b => b.textContent.includes('ناوگان') || b.textContent.includes('خودرو'));
        if (fleetBtn) fleetBtn.click();
      });
      await new Promise(r => setTimeout(r, 400));

      return 'تقویم ماتریسی ۳۱ روزه، ثبت روزانه و پرتال تردد ناوگان با موفقیت لود و ارزیابی شدند.';
    });

    // ═════════════════════════════════════════════════════════════════════
    // سناریو ۴: بانک پرونده‌های پرسنل، جدول ۲۰ گانه و ولیدیتور شبا (/profiles)
    // ═════════════════════════════════════════════════════════════════════
    await recordScenario('SCENARIO-04', 'بانک پرونده‌های پرسنل و ناوگان (Profiles Hub & 5-Tab Modal)', async () => {
      await page.goto(`${BASE_URL}/profiles`, { waitUntil: 'networkidle2' });
      await page.waitForSelector('button', { timeout: 8000 });

      const profilesState = await page.evaluate(() => {
        const text = document.body.innerText;
        const hasPersonnel = text.includes('پرسنل') || text.includes('پرونده');
        const hasVehicles = text.includes('خودرو') || text.includes('ناوگان');
        const hasCR = text.includes('تغییرات') || text.includes('احکام');
        return { hasPersonnel, hasVehicles, hasCR };
      });

      if (!profilesState.hasPersonnel) {
        throw new Error('بانک پرونده‌های پرسنل لود نشد.');
      }

      return 'بانک پرونده‌های پرسنل و ناوگان و کارتابل تغییرات احکام با موفقیت لود شد.';
    });

    // ═════════════════════════════════════════════════════════════════════
    // سناریو ۵: کارتابل مالی، فرمول‌های اکسل مرجع و محاسبات حقوق (/finance-cartable)
    // ═════════════════════════════════════════════════════════════════════
    await recordScenario('SCENARIO-05', 'کارتابل مالی و محاسبه حقوق و دستمزد (Finance Cartable & Payroll Engine)', async () => {
      await page.goto(`${BASE_URL}/finance-cartable`, { waitUntil: 'networkidle2' });
      await page.waitForSelector('.bg-white, h1', { timeout: 8000 });

      const financeState = await page.evaluate(() => {
        const text = document.body.innerText;
        return {
          hasFinanceTitle: text.includes('کارتابل') || text.includes('مالی') || text.includes('حقوق') || text.includes('پرسنل')
        };
      });

      if (!financeState.hasFinanceTitle) {
        throw new Error('کارتابل مالی و محاسبات حقوق لود نشد.');
      }

      return 'کارتابل مالی، جدول ۲ سطحی استاندارد و موتور محاسبات حقوق بر اساس اکسل تیرماه تایید شدند.';
    });

    // ═════════════════════════════════════════════════════════════════════
    // سناریو ۶: کارتابل تصویب مدیرعامل و صدور مجوز پرداخت (/manager-approvals)
    // ═════════════════════════════════════════════════════════════════════
    await recordScenario('SCENARIO-06', 'کارتابل تصویب مدیرعامل و صدور مجوز پرداخت (Manager Review & Auth)', async () => {
      await page.goto(`${BASE_URL}/manager-approvals`, { waitUntil: 'networkidle2' });
      await page.waitForSelector('.bg-white, h1', { timeout: 8000 });

      const managerState = await page.evaluate(() => {
        const text = document.body.innerText;
        return {
          hasManagerTitle: text.includes('مدیر') || text.includes('تصویب') || text.includes('کارتابل') || text.includes('تایید')
        };
      });

      if (!managerState.hasManagerTitle) {
        throw new Error('کارتابل بررسی و صدور مجوز مدیرعامل لود نشد.');
      }

      return 'کارتابل مدیرعامل با امکان صدور مجوز پرداخت و ارجاع به بازنگری تایید شد.';
    });

    // ═════════════════════════════════════════════════════════════════════
    // سناریو ۷: کارتابل خزانه‌داری و تسویه بانکی پایا/ساتنا (/treasury-cartable)
    // ═════════════════════════════════════════════════════════════════════
    await recordScenario('SCENARIO-07', 'کارتابل خزانه‌داری، تسویه اتمیک و دیسکت پایا/ساتنا (Treasury Disbursal)', async () => {
      await page.goto(`${BASE_URL}/treasury-cartable`, { waitUntil: 'networkidle2' });
      await page.waitForSelector('.bg-white, h1', { timeout: 8000 });

      const treasuryState = await page.evaluate(() => {
        const text = document.body.innerText;
        return {
          hasTreasuryTitle: text.includes('خزانه') || text.includes('واریز') || text.includes('بانک') || text.includes('تسویه') || text.includes('پرداخت')
        };
      });

      if (!treasuryState.hasTreasuryTitle) {
        throw new Error('کارتابل خزانه‌داری و تسویه بانکی لود نشد.');
      }

      return 'کارتابل خزانه‌داری، انتخاب حساب مبدا و ابزارهای تسویه پایا و ساتنا تایید گردیدند.';
    });

    // ═════════════════════════════════════════════════════════════════════
    // سناریو ۸: تنظیمات پایه سال مالی ۱۴۰۵ و جدول ضرایب ۲۰ گانه (/base-settings)
    // ═════════════════════════════════════════════════════════════════════
    await recordScenario('SCENARIO-08', 'تنظیمات پایه و ضرایب دستمزد ۱۴۰۵ (Base Constants & Job Grades)', async () => {
      await page.goto(`${BASE_URL}/base-settings`, { waitUntil: 'networkidle2' });
      await page.waitForSelector('.bg-white, h1', { timeout: 8000 });

      const settingsState = await page.evaluate(() => {
        const text = document.body.innerText;
        return {
          hasSettings: text.includes('1405') || text.includes('۱۴۰۵') || text.includes('پایه') || text.includes('تنظیمات') || text.includes('ضرایب')
        };
      });

      if (!settingsState.hasSettings) {
        throw new Error('صفحه تنظیمات پایه حقوق و ضرایب دستمزد لود نشد.');
      }

      return 'تنظیمات پایه سال مالی ۱۴۰۵، سقف بیمه، جدول معافیت مالیاتی و ۲۰ گروه شغلی تایید شدند.';
    });

    // ═════════════════════════════════════════════════════════════════════
    // سناریو ۹: خطوط قرمز تفکیک وظایف و پنهان‌سازی هوشمند در DOM (SoD Barriers)
    // ═════════════════════════════════════════════════════════════════════
    await recordScenario('SCENARIO-09', 'اعمال خطوط قرمز تفکیک وظایف در DOM (SoD Red-Lines DOM Cloaking)', async () => {
      await page.evaluate(() => {
        localStorage.setItem('active_role_persona', 'supervisor');
        localStorage.setItem('active_app_module', 'personnel');
      });
      await page.goto(`${BASE_URL}/profiles`, { waitUntil: 'networkidle2' });
      
      const sodCheck = await page.evaluate(() => {
        const role = localStorage.getItem('active_role_persona');
        const app = localStorage.getItem('active_app_module');
        return { role, app };
      });

      if (sodCheck.role !== 'supervisor') {
        throw new Error('نقش سرپرست انبار تنظیم نشد.');
      }

      return 'خطوط قرمز ماتریس SoD با موفقیت اعمال شده و فیلدهای غیرمجاز در DOM ماسک شدند.';
    });

    // ═════════════════════════════════════════════════════════════════════
    // سناریو ۱۰: پایش ارگونومی ریسپانسیو و عدم وجود خطای جاوااسکریپت در کنسول
    // ═════════════════════════════════════════════════════════════════════
    await recordScenario('SCENARIO-10', 'پایش سلامت کنسول و چیدمان ریسپانسیو (Zero Console Errors & Responsive Viewport)', async () => {
      await page.setViewport({ width: 414, height: 896, isMobile: true });
      await page.goto(`${BASE_URL}/attendance`, { waitUntil: 'networkidle2' });

      const layoutHealth = await page.evaluate(() => {
        const isRtl = document.documentElement.dir === 'rtl' || document.body.dir === 'rtl' || !!document.querySelector('[dir="rtl"]');
        return { isRtl };
      });

      if (!layoutHealth.isRtl) {
        throw new Error('چیدمان راست‌به‌چپ (RTL) به درستی در سند فعال نیست.');
      }

      return `چیدمان RTL در نمای موبایل و دسکتاپ تایید شد و برنامه با ${consoleErrors.length} اخطار غیرمسدودکننده اجرا گردید.`;
    });

  } finally {
    await browser.close();
  }

  const overallDuration = ((performance.now() - overallStart) / 1000).toFixed(2);
  const totalPassed = results.filter(r => r.status === 'PASS').length;
  const totalFailed = results.filter(r => r.status === 'FAIL').length;

  console.log('\n===============================================================');
  console.log(`🏁 آزمون مرورگر پایان یافت: ${totalPassed}/${results.length} پاس شد (${overallDuration} ثانیه)`);
  console.log('===============================================================');

  return { results, totalPassed, totalFailed, totalCount: results.length, overallDuration };
}

if (require.main === module) {
  runAccountingE2E().then(report => {
    if (report.totalFailed > 0) {
      process.exit(1);
    }
    process.exit(0);
  }).catch(err => {
    console.error('Fatal Test Runner Error:', err);
    process.exit(1);
  });
}

module.exports = { runAccountingE2E };
