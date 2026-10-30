/**
 * Video 7: payroll calculation, payslip, 58-col Excel, social security/tax/bank diskettes & treasury payment (plan §4 row 7).
 * Seed: --purge, then --base --with-attendance.
 * demo_accountant inspects statutory settings in "تنظیمات پایه حقوق", calculates monthly payroll in "حقوق و دستمزد",
 * opens & prints a payslip, exports the 58-column payroll Excel, and submits payroll for manager approval;
 * demo_manager approves in "کارهای من";
 * demo_accountant downloads social security DBF zip, WH/WP tax files, and bank payment Excel in "دیسکت‌های بیمه و مالیات";
 * demo_treasury records PAYA batch ID & tracking code in "پرداخت حقوق و ناوگان" and closes the period to PAID.
 */
import type { Locator, Page } from '@playwright/test';
import captions from './07-payroll.captions.json';
import { expect, videoTest, type TrainingVideo } from '../helpers/video';

const test = videoTest(captions);

async function openMyTasks(tv: TrainingVideo, page: Page): Promise<void> {
  await page.goto('/app/my-tasks');
  await expect(page.getByRole('heading', { name: 'کارهای من' })).toBeVisible({ timeout: 30_000 });
}

function payrollTaskCard(page: Page): Locator {
  return page.locator('div.rounded-2xl').filter({ hasText: 'مرحله:' }).filter({ hasText: /حقوق/ }).first();
}

