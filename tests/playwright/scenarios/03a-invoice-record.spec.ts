/**
 * Video 3-a: recording an invoice (plan §4 row 3-a). User demo_employee (seed: --purge, then --base).
 * Two-line invoice with discount, VAT, attachment and description; draft → send → internal number;
 * then the same number again for the same counterparty: duplicate warning and the reason dialog on send.
 */
import type { Locator, Page } from '@playwright/test';
import captions from './03a-invoice-record.captions.json';
import { expect, videoTest, type TrainingVideo } from '../helpers/video';

const test = videoTest(captions);

const INVOICE_NUMBER = 'F-3001';
const HEAD = 'دوره‌های آموزشی';
// a 1×1 PNG stands in for the scanned invoice
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

/** Picks the first option whose text contains `text` (ngValue options carry generated values). */
async function pickOption(select: Locator, text: string): Promise<void> {
  const value = await select.locator('option').filter({ hasText: text }).first().getAttribute('value');
  await select.selectOption(value ?? '');
}

function invoiceDialog(page: Page): Locator {
  return page.getByRole('dialog').filter({ hasText: 'ردیف‌های فاکتور' });
}

async function openNewInvoice(page: Page, tv: TrainingVideo): Promise<Locator> {
  await tv.act.click(page.getByRole('button', { name: /فاکتور جدید/ }).filter({ visible: true }).first());
  const dialog = invoiceDialog(page);
  await expect(dialog.getByLabel('شماره فاکتور یا رسید')).toBeVisible({ timeout: 30_000 });
  return dialog;
}

async function fillHeader(dialog: Locator, tv: TrainingVideo, quick = false): Promise<void> {
  const counterparty = dialog.getByLabel('طرف‌حساب', { exact: true });
  await expect(counterparty.locator('option')).not.toHaveCount(1, { timeout: 30_000 });
  if (!quick) await tv.act.click(counterparty);
  await counterparty.selectOption({ index: 1 });
  await tv.act.fill(dialog.getByLabel('شماره فاکتور یا رسید'), INVOICE_NUMBER, { quick });
  await tv.act.fill(dialog.getByLabel('تاریخ فاکتور (شمسی)'), '1405/08/05', { quick: true });
}

async function fillLine(dialog: Locator, tv: TrainingVideo, i: number, line: { desc: string; qty: string; unit: string; price: number }, quick = false): Promise<void> {
  await tv.act.fill(dialog.getByLabel('شرح ردیف').nth(i), line.desc, { quick });
  await tv.act.fill(dialog.getByLabel('تعداد', { exact: true }).nth(i), line.qty, { quick: true });
  await tv.act.fill(dialog.getByLabel('واحد', { exact: true }).nth(i), line.unit, { quick: true });
  await tv.fillAmount(dialog.getByLabel('فی ردیف (ریال)').nth(i), line.price);
  await pickOption(dialog.getByLabel('سرفصل هزینهٔ ردیف').nth(i), HEAD);
}

function invoiceRows(page: Page): Locator {
  return page.getByRole('row').filter({ hasText: INVOICE_NUMBER });
}

/** «ارسال» on the draft row, then the confirm dialog. */
async function sendDraft(page: Page, tv: TrainingVideo): Promise<void> {
  const draft = invoiceRows(page).filter({ has: page.getByRole('button', { name: /ارسال/ }) }).first();
  await expect(draft).toBeVisible({ timeout: 30_000 });
  await tv.act.click(draft.getByRole('button', { name: /ارسال/ }).first());
  await tv.act.click(page.getByRole('button', { name: 'تایید', exact: true }));
}

