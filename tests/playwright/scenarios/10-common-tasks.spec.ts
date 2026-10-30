import type { Page } from '@playwright/test';
import captions from './10-common-tasks.captions.json';
import { expect, videoTest, type TrainingVideo } from '../helpers/video';

/**
 * فیلم ۱۰ — کارهای مشترک:
 *   ۱. تعیین جانشین (`demo_supervisor` از منوی کاربر → «جانشین من» کارمند دوم `demo_employee2` را جانشین می‌کند).
 *   ۲. کار به جای دیگری (`demo_employee2` در «کارهای من» کارت فاکتورِ سرپرست را می‌بیند).
 *   ۳. ارجاع با دستور و مهلت به `demo_accountant` + رونوشت «برای اطلاع» به `demo_manager`.
 *   ۴. حسابدار پاسخ ارجاع را می‌نویسد و «انجام شد» می‌زند؛ مدیر «رؤیت شد» می‌زند.
 *   ۵. کار بدون اینترنت (`context.setOffline(true)`) روی تأیید فاکتور در «کارهای من» و ارسال خودکار صف پس از وصل شدن (`setOffline(false)`).
 *
 * پیش‌نیاز داده: `seed_video_demo --purge` سپس `seed_video_demo --base --with-invoice submitted`.
 */

const test = videoTest(captions);

async function openMyTasks(tv: TrainingVideo, page: Page): Promise<void> {
  await page.goto('/app/my-tasks', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'کارهای من' })).toBeVisible({ timeout: 30_000 });
  await tv.dismissPushBanner();
}