test('video 7: payroll calculation, payslip, diskettes and treasury disbursement', async ({ page, tv }) => {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await page.goto('/login');
      break;
    } catch (e) {
      if (attempt === 3) throw e;
      await page.waitForTimeout(2000);
    }
  }
  await expect(page.getByRole('button', { name: 'ورود به سامانه' })).toBeVisible();
  await tv.titleCard();

  // ─── ۱. حسابدار: مشاهدهٔ تنظیمات پایه حقوق و محاسبهٔ حقوق دوره ───
  await tv.say('base_settings');
  await tv.loginAs('demo_accountant');
  await tv.pickCompany();
  await tv.openMenu('تنظیمات پایه حقوق', '/app/finance/base-settings');
  await expect(page.locator('.fixed.inset-0.z-40')).toBeHidden({ timeout: 30_000 });
  await page.waitForTimeout(1000);
  await tv.act.click(page.getByRole('tab', { name: 'مزایای قانون کار' }));
  await expect(page.getByText(/کمک‌هزینه اقلام مصرفی خانوار|حق مسکن/).first()).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1000);

  await tv.say('calc_payroll');
  await tv.openMenu('حقوق و دستمزد', '/app/finance/accountant-payroll');
  const calcBtn = page.getByRole('button', { name: /محاسبه مکانیزه حقوق/ });
  await expect(calcBtn).toBeVisible({ timeout: 30_000 });
  await tv.act.click(calcBtn);
  await expect(page.getByText('علی رضایی').first()).toBeVisible({ timeout: 30_000 });
  await tv.expectNoErrors();

  // ─── ۲. باز کردن فیش حقوقی، چاپ فیش و خروجی اکسل ۵۸ ستونی ───
  await tv.say('payslip_open');
  const payslipBtn = page.getByRole('button', { name: 'فیش', exact: true }).filter({ visible: true }).first();
  await tv.act.click(payslipBtn);
  const payslipDialog = page.locator('#payroll-payslip-dialog');
  await expect(payslipDialog).toBeVisible({ timeout: 30_000 });
  await expect(payslipDialog.getByText(/بیمه سهم کارگر \(۷٪\)/)).toBeVisible({ timeout: 30_000 });
  await expect(payslipDialog.getByText(/مالیات بر درآمد حقوق/)).toBeVisible({ timeout: 30_000 });
  await expect(payslipDialog.getByText(/مبلغ خالص قابل پرداخت/)).toBeVisible({ timeout: 30_000 });

  await page.evaluate(() => {
    window.print = () => {};
    window.open = () => null;
  });
  await tv.say('payslip_print');
  await tv.act.click(payslipDialog.getByRole('button', { name: 'چاپ فیش حقوقی' }));
  await tv.act.click(payslipDialog.locator('button[appAction="close"]').first());
  await expect(payslipDialog).toBeHidden({ timeout: 30_000 });

  const excelDownloadPromise = page.waitForEvent('download');
  await tv.act.click(page.locator('button[appAction="export-excel"]').first());
  const excelDownload = await excelDownloadPromise;
  expect(excelDownload.suggestedFilename()).toContain('Payroll_');
  await tv.expectNoErrors();

  // ─── ۳. ارسال حقوق دوره برای تأیید مدیر و تأیید توسط مدیر ───
  await tv.say('submit_mgr');
  await tv.act.click(page.getByRole('button', { name: 'ارسال برای تأیید مدیر' }));
  const confirmBtn = page.getByRole('button', { name: 'بله، ارسال شود' });
  await expect(confirmBtn).toBeVisible({ timeout: 30_000 });
  await tv.act.click(confirmBtn);
  await expect(page.getByText('در انتظار تأیید مدیر')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1000);
  await tv.expectNoErrors();

  await tv.loginAs('demo_manager');
  await tv.pickCompany();
  await openMyTasks(tv, page);
  await tv.say('mgr_approve');
  await tv.act.click(payrollTaskCard(page).getByRole('button', { name: 'تأیید' }));
  await expect(payrollTaskCard(page)).toBeHidden({ timeout: 30_000 });
  await page.waitForTimeout(1000);
  await tv.expectNoErrors();

  // ─── ۴. حسابدار: دانلود دیسکت بیمه، فایل‌های مالیات WH/WP و فایل پرداخت بانک ───
  await tv.loginAs('demo_accountant');
  await tv.pickCompany();
  await tv.openMenu('دیسکت‌های بیمه و مالیات', '/app/finance/accountant-diskettes');
  await expect(page.getByText('0012345678')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1000);

  await tv.say('disk_bimeh');
  const [dskDownload] = await Promise.all([
    page.waitForEvent('download'),
    tv.act.click(page.getByRole('button', { name: /دانلود فایل‌های DBF/ })),
  ]);
  expect(dskDownload.suggestedFilename()).toContain('Bimeh_');

  await tv.say('disk_tax');
  await tv.act.click(page.getByRole('tab', { name: /مالیات/ }));
  const [whDownload] = await Promise.all([
    page.waitForEvent('download'),
    tv.act.click(page.getByRole('button', { name: /فایل‌های مالیاتی WH و WP/ })),
  ]);
  expect(whDownload.suggestedFilename()).toContain('WH_');
  const wpDownload = await page.waitForEvent('download');
  expect(wpDownload.suggestedFilename()).toContain('WP_');

  await tv.say('disk_bank');
  await tv.act.click(page.getByRole('tab', { name: /بانک|واریز بانکی/ }));
  const [bankDownload] = await Promise.all([
    page.waitForEvent('download'),
    tv.act.click(page.getByRole('button', { name: /دیسکت بانکی حقوق/ })),
  ]);
  expect(bankDownload.suggestedFilename()).toContain('Bank_Payment_');
  await tv.expectNoErrors();

  // ─── ۵. خزانه‌دار: ثبت کد رهگیری و شناسهٔ دستهٔ پایا و بستن دوره به PAID ───
  await tv.loginAs('demo_treasury');
  await tv.pickCompany();
  await tv.openMenu('پرداخت حقوق و ناوگان', '/app/finance/treasurer-disbursements');

  await tv.say('treasury_pay');
  const settlePeriodBtn = page.getByRole('button', { name: 'پرداخت دوره' }).first();
  await expect(settlePeriodBtn).toBeVisible({ timeout: 30_000 });
  await tv.act.click(settlePeriodBtn);

  const batchDialog = page.locator('#treasury-batch-dialog');
  await expect(batchDialog).toBeVisible({ timeout: 30_000 });
  await tv.act.fill(batchDialog.locator('#treasury-batch-id'), 'BATCH-140507-01');
  await tv.act.fill(batchDialog.locator('#treasury-batch-tracking'), 'PAYA-7001');
  await tv.act.click(batchDialog.getByRole('button', { name: 'ثبت واریز' }));
  await expect(batchDialog).toBeHidden({ timeout: 30_000 });

  await tv.say('treasury_archive');
  await tv.act.click(page.getByRole('tab', { name: /آرشیو|سوابق/ }));
  await expect(page.getByRole('heading', { name: 'سوابق اسناد واریز شده و کدهای پیگیری بانک' })).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1000);
  await tv.expectNoErrors();
  await tv.say('end');
});
