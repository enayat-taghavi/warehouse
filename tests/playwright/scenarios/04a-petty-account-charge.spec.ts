/**
 * Video 4-a: petty cash account and charge (plan §4 row 4-a). Users demo_accountant, demo_employee, demo_manager,
 * demo_treasury (seed: --purge, then --base). The accountant opens a petty account for the employee (the manager
 * cannot open «رسیدگی تن‌خواه»; the ceiling field is manager-only, so it stays 0), the employee asks for a charge,
 * the accountant reviews it and, being over the ceiling, the manager approves it in «کارهای من»; the treasurer
 * pays it with a tracking code.
 */
import type { Locator, Page } from '@playwright/test';
import captions from './04a-petty-account-charge.captions.json';
import { expect, videoTest, type TrainingVideo } from '../helpers/video';

const test = videoTest(captions);

const CHARGE_TITLE = 'شارژ تنخواه آبان';

function chargeCard(page: Page): Locator {
  return page.locator('div.rounded-2xl').filter({ hasText: 'شارژ تنخواه' }).filter({ has: page.getByRole('button') }).first();
}

async function openMyTasks(tv: TrainingVideo, page: Page): Promise<void> {
  await tv.openMenu('کارهای من', '/app/my-tasks');
  await expect(chargeCard(page)).toBeVisible({ timeout: 30_000 });
}

test('video 4-a: petty account and charge', async ({ page, tv }) => {
  try {
    await page.goto('/login');
  } catch {
    await page.waitForTimeout(1000);
    await page.goto('/login');
  }
  await expect(page.getByRole('button', { name: 'ورود به سامانه' })).toBeVisible();
  await tv.titleCard();

  // ─── حسابدار: ساختن حساب تنخواه ───
  await tv.say('opener');
  await tv.loginAs('demo_accountant');
  await tv.pickCompany();
  await tv.openMenu('رسیدگی تن‌خواه', '/app/finance/accountant-petty-cash');
  await tv.act.click(page.getByRole('tab', { name: /حساب‌های تنخواه|حساب‌ها/ }).first());
  await tv.say('accounts');
  await tv.act.click(page.getByRole('button', { name: /حساب جدید/ }).first());
  const form = page.getByRole('dialog').filter({ hasText: 'حساب تنخواه جدید' });
  const picker = form.getByRole('combobox', { name: 'جست‌وجوی تنخواه‌گردان' });
  await expect(picker).toBeVisible({ timeout: 30_000 });
  await tv.say('custodian');
  await tv.act.fill(picker, 'مریم');
  await tv.act.click(page.getByRole('option', { name: /مریم/ }).first());
  await tv.say('save');
  await tv.act.click(form.getByRole('button', { name: 'ذخیره', exact: true }));
  await expect(form).toBeHidden({ timeout: 30_000 });
  await expect(page.getByText(/مریم/).first()).toBeVisible({ timeout: 30_000 });
  await tv.expectNoErrors();

  // ─── کارمند: درخواست شارژ ───
  await tv.loginAs('demo_employee');
  await tv.pickCompany();
  await tv.openMenu('مدیریت تن‌خواه', '/app/finance/employee-petty-cash');
  await expect(page.getByRole('button', { name: /درخواست شارژ/ }).first()).toBeVisible({ timeout: 30_000 });
  await tv.say('employee');
  await tv.act.click(page.getByRole('button', { name: /درخواست شارژ/ }).first());
  const charge = page.getByRole('dialog').filter({ hasText: 'ارسال درخواست شارژ' });
  await expect(charge.getByLabel('عنوان درخواست')).toBeVisible({ timeout: 30_000 });
  await tv.say('charge');
  await tv.act.fill(charge.getByLabel('عنوان درخواست'), CHARGE_TITLE);
  await tv.fillAmount(charge.getByLabel('مبلغ مورد نیاز (ریال)'), 20_000_000);
  await tv.act.fill(charge.getByLabel('علت و توضیحات درخواست شارژ'), 'خریدهای کوچک دفتر در ماه آبان.', { quick: true });
  await tv.act.click(charge.getByRole('button', { name: 'ارسال درخواست شارژ' }));
  await expect(charge).toBeHidden({ timeout: 30_000 });
  await tv.expectNoErrors();

  // ─── حسابدار: بررسی در «کارهای من» ───
  await tv.loginAs('demo_accountant');
  await tv.pickCompany();
  await openMyTasks(tv, page);
  await tv.say('accountant');
  await tv.act.click(chargeCard(page).getByRole('button', { name: 'بررسی' }));
  await expect(chargeCard(page)).toBeHidden({ timeout: 30_000 });
  await tv.expectNoErrors();

  // ─── مدیر: تأیید شارژ بالای سقف ───
  await tv.loginAs('demo_manager');
  await tv.pickCompany();
  await openMyTasks(tv, page);
  await tv.say('manager');
  await tv.act.click(chargeCard(page).getByRole('button', { name: 'تأیید' }));
  await expect(chargeCard(page)).toBeHidden({ timeout: 30_000 });
  await tv.expectNoErrors();

  // ─── خزانه‌دار: ثبت واریز ───
  await tv.loginAs('demo_treasury');
  await tv.pickCompany();
  await openMyTasks(tv, page);
  await tv.say('treasury');
  await tv.act.click(chargeCard(page).getByRole('button', { name: 'مشاهدهٔ جزئیات سند' }));
  const tracking = page.getByLabel(/شمارهٔ پیگیری یا سند بانکی واریز/);
  await expect(tracking).toBeVisible({ timeout: 30_000 });
  await tv.say('pay');
  await tv.act.fill(tracking, 'TRK-4001');
  await tv.act.click(page.getByRole('button', { name: 'ثبت واریز' }));
  await expect(tracking).toBeHidden({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  await tv.expectNoErrors();

  // ─── کارمند: موجودی ───
  await tv.loginAs('demo_employee');
  await tv.pickCompany();
  await tv.openMenu('مدیریت تن‌خواه', '/app/finance/employee-petty-cash');
  await expect(page.locator('#balanceCard')).toBeVisible({ timeout: 30_000 });
  await tv.say('balance');
  await tv.expectNoErrors();
  await tv.say('end');
});
