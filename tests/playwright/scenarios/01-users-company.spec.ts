/**
 * Video 1: users and company (plan §4 row 1). User demo_admin (seed: --purge, then --admin).
 * Builds through the UI what `seed_video_demo --base` builds: company DEMO-VID «شرکت نمایشی», project DEMO-P1,
 * sections DEMO-S1/DEMO-S2, the six demo_* users (BASE_USERS) with their section roles; then shows the access,
 * workflow and numbering tabs and logs in as demo_employee (forced first password change, limited menu).
 * Passwords of users made here are generated at run time into scratch/video_demo_credentials.json (never printed).
 */
import type { Locator, Page } from '@playwright/test';
import captions from './01-users-company.captions.json';
import { expect, newDemoPassword, videoTest, type TrainingVideo } from '../helpers/video';

const test = videoTest(captions);

const COMPANY = { code: 'DEMO-VID', name: 'شرکت نمایشی' };
const PROJECT = { code: 'DEMO-P1', name: 'دفتر مرکزی' };
const SECTIONS = [{ code: 'DEMO-S1', name: 'بخش اداری' }, { code: 'DEMO-S2', name: 'بخش فنی' }];
// same rows as BASE_USERS in seed_video_demo.py
const USERS = [
  { username: 'demo_employee', first: 'مریم', last: 'کارمند', phone: '09399900001' },
  { username: 'demo_employee2', first: 'علی', last: 'کارمند دوم', phone: '09399900002' },
  { username: 'demo_supervisor', first: 'زهرا', last: 'سرپرست', phone: '09399900003' },
  { username: 'demo_accountant', first: 'رضا', last: 'حسابدار', phone: '09399900004' },
  { username: 'demo_manager', first: 'سارا', last: 'مدیر', phone: '09399900005' },
  { username: 'demo_treasury', first: 'حسین', last: 'خزانه‌دار', phone: '09399900006' },
];

/** Tab bars show the full or the short label depending on width; the studio bar comes first in the page. */
function tab(scope: Page | Locator, full: string, short = full): Locator {
  return scope.getByRole('tab', { name: new RegExp(`^(${full}|${short})(\\s|$)`) }).first();
}

async function createUser(page: Page, tv: TrainingVideo, user: typeof USERS[number], narrate: boolean): Promise<void> {
  const quick = { quick: !narrate };
  await tv.act.click(page.getByRole('button', { name: 'کاربر جدید' }));
  const dialog = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: /کاربر جدید|پرونده پرسنلی/ }) });
  await expect(dialog).toBeVisible();

  if (narrate) await tv.say('user_identity');
  await tv.act.fill(dialog.getByLabel('نام (First Name)'), user.first, quick);
  await tv.act.fill(dialog.getByLabel('نام خانوادگی (Last Name)'), user.last, quick);
  await tv.act.fill(dialog.getByLabel('کد / نام کاربری (Personnel ID)'), user.username, quick);
  await tv.act.fill(dialog.getByLabel('تلفن همراه').first(), user.phone, quick);

  await tv.act.click(tab(dialog, 'امنیت و ورود', 'امنیت'));
  if (narrate) await tv.say('user_password');
  await tv.act.fillSecret(dialog.getByLabel(/کلمه عبور اولیه/), newDemoPassword(user.username));

  await tv.act.click(dialog.getByRole('tab', { name: /شرکت/ }));
  if (narrate) await tv.say('user_company');
  await tv.act.click(dialog.getByRole('group', { name: 'شرکت‌های مجاز کاربر' }).getByText(COMPANY.name, { exact: true }));

  await tv.act.click(dialog.getByRole('button', { name: 'ایجاد حساب کاربری' }));
  await expect(dialog.getByRole('heading', { name: /ویرایش پرونده پرسنلی/ })).toBeVisible({ timeout: 30_000 });
  await tv.expectNoErrors();
  if (narrate) await tv.say('user_saved');
  await tv.act.click(dialog.getByRole('button', { name: 'انصراف', exact: true }));
  await expect(dialog).toBeHidden();
}

async function assign(page: Page, tv: TrainingVideo, cardTitle: string, roleShort: string, usernames: string[]): Promise<void> {
  const card = page.locator('section[data-group]').filter({ has: page.getByRole('button', { name: cardTitle, exact: true }) });
  const header = card.getByRole('button', { name: cardTitle, exact: true });
  if ((await header.getAttribute('aria-expanded')) === 'false') await tv.act.click(header);
  await tv.act.click(card.getByRole('button', { name: `افزودن ${roleShort}` }));
  const modal = page.getByRole('dialog').filter({ hasText: 'تایید انتساب' });
  await expect(modal).toBeVisible();
  for (const username of usernames) {
    await tv.act.fill(modal.getByLabel('جستجوی کاربر'), username);
    await tv.act.click(modal.getByRole('checkbox', { name: new RegExp(`${username}$`) }));
  }
  await tv.act.click(modal.getByRole('button', { name: 'تایید انتساب' }));
  await expect(modal).toBeHidden({ timeout: 30_000 });
  await tv.expectNoErrors();
}

