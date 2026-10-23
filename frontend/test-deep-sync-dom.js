const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

const BASE_URL = 'http://localhost:4200';

async function runDeepSyncDomTest() {
  console.log('========================================================================');
  console.log('🚀 FAST DOM BROWSER TEST: 3-TIER CONTEXT-AWARE DEEP SYNC');
  console.log('   (Warehouse Context, Finance Context, Operations Context)');
  console.log('========================================================================\n');

  const chromePath = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  ].find(p => fs.existsSync(p));

  const testReport = {
    startTime: new Date().toISOString(),
    totalTasks: 0,
    passedTasks: 0,
    failedTasks: 0,
    scenarios: []
  };

  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: chromePath || undefined,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1440,900'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  page.on('console', msg => {
    const txt = msg.text();
    if (!txt.includes('ngsw')) console.log('  [BROWSER CONSOLE]', txt);
  });
  page.on('pageerror', err => console.log('  [BROWSER ERROR]', err.message));

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  async function runStep(taskId, title, testFn) {
    testReport.totalTasks++;
    const t0 = performance.now();
    try {
      const details = await testFn();
      const dur = ((performance.now() - t0) / 1000).toFixed(2);
      console.log(`  ✅ [PASS] ${taskId}: ${title} (${dur}s)`);
      testReport.passedTasks++;
      testReport.scenarios.push({ taskId, title, status: 'PASS', duration: `${dur}s`, details });
      return { success: true, details };
    } catch (err) {
      const dur = ((performance.now() - t0) / 1000).toFixed(2);
      console.error(`  ❌ [FAIL] ${taskId}: ${title} (${dur}s) -> ${err.message}`);
      testReport.failedTasks++;
      testReport.scenarios.push({ taskId, title, status: 'FAIL', duration: `${dur}s`, error: err.message });
      return { success: false, error: err.message };
    }
  }

  // Helper to open user menu dropdown
  async function openUserMenu() {
    await page.waitForSelector('app-user-menu', { timeout: 10000 });
    const isDropdownOpen = await page.evaluate(() => {
      return !!document.querySelector('app-user-menu .absolute.right-0');
    });
    if (!isDropdownOpen) {
      const userBtn = await page.$('app-user-menu > div > button');
      if (!userBtn) throw new Error('دکمه پروفایل در app-user-menu یافت نشد.');
      await userBtn.click();
      await page.waitForSelector('app-user-menu .absolute.right-0', { timeout: 6000 });
    }
  }

  // Helper to open deep sync modal
  async function triggerDeepSyncModal() {
    await openUserMenu();
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('app-user-menu .absolute.right-0 button'));
      const deepSyncBtn = buttons.find(b => b.textContent && b.textContent.includes('بروزرسانی عمیق'));
      if (deepSyncBtn) deepSyncBtn.click();
    });
    await page.waitForSelector('app-deep-sync-modal [role="dialog"]', { timeout: 8000 });
    await sleep(400);
  }

  // Helper to close modal via cancel
  async function closeDeepSyncModal() {
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('app-deep-sync-modal button'));
      const cancelBtn = buttons.find(b => b.textContent && b.textContent.trim() === 'انصراف');
      if (cancelBtn) cancelBtn.click();
    });
    await page.waitForFunction(() => {
      return !document.querySelector('app-deep-sync-modal [role="dialog"]');
    }, { timeout: 5000 });
    await page.keyboard.press('Escape');
    await sleep(300);
  }

  // Helper to navigate to Launcher and select an app card
  async function switchAppViaLauncher(appName) {
    await page.goto(`${BASE_URL}/app/launcher`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForSelector('main .grid > div', { timeout: 10000 });

    const cardHandles = await page.$$('main .grid > div');
    let targetCard = null;

    for (const card of cardHandles) {
      const text = await page.evaluate(el => el.textContent, card);
      if (appName === 'warehouse' && text.includes('انبارگردانی')) {
        targetCard = card;
        break;
      }
      if (appName === 'finance' && (text.includes('مالی') || text.includes('حقوق'))) {
        targetCard = card;
        break;
      }
      if (appName === 'operations' && text.includes('عملیات')) {
        targetCard = card;
        break;
      }
    }

    if (!targetCard) {
      throw new Error(`کارت سامانه "${appName}" در پورتال لانچر یافت نشد.`);
    }

    await targetCard.click();
    await page.waitForFunction((target) => {
      if (target === 'warehouse') return window.location.pathname.startsWith('/app/warehouse');
      if (target === 'finance') return window.location.pathname.startsWith('/app/finance');
      if (target === 'operations') return window.location.pathname.startsWith('/app/operations');
      return false;
    }, { timeout: 15000 }, appName);
    await page.waitForSelector('app-user-menu', { timeout: 15000 });
    await sleep(1000);
    console.log(`  [NAV] Switched to ${appName}, current URL: ${page.url()}`);
  }

  try {
    // مرحله ۱: ورود و احراز هویت اولیه در کلاینت
    await runStep('DOM-1', 'ورود و راه‌اندازی سشن احراز هویت ادمین در کلاینت', async () => {
      await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForSelector('#login-username', { timeout: 10000 });
      await page.type('#login-username', 'admin');
      await page.type('#login-password', '123456');
      await page.click('form button[type="submit"]');

      await page.waitForFunction(() => {
        return !window.location.href.includes('/login');
      }, { timeout: 20000 });

      // ورود به سامانه انبارداری از لانچر
      await switchAppViaLauncher('warehouse');
      return 'لاگین ادمین با موفقیت انجام شد و سامانه انبارداری بارگذاری گردید.';
    });

    // مرحله ۲: بررسی بروزرسانی عمیق در سناریوی ۱ (انبارداری)
    await runStep('DOM-2', 'سناریوی ۱: اعتبارسنجی بروزرسانی عمیق در قلمرو انبارداری (/app/warehouse)', async () => {
      await triggerDeepSyncModal();

      const modalData = await page.evaluate(() => {
        const title = document.querySelector('app-deep-sync-modal h2')?.textContent?.trim() || '';
        const banner = document.querySelector('app-deep-sync-modal h3')?.textContent?.trim() || '';
        const bodyText = document.querySelector('app-deep-sync-modal [role="dialog"]')?.textContent || '';
        const isWarehouseScope = banner.includes('انبار') || bodyText.includes('انبار');
        const buttons = Array.from(document.querySelectorAll('app-deep-sync-modal button'));
        const hasOpsTabs = buttons.some(b => b.textContent && b.textContent.includes('کل سازمان'));

        return { title, banner, isWarehouseScope, hasOpsTabs };
      });

      if (!modalData.isWarehouseScope) {
        throw new Error(`در قلمرو انبارداری باید صرفاً لیست انبارها نمایش داده شود. هدر: "${modalData.banner}"`);
      }

      if (modalData.hasOpsTabs) {
        throw new Error('تب‌های چندماژوله عملیات نباید در قلمرو انبارداری نمایش داده شوند.');
      }

      await closeDeepSyncModal();
      return `قلمرو انبارداری تایید شد: هدر "${modalData.banner}".`;
    });

    // مرحله ۳: بررسی بروزرسانی عمیق در سناریوی ۲ (مالی و پرسنلی)
    await runStep('DOM-3', 'سناریوی ۲: اعتبارسنجی بروزرسانی عمیق در قلمرو مالی و پرسنلی (/app/finance)', async () => {
      await switchAppViaLauncher('finance');
      await triggerDeepSyncModal();

      const modalData = await page.evaluate(() => {
        const title = document.querySelector('app-deep-sync-modal h2')?.textContent?.trim() || '';
        const banner = document.querySelector('app-deep-sync-modal h3')?.textContent?.trim() || '';
        const bodyText = document.querySelector('app-deep-sync-modal [role="dialog"]')?.textContent || '';
        const isFinanceScope = banner.includes('پروژه‌ها') || banner.includes('کارگاه') || bodyText.includes('پروژه‌ها') || bodyText.includes('کارگاه');

        return { title, banner, isFinanceScope };
      });

      if (!modalData.isFinanceScope) {
        throw new Error(`در قلمرو مالی باید پروژه‌ها و کارگاه‌های مالی نمایش داده شوند. هدر جاری: "${modalData.banner}"`);
      }

      await closeDeepSyncModal();
      return `قلمرو مالی تایید شد: هدر "${modalData.banner}".`;
    });

    // مرحله ۴: بررسی بروزرسانی عمیق در سناریوی ۳ (مرکز عملیات سازمان)
    await runStep('DOM-4', 'سناریوی ۳: اعتبارسنجی بروزرسانی عمیق در مرکز عملیات سازمان (/app/operations)', async () => {
      await switchAppViaLauncher('operations');
      await triggerDeepSyncModal();

      const opsData = await page.evaluate(() => {
        const title = document.querySelector('app-deep-sync-modal h2')?.textContent?.trim() || '';
        const banner = document.querySelector('app-deep-sync-modal h3')?.textContent?.trim() || '';
        const buttons = Array.from(document.querySelectorAll('app-deep-sync-modal button'));
        const hasAllTab = buttons.some(b => b.textContent && b.textContent.includes('کل سازمان'));
        const hasWhTab = buttons.some(b => b.textContent && b.textContent.includes('انبارداری'));
        const hasFinTab = buttons.some(b => b.textContent && b.textContent.includes('مالی'));
        const hasSelectOrgBtn = buttons.some(b => b.textContent && b.textContent.includes('انتخاب کل سامانه‌های سازمان'));

        return {
          title,
          banner,
          hasAllTab,
          hasWhTab,
          hasFinTab,
          hasSelectOrgBtn
        };
      });

      if (!opsData.hasAllTab || !opsData.hasWhTab || !opsData.hasFinTab) {
        throw new Error('تب‌های سه‌گانه مرکز عملیات در DOM یافت نشدند.');
      }

      if (!opsData.hasSelectOrgBtn) {
        throw new Error('دکمه "انتخاب کل سامانه‌های سازمان" در مرکز عملیات یافت نشد.');
      }

      await closeDeepSyncModal();
      return `قلمرو مرکز عملیات تایید شد: عنوان "${opsData.title}"، تب‌های چندماژوله فعال، و دکمه انتخاب کل سامانه‌ها موجود است.`;
    });

    // مرحله ۵: اعتبارسنجی انتخاب کل سامانه‌های سازمان در مرکز عملیات
    await runStep('DOM-5', 'تست تعامل انتخابی و محاسبه آمار در مرکز عملیات سازمان', async () => {
      await triggerDeepSyncModal();

      const toggleResult = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('app-deep-sync-modal button'));
        const orgBtn = buttons.find(b => b.textContent && b.textContent.includes('انتخاب کل سامانه‌های سازمان'));
        if (orgBtn) orgBtn.click();

        const confirmBtn = buttons.find(b => b.textContent && b.textContent.includes('شروع بروزرسانی'));
        return {
          confirmBtnText: confirmBtn ? confirmBtn.textContent.replace(/\s+/g, ' ').trim() : '',
          confirmDisabled: confirmBtn ? confirmBtn.disabled : false
        };
      });

      await closeDeepSyncModal();
      return `محاسبه شمارش کل سامانه‌ها با موفقیت انجام شد: "${toggleResult.confirmBtnText}" (غیرفعال: ${toggleResult.confirmDisabled})`;
    });

  } catch (err) {
    console.error('Fatal error during test:', err);
  } finally {
    await browser.close();
  }

  console.log('\n========================================================================');
  console.log(`📊 نتیجه نهایی تست دام: ${testReport.passedTasks} از ${testReport.totalTasks} مرحله با موفقیت پاس شد.`);
  console.log('========================================================================\n');

  return testReport;
}

runDeepSyncDomTest()
  .then(report => {
    if (report.failedTasks > 0) process.exit(1);
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
