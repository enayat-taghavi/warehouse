/**
 * Video 3-c: invoice payment (plan §4 row 3-c). User demo_treasury
 * (seed: --purge, then --base --with-invoice approved → DEMO-INV-100, 24,200,000 rials, waits for treasury).
 * First installment → «پرداخت ناقص», void it with a reason, pay it again, print, last installment closes it, Excel.
 */
import type { Locator, Page } from '@playwright/test';
import captions from './03c-invoice-payment.captions.json';
import { expect, videoTest, type TrainingVideo } from '../helpers/video';

const test = videoTest(captions);

const INVOICE = 'DEMO-INV-100';

function invoiceRow(page: Page): Locator {
  return page.getByRole('row').filter({ hasText: INVOICE }).first();
}

function payDialog(page: Page): Locator {
  return page.getByRole('dialog').filter({ hasText: 'قسط‌های ثبت‌شده' });
}

async function openPay(page: Page, tv: TrainingVideo): Promise<Locator> {
  await tv.act.click(invoiceRow(page).getByRole('button', { name: /ثبت قسط/ }));
  const dialog = payDialog(page);
  await expect(dialog.getByLabel('کد پیگیری')).toBeVisible({ timeout: 30_000 });
  return dialog;
}

async function pay(dialog: Locator, tv: TrainingVideo, rials: number, tracking: string): Promise<void> {
  await tv.fillAmount(dialog.getByLabel('مبلغ قسط (ریال)'), rials);
  const account = dialog.getByLabel('حساب بانکی شرکت');
  if (await account.isVisible().catch(() => false)) {
    if ((await account.locator('option:checked').textContent())?.includes('انتخاب حساب')) {
      await tv.act.click(account);
      await account.selectOption({ index: 1 });
    }
  }
  await tv.act.fill(dialog.getByLabel('کد پیگیری'), tracking);
  await tv.act.click(dialog.getByRole('button', { name: 'ثبت قسط', exact: true }));
}

test('video 3-c: invoice payment', async ({ page, tv }) => {
  try {
    await page.goto('/login');
  } catch {
    await page.waitForTimeout(1000);
    await page.goto('/login');
  }
  await expect(page.getByRole('button', { name: 'ورود به سامانه' })).toBeVisible();
  await tv.titleCard();

  await tv.say('login');
  await tv.loginAs('demo_treasury');
  await tv.pickCompany();
  await tv.openMenu('تسویه فاکتور و تن‌خواه', '/app/finance/treasurer-invoices');
  await expect(invoiceRow(page)).toBeVisible({ timeout: 30_000 });
  await tv.say('list');

  // ─── قسط اول و ابطال ───
  await tv.say('open');
  let dialog = await openPay(page, tv);
  await tv.say('first');
  await pay(dialog, tv, 10_000_000, 'TRK-1001');
  await expect(dialog.getByRole('button', { name: /ابطال قسط/ })).toBeVisible({ timeout: 30_000 });
  await tv.say('partial');
  await tv.expectNoErrors();

  await tv.say('void');
  await tv.act.click(dialog.getByRole('button', { name: /ابطال قسط/ }).first());
  const reason = page.getByRole('dialog').filter({ hasText: 'دلیل ابطال قسط' });
  await expect(reason.getByLabel('دلیل اقدام')).toBeVisible();
  await tv.act.fill(reason.getByLabel('دلیل اقدام'), 'کد پیگیری اشتباه وارد شده بود.');
  await tv.act.click(reason.getByRole('button', { name: 'ابطال قسط' }));
  await expect(dialog.getByText('باطل شد').first()).toBeVisible({ timeout: 30_000 });
  await tv.expectNoErrors();

  await tv.say('again');
  await pay(dialog, tv, 10_000_000, 'TRK-1002');
  await expect(dialog.getByText('TRK-1002')).toBeVisible({ timeout: 30_000 });
  await tv.act.click(dialog.getByRole('button', { name: 'انصراف' }));
  await expect(invoiceRow(page).getByText('پرداخت ناقص')).toBeVisible({ timeout: 30_000 });
  await tv.expectNoErrors();

  // ─── چاپ ───
  await tv.say('print');
  // «چاپ / PDF» here downloads the server-made PDF
  await tv.download(() => tv.act.click(invoiceRow(page).getByRole('button', { name: /چاپ/ })), /\.pdf$/i);

  // ─── قسط آخر ───
  await tv.say('last');
  dialog = await openPay(page, tv);
  await pay(dialog, tv, 14_200_000, 'TRK-1003');
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  await tv.expectNoErrors();

  // ─── خروجی اکسل ───
  await tv.download(() => tv.act.click(page.getByRole('button', { name: /اکسل/ }).filter({ visible: true }).first()), /\.xlsx?$/i, 'excel');
  await tv.expectNoErrors();
  await tv.say('end');
});
