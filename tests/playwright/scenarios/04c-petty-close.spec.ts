/**
 * Video 4-c: petty cash reconciliation, debt settlement, handover & closing (plan §4 row 4-c).
 * Seed: --purge, then --base --with-petty-account.
 * demo_accountant opens "رسیدگی تن‌خواه" -> "حساب‌های تنخواه", records a periodic cash reconciliation
 * with a 2,000,000 Rial shortage, settles the resulting debt by cash reference, hands the account over
 * to demo_employee2 ("سارا کارمند دوم"), and closes the new account with a treasury return reference.
 */
import type { Locator, Page } from '@playwright/test';
import captions from './04c-petty-close.captions.json';
import { expect, videoTest } from '../helpers/video';

const test = videoTest(captions);

function accountCard(page: Page, name: string): Locator {
  return page.locator('article').filter({ hasText: name }).first();
}

test('video 4-c: petty cash reconcile, settle, handover and close', async ({ page, tv }) => {
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

  await tv.say('login');
  await tv.loginAs('demo_accountant');
  await tv.pickCompany();
  await tv.openMenu('رسیدگی تن‌خواه', '/app/finance/accountant-petty-cash');
  await tv.act.click(page.getByRole('tab', { name: /حساب/ }));

  const maryamCard = accountCard(page, 'مریم کارمند');
  await expect(maryamCard).toBeVisible({ timeout: 30_000 });

  // ─── ۱. تطبیق دوره‌ای نقد (کسری ۲ میلیون ریال) ───
  await tv.say('reconcile_open');
  await tv.act.click(maryamCard.getByRole('button', { name: 'تطبیق نقد' }));
  const recDialog = page.getByRole('dialog').filter({ hasText: 'تطبیق نقد' });
  await expect(recDialog.getByText(/موجودی دفتری فعلی/)).toBeVisible({ timeout: 30_000 });

  await tv.say('reconcile_save');
  await tv.act.fill(recDialog.locator('#pam_rec_date'), '1405/08/15', { quick: true });
  const calToggle = recDialog.getByTitle('انتخاب تاریخ از تقویم');
  if (await page.locator('.datepicker-outer-container').isVisible().catch(() => false)) {
    await calToggle.click();
  }
  await tv.fillAmount(recDialog.locator('#pam_rec_counted'), 28_000_000);
  await tv.act.fill(recDialog.locator('#pam_rec_note'), 'شمارش صندوق نیمهٔ آبان؛ دو میلیون ریال کسری');
  await tv.act.click(recDialog.getByRole('button', { name: 'ثبت تطبیق' }));
  await expect(recDialog).toBeHidden({ timeout: 30_000 });
  await tv.expectNoErrors();

  // باز کردن جزئیات حساب برای دیدن ردیف تطبیق
  await tv.say('expand');
  await tv.act.click(maryamCard.getByRole('button', { name: 'نمایش تسویه‌ها و تطبیق‌ها' }));
  await expect(maryamCard.getByText('کسری')).toBeVisible({ timeout: 30_000 });

  // ─── ۲. تسویهٔ بدهی ───
  await tv.say('settle');
  await tv.act.click(maryamCard.getByRole('button', { name: 'تسویهٔ بدهی' }));
  const settleDialog = page.getByRole('dialog').filter({ hasText: 'تسویهٔ بدهی' });
  await expect(settleDialog.getByText(/بدهی کل/)).toBeVisible({ timeout: 30_000 });
  await tv.fillAmount(settleDialog.locator('#pam_settle_amount'), 2_000_000);
  await tv.act.fill(settleDialog.locator('#pam_settle_ref'), 'SET-4003');
  await tv.act.fill(settleDialog.locator('#pam_settle_note'), 'واریز نقدی کسری صندوق توسط تنخواه‌گردان');
  await tv.act.click(settleDialog.getByRole('button', { name: 'ثبت تسویه' }));
  await expect(settleDialog).toBeHidden({ timeout: 30_000 });
  await expect(maryamCard.getByText('SET-4003')).toBeVisible({ timeout: 30_000 });
  await tv.expectNoErrors();

  // ─── ۳. تحویل حساب به سارا کارمند دوم ───
  await tv.say('handover_open');
  await tv.act.click(maryamCard.getByRole('button', { name: 'تحویل حساب' }));
  const hoDialog = page.getByRole('dialog').filter({ hasText: 'تحویل حساب' });
  await expect(hoDialog).toBeVisible({ timeout: 30_000 });
  await tv.act.fill(hoDialog.getByRole('combobox', { name: 'جست‌وجوی تنخواه‌گردان جدید' }), 'علی کارمند');
  await tv.act.click(hoDialog.getByRole('option', { name: /علی کارمند دوم/ }));
  await tv.act.fill(hoDialog.locator('#pam_ho_ref'), 'HO-4004');
  await tv.act.fill(hoDialog.locator('#pam_ho_note'), 'تحویل تنخواه کارگاه به تنخواه‌گردان جدید');

  await tv.say('handover_done');
  await tv.act.click(hoDialog.getByRole('button', { name: 'تحویل حساب' }));
  await expect(hoDialog).toBeHidden({ timeout: 30_000 });
  const aliCard = accountCard(page, 'علی کارمند دوم');
  await expect(aliCard).toBeVisible({ timeout: 30_000 });
  await expect(maryamCard.getByText('بسته‌شده')).toBeVisible({ timeout: 30_000 });
  await tv.expectNoErrors();

  // ─── ۴. بستن حساب تنخواه علی کارمند دوم ───
  await tv.say('close_open');
  await tv.act.click(aliCard.getByRole('button', { name: 'بستن حساب' }));
  const closeDialog = page.getByRole('dialog').filter({ hasText: 'بستن حساب' });
  await expect(closeDialog.getByText(/موجودی فعلی حساب/)).toBeVisible({ timeout: 30_000 });

  await tv.say('close_done');
  await tv.act.fill(closeDialog.locator('#pam_close_ref'), 'CLS-4005');
  await tv.act.fill(closeDialog.locator('#pam_close_note'), 'پایان دوره و برگشت ماندهٔ تنخواه به خزانه');
  await tv.act.click(closeDialog.getByRole('button', { name: 'بستن حساب' }));
  await expect(closeDialog).toBeHidden({ timeout: 30_000 });
  await expect(aliCard.getByText('بسته‌شده')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1000);
  await tv.expectNoErrors();
  await tv.say('end');
});
