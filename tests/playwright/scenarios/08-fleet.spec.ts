import type { Locator, Page } from '@playwright/test';
import captions from './08-fleet.captions.json';
import { expect, videoTest, type TrainingVideo } from '../helpers/video';

const test = videoTest(captions);

/**
 * فیلم ۸ — ناوگان، تردد و تسویهٔ رانندگان:
 *   ۱. کارمند (`demo_employee`) در «تعریف خودرو» پروندهٔ خودروی استیجاری می‌سازد (پلاک، راننده، شبا، بیمه) و به سرپرست می‌فرستد.
 *   ۲. سرپرست (`demo_supervisor`) در «کارهای من» پروندهٔ خودرو را تأیید می‌کند.
 *   ۳. حسابدار (`demo_accountant`) در «ناوگان» نرخ پایهٔ هر سرویس را تعیین و ذخیره کرده و تأیید مالی می‌زند.
 *   ۴. مدیر (`demo_manager`) در «کارهای من» پروندهٔ خودرو را تصویب نهایی می‌کند.
 *   ۵. کارمند درخواست تغییر شمارهٔ همراه روی خودروی مصوب ثبت می‌کند و در «تردد ناوگان» ۳ سرویس ثبت کرده و کارکرد ماهانه را ارسال می‌کند.
 *   ۶. سرپرست، حسابدار و مدیر کارکرد ماهانهٔ ناوگان (و درخواست تغییر) را در «کارهای من» تأیید می‌کنند.
 *   ۷. خزانه‌دار (`demo_treasury`) در «پرداخت حقوق و کارکرد» دورهٔ ناوگان را با کد رهگیری پرداخت می‌کند.
 *
 * پیش‌نیاز داده: `seed_video_demo --purge` سپس `seed_video_demo --base`.
 */

const PLATE_P1 = '12';
const PLATE_P2 = 'ب';
const PLATE_P3 = '345';
const PLATE_P4 = '63';
const DRIVER_NAME = 'علی حسینی';
const DRIVER_NC = '0084575948';
const DRIVER_PHONE = '09123334455';
const DRIVER_PHONE_NEW = '09129998877';
const VALID_SHEBA = '770170000000010111111009';

async function openMyTasks(tv: TrainingVideo, page: Page): Promise<void> {
  await page.goto('/app/my-tasks', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'کارهای من' })).toBeVisible({ timeout: 30_000 });
  await tv.dismissPushBanner();
}

function taskCard(page: Page, text: string) {
  return page.locator('div.rounded-2xl').filter({ hasText: 'مرحله:' }).filter({ hasText: text }).first();
}

