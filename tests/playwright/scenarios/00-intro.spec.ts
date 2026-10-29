/**
 * Video 0: introduction (plan §4 row 0). User demo_admin (seed: --purge, then --admin).
 * Login, app launcher, sidebar menu, notification bell, user menu, «کارهای من», back to launcher, logout.
 * The app has no light/dark switch (darkMode: 'selector', no toggle in the UI), so that scene is not in the video.
 */
import captions from './00-intro.captions.json';
import { expect, videoTest } from '../helpers/video';

const test = videoTest(captions);

test('video 0: introduction', async ({ page, tv }) => {
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'ورود به سامانه' })).toBeVisible();
  await tv.titleCard();

  await tv.say('login');
  await tv.loginAs('demo_admin');

  // صفحهٔ انتخاب برنامه
  if (!/\/app\/launcher/.test(page.url())) await page.goto('/app/launcher');
  const enterFinance = page.getByRole('button', { name: 'ورود به سامانه مالی' });
  await expect(enterFinance).toBeVisible();
  await tv.say('launcher');
  await tv.expectNoErrors();
  await tv.say('enter_finance');
  await tv.act.click(enterFinance);
  await expect(page).not.toHaveURL(/\/app\/launcher/);

  // مدیر کل شرکت پیش‌فرض ندارد؛ پنجرهٔ انتخاب شرکت را می‌بندیم
  const closeCompanyModal = page.getByTitle('انصراف و بستن');
  if (await closeCompanyModal.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await tv.act.click(closeCompanyModal);
  }

  // منوی کنار صفحه
  if (tv.mobile) {
    await tv.say('sidebar_mobile');
    await tv.act.click(page.getByRole('button', { name: 'نمایش منو' }));
    await tv.say('sidebar');
    const orgMenu = page.getByTitle('کلیک برای باز/بسته کردن منوی راهبر تشکیلات');
    if (await orgMenu.isVisible().catch(() => false)) await tv.act.click(orgMenu);
    await tv.act.click(page.getByRole('button', { name: 'بستن منو' }));
  } else {
    await tv.say('sidebar');
    const orgMenu = page.getByTitle('کلیک برای باز/بسته کردن منوی راهبر تشکیلات');
    if (await orgMenu.isVisible().catch(() => false)) {
      await tv.act.click(orgMenu);
      await page.waitForTimeout(800);
      await tv.act.click(orgMenu);
    }
  }
  await tv.expectNoErrors();

  // زنگوله
  const bell = page.getByRole('button', { name: 'مرکز اعلان‌های سامانه' });
  await tv.act.click(bell);
  await tv.say('bell');
  await page.keyboard.press('Escape');
  if (await page.getByTitle('علامت‌گذاری همهٔ اعلان‌ها به عنوان خوانده‌شده').isVisible().catch(() => false)) {
    await tv.act.click(bell);
  }

  // منوی کاربر و «کارهای من»
  const userMenu = page.getByTitle(/^پروفایل کاربری و تنظیمات/);
  await tv.act.click(userMenu);
  await expect(page.getByRole('button', { name: 'کارهای من' })).toBeVisible();
  await tv.say('user_menu');
  await tv.act.click(page.getByRole('button', { name: 'کارهای من' }));
  await expect(page.getByRole('heading', { name: 'کارهای من' })).toBeVisible();
  await tv.say('my_tasks');
  await tv.expectNoErrors();

  // بازگشت به صفحهٔ انتخاب برنامه
  await tv.act.click(userMenu);
  await tv.say('back_launcher');
  await tv.act.click(page.getByRole('button', { name: 'پورتال لانچر برنامه‌ها' }));
  await expect(page).toHaveURL(/\/app\/launcher/);

  // خروج
  await tv.say('logout');
  const launcherLogout = page.getByTitle('خروج از حساب کاربری');
  await tv.act.click(launcherLogout);
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole('button', { name: 'ورود به سامانه' })).toBeVisible();
  await tv.say('end');
  await tv.expectNoErrors();
});
