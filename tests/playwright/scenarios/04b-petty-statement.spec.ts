/**
 * Video 4-b: petty cash expenses, statement, line rejection & refill (plan §4 row 4-b).
 * Seed: --purge, then --base --with-petty-account.
 * demo_employee records 2 expenses (one with receipt attachment) and creates/sends a statement;
 * demo_accountant opens statement detail from My Tasks, rejects the second line with a reason,
 * and marks the statement reviewed; demo_manager approves; demo_treasury pays/refills with tracking code;
 * demo_employee views updated balance and open debt from the rejected line.
 */
import type { Locator, Page } from '@playwright/test';
import captions from './04b-petty-statement.captions.json';
import { expect, videoTest, type TrainingVideo } from '../helpers/video';

const test = videoTest(captions);

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function openMyTasks(tv: TrainingVideo, page: Page): Promise<void> {
  await page.goto('/app/my-tasks');
  await expect(page.getByRole('heading', { name: 'کارهای من' })).toBeVisible({ timeout: 30_000 });
}

function statementCard(page: Page): Locator {
  return page.locator('div.rounded-2xl').filter({ hasText: 'صورت‌حساب تنخواه' }).filter({ hasText: 'مریم کارمند' }).first();
}

async function pickFirstExpenseHead(select: Locator): Promise<void> {
  await expect(select.locator('option')).not.toHaveCount(1, { timeout: 30_000 });
  const val = await select.locator('optgroup option').first().getAttribute('value');
  await select.selectOption(val ?? { index: 1 });
}

