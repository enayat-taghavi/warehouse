import { expect, test } from '@playwright/test';
import { TrainingVideo } from '../helpers/video';

/**
 * فیلم ۹ — گزارش‌های مدیریتی، داشبورد و کنترل بودجه:
 *   ۱. مدیر (`demo_manager`) وارد می‌شود و «داشبورد مدیریتی» (`/app/finance/manager-dashboard`) را می‌بیند.
 *   ۲. به «کنترل بودجه» (`/app/finance/manager-budget`) می‌رود و وضعیت مصرف بودجه را بررسی می‌کند.
 *   ۳. به «گزارش‌های مدیریتی» (`/app/finance/manager-reports`) می‌رود، تب‌های گزارش و فیلترها را می‌بیند و خروجی اکسل و چاپ می‌گیرد.
 *
 * پیش‌نیاز داده: `seed_video_demo --purge` سپس `seed_video_demo --base --with-invoice approved --with-petty-account`.
 */

test('video 9: manager dashboard, budget control and management reports', async ({ page }, testInfo) => {
  test.setTimeout(360_000);
  const tv = new TrainingVideo(page, testInfo, '09-reports');
  await tv.init();
  await tv.titleCard();

  await tv.loginAs('demo_manager');
  await tv.pickCompany();

  // ─── ۱. داشبورد مدیریتی ───
  await tv.openMenu('داشبورد مدیریتی', '/app/finance/manager-dashboard');
  await tv.say('dashboard');
  await expect(page.locator('main, [dir="rtl"]').first()).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  await tv.expectNoErrors();

  // ─── ۲. کنترل بودجه ───
  await tv.openMenu('کنترل بودجه', '/app/finance/manager-budget');
  await tv.say('budget');
  await expect(page.getByText(/بودجه/).first()).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  await tv.expectNoErrors();

  // ─── ۳. گزارش‌های مدیریتی ───
  await tv.openMenu('گزارش‌های مدیریتی', '/app/finance/manager-reports');
  await tv.say('reports_overview');
  await expect(page.getByRole('tab').first()).toBeVisible({ timeout: 30_000 });

  await tv.say('reports_filter');
  const refreshBtn = page.locator('button[appAction="refresh"]').first();
  if (await refreshBtn.isVisible().catch(() => false)) {
    await tv.act.click(refreshBtn);
  }

  await tv.say('reports_tabs');
  const tabs = page.getByRole('tab');
  const tabCount = await tabs.count();
  for (let i = 1; i < Math.min(tabCount, 4); i++) {
    await tv.act.click(tabs.nth(i));
    await page.waitForTimeout(800);
  }
  await tv.act.click(tabs.first());

  await tv.say('export_print');
  const exportBtn = page.locator('button[appAction="export-excel"]').first();
  if (await exportBtn.isEnabled().catch(() => false)) {
    await tv.expectDownload(async () => {
      await tv.act.click(exportBtn);
    });
  }

  const printBtn = page.locator('button[appAction="print"]').first();
  if (await printBtn.isVisible().catch(() => false)) {
    await tv.expectPrint(async () => {
      await tv.act.click(printBtn);
    });
  }

  await tv.expectNoErrors();
  await tv.say('end');
});