test('video 10: substitutes, workflow referrals, inform copies, and offline queue sync', async ({ page, context, tv }) => {
  test.setTimeout(480_000);

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

  // ─── ۱. سرپرست: تعیین جانشین در منوی کاربر ───
  await tv.loginAs('demo_supervisor');
  await tv.pickCompany();

  await tv.say('substitute_set');
  await tv.act.click(page.locator('button[title*="پروفایل کاربری"]').first());
  await tv.act.click(page.getByRole('button', { name: 'جانشین من' }));

  const subDialog = page.getByRole('dialog', { name: 'جانشین موقت من' });
  await expect(subDialog).toBeVisible({ timeout: 30_000 });
  const subSelect = subDialog.locator('#wfsub-substitute');
  await expect(subSelect.getByRole('option', { name: /کارمند دوم/ })).toBeAttached({ timeout: 15_000 });
  const emp2Val = await subSelect.getByRole('option', { name: /کارمند دوم/ }).getAttribute('value');
  await subSelect.selectOption(emp2Val || '');

  await tv.act.fill(subDialog.locator('#wfsub-start-date'), '1405/01/01');
  await tv.act.fill(subDialog.locator('#wfsub-end-date'), '1405/12/29');
  await tv.act.click(subDialog.getByRole('button', { name: 'ثبت جانشین' }));
  await expect(subDialog.getByText(/فعال|جانشین/).first()).toBeVisible({ timeout: 30_000 });
  await tv.act.click(subDialog.getByRole('button', { name: 'بستن' }).first());
  await expect(subDialog).toBeHidden({ timeout: 30_000 });
  await tv.expectNoErrors();

  // ─── ۲. کارمند دوم (جانشین سرپرست): دیدن کار در «کارهای من» و ثبت ارجاع و رونوشت ───
  await tv.loginAs('demo_employee2');
  await tv.pickCompany();
  await openMyTasks(tv, page);

  await tv.say('substitute_act');
  const invCard = page.locator('div.rounded-2xl').filter({ hasText: 'DEMO-INV-100' }).first();
  await expect(invCard).toBeVisible({ timeout: 30_000 });

  await tv.say('refer_action');
  await tv.act.click(invCard.getByRole('button', { name: /ارجاع/ }));
  const referModal = page.getByRole('dialog', { name: 'ارجاع سند' });
  await expect(referModal).toBeVisible({ timeout: 30_000 });

  // ارجاع برای اقدام به حسابدار
  const targetSelect = referModal.locator('#refer-target-user');
  await expect(targetSelect.getByRole('option', { name: /حسابدار/ })).toBeAttached({ timeout: 15_000 });
  const accVal = await targetSelect.getByRole('option', { name: /حسابدار/ }).getAttribute('value');
  await targetSelect.selectOption(accVal || '');

  await tv.act.fill(referModal.locator('#refer-instruction'), 'لطفاً کد اقتصادی فروشنده بررسی شود.');
  await tv.act.fill(referModal.locator('#refer-due-date'), '1405/08/20');
  await tv.act.click(referModal.getByRole('button', { name: 'ارسال ارجاع' }));
  await expect(referModal).toBeHidden({ timeout: 30_000 });

  // ارسال رونوشت برای اطلاع به مدیر
  await tv.act.click(invCard.getByRole('button', { name: /ارجاع/ }));
  await expect(referModal).toBeVisible({ timeout: 30_000 });
  await tv.act.click(referModal.getByRole('radio', { name: /برای اطلاع/ }));
  await expect(targetSelect.getByRole('option', { name: /مدیر/ })).toBeAttached({ timeout: 15_000 });
  const mgrVal = await targetSelect.getByRole('option', { name: /مدیر/ }).getAttribute('value');
  await targetSelect.selectOption(mgrVal || '');

  await tv.act.fill(referModal.locator('#refer-instruction'), 'جهت استحضار مدیریت محترم.');
  await tv.act.click(referModal.getByRole('button', { name: 'ارسال ارجاع' }));
  await expect(referModal).toBeHidden({ timeout: 30_000 });
  await page.waitForTimeout(1000);
  await tv.expectNoErrors();

  // ─── ۳. حسابدار: پاسخ به ارجاع و زدن «انجام شد» ───
  await tv.loginAs('demo_accountant');
  await tv.pickCompany();
  await openMyTasks(tv, page);

  await tv.say('refer_reply');
  const refCard = page.locator('div.rounded-2xl').filter({ hasText: 'DEMO-INV-100' }).first();
  await expect(refCard).toBeVisible({ timeout: 30_000 });
  await tv.act.fill(refCard.locator('textarea'), 'کد اقتصادی بررسی شد و معتبر است.');
  await tv.act.click(refCard.getByRole('button', { name: 'انجام شد' }));
  await expect(refCard).toBeHidden({ timeout: 30_000 });
  await page.waitForTimeout(1000);
  await tv.expectNoErrors();

  // ─── ۴. مدیر: دیدن رونوشت «برای اطلاع» و زدن «رؤیت شد» ───
  await tv.loginAs('demo_manager');
  await tv.pickCompany();
  await openMyTasks(tv, page);

  await tv.say('inform_seen');
  const informCard = page.locator('div.rounded-2xl').filter({ hasText: 'DEMO-INV-100' }).first();
  await expect(informCard).toBeVisible({ timeout: 30_000 });
  await tv.act.click(informCard.getByRole('button', { name: 'رؤیت شد' }));
  await expect(informCard).toBeHidden({ timeout: 30_000 });
  await page.waitForTimeout(1000);
  await tv.expectNoErrors();

  // ─── ۵. کارمند دوم (جانشین سرپرست): تأیید فاکتور در حالت آفلاین و همگام‌سازی خودکار پس از اتصال ───
  await tv.loginAs('demo_employee2');
  await tv.pickCompany();
  await openMyTasks(tv, page);

  await tv.say('offline_queue');
  const stepCard = page.locator('div.rounded-2xl').filter({ hasText: 'DEMO-INV-100' }).first();
  await expect(stepCard).toBeVisible({ timeout: 30_000 });

  await context.setOffline(true);
  await tv.act.click(stepCard.getByRole('button', { name: 'تأیید' }));
  await expect(page.getByText(/در انتظار ارسال|در صف ارسال/).first()).toBeVisible({ timeout: 15_000 });

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(stepCard).toBeHidden({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  await tv.expectNoErrors();
  await tv.say('end');
});