test('video 3-a: invoice record', async ({ page, tv }) => {
  try {
    await page.goto('/login');
  } catch {
    await page.waitForTimeout(1000);
    await page.goto('/login');
  }
  await expect(page.getByRole('button', { name: 'ورود به سامانه' })).toBeVisible();
  await tv.titleCard();

  await tv.say('login');
  await tv.loginAs('demo_employee');
  await tv.pickCompany();
  await tv.openMenu('ثبت فاکتور', '/app/finance/employee-invoices');
  await expect(page.getByLabel('جستجوی فاکتور')).toBeVisible({ timeout: 30_000 });

  // ─── فرم فاکتور ───
  await tv.say('new');
  let dialog = await openNewInvoice(page, tv);
  await tv.say('header');
  await fillHeader(dialog, tv);

  await tv.say('lines');
  await fillLine(dialog, tv, 0, { desc: 'ماژیک وایت‌برد', qty: '10', unit: 'عدد', price: 500_000 });
  await tv.act.click(dialog.getByRole('button', { name: /افزودن ردیف/ }));
  await fillLine(dialog, tv, 1, { desc: 'کاغذ A4', qty: '4', unit: 'بسته', price: 4_250_000 });

  await tv.say('totals');
  await tv.fillAmount(dialog.getByLabel('تخفیف کل فاکتور (ریال)'), 1_000_000);
  const vat = dialog.getByRole('checkbox', { name: /مشمول مالیات/ });
  if (!(await vat.isChecked())) await tv.act.click(vat);
  await expect(dialog.getByText('مبلغ قابل پرداخت (ریال)')).toBeVisible();

  await tv.say('attach');
  await dialog.locator('input[type="file"]').setInputFiles({ name: 'invoice-F-3001.png', mimeType: 'image/png', buffer: PNG });
  await expect(dialog.getByText('invoice-F-3001.png')).toBeVisible();
  await tv.act.fill(dialog.getByLabel('شرح و جزئیات هزینه'), 'خرید لوازم کلاس آموزشی');

  await tv.say('save');
  await tv.act.click(dialog.getByRole('button', { name: /ذخیره فاکتور پیش‌نویس/ }));
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  await expect(invoiceRows(page).first()).toBeVisible({ timeout: 30_000 });
  await tv.expectNoErrors();

  // ─── ارسال و شمارهٔ داخلی ───
  await tv.say('send');
  await sendDraft(page, tv);
  await expect(invoiceRows(page).first().getByText(/شمارهٔ داخلی/)).toBeVisible({ timeout: 30_000 });
  await tv.say('number');
  await tv.expectNoErrors();

  // ─── فاکتور تکراری ───
  await tv.say('duplicate');
  dialog = await openNewInvoice(page, tv);
  await fillHeader(dialog, tv, true);
  await expect(dialog.getByText('این شماره فاکتور برای این طرف حساب قبلاً ثبت شده است')).toBeVisible({ timeout: 30_000 });
  await fillLine(dialog, tv, 0, { desc: 'ماژیک وایت‌برد', qty: '10', unit: 'عدد', price: 500_000 }, true);
  await tv.act.fill(dialog.getByLabel('شرح و جزئیات هزینه'), 'خرید لوازم کلاس آموزشی', { quick: true });
  await tv.act.click(dialog.getByRole('button', { name: /ذخیره فاکتور پیش‌نویس/ }));
  await expect(dialog).toBeHidden({ timeout: 30_000 });

  await tv.say('duplicate_send');
  await sendDraft(page, tv);
  const reason = page.getByRole('dialog').filter({ hasText: 'دلیل ارسال فاکتور تکراری' });
  await expect(reason).toBeVisible({ timeout: 30_000 });
  await tv.act.fill(reason.getByLabel('دلیل اقدام'), 'این قسط دوم همان خرید است و فروشنده شمارهٔ تازه نداده است.');
  await tv.act.click(reason.getByRole('button', { name: 'ارسال فاکتور' }));
  await expect(reason).toBeHidden({ timeout: 30_000 });
  await expect(invoiceRows(page).filter({ hasText: 'تکراری' }).first()).toBeVisible({ timeout: 30_000 });
  await tv.say('duplicate_done');
  await tv.expectNoErrors();
  await tv.say('end');
});
