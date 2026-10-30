/**
 * Video 5: personnel profile lifecycle, masked sensitive view & change request (plan §4 row 5).
 * Seed: --purge, then --base.
 * demo_employee creates a 5-tab personnel profile with national code, Sheba & document and submits;
 * demo_supervisor sees masked sensitive fields in "پرسنل" and approves in "کارهای من";
 * demo_accountant completes wage & insurance in "پرسنل", prints in "بانک پرونده‌ها", and marks reviewed in "کارهای من";
 * demo_manager approves in "کارهای من";
 * demo_employee submits a change request on the approved profile and opens the pending diff viewer.
 */
import type { Locator, Page } from '@playwright/test';
import captions from './05-personnel-file.captions.json';
import { expect, videoTest, type TrainingVideo } from '../helpers/video';

const test = videoTest(captions);

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

function shebaDigits(bban = '0170000000123456789012'): string {
  const numeric = `${bban}182700`;
  const check = 98 - Number(BigInt(numeric) % 97n);
  return `${String(check).padStart(2, '0')}${bban}`;
}

async function openMyTasks(tv: TrainingVideo, page: Page): Promise<void> {
  await page.goto('/app/my-tasks');
  await expect(page.getByRole('heading', { name: 'کارهای من' })).toBeVisible({ timeout: 30_000 });
}

function personnelTaskCard(page: Page): Locator {
  return page.locator('div.rounded-2xl').filter({ hasText: 'محسن رضایی' }).first();
}

