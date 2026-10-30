import type { Page } from '@playwright/test';
import captions from './09-reports.captions.json';
import { expect, videoTest, type TrainingVideo } from '../helpers/video';

/**
 * فیلم ۹ — گزارش‌های مدیریتی، داشبورد و کنترل بودجه:
 *   ۱. مدیر (`demo_manager`) وارد می‌شود و «داشبورد مدیریتی» (`/app/finance/manager-dashboard`) را می‌بیند.
 *   ۲. به «کنترل بودجه» (`/app/finance/manager-budget`) می‌رود و وضعیت مصرف بودجه را بررسی می‌کند.
 *   ۳. به «گزارش‌های مدیریتی» (`/app/finance/manager-reports`) می‌رود، تب‌های گزارش و فیلترها را می‌بیند و خروجی اکسل و چاپ می‌گیرد.
 *
 * پیش‌نیاز داده: `seed_video_demo --purge` سپس `seed_video_demo --base --with-invoice approved --with-attendance`.
 */

const test = videoTest(captions);

test('video 9: manager dashboard, budget control and management reports', async ({ page, tv }) => {
  test.setTimeout(360_000);

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
  await page.waitForTimeout(1500);

  await tv.say('reports_tabs');
  const tabs = page.getByRole('tab');
  const tabCount = await tabs.count();
  for (let i = 1; i < Math.min(tabCount, 4); i++) {
    await tv.act.click(tabs.nth(i));
    await page.waitForTimeout(800);
  }
  await tv.act.click(tabs.first());
  await page.waitForTimeout(1000);

  await tv.say('export_print');
  const exportBtn = page.getByRole('button', { name: /خروجی اکسل|اکسل/ }).first();
  if (await exportBtn.isEnabled().catch(() => false)) {
    await tv.download(async () => {
      await tv.act.click(exportBtn);
    });
  }

  const printBtn = page.getByRole('button', { name: /چاپ گزارش|چاپ/ }).first();
  if (await printBtn.isVisible().catch(() => false)) {
    await tv.print(async () => {
      await tv.act.click(printBtn);
    });
  }

  await tv.expectNoErrors();
  await tv.say('end');
});