test('video 1: users and company', async ({ page, tv }) => {
  try {
    await page.goto('/login');
  } catch {
    await page.waitForTimeout(1000);
    await page.goto('/login');
  }
  await expect(page.getByRole('button', { name: 'ورود به سامانه' })).toBeVisible();
  await tv.titleCard();

  await tv.say('login');
  await tv.loginAs('demo_admin');

  // ─── شرکت ───
  await page.goto('/app/operations/companies');
  const newCompany = page.getByRole('button', { name: 'ثبت شرکت جدید' });
  await expect(newCompany).toBeVisible();
  await tv.say('companies');
  await tv.act.click(newCompany);
  await tv.say('new_company');
  await tv.act.fill(page.getByLabel(/^کد شرکت/), COMPANY.code);
  await tv.act.fill(page.getByLabel(/^نام کامل شرکت/), COMPANY.name);
  await tv.act.click(page.getByRole('button', { name: 'ثبت شرکت' }));
  await expect(page).toHaveURL(/\/companies\/\d+/, { timeout: 30_000 });
  await tv.expectNoErrors();
  await tv.say('company_saved');
  const companyUrl = page.url().split('?')[0];

  // ─── پروژه و بخش‌ها ───
  await tv.act.click(tab(page, 'پروژه‌ها و بخش‌ها', 'پروژه‌ها'));
  await expect(page.getByLabel('کد پروژه (یکتا در شرکت)')).toBeVisible();
  await tv.say('projects');
  await tv.act.fill(page.getByLabel('کد پروژه (یکتا در شرکت)'), PROJECT.code);
  await tv.act.fill(page.getByLabel('نام پروژه'), PROJECT.name);
  await tv.act.click(page.getByRole('button', { name: 'ثبت پروژه' }));
  await expect(page.getByText(PROJECT.name).first()).toBeVisible();
  await tv.expectNoErrors();

  await tv.act.click(tab(page, 'بخش‌ها'));
  await expect(page.getByLabel('پروژهٔ والد')).toBeVisible();
  await tv.say('sections');
  for (const section of SECTIONS) {
    await page.getByLabel('پروژهٔ والد').selectOption({ label: `${PROJECT.name} (${PROJECT.code})` });
    await tv.act.fill(page.getByLabel('کد بخش (یکتا)'), section.code);
    await tv.act.fill(page.getByLabel('نام بخش'), section.name);
    await tv.act.click(page.getByRole('button', { name: 'ثبت بخش' }));
    await expect(page.getByText(section.name).first()).toBeVisible();
    await tv.expectNoErrors();
  }

  // ─── کاربران ───
  await tv.openMenu('کاربران', '/app/operations/users');
  await expect(page.getByRole('button', { name: 'کاربر جدید' })).toBeVisible();
  await tv.say('users');
  await createUser(page, tv, USERS[0], true);
  await tv.say('more_users');
  for (const user of USERS.slice(1)) await createUser(page, tv, user, false);

  // ─── انتساب نقش‌ها ───
  await tv.say('back_company');
  await page.goto(`${companyUrl}?tab=projects`);
  await tv.act.click(tab(page, 'پروژه‌ها و بخش‌ها', 'پروژه‌ها'));
  await tv.act.click(tab(page, 'انتساب کاربران و نقش‌ها', 'انتساب‌ها'));
  await expect(page.locator('section[data-group]').first()).toBeVisible({ timeout: 30_000 });
  await tv.say('assignments');
  await tv.say('assign_section');
  await assign(page, tv, SECTIONS[0].name, 'کارمندان', ['demo_employee', 'demo_employee2']);
  await assign(page, tv, SECTIONS[0].name, 'سرپرستان', ['demo_supervisor']);
  await tv.say('assign_project');
  await assign(page, tv, PROJECT.name, 'حسابداران', ['demo_accountant']);
  await assign(page, tv, PROJECT.name, 'مدیران', ['demo_manager']);
  await tv.say('assign_company');
  await assign(page, tv, 'همهٔ بخش‌های شرکت', 'خزانه‌داران', ['demo_treasury']);

  // ─── دسترسی، گردش کار، شماره‌گذاری ───
  // the access tab lists workspace members from the studio's first load; reload so the new assignments show
  await page.goto(`${companyUrl}?tab=access`);
  await expect(page.getByRole('button', { name: 'تخصیص دسترسی' })).toBeVisible({ timeout: 30_000 });
  if (!tv.mobile) await expect(page.getByText('مریم کارمند').first()).toBeVisible();
  await tv.say('access');
  await tv.act.click(tab(page, 'گردش کار', 'گردش'));
  await expect(page.getByRole('heading', { name: 'تنظیمات گردش کار شرکت' })).toBeVisible();
  await tv.say('workflow');
  await tv.act.click(tab(page, 'شماره‌گذاری اسناد', 'شماره‌ها'));
  await expect(page.getByRole('heading', { name: 'دفتر شماره‌های صادرشده' })).toBeVisible();
  await tv.say('numbering');
  await tv.expectNoErrors();

  // ─── ورود کارمند ───
  await tv.say('employee_login');
  await tv.loginAs('demo_employee', 'first_login');
  await tv.pickCompany(COMPANY.name);
  if (tv.mobile) {
    const show = page.getByRole('button', { name: 'نمایش منو' });
    if (await show.isVisible({ timeout: 5_000 }).catch(() => false)) await tv.act.click(show);
  }
  await expect(page.getByRole('button', { name: 'ثبت فاکتور', exact: true }).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'طرف‌حساب‌های مالی', exact: true })).toHaveCount(0);
  await tv.say('employee_menu');
  if (tv.mobile) {
    const hide = page.getByRole('button', { name: 'بستن منو' });
    if (await hide.isVisible().catch(() => false)) await tv.act.click(hide);
  }
  await tv.expectNoErrors();
  await tv.say('end');
});
