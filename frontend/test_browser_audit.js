const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Helper to calculate valid Iranian national code for testing
function getValidNationalCode() {
  return '0010398041';
}

async function runComprehensiveBrowserAudit() {
  console.log('================================================================');
  console.log('🚀 STARTING REAL BROWSER E2E AUDIT WITH GOOGLE CHROME');
  console.log('Target Pages:');
  console.log('  1. /app/finance/employee-new-personnel');
  console.log('  2. /app/finance/employee-new-vehicle');
  console.log('================================================================\n');

  // 1. Authenticate with backend API
  console.log('▶ Step 1: Authenticating superuser admin_boss with backend...');
  const loginRes = await fetch('http://localhost:8000/api/auth/login/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin_boss', password: 'Admin1234!' })
  });

  if (!loginRes.ok) {
    throw new Error(`Authentication failed with HTTP ${loginRes.status}: ${await loginRes.text()}`);
  }
  const loginData = await loginRes.json();
  const tokens = loginData.tokens;
  const userProfile = { ...loginData.user, requires_password_change: false };
  console.log('✓ Successfully authenticated admin_boss with backend.');

  // 2. Launch Puppeteer with Chrome
  console.log('▶ Step 2: Launching Chrome executable...');
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--window-size=1440,900'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const screenshotsDir = path.join(__dirname, 'audit_screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  const auditReport = {
    timestamp: new Date().toISOString(),
    browser: 'Google Chrome (Puppeteer)',
    viewport: { width: 1440, height: 900 },
    consoleErrors: [],
    consoleWarnings: [],
    failedRequests: [],
    networkCalls: [],
    findings: [],
    personnelAudit: {},
    vehicleAudit: {},
    mobileAudit: {},
    navigationAudit: {}
  };

  // Monitor Console
  page.on('console', msg => {
    const text = msg.text();
    const type = msg.type();
    const location = msg.location() ? `${msg.location().url}:${msg.location().lineNumber}` : '';
    if (type === 'error') {
      auditReport.consoleErrors.push({ text, location });
      console.error(`🔴 [Browser Console Error] ${text}`);
    } else if (type === 'warn') {
      if (!text.includes('Angular is running in development mode')) {
        auditReport.consoleWarnings.push({ text, location });
        console.warn(`🟡 [Browser Console Warning] ${text}`);
      }
    }
  });

  // Monitor Page Uncaught Errors
  page.on('pageerror', err => {
    auditReport.consoleErrors.push({ text: err.toString(), stack: err.stack });
    console.error(`💥 [Uncaught Exception] ${err.toString()}`);
  });

  // Monitor Network
  page.on('request', req => {
    if (req.url().includes('/api/')) {
      auditReport.networkCalls.push({
        method: req.method(),
        url: req.url(),
        postData: req.postData() ? req.postData().slice(0, 300) : null
      });
    }
  });

  page.on('response', async res => {
    const status = res.status();
    const url = res.url();
    if (status >= 400 && url.includes('/api/')) {
      let body = '';
      try {
        body = await res.text();
      } catch (e) {}
      auditReport.failedRequests.push({
        url,
        status,
        statusText: res.statusText(),
        body: body.slice(0, 500)
      });
      console.warn(`⚠️ [HTTP Error] ${status} ${url} -> ${body.slice(0, 150)}`);
    }
  });

  // 3. Inject Tokens & Pre-configure Active Company
  console.log('▶ Step 3: Setting up authenticated session with company ID 2 (فارس عالیش)...');
  await page.goto('http://localhost:4200/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ access, refresh, user }) => {
    const company = { id: 2, name: 'فارس عالیش', code: 'FA', has_warehouse_module: true };
    localStorage.setItem('wh_access_token', access);
    localStorage.setItem('wh_refresh_token', refresh);
    localStorage.setItem('wh_user_profile', JSON.stringify(user));
    localStorage.setItem('active_company_id', '2');
    localStorage.setItem('active_company_data', JSON.stringify(company));
    sessionStorage.setItem('active_company_id', '2');
    sessionStorage.setItem('active_company_data', JSON.stringify(company));
  }, { access: tokens.access, refresh: tokens.refresh, user: userProfile });

  // Helper function to dismiss company modal if it still appears
  async function dismissCompanyModalIfOpen(page) {
    const modalFound = await page.evaluate(() => {
      const modal = document.querySelector('app-company-switcher-modal, .fixed.inset-0');
      if (modal && modal.innerText.includes('انتخاب شرکت کاری')) {
        const companyBtn = Array.from(modal.querySelectorAll('button')).find(b => b.innerText.includes('فارس عالیش') || b.innerText.includes('پاینده'));
        if (companyBtn) {
          companyBtn.click();
          return true;
        }
      }
      return false;
    });
    if (modalFound) {
      console.log('ℹ️ Handled and dismissed Company Switcher Modal by selecting active company.');
      await new Promise(r => setTimeout(r, 600));
    }
  }

  // ────────────────────────────────────────────────────────────────
  // 4. AUDIT: /app/finance/employee-new-personnel
  // ────────────────────────────────────────────────────────────────
  console.log('\n================================================================');
  console.log('▶ Step 4: AUDITING /app/finance/employee-new-personnel');
  console.log('================================================================');

  await page.goto('http://localhost:4200/app/finance/employee-new-personnel?cid=2', {
    waitUntil: 'networkidle2',
    timeout: 30000
  });
  await new Promise(r => setTimeout(r, 1200));
  await dismissCompanyModalIfOpen(page);

  await page.screenshot({ path: path.join(screenshotsDir, '01_personnel_hub.png'), fullPage: false });
  console.log('📸 Saved screenshot: 01_personnel_hub.png');

  // Audit Personnel Hub Header, Sticky Bar, Subtabs, Actions
  const personnelHubInspection = await page.evaluate(() => {
    const stickyHeader = document.querySelector('.sticky.top-0');
    const headerTitle = document.querySelector('h1, h2, h3, .font-black')?.innerText.trim();
    const sectionSelect = document.querySelector('select');
    const sections = sectionSelect ? Array.from(sectionSelect.options).map(o => ({ value: o.value, text: o.text.trim() })) : [];
    const switcherButtons = Array.from(document.querySelectorAll('button')).filter(b => b.innerText.includes('تعریف پرسنل') || b.innerText.includes('تعریف خودرو')).map(b => ({
      text: b.innerText.trim(),
      isActive: b.classList.contains('bg-white') || b.classList.contains('text-purple-700')
    }));

    const actionButtons = {
      excelExport: !!document.querySelector('button[title*="خروجی رسمی اکسل"]'),
      excelImport: !!document.querySelector('button[title*="ورود اطلاعات از طریق فایل اکسل"]'),
      refresh: !!document.querySelector('button[title*="بروزرسانی داده‌ها"]'),
      addPersonnel: !!document.querySelector('button[title*="معرفی پرسنل جدید"]')
    };

    const searchInput = document.querySelector('input[placeholder*="جستجو"]');
    const tableHeaders = Array.from(document.querySelectorAll('table th')).map(th => th.innerText.trim());
    const tableRowsCount = document.querySelectorAll('table tbody tr').length;
    const bodyDir = document.documentElement.getAttribute('dir') || document.body.getAttribute('dir');

    return {
      hasStickyHeader: !!stickyHeader,
      headerTitle,
      selectedSectionId: sectionSelect ? sectionSelect.value : null,
      sections,
      switcherButtons,
      actionButtons,
      hasSearchInput: !!searchInput,
      tableHeaders,
      tableRowsCount,
      bodyDir
    };
  });
  console.log('- Personnel Hub Inspection:', JSON.stringify(personnelHubInspection, null, 2));
  auditReport.personnelAudit.hub = personnelHubInspection;

  // Click Add Personnel Button
  console.log('- Clicking "معرفی پرسنل جدید (پیش‌نویس)" button...');
  const addPersonnelBtnClicked = await page.evaluate(() => {
    const btn = document.querySelector('button[title*="معرفی پرسنل جدید"]');
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  });

  if (!addPersonnelBtnClicked) {
    auditReport.findings.push({
      page: 'employee-new-personnel',
      severity: 'CRITICAL',
      title: 'دکمه معرفی پرسنل جدید در صفحه هاب یافت نشد یا در دسترس نبود.'
    });
  } else {
    await new Promise(r => setTimeout(r, 800));
    await page.screenshot({ path: path.join(screenshotsDir, '02_personnel_modal_open.png'), fullPage: false });
    console.log('📸 Saved screenshot: 02_personnel_modal_open.png');

    // Inspect Modal Form Elements
    const personnelModalInspection = await page.evaluate(() => {
      const modal = document.querySelector('.fixed.inset-0');
      if (!modal) return { isOpen: false };

      const title = modal.querySelector('h3')?.innerText.trim();
      const inputs = Array.from(modal.querySelectorAll('input')).map(i => ({
        placeholder: i.placeholder,
        name: i.name,
        type: i.type,
        dir: i.getAttribute('dir'),
        value: i.value
      }));
      const selects = Array.from(modal.querySelectorAll('select')).map(s => s.name || s.className);
      const convertBtn = Array.from(modal.querySelectorAll('button')).find(b => b.innerText.includes('⚡') || (b.title && b.title.includes('شبا')));
      const copyShebaBtn = Array.from(modal.querySelectorAll('button')).find(b => b.title && b.title.includes('کپی شماره شبا'));
      const copyAccountBtn = Array.from(modal.querySelectorAll('button')).find(b => b.title && b.title.includes('کپی شماره حساب'));
      const draftBtn = Array.from(modal.querySelectorAll('button')).find(b => b.innerText.includes('پیش‌نویس'));
      const submitBtn = Array.from(modal.querySelectorAll('button')).find(b => b.innerText.includes('ارسال به سرپرست'));

      return {
        isOpen: true,
        title,
        inputsCount: inputs.length,
        inputs,
        selectsCount: selects.length,
        hasConvertBtn: !!convertBtn,
        hasCopyShebaBtn: !!copyShebaBtn,
        hasCopyAccountBtn: !!copyAccountBtn,
        hasDraftBtn: !!draftBtn,
        hasSubmitBtn: !!submitBtn
      };
    });
    console.log('- Personnel Modal Inspection:', JSON.stringify(personnelModalInspection, null, 2));
    auditReport.personnelAudit.modal = personnelModalInspection;

    // Test Form Validations & Sheba Bidirectional Sync
    console.log('- Testing National Code Validation in Personnel Modal...');
    const nationalCodeTest = await page.evaluate(async (validCode) => {
      const modal = document.querySelector('.fixed.inset-0');
      const allInputs = Array.from(modal.querySelectorAll('input'));
      const natInput = allInputs.find(i => i.placeholder && i.placeholder.includes('ملی'));
      if (!natInput) return { error: 'National code input not found' };

      // 1. Test invalid code (length < 10)
      natInput.value = '12345';
      natInput.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 100));
      const err1 = modal.querySelector('.text-rose-600')?.innerText.trim();

      // 2. Test repeated digits (1111111111)
      natInput.value = '1111111111';
      natInput.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 100));
      const err2 = modal.querySelector('.text-rose-600')?.innerText.trim();

      // 3. Test invalid checksum (1234567890)
      natInput.value = '1234567890';
      natInput.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 100));
      const err3 = modal.querySelector('.text-rose-600')?.innerText.trim();

      // 4. Test valid code
      natInput.value = validCode;
      natInput.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 100));
      const errValid = modal.querySelector('.text-rose-600')?.innerText.trim();

      return {
        errShortLength: err1,
        errRepeatedDigits: err2,
        errInvalidChecksum: err3,
        errWithValidCode: errValid
      };
    }, getValidNationalCode());
    console.log('- National Code Validation Result:', nationalCodeTest);
    auditReport.personnelAudit.nationalCodeTest = nationalCodeTest;

    // Test Sheba <-> Account Bidirectional Conversion & Combobox
    console.log('- Testing Iranian Bank Selection & Account -> Sheba conversion (⚡)...');
    const shebaConversionTest = await page.evaluate(async () => {
      const modal = document.querySelector('.fixed.inset-0');
      const allInputs = Array.from(modal.querySelectorAll('input'));
      const bankInput = allInputs.find(i => i.placeholder && i.placeholder.includes('انتخاب بانک عامل'));
      const accountInput = allInputs.find(i => i.placeholder && i.placeholder.includes('0101111111001'));
      const shebaInput = allInputs.find(i => i.placeholder && (i.placeholder.includes('--') || i.placeholder.includes('----')));
      const convertBtn = Array.from(modal.querySelectorAll('button')).find(b => b.innerText.includes('⚡') || (b.title && b.title.includes('شبا')));

      let bankSelected = false;
      let bankDropdownOpened = false;

      if (bankInput) {
        bankInput.focus();
        bankInput.dispatchEvent(new Event('focus', { bubbles: true }));
        await new Promise(r => setTimeout(r, 200));

        const bankList = modal.querySelectorAll('.max-h-52 div');
        bankDropdownOpened = bankList.length > 0;

        // Click on "بانک ملی ایران"
        const bmi = Array.from(modal.querySelectorAll('.max-h-52 div')).find(d => d.innerText.includes('ملی ایران') || d.innerText.includes('کد 017'));
        if (bmi) {
          bmi.click();
          bankSelected = true;
        }
      }

      let shebaGenerated = null;
      let validationMessage = null;

      if (accountInput) {
        accountInput.value = '0105678901004';
        accountInput.dispatchEvent(new Event('input', { bubbles: true }));
        accountInput.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise(r => setTimeout(r, 200));
      }

      if (convertBtn) {
        convertBtn.click();
        await new Promise(r => setTimeout(r, 400));
        shebaGenerated = shebaInput ? shebaInput.value : null;
        const banner = modal.querySelector('.text-emerald-700, .text-emerald-600');
        validationMessage = banner ? banner.innerText.trim() : null;
      }

      // Test Reverse: Paste Sheba and check auto-populate of Bank and Account
      let reverseBankDetected = null;
      let reverseAccountExtracted = null;

      if (shebaInput) {
        // Clear first
        if (accountInput) {
          accountInput.value = '';
          accountInput.dispatchEvent(new Event('input', { bubbles: true }));
        }

        // Simulate pasting Mellat Sheba: IR820120000000001234567890
        shebaInput.value = '82 0120 0000 0000 1234 5678 90';
        shebaInput.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 400));

        reverseBankDetected = bankInput ? bankInput.value : null;
        reverseAccountExtracted = accountInput ? accountInput.value : null;
      }

      return {
        bankDropdownOpened,
        bankSelected,
        shebaGenerated,
        validationMessage,
        reverseBankDetected,
        reverseAccountExtracted
      };
    });
    console.log('- Sheba Conversion Test Result:', shebaConversionTest);
    auditReport.personnelAudit.shebaConversionTest = shebaConversionTest;

    // Test Birth Date Auto-Masking & Clean Absence of Wage / Blue Banner
    console.log('- Testing Birth Date Auto-Masking (13700514 -> 1370/05/14) and Clean Wage Absence...');
    const birthDateTest = await page.evaluate(async () => {
      const modal = document.querySelector('.fixed.inset-0');
      const birthInput = modal.querySelector('input[placeholder*="۱۳۷۰/۰۵/۱۴"]');
      const wageInput = modal.querySelector('input[placeholder*="۴,۵۰۰,۰۰۰"]');
      const blueBanner = modal.querySelector('.bg-blue-50\\/80');

      if (!birthInput) return { error: 'Birth date input not found' };

      // Type 8 digits without slash
      birthInput.value = '13700514';
      birthInput.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 200));

      return {
        birthDateAutoMasked: birthInput.value,
        isAutoMaskedCorrectly: birthInput.value === '1370/05/14' || birthInput.value === '۱۳۷۰/۰۵/۱۴',
        wageInputCleanlyRemoved: !wageInput,
        blueBannerCleanlyRemoved: !blueBanner
      };
    });
    console.log('- Birth Date Auto-Masking & Clean Removal Result:', birthDateTest);
    auditReport.personnelAudit.birthDateTest = birthDateTest;

    await page.screenshot({ path: path.join(screenshotsDir, '03_personnel_sheba_tested.png'), fullPage: false });
    console.log('📸 Saved screenshot: 03_personnel_sheba_tested.png');

    // Test Draft Submission API Call
    console.log('- Testing Personnel Draft Save Submission (API POST /api/personnel/profiles/)...');
    const draftSaveResult = await page.evaluate(async (validNatCode) => {
      const modal = document.querySelector('.fixed.inset-0');
      const allInputs = Array.from(modal.querySelectorAll('input'));
      const fnInput = allInputs.find(i => i.placeholder && i.placeholder.includes('علی'));
      const lnInput = allInputs.find(i => i.placeholder && i.placeholder.includes('محمدی'));
      const natInput = allInputs.find(i => i.placeholder && i.placeholder.includes('ملی'));
      const jobInput = allInputs.find(i => i.placeholder && i.placeholder.includes('سمت'));
      const draftBtn = Array.from(modal.querySelectorAll('button')).find(b => b.innerText.includes('پیش‌نویس'));

      if (fnInput) {
        fnInput.value = 'امید (تست)';
        fnInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (lnInput) {
        lnInput.value = 'آزمایشی';
        lnInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (natInput) {
        natInput.value = validNatCode;
        natInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (jobInput) {
        jobInput.value = 'کارشناس تست';
        jobInput.dispatchEvent(new Event('input', { bubbles: true }));
      }

      if (draftBtn) {
        draftBtn.click();
        return { clicked: true };
      }
      return { clicked: false, error: 'Draft button not found' };
    }, getValidNationalCode());

    console.log('- Personnel Draft Save Clicked:', draftSaveResult);
    await new Promise(r => setTimeout(r, 1500));
    await page.screenshot({ path: path.join(screenshotsDir, '04_personnel_draft_submitted.png'), fullPage: false });
    console.log('📸 Saved screenshot: 04_personnel_draft_submitted.png');

    // Close Personnel Modal
    await page.evaluate(() => {
      const closeBtn = document.querySelector('.fixed.inset-0 button[title*="بستن"]');
      if (closeBtn) closeBtn.click();
    });
    await new Promise(r => setTimeout(r, 500));
  }

  // ────────────────────────────────────────────────────────────────
  // 5. AUDIT: /app/finance/employee-new-vehicle
  // ────────────────────────────────────────────────────────────────
  console.log('\n================================================================');
  console.log('▶ Step 5: AUDITING /app/finance/employee-new-vehicle');
  console.log('================================================================');

  await page.goto('http://localhost:4200/app/finance/employee-new-vehicle?cid=2', {
    waitUntil: 'networkidle2',
    timeout: 30000
  });
  await new Promise(r => setTimeout(r, 1200));
  await dismissCompanyModalIfOpen(page);

  await page.screenshot({ path: path.join(screenshotsDir, '05_vehicle_hub.png'), fullPage: false });
  console.log('📸 Saved screenshot: 05_vehicle_hub.png');

  // Audit Vehicle Hub Header, Subtabs, Actions, Metrics
  const vehicleHubInspection = await page.evaluate(() => {
    const stickyHeader = document.querySelector('.sticky.top-0');
    const headerTitle = document.querySelector('h1, h2, h3, .font-black')?.innerText.trim();
    const sectionSelect = document.querySelector('select');
    const sections = sectionSelect ? Array.from(sectionSelect.options).map(o => ({ value: o.value, text: o.text.trim() })) : [];

    const switcherButtons = Array.from(document.querySelectorAll('button')).filter(b => b.innerText.includes('تعریف پرسنل') || b.innerText.includes('تعریف خودرو')).map(b => ({
      text: b.innerText.trim(),
      isActive: b.classList.contains('bg-white') || b.classList.contains('text-amber-800')
    }));

    const subtabs = Array.from(document.querySelectorAll('.flex.bg-slate-100\\/90 button')).map(b => ({
      label: b.querySelector('span:first-child')?.innerText.trim() || b.innerText.trim(),
      count: b.querySelector('span:last-child')?.innerText.trim(),
      isActive: b.classList.contains('bg-white')
    }));

    const actionButtons = {
      excelExport: !!document.querySelector('button[title*="خروجی رسمی اکسل ناوگان"]'),
      excelImport: !!document.querySelector('button[title*="ورود اطلاعات دسته‌جمعی از اکسل"]'),
      refresh: !!document.querySelector('button[title*="بروزرسانی داده‌ها"]'),
      addVehicle: !!document.querySelector('button[title*="معرفی خودرو جدید"]')
    };

    const searchInput = document.querySelector('input[placeholder*="جستجوی پلاک"]');
    const tableHeaders = Array.from(document.querySelectorAll('table th')).map(th => th.innerText.trim());
    const tableRowsCount = document.querySelectorAll('table tbody tr').length;

    return {
      hasStickyHeader: !!stickyHeader,
      headerTitle,
      selectedSectionId: sectionSelect ? sectionSelect.value : null,
      sections,
      switcherButtons,
      subtabs,
      actionButtons,
      hasSearchInput: !!searchInput,
      tableHeaders,
      tableRowsCount
    };
  });
  console.log('- Vehicle Hub Inspection:', JSON.stringify(vehicleHubInspection, null, 2));
  auditReport.vehicleAudit.hub = vehicleHubInspection;

  // Click Add Vehicle Button
  console.log('- Clicking "معرفی خودرو جدید (پیش‌نویس)" button...');
  const addVehicleBtnClicked = await page.evaluate(() => {
    const btn = document.querySelector('button[title*="معرفی خودرو جدید"]');
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  });

  if (!addVehicleBtnClicked) {
    auditReport.findings.push({
      page: 'employee-new-vehicle',
      severity: 'CRITICAL',
      title: 'دکمه معرفی خودرو جدید در صفحه هاب یافت نشد یا غیرفعال بود.'
    });
  } else {
    await new Promise(r => setTimeout(r, 800));
    await page.screenshot({ path: path.join(screenshotsDir, '06_vehicle_modal_open.png'), fullPage: false });
    console.log('📸 Saved screenshot: 06_vehicle_modal_open.png');

    // Inspect Vehicle Modal
    const vehicleModalInspection = await page.evaluate(() => {
      const modal = document.querySelector('.fixed.inset-0, [role="dialog"]');
      if (!modal) return { isOpen: false };

      const title = modal.querySelector('h3')?.innerText.trim();
      const hasPlateWidget = !!modal.querySelector('.grid-cols-4');
      const plateInputs = modal.querySelectorAll('.grid-cols-4 input, .grid-cols-4 select');
      const plateGraphicPreview = !!modal.querySelector('.border-2.border-slate-900');
      const convertBtn = Array.from(modal.querySelectorAll('button')).find(b => b.innerText.includes('⚡') || (b.title && b.title.includes('شبا')));
      const isDriverOwnerCheckbox = modal.querySelector('input[type="checkbox"]');
      const draftBtn = Array.from(modal.querySelectorAll('button')).find(b => b.innerText.includes('ذخیره در پیش‌نویس'));
      const submitBtn = Array.from(modal.querySelectorAll('button')).find(b => b.innerText.includes('ارسال به سرپرست'));

      return {
        isOpen: true,
        title,
        hasPlateWidget,
        plateInputsCount: plateInputs.length,
        hasPlateGraphicPreview: plateGraphicPreview,
        hasConvertBtn: !!convertBtn,
        hasDriverOwnerCheckbox: !!isDriverOwnerCheckbox,
        isDriverOwnerChecked: isDriverOwnerCheckbox ? isDriverOwnerCheckbox.checked : false,
        hasDraftBtn: !!draftBtn,
        hasSubmitBtn: !!submitBtn
      };
    });
    console.log('- Vehicle Modal Inspection:', JSON.stringify(vehicleModalInspection, null, 2));
    auditReport.vehicleAudit.modal = vehicleModalInspection;

    // Test 4-Part Plate Widget & Auto-Focus
    console.log('- Testing 4-Part Iran License Plate Widget & Graphic Preview...');
    const plateWidgetTest = await page.evaluate(async () => {
      const modal = document.querySelector('.fixed.inset-0, [role="dialog"]');
      const inputs = modal.querySelectorAll('.grid-cols-4 input, .grid-cols-4 select');
      if (inputs.length < 4) return { error: 'Plate widget inputs less than 4' };

      const p1 = inputs[0]; // 2 digits
      const p2 = inputs[1]; // letter select
      const p3 = inputs[2]; // 3 digits
      const p4 = inputs[3]; // Iran code 2 digits

      p1.value = '12';
      p1.dispatchEvent(new Event('input', { bubbles: true }));

      p2.value = 'ج';
      p2.dispatchEvent(new Event('change', { bubbles: true }));

      p3.value = '345';
      p3.dispatchEvent(new Event('input', { bubbles: true }));

      p4.value = '63';
      p4.dispatchEvent(new Event('input', { bubbles: true }));

      await new Promise(r => setTimeout(r, 200));

      const previewBox = modal.querySelector('.border-2.border-slate-900');
      const previewText = previewBox ? previewBox.innerText.replace(/\s+/g, ' ').trim() : null;

      return {
        p1Val: p1.value,
        p2Val: p2.value,
        p3Val: p3.value,
        p4Val: p4.value,
        previewText
      };
    });
    console.log('- Plate Widget Test Result:', plateWidgetTest);
    auditReport.vehicleAudit.plateWidgetTest = plateWidgetTest;

    // Test Driver vs Owner Toggle
    console.log('- Testing Driver vs Owner toggle in Vehicle Modal...');
    const ownerToggleTest = await page.evaluate(async () => {
      const modal = document.querySelector('.fixed.inset-0, [role="dialog"]');
      const checkbox = modal.querySelector('input[type="checkbox"]');
      if (!checkbox) return { error: 'Checkbox not found' };

      // Uncheck
      checkbox.click();
      await new Promise(r => setTimeout(r, 200));

      const ownerSectionFound = !!modal.querySelector('.bg-amber-50\\/50');
      const ownerInputs = modal.querySelectorAll('.bg-amber-50\\/50 input');

      // Re-check
      checkbox.click();
      await new Promise(r => setTimeout(r, 200));
      const ownerSectionAfterRecheck = !!modal.querySelector('.bg-amber-50\\/50');

      return {
        ownerSectionAppearedOnUncheck: ownerSectionFound,
        ownerInputsCount: ownerInputs.length,
        ownerSectionRemovedOnRecheck: !ownerSectionAfterRecheck
      };
    });
    console.log('- Owner Toggle Test Result:', ownerToggleTest);
    auditReport.vehicleAudit.ownerToggleTest = ownerToggleTest;

    // Test Vehicle Sheba & Bank Conversion
    console.log('- Testing Vehicle Sheba & Account conversion (⚡)...');
    const vehicleShebaTest = await page.evaluate(async () => {
      const modal = document.querySelector('.fixed.inset-0, [role="dialog"]');
      const allInputs = Array.from(modal.querySelectorAll('input'));
      const bankInput = allInputs.find(i => i.placeholder && i.placeholder.includes('انتخاب بانک عامل'));
      const accountInput = allInputs.find(i => i.placeholder && i.placeholder.includes('0101111111001'));
      const shebaInput = allInputs.find(i => i.placeholder && i.placeholder.includes('3456'));
      const convertBtn = Array.from(modal.querySelectorAll('button')).find(b => b.innerText.includes('⚡') || (b.title && b.title.includes('شبا')));

      let bankSelected = false;
      if (bankInput) {
        bankInput.focus();
        bankInput.dispatchEvent(new Event('focus', { bubbles: true }));
        await new Promise(r => setTimeout(r, 200));

        // Click on Mellat
        const mellat = Array.from(modal.querySelectorAll('.max-h-52 div')).find(d => d.innerText.includes('ملت') || d.innerText.includes('کد 012'));
        if (mellat) {
          mellat.click();
          bankSelected = true;
        }
      }

      let shebaGenerated = null;
      let validationMessage = null;

      if (accountInput) {
        accountInput.value = '1234567890';
        accountInput.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 200));
      }

      if (convertBtn) {
        convertBtn.click();
        await new Promise(r => setTimeout(r, 400));
        shebaGenerated = shebaInput ? shebaInput.value : null;
        const banner = modal.querySelector('.text-emerald-600');
        validationMessage = banner ? banner.innerText.trim() : null;
      }

      return {
        bankSelected,
        shebaGenerated,
        validationMessage
      };
    });
    console.log('- Vehicle Sheba Test Result:', vehicleShebaTest);
    auditReport.vehicleAudit.vehicleShebaTest = vehicleShebaTest;

    await page.screenshot({ path: path.join(screenshotsDir, '07_vehicle_plate_and_sheba.png'), fullPage: false });
    console.log('📸 Saved screenshot: 07_vehicle_plate_and_sheba.png');

    // Test Vehicle Draft Save Submission
    console.log('- Testing Vehicle Draft Save Submission (API POST /api/fleet/vehicles/)...');
    const vehicleDraftSaveResult = await page.evaluate(async (validNatCode) => {
      const modal = document.querySelector('.fixed.inset-0, [role="dialog"]');
      const allInputs = Array.from(modal.querySelectorAll('input'));
      const driverName = allInputs.find(i => i.placeholder && i.placeholder.includes('علی حسینی'));
      const driverNat = allInputs.find(i => i.placeholder && i.placeholder.includes('۰۱۲۳۴۵۶۷۸۹'));
      const draftBtn = Array.from(modal.querySelectorAll('button')).find(b => b.innerText.includes('ذخیره در پیش‌نویس'));

      if (driverName) {
        driverName.value = 'رضا مرادی (تست)';
        driverName.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (driverNat) {
        driverNat.value = validNatCode;
        driverNat.dispatchEvent(new Event('input', { bubbles: true }));
      }

      if (draftBtn) {
        draftBtn.click();
        return { clicked: true };
      }
      return { clicked: false, error: 'Vehicle draft button not found' };
    }, getValidNationalCode());

    console.log('- Vehicle Draft Save Clicked:', vehicleDraftSaveResult);
    await new Promise(r => setTimeout(r, 1500));
    await page.screenshot({ path: path.join(screenshotsDir, '08_vehicle_draft_submitted.png'), fullPage: false });
    console.log('📸 Saved screenshot: 08_vehicle_draft_submitted.png');

    // Close Vehicle Modal
    await page.evaluate(() => {
      const closeBtn = document.querySelector('.fixed.inset-0 button, [role="dialog"] button');
      if (closeBtn) closeBtn.click();
    });
    await new Promise(r => setTimeout(r, 500));
  }

  // ────────────────────────────────────────────────────────────────
  // 6. AUDIT: Mobile Viewport & Responsiveness
  // ────────────────────────────────────────────────────────────────
  console.log('\n================================================================');
  console.log('▶ Step 6: AUDITING Mobile Viewport Responsiveness (375x667 iPhone SE)');
  console.log('================================================================');

  await page.setViewport({ width: 375, height: 667, isMobile: true, hasTouch: true });

  // Mobile Personnel
  await page.goto('http://localhost:4200/app/finance/employee-new-personnel?cid=2', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 800));
  await dismissCompanyModalIfOpen(page);

  const mobilePersonnelCheck = await page.evaluate(() => {
    const hasHorizontalOverflow = document.documentElement.scrollWidth > window.innerWidth;
    const scrollWidth = document.documentElement.scrollWidth;
    const clientWidth = window.innerWidth;
    return { hasHorizontalOverflow, scrollWidth, clientWidth };
  });
  console.log('- Mobile Personnel Layout:', mobilePersonnelCheck);
  auditReport.mobileAudit.personnel = mobilePersonnelCheck;
  await page.screenshot({ path: path.join(screenshotsDir, '09_personnel_mobile.png'), fullPage: false });
  console.log('📸 Saved screenshot: 09_personnel_mobile.png');

  // Mobile Vehicle
  await page.goto('http://localhost:4200/app/finance/employee-new-vehicle?cid=2', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 800));
  await dismissCompanyModalIfOpen(page);

  const mobileVehicleCheck = await page.evaluate(() => {
    const hasHorizontalOverflow = document.documentElement.scrollWidth > window.innerWidth;
    const scrollWidth = document.documentElement.scrollWidth;
    const clientWidth = window.innerWidth;
    return { hasHorizontalOverflow, scrollWidth, clientWidth };
  });
  console.log('- Mobile Vehicle Layout:', mobileVehicleCheck);
  auditReport.mobileAudit.vehicle = mobileVehicleCheck;
  await page.screenshot({ path: path.join(screenshotsDir, '10_vehicle_mobile.png'), fullPage: false });
  console.log('📸 Saved screenshot: 10_vehicle_mobile.png');

  // ────────────────────────────────────────────────────────────────
  // 7. AUDIT: Seamless Inter-Module Navigation
  // ────────────────────────────────────────────────────────────────
  console.log('\n================================================================');
  console.log('▶ Step 7: AUDITING Capsule Switcher Navigation (Personnel <-> Vehicle)');
  console.log('================================================================');

  await page.setViewport({ width: 1440, height: 900 });
  await page.goto('http://localhost:4200/app/finance/employee-new-personnel?cid=2', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 600));

  // Click vehicle button inside capsule
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('تعریف خودرو'));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 800));
  const urlAfterToVehicle = page.url();

  // Click personnel button inside capsule
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('تعریف پرسنل'));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 800));
  const urlAfterToPersonnel = page.url();

  auditReport.navigationAudit = {
    urlAfterToVehicle,
    urlAfterToPersonnel,
    isNavigationWorking: urlAfterToVehicle.includes('employee-new-vehicle') && urlAfterToPersonnel.includes('employee-new-personnel')
  };
  console.log('- Capsule Navigation Audit:', auditReport.navigationAudit);

  // Close browser
  await browser.close();

  // Save full JSON audit
  fs.writeFileSync(path.join(__dirname, 'comprehensive_audit_report.json'), JSON.stringify(auditReport, null, 2), 'utf-8');
  console.log('\n================================================================');
  console.log('🎉 AUDIT COMPLETE! Report saved to comprehensive_audit_report.json');
  console.log('================================================================\n');
}

runComprehensiveBrowserAudit().catch(err => {
  console.error('Audit execution error:', err);
  process.exit(1);
});
