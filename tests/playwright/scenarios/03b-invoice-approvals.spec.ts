/**
 * Video 3-b: invoice approvals (plan §4 row 3-b). Users demo_supervisor, demo_employee, demo_accountant, demo_manager
 * (seed: --purge, then --base --with-invoice submitted → DEMO-INV-100 waits for the supervisor).
 * Supervisor returns it for a fix, the employee edits and resends, supervisor, accountant and manager approve.
 */
import type { Locator, Page } from '@playwright/test';
import captions from './03b-invoice-approvals.captions.json';
import { expect, videoTest } from '../helpers/video';

const test = videoTest(captions);

const INVOICE = 'DEMO-INV-100';

function invoiceRow(page: Page): Locator {
  return page.getByRole('row').filter({ hasText: INVOICE }).first();
}

test('video 3-b: invoice approvals', async ({ page, tv }) => {
  try {
    await page.goto('/login');
  } catch {
    await page.waitForTimeout(1000);
    await page.goto('/login');
  }
  await expect(page.getByRole('button', { name: 'ورود به سامانه' })).toBeVisible();
  await tv.titleCard();

  // ─── سرپرست: عودت برای اصلاح ───
  await tv.loginAs('demo_supervisor');
  await tv.pickCompany();
  await tv.openMenu('تایید فاکتورها', '/app/finance/supervisor-invoices');
  await expect(invoiceRow(page)).toBeVisible({ timeout: 30_000 });
  await tv.say('supervisor');
  await tv.say('return');
  await tv.act.click(invoiceRow(page).getByRole('button', { name: /عودت/ }));
  const reason = page.getByRole('dialog').filter({ hasText: 'دلیل اقدام' });
  await expect(reason).toBeVisible();
  await tv.act.fill(reason.getByLabel('دلیل اقدام'), 'شرح فاکتور کامل نیست؛ نام کلاس آموزشی را هم بنویسید.');
  await tv.act.click(reason.getByRole('button', { name: 'عودت فاکتور' }));
  await expect(reason).toBeHidden({ timeout: 30_000 });
  await expect(page.getByText(/برای اصلاح به کارمند برگشت/).first()).toBeVisible({ timeout: 30_000 });
  await tv.expectNoErrors();

  // ─── کارمند: کارهای من، اصلاح و ارسال دوباره ───
  await tv.loginAs('demo_employee');
  await tv.pickCompany();
  await tv.openMenu('ثبت فاکتور', '/app/finance/employee-invoices');
  await expect(invoiceRow(page)).toBeVisible({ timeout: 30_000 });
  await tv.say('employee');
  await tv.say('fix');
  await tv.act.click(invoiceRow(page).getByRole('button', { name: /ویرایش/ }));
  const dialog = page.getByRole('dialog', { name: 'ویرایش فاکتور پیش‌نویس' });
  await expect(dialog.getByLabel('شرح و جزئیات هزینه')).toBeVisible({ timeout: 30_000 });
  await tv.act.fill(dialog.getByLabel('شرح و جزئیات هزینه'), 'خرید لوازم کلاس آموزشی «حسابداری مقدماتی»');
  await tv.act.click(dialog.getByRole('button', { name: /ذخیره فاکتور/ }));
  await expect(dialog).toBeHidden({ timeout: 30_000 });

  await tv.say('resend');
  await tv.act.click(invoiceRow(page).getByRole('button', { name: /ارسال/ }));
  await tv.act.click(page.getByRole('button', { name: 'تایید', exact: true }));
  await expect(invoiceRow(page).getByText(/در انتظار/)).toBeVisible({ timeout: 30_000 });
  await tv.expectNoErrors();

  // ─── سرپرست: تأیید ───
  await tv.loginAs('demo_supervisor');
  await tv.pickCompany();
  await tv.openMenu('تایید فاکتورها', '/app/finance/supervisor-invoices');
  await expect(invoiceRow(page)).toBeVisible({ timeout: 30_000 });
  await tv.say('approve');
  await tv.act.click(invoiceRow(page).getByRole('button', { name: /تایید|تأیید/ }).first());
  await expect(page.getByText(/به کارتابل حسابداری ارسال شد/)).toBeVisible({ timeout: 30_000 });
  await tv.expectNoErrors();

  // ─── حسابدار: صدور سند ───
  await tv.loginAs('demo_accountant');
  await tv.pickCompany();
  await tv.openMenu('ممیزی فاکتورها', '/app/finance/accountant-invoices');
  await expect(invoiceRow(page)).toBeVisible({ timeout: 30_000 });
  await tv.say('accountant');
  await tv.act.click(invoiceRow(page).getByRole('button', { name: /صدور سند/ }));
  await expect(invoiceRow(page).getByRole('button', { name: /صدور سند/ })).toHaveCount(0, { timeout: 30_000 });
  await tv.expectNoErrors();

  // ─── مدیر: مجوز پرداخت ───
  await tv.loginAs('demo_manager');
  await tv.pickCompany();
  await tv.openMenu('کارتابل تاییدات', '/app/finance/manager-approvals');
  await tv.act.click(page.getByRole('tab', { name: /^(فاکتورهای هزینه|فاکتور)/ }).first());
  await expect(invoiceRow(page)).toBeVisible({ timeout: 30_000 });
  await tv.say('manager');
  await tv.act.click(invoiceRow(page).getByRole('button', { name: /مجوز پرداخت/ }));
  await expect(invoiceRow(page)).toBeHidden({ timeout: 30_000 });
  await tv.expectNoErrors();
  await tv.say('end');
});