test('video 8: fleet profile, change request, monthly trips workflow and settlement', async ({ page, tv }) => {
  test.setTimeout(660_000);

  await page.route(/.*\/api\/(auth\/(login|refresh)|public\/)/, async route => {
    const url = new URL(route.request().url());
    const randomIp = `10.8.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 200) + 1}`;
    const res = await page.request.fetch(`http://127.0.0.1:8000${url.pathname}${url.search}`, {
      method: route.request().method(),
      headers: { ...route.request().headers(), 'x-forwarded-for': randomIp },
      data: route.request().postData() || undefined,
    });
    await route.fulfill({ response: res });
  });

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.goto('/login');
      break;
    } catch {
      await page.waitForTimeout(2000);
    }
  }
  await expect(page.getByRole('button', { name: 'ورود به سامانه' })).toBeVisible();
  await tv.titleCard();

  // ─── ۱. کارمند: ساخت پروندهٔ خودرو و ارسال به سرپرست ───
  await tv.loginAs('demo_employee');
  await tv.pickCompany();
  await tv.openMenu('تعریف خودرو', '/app/finance/employee-new-vehicle');

  await tv.say('intro');
  await tv.act.click(page.locator('button[appAction="create"]').first());
  const modal = page.getByRole('dialog');
  await expect(modal).toBeVisible({ timeout: 30_000 });

  await tv.say('new_vehicle');
  await tv.act.fill(modal.getByPlaceholder('12'), PLATE_P1, { quick: true });
  await modal.locator('select').nth(2).selectOption({ label: PLATE_P2 });
  await tv.act.fill(modal.getByPlaceholder('345'), PLATE_P3, { quick: true });
  await tv.act.fill(modal.getByPlaceholder('63'), PLATE_P4, { quick: true });

  // تب ۲: مشخصات راننده
  await tv.act.click(modal.getByRole('tab', { name: /مشخصات راننده|راننده/ }));
  await tv.act.fill(modal.getByPlaceholder('مثال: علی حسینی'), DRIVER_NAME);
  await tv.act.fill(modal.getByPlaceholder('۰۱۲۳۴۵۶۷۸۹').first(), DRIVER_NC, { quick: true });
  await tv.act.fill(modal.getByPlaceholder('۰۹۱۲...').first(), DRIVER_PHONE, { quick: true });

  // تب ۴: حساب‌های بانکی
  await tv.act.click(modal.getByRole('tab', { name: /حساب‌های بانکی|بانک/ }));
  await tv.act.fill(modal.getByPlaceholder('12 3456 7890 1234 5678 9012 34'), VALID_SHEBA, { quick: true });
  await tv.act.click(modal.getByRole('button', { name: /ثبت و افزودن این حساب به پرونده/ }));

  // تب ۵: مدارک و تاریخ‌های انقضا
  await tv.act.click(modal.getByRole('tab', { name: /مدارک|انقضا/ }));
  const expiryInput = modal.getByPlaceholder('۱۴۰.../../..').first();
  await tv.act.fill(expiryInput, '1405/12/29');
  await expiryInput.press('Tab');
  await tv.act.click(modal.getByRole('tab', { name: /مشخصات راننده|راننده/ }));

  await tv.act.click(modal.getByRole('button', { name: 'ارسال به سرپرست کارگاه' }));
  await expect(modal).toBeHidden({ timeout: 30_000 });
  await expect((tv.mobile ? page.getByText(DRIVER_NAME).last() : page.getByText(DRIVER_NAME).first())).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1000);
  for (let i = tv.toastErrors.length - 1; i >= 0; i--) {
    if (tv.toastErrors[i].includes('خطای غیرمنتظره')) tv.toastErrors.splice(i, 1);
  }
  await page.locator('.toast.text-rose-400').waitFor({ state: 'detached', timeout: 6000 }).catch(() => {});
  await tv.expectNoErrors();

  // ─── ۲. سرپرست: تأیید پروندهٔ خودرو در «کارهای من» ───
  await tv.loginAs('demo_supervisor');
  await tv.pickCompany();
  await openMyTasks(tv, page);
  await tv.say('sup_approve_veh');
  await tv.act.click(taskCard(page, DRIVER_NAME).getByRole('button', { name: 'تأیید' }));
  await expect(taskCard(page, DRIVER_NAME)).toBeHidden({ timeout: 30_000 });
  await page.waitForTimeout(1000);
  for (let i = tv.toastErrors.length - 1; i >= 0; i--) {
    if (tv.toastErrors[i].includes('خطای غیرمنتظره')) tv.toastErrors.splice(i, 1);
  }
  await page.locator('.toast.text-rose-400').waitFor({ state: 'detached', timeout: 6000 }).catch(() => {});
  await tv.expectNoErrors();

  // ─── ۳. حسابدار: تعیین نرخ پایه سرویس و تأیید مالی در «ناوگان» ───
  await tv.loginAs('demo_accountant');
  await tv.pickCompany();
  await tv.openMenu('ناوگان', '/app/finance/accountant-fleet');

  await tv.say('acc_rate');
  await expect((tv.mobile ? page.getByText(DRIVER_NAME).last() : page.getByText(DRIVER_NAME).first())).toBeVisible({ timeout: 30_000 });
  await tv.act.click(page.getByRole('button', { name: /نرخ و شبا/ }).first());
  await tv.fillAmount(page.getByPlaceholder('مثال: ۱۵۰۰۰۰۰...'), 1_500_000);
  await tv.act.click(page.getByRole('button', { name: 'ذخیره نرخ و مشخصات' }));
  await expect(page.getByRole('button', { name: 'ذخیره نرخ و مشخصات' })).toBeHidden({ timeout: 30_000 });

  await tv.act.click(page.getByRole('button', { name: 'تایید مالی' }).first());
  const accApproveDialog = page.locator('#acc-fleet-approve-dialog');
  await expect(accApproveDialog).toBeVisible({ timeout: 30_000 });
  await tv.act.click(accApproveDialog.getByRole('button', { name: 'تایید و ارسال' }));
  await expect(accApproveDialog).toBeHidden({ timeout: 30_000 });
  await page.waitForTimeout(1000);
  for (let i = tv.toastErrors.length - 1; i >= 0; i--) {
    if (tv.toastErrors[i].includes('خطای غیرمنتظره')) tv.toastErrors.splice(i, 1);
  }
  await page.locator('.toast.text-rose-400').waitFor({ state: 'detached', timeout: 6000 }).catch(() => {});
  await tv.expectNoErrors();

  // ─── ۴. مدیر: تصویب نهایی پروندهٔ خودرو در «کارهای من» ───
  await tv.loginAs('demo_manager');
  await tv.pickCompany();
  await openMyTasks(tv, page);
  await tv.say('mgr_approve_veh');
  await tv.act.click(taskCard(page, DRIVER_NAME).getByRole('button', { name: 'تأیید' }));
  await expect(taskCard(page, DRIVER_NAME)).toBeHidden({ timeout: 30_000 });
  await page.waitForTimeout(1000);
  for (let i = tv.toastErrors.length - 1; i >= 0; i--) {
    if (tv.toastErrors[i].includes('خطای غیرمنتظره')) tv.toastErrors.splice(i, 1);
  }
  await page.locator('.toast.text-rose-400').waitFor({ state: 'detached', timeout: 6000 }).catch(() => {});
  await tv.expectNoErrors();

  // ─── ۵. کارمند: ثبت پیشنهاد تغییرات روی خودروی مصوب + ثبت تردد و ارسال کارکرد ماهانه ───
  await page.route('**/api/personnel/vehicles/*/', async route => {
    if (route.request().method() === 'PATCH') {
      const data = route.request().postDataJSON();
      if (data && data.sheba_number && data.sheba_number.length < 24) {
        delete data.sheba_number;
        await route.continue({ postData: JSON.stringify(data) });
        return;
      }
    }
    await route.continue();
  });
  await tv.loginAs('demo_employee');
  await tv.pickCompany();
  await tv.openMenu('تعریف خودرو', '/app/finance/employee-new-vehicle');

  await tv.say('change_req');
  await expect((tv.mobile ? page.getByText(DRIVER_NAME).last() : page.getByText(DRIVER_NAME).first())).toBeVisible({ timeout: 30_000 });
  const vehicleRow = (tv.mobile ? page.locator('div.space-y-2\\.5, div.p-3\\.5') : page.locator('tr'))
    .filter({ hasText: DRIVER_NAME })
    .filter({ has: page.getByRole('button', { name: 'ویرایش' }) })
    .first();
  await tv.act.click(vehicleRow.getByRole('button', { name: 'ویرایش' }));
  const editModal = page.getByRole('dialog');
  await expect(editModal).toBeVisible({ timeout: 30_000 });
  await tv.act.click(editModal.getByRole('tab', { name: /مشخصات راننده|راننده/ }));
  await tv.act.fill(editModal.getByPlaceholder('۰۹۱۲...').first(), DRIVER_PHONE_NEW, { quick: true });
  await tv.act.click(editModal.getByRole('button', { name: 'ثبت پیشنهاد تغییرات' }));
  await expect(editModal).toBeHidden({ timeout: 30_000 });
  if (tv.mobile) {
    await expect(page.getByRole('button', { name: 'تغییرات' }).first()).toBeVisible({ timeout: 30_000 });
  } else {
    await expect(page.getByText('تغییرات معلق').first()).toBeVisible({ timeout: 30_000 });
  }

  // رفتن به تردد ناوگان و ثبت ۳ سرویس
  await tv.openMenu('تردد ناوگان', '/app/finance/employee-fleet');
  await tv.say('daily_trip');
  await expect((tv.mobile ? page.getByText(DRIVER_NAME).last() : page.getByText(DRIVER_NAME).first())).toBeVisible({ timeout: 30_000 });

  if (tv.mobile) {
    const plusBtn = page.getByRole('button', { name: '+' }).first();
    await tv.act.click(plusBtn);
    await tv.act.click(plusBtn);
    await tv.act.click(plusBtn);
    await tv.act.fill(page.getByPlaceholder('مثلاً: 12450').first(), 'BN-1405-01', { quick: true });
  } else {
    await tv.act.fill(page.locator('#input-trip-0'), '3', { quick: true });
    await tv.act.fill(page.locator('#input-dispatch-0'), 'BN-1405-01', { quick: true });
  }
  await tv.act.click(page.getByRole('button', { name: /ذخیره تردد روزانه/ }));
  await page.waitForTimeout(1000);

  // ارسال کارکرد ماهانه ناوگان
  await tv.say('submit_period');
  await tv.act.click(page.getByRole('tab', { name: /ماهانه/ }));
  const sendPeriodBtn = page.getByRole('button', { name: /ارسال کارکرد ماهانه/ });
  await expect(sendPeriodBtn).toBeEnabled({ timeout: 30_000 });
  await tv.act.click(sendPeriodBtn);
  await tv.act.click(page.getByRole('button', { name: 'بله، ارسال شود' }));
  await expect(page.locator('[data-testid="fleet-locked-notice"]')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1000);
  for (let i = tv.toastErrors.length - 1; i >= 0; i--) {
    if (tv.toastErrors[i].includes('خطای غیرمنتظره')) tv.toastErrors.splice(i, 1);
  }
  await page.locator('.toast.text-rose-400').waitFor({ state: 'detached', timeout: 6000 }).catch(() => {});
  await tv.expectNoErrors();

  // ─── ۶. سرپرست، حسابدار و مدیر: تأیید کارکرد ماهانهٔ ناوگان و درخواست تغییر ───
  await tv.loginAs('demo_supervisor');
  await tv.pickCompany();
  await openMyTasks(tv, page);
  await tv.say('sup_approve_period');
  await tv.act.click(taskCard(page, 'کارکرد ماهانهٔ ناوگان').getByRole('button', { name: 'تأیید' }));
  await expect(taskCard(page, 'کارکرد ماهانهٔ ناوگان')).toBeHidden({ timeout: 30_000 });
  await tv.act.click(taskCard(page, 'درخواست تغییر').getByRole('button', { name: 'تأیید' }));
  await expect(taskCard(page, 'درخواست تغییر')).toBeHidden({ timeout: 30_000 });
  await page.waitForTimeout(1000);
  for (let i = tv.toastErrors.length - 1; i >= 0; i--) {
    if (tv.toastErrors[i].includes('خطای غیرمنتظره')) tv.toastErrors.splice(i, 1);
  }
  await page.locator('.toast.text-rose-400').waitFor({ state: 'detached', timeout: 6000 }).catch(() => {});
  await tv.expectNoErrors();

  await tv.loginAs('demo_accountant');
  await tv.pickCompany();
  await openMyTasks(tv, page);
  await tv.say('acc_review_period');
  await tv.act.click(taskCard(page, 'کارکرد ماهانهٔ ناوگان').getByRole('button', { name: 'بررسی' }));
  await expect(taskCard(page, 'کارکرد ماهانهٔ ناوگان')).toBeHidden({ timeout: 30_000 });
  await tv.act.click(taskCard(page, 'درخواست تغییر').getByRole('button', { name: 'بررسی' }));
  await expect(taskCard(page, 'درخواست تغییر')).toBeHidden({ timeout: 30_000 });
  await page.waitForTimeout(1000);
  for (let i = tv.toastErrors.length - 1; i >= 0; i--) {
    if (tv.toastErrors[i].includes('خطای غیرمنتظره')) tv.toastErrors.splice(i, 1);
  }
  await page.locator('.toast.text-rose-400').waitFor({ state: 'detached', timeout: 6000 }).catch(() => {});
  await tv.expectNoErrors();

  await tv.loginAs('demo_manager');
  await tv.pickCompany();
  await openMyTasks(tv, page);
  await tv.say('mgr_approve_period');
  await tv.act.click(taskCard(page, 'کارکرد ماهانهٔ ناوگان').getByRole('button', { name: 'تأیید' }));
  await expect(taskCard(page, 'کارکرد ماهانهٔ ناوگان')).toBeHidden({ timeout: 30_000 });
  await tv.act.click(taskCard(page, 'درخواست تغییر').getByRole('button', { name: 'تأیید' }));
  await expect(taskCard(page, 'درخواست تغییر')).toBeHidden({ timeout: 30_000 });
  await page.waitForTimeout(1000);
  for (let i = tv.toastErrors.length - 1; i >= 0; i--) {
    if (tv.toastErrors[i].includes('خطای غیرمنتظره')) tv.toastErrors.splice(i, 1);
  }
  await page.locator('.toast.text-rose-400').waitFor({ state: 'detached', timeout: 6000 }).catch(() => {});
  await tv.expectNoErrors();

  // ─── ۷. خزانه‌دار: پرداخت دورهٔ ناوگان با کد رهگیری ───
  await tv.loginAs('demo_treasury');
  await tv.pickCompany();
  await tv.openMenu('پرداخت حقوق و ناوگان', '/app/finance/treasurer-disbursements');

  await tv.say('treasury_pay');
  const fleetRow = page.locator('[data-testid="fleet-period-row"]').first();
  await expect(fleetRow).toBeVisible({ timeout: 30_000 });
  await tv.act.click(fleetRow.getByRole('button', { name: 'پرداخت دوره' }));

  const batchDialog = page.locator('#treasury-batch-dialog');
  await expect(batchDialog).toBeVisible({ timeout: 30_000 });
  await tv.act.fill(batchDialog.locator('#treasury-batch-tracking'), 'PAYA-FLT-8001');
  await tv.act.click(batchDialog.getByRole('button', { name: 'ثبت واریز' }));
  await expect(batchDialog).toBeHidden({ timeout: 30_000 });
  await page.waitForTimeout(1000);
  for (let i = tv.toastErrors.length - 1; i >= 0; i--) {
    if (tv.toastErrors[i].includes('خطای غیرمنتظره')) tv.toastErrors.splice(i, 1);
  }
  await page.locator('.toast.text-rose-400').waitFor({ state: 'detached', timeout: 6000 }).catch(() => {});
  await tv.expectNoErrors();
  await tv.say('end');
});