test('video 5: personnel profile, approval workflow and change request', async ({ page, tv }) => {
  for (let i = 0; i < 3; i++) {
    try {
      await page.goto('/login');
      break;
    } catch {
      await page.waitForTimeout(2000);
    }
  }
  await expect(page.getByRole('button', { name: 'ورود به سامانه' })).toBeVisible();
  await tv.titleCard();

  // ─── ۱. کارمند: ساخت پرونده در ۵ تب و ارسال به سرپرست ───
  await tv.say('emp_open');
  await tv.loginAs('demo_employee');
  await tv.pickCompany();
  await tv.openMenu('تعریف پرسنل', '/app/finance/employee-new-personnel');
  await expect(page.locator('button[appAction="export-excel"]')).toBeEnabled({ timeout: 30_000 });

  const createBtn = page.locator('button[appAction="create"]').first();
  await expect(createBtn).toBeVisible({ timeout: 30_000 });
  await tv.say('tab_identity');
  await tv.act.click(createBtn);

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await tv.act.fill(dialog.getByPlaceholder('۰۱۲۳۴۵۶۷۸۹'), '0013542419');
  await tv.act.fill(dialog.getByPlaceholder('مثال: علی'), 'محسن');
  await tv.act.fill(dialog.getByPlaceholder('مثال: محمدی'), 'رضایی');
  await tv.act.fill(dialog.getByPlaceholder('مثال: حسین'), 'احمد');
  await tv.act.fill(dialog.getByPlaceholder('مثال: ۱۲۳۴'), '1452');
  await tv.act.fill(dialog.getByPlaceholder('۱۳۷۰/۰۵/۱۴'), '13720415');

  await tv.say('tab_job');
  await tv.act.click(dialog.getByRole('button', { name: /گام بعدی: مشخصات شغلی/ }));
  await tv.act.fill(dialog.getByPlaceholder('انتخاب یا تایپ سمت شغلی...'), 'کارشناس لجستیک');
  await tv.act.fill(dialog.getByPlaceholder('مثال: ۱۲۳۴۵۶'), '123456');

  await tv.say('tab_bank');
  await tv.act.click(dialog.getByRole('button', { name: /گام بعدی: حساب‌های بانکی/ }));
  await tv.act.fill(dialog.getByPlaceholder('-- ---- ---- ---- ---- ----'), shebaDigits());
  await tv.act.click(dialog.getByRole('button', { name: /افزودن این حساب به لیست حساب‌های پرسنل/ }));
  await expect(dialog.getByText('⭐ حساب اصلی واریز')).toBeVisible({ timeout: 30_000 });

  await tv.say('tab_address');
  await tv.act.click(dialog.getByRole('button', { name: /گام بعدی: نشانی و تماس/ }));
  await tv.act.fill(dialog.getByPlaceholder('۰۹۱۲...'), '09123456789');
  await tv.act.fill(dialog.getByPlaceholder('مثال: ۱۲۳۴۵۶۷۸۹۰'), '1456789123');
  await tv.act.fill(
    dialog.getByPlaceholder('استان، شهر، خیابان، کوچه، پلاک، واحد...'),
    'شیراز، بلوار زند، کوچه ۱۲، پلاک ۸',
  );

  await tv.say('tab_docs');
  await tv.act.click(dialog.getByRole('button', { name: /گام بعدی: مدارک و یادداشت/ }));
  await dialog.locator('input[type="file"]').setInputFiles({
    name: 'national-card.png',
    mimeType: 'image/png',
    buffer: PNG,
  });
  await tv.act.fill(dialog.getByPlaceholder(/هرگونه توضیحات در مورد مدارک/), 'مدارک هویتی و بانکی کامل است.');
  await tv.act.click(dialog.getByRole('button', { name: 'ارسال به سرپرست' }));
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  await tv.expectNoErrors();

  // ─── ۲. سرپرست: مشاهدهٔ دید ستاره‌دار و تأیید در کارهای من ───
  await tv.loginAs('demo_supervisor');
  await tv.pickCompany();
  await tv.openMenu('پرسنل', '/app/finance/supervisor-personnel');
  await expect(page.getByText('محسن رضایی').filter({ visible: true }).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('******2419').filter({ visible: true }).first()).toBeVisible({ timeout: 30_000 });
  await tv.say('sup_masked');

  await openMyTasks(tv, page);
  await tv.say('sup_approve');
  await tv.act.click(personnelTaskCard(page).getByRole('button', { name: 'تأیید' }));
  await expect(personnelTaskCard(page)).toBeHidden({ timeout: 30_000 });
  await page.waitForTimeout(1000);
  await tv.expectNoErrors();

  // ─── ۳. حسابدار: تکمیل مزد و بیمه، چاپ پرونده و بررسی در کارهای من ───
  await tv.loginAs('demo_accountant');
  await tv.pickCompany();
  await tv.openMenu('پرسنل', '/app/finance/accountant-personnel');
  const completeBtn = page.getByRole('button', { name: /احکام و مدارک|تکمیل مزد و مدارک|تکمیل مدارک و مزد/ }).filter({ visible: true }).first();
  await expect(completeBtn).toBeVisible({ timeout: 30_000 });
  await tv.say('acc_complete');
  await tv.act.click(completeBtn);

  await expect(page.getByText(/احکام مالی، مزد و مدارک بانکی/)).toBeVisible({ timeout: 30_000 });
  const wageInput = page.locator('input[type="number"]').nth(1);
  await tv.act.fill(wageInput, '7000000');
  await tv.act.click(page.getByRole('tab', { name: /بیمه/ }));
  await tv.act.fill(page.getByPlaceholder('۱۰ رقم شماره بیمه...'), '0098765432');
  await tv.act.click(page.getByRole('button', { name: /ذخیره تغییرات احکام|ذخیره احکام مالی/ }));
  await expect(page.getByText(/احکام مالی، مزد و مدارک بانکی/)).toBeHidden({ timeout: 30_000 });
  await page.waitForTimeout(1000);
  await tv.expectNoErrors();

  await openMyTasks(tv, page);
  await tv.say('acc_print');
  await tv.act.click(personnelTaskCard(page).getByRole('button', { name: 'بررسی' }));
  await expect(personnelTaskCard(page)).toBeHidden({ timeout: 30_000 });
  await page.waitForTimeout(1000);
  await tv.expectNoErrors();

  // ─── ۴. مدیر: تصویب نهایی پرونده و چاپ پرونده ───
  await tv.loginAs('demo_manager');
  await tv.pickCompany();
  await openMyTasks(tv, page);
  await tv.say('mgr_approve');
  await tv.act.click(personnelTaskCard(page).getByRole('button', { name: 'تأیید' }));
  await expect(personnelTaskCard(page)).toBeHidden({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  await tv.expectNoErrors();

  await tv.openMenu('بانک پرونده‌ها', '/app/finance/profiles');
  await expect(page.getByText('محسن رضایی').filter({ visible: true }).first()).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => {
    window.open = () => null;
  });
  await tv.act.click(page.getByRole('button', { name: 'چاپ پرونده' }).filter({ visible: true }).first());
  await page.waitForTimeout(1000);
  await tv.expectNoErrors();

  // ─── ۵. کارمند: ثبت درخواست تغییرات روی پروندهٔ مصوب و مشاهدهٔ مقایسهٔ قدیم/جدید ───
  await tv.loginAs('demo_employee');
  await tv.pickCompany();
  await tv.openMenu('تعریف پرسنل', '/app/finance/employee-new-personnel');
  const editApprovedBtn = page
    .getByRole('button', { name: /ویرایش مشخصات و ثبت پیشنهاد تغییرات|ویرایش مشخصات و پیشنهاد تغییرات/ })
    .filter({ visible: true })
    .first();
  await expect(editApprovedBtn).toBeVisible({ timeout: 30_000 });
  await tv.say('change_req');
  await tv.act.click(editApprovedBtn);

  const editDialog = page.getByRole('dialog');
  await expect(editDialog).toBeVisible({ timeout: 30_000 });
  await tv.act.click(editDialog.getByRole('tab', { name: /نشانی|تماس/ }));
  await tv.act.fill(editDialog.getByPlaceholder('۰۹۱۲...'), '09129998877');
  await tv.act.click(editDialog.getByRole('button', { name: /ثبت درخواست تغییرات/ }));
  await expect(editDialog).toBeHidden({ timeout: 30_000 });

  const diffBtn = page
    .getByRole('button', { name: /مشاهده جزئیات تغییرات پیشنهادی معلق|مشاهده تغییرات معلق/ })
    .filter({ visible: true })
    .first();
  await expect(diffBtn).toBeVisible({ timeout: 30_000 });
  await tv.say('change_diff');
  await tv.act.click(diffBtn);
  const diffDialog = page.getByRole('dialog');
  await expect(diffDialog.getByText('09129998877')).toBeVisible({ timeout: 30_000 });
  await tv.act.click(diffDialog.getByRole('button', { name: 'بستن', exact: true }));
  await expect(diffDialog).toBeHidden({ timeout: 30_000 });
  await page.waitForTimeout(1000);
  await tv.expectNoErrors();
  await tv.say('end');
});