test('video 4-b: petty cash statement, line rejection and refill', async ({ page, tv }) => {
  try {
    await page.goto('/login');
  } catch {
    await page.waitForTimeout(1000);
    await page.goto('/login');
  }
  await expect(page.getByRole('button', { name: 'ورود به سامانه' })).toBeVisible();
  await tv.titleCard();

  // ─── ۱. کارمند: ثبت دو هزینه و ارسال صورت‌حساب ───
  await tv.say('login');
  await tv.loginAs('demo_employee');
  await tv.pickCompany();
  await tv.openMenu('مدیریت تن‌خواه', '/app/finance/employee-petty-cash');
  await expect(page.locator('#balanceCard')).toBeVisible({ timeout: 30_000 });
  await tv.say('balance');

  // هزینهٔ اول (با رسید)
  await tv.say('exp1');
  await tv.act.click(page.getByRole('button', { name: 'ثبت هزینه' }));
  const expDialog = page.getByRole('dialog').filter({ hasText: 'ثبت سند هزینه از محل تنخواه' });
  await expect(expDialog).toBeVisible({ timeout: 30_000 });
  await tv.act.fill(expDialog.locator('#petty_expense_title'), 'خرید لوازم تحریر کارگاه');
  await pickFirstExpenseHead(expDialog.locator('#petty_expense_head'));
  await tv.fillAmount(expDialog.locator('#petty_expense_amount'), 3_000_000);
  await expDialog.locator('#petty_expense_file').setInputFiles({
    name: 'receipt-4001.png',
    mimeType: 'image/png',
    buffer: PNG,
  });
  await tv.act.click(expDialog.getByRole('button', { name: 'ثبت هزینه (پیش‌نویس)' }));
  await expect(expDialog).toBeHidden({ timeout: 30_000 });
  await tv.expectNoErrors();

  // هزینهٔ دوم (بدون رسید؛ برای رد شدن توسط حسابدار)
  await tv.say('exp2');
  await tv.act.click(page.getByRole('button', { name: 'ثبت هزینه' }));
  await expect(expDialog).toBeVisible({ timeout: 30_000 });
  await tv.act.fill(expDialog.locator('#petty_expense_title'), 'پذیرایی جلسه بدون فاکتور');
  await pickFirstExpenseHead(expDialog.locator('#petty_expense_head'));
  await tv.fillAmount(expDialog.locator('#petty_expense_amount'), 1_500_000);
  await tv.act.click(expDialog.getByRole('button', { name: 'ثبت هزینه (پیش‌نویس)' }));
  await expect(expDialog).toBeHidden({ timeout: 30_000 });
  await tv.expectNoErrors();

  // ساخت و ارسال صورت‌حساب
  await tv.say('statement');
  await tv.act.click(page.getByRole('tab', { name: /صورت‌حساب/ }));
  await expect(page.getByRole('row').filter({ hasText: 'خرید لوازم تحریر کارگاه' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('row').filter({ hasText: 'پذیرایی جلسه بدون فاکتور' })).toBeVisible({ timeout: 30_000 });
  const selectAll = page.getByRole('checkbox', { name: 'انتخاب همهٔ هزینه‌های باز' });
  await expect(selectAll).toBeVisible({ timeout: 30_000 });
  await tv.act.click(selectAll);
  await tv.act.click(page.getByRole('button', { name: 'ساخت و ارسال صورت‌حساب' }));
  await expect(page.getByRole('row').filter({ hasText: 'در بررسی' }).first()).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  await tv.expectNoErrors();

  // ─── ۲. حسابدار: رد یک ردیف با دلیل و تأیید بررسی صورت‌حساب ───
  await tv.loginAs('demo_accountant');
  await tv.pickCompany();
  await openMyTasks(tv, page);
  await tv.say('acc_detail');
  await expect(statementCard(page)).toBeVisible({ timeout: 30_000 });
  await tv.act.click(statementCard(page).getByRole('button', { name: /مشاهده/ }));

  const detailModal = page.getByRole('dialog').filter({ hasText: 'صورت‌حساب تنخواه' });
  await expect(detailModal).toBeVisible({ timeout: 30_000 });
  const badRow = detailModal.getByRole('row').filter({ hasText: 'پذیرایی جلسه بدون فاکتور' });
  await expect(badRow).toBeVisible({ timeout: 30_000 });

  await tv.say('acc_reject');
  await tv.act.click(badRow.getByRole('button', { name: 'رد ردیف' }));
  await tv.act.fill(detailModal.locator('#rejectReason'), 'رسید معتبر پیوست نشده است.');
  await tv.act.click(detailModal.getByRole('button', { name: 'ثبت رد ردیف' }));
  await expect(badRow.getByText('ردشده')).toBeVisible({ timeout: 30_000 });
  await tv.expectNoErrors();

  await tv.say('acc_review');
  await tv.act.click(detailModal.getByRole('button', { name: 'بستن' }).first());
  await expect(detailModal).toBeHidden({ timeout: 30_000 });
  await openMyTasks(tv, page);
  await tv.act.click(statementCard(page).getByRole('button', { name: 'بررسی' }));
  await expect(statementCard(page)).toBeHidden({ timeout: 30_000 });
  await page.waitForTimeout(1000);
  await tv.expectNoErrors();

  // ─── ۳. مدیر: تأیید صورت‌حساب ───
  await tv.loginAs('demo_manager');
  await tv.pickCompany();
  await openMyTasks(tv, page);
  await tv.say('manager');
  await tv.act.click(statementCard(page).getByRole('button', { name: 'تأیید' }));
  await expect(statementCard(page)).toBeHidden({ timeout: 30_000 });
  await page.waitForTimeout(1000);
  await tv.expectNoErrors();

  // ─── ۴. خزانه‌دار: ثبت پرداخت (شارژ دوباره) ───
  await tv.loginAs('demo_treasury');
  await tv.pickCompany();
  await openMyTasks(tv, page);
  await tv.say('treasury');
  await tv.act.click(statementCard(page).getByRole('button', { name: /مشاهده/ }));
  const tracking = page.locator('#trackingCodeSt');
  await expect(tracking).toBeVisible({ timeout: 30_000 });
  await tv.act.fill(tracking, 'TRK-4002');
  await tv.act.click(page.getByRole('button', { name: 'ثبت پرداخت' }));
  await expect(tracking).toBeHidden({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  await tv.expectNoErrors();

  // ─── ۵. کارمند: مشاهدهٔ ماندهٔ شارژشده و بدهی ردیف ردشده ───
  await tv.loginAs('demo_employee');
  await tv.pickCompany();
  await tv.openMenu('مدیریت تن‌خواه', '/app/finance/employee-petty-cash');
  await expect(page.locator('#balanceCard')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#balanceCard').getByText('ردیف‌های ردشده')).toBeVisible({ timeout: 30_000 });
  await tv.say('final_balance');
  await tv.expectNoErrors();
  await tv.say('end');
});
