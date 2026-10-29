/**
 * Video 2: accounting setup (plan §4 row 2). Users demo_admin, demo_treasury, demo_accountant
 * (seed: --purge, then --base; the base already has fiscal year 1405, one bank account, head group 50 and one
 * counterparty, so this video adds the next fiscal year, a second account, group 60 and a second counterparty).
 */
import type { Page } from '@playwright/test';
import captions from './02-accounting-setup.captions.json';
import { expect, videoTest, type TrainingVideo } from '../helpers/video';

const test = videoTest(captions);

const COMPANY = { code: 'DEMO-VID', name: 'شرکت نمایشی' };
const ACCOUNT_TITLE = 'حساب تنخواه کارگاه';
const HEAD_GROUP = { code: '60', title: 'هزینه‌های رفاهی' };
const HEAD = { code: '6001', title: 'کمک‌هزینهٔ ورزش' };
const COUNTERPARTY = 'تعمیرگاه نمونهٔ شهر';

/** 24 IBAN digits (check digits + BBAN) for a made-up account; valid mod-97 like demo_sheba() in the seed. */
function shebaDigits(bban = '0190000000987654321098'): string {
  const numeric = `${bban}182700`; // "IR00" → I=18, R=27
  const check = 98 - Number(BigInt(numeric) % 97n);
  return `${String(check).padStart(2, '0')}${bban}`;
}

async function openDemoStudio(page: Page, tv: TrainingVideo): Promise<void> {
  await page.goto('/app/operations/companies');
  const search = page.getByLabel('جستجو در فهرست شرکت‌ها');
  await expect(search).toBeVisible();
  await tv.act.fill(search, COMPANY.code);
  await tv.say('open_studio');
  await tv.act.click(page.getByRole('button', { name: /استودیو/ }).filter({ visible: true }).first());
  await expect(page).toHaveURL(/\/companies\/\d+/);
  await expect(page.getByRole('heading', { level: 1, name: new RegExp(COMPANY.name) })).toBeVisible();
}

test('video 2: accounting setup', async ({ page, tv }) => {
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
  await openDemoStudio(page, tv);

  // ─── دورهٔ مالی ───
  const newPeriod = page.getByRole('button', { name: 'تعریف دوره مالی' });
  await expect(newPeriod).toBeVisible({ timeout: 30_000 });
  await tv.say('fiscal');
  await tv.act.click(newPeriod);
  await tv.say('fiscal_dates');
  await tv.act.fill(page.getByLabel('عنوان دوره مالی'), 'سال مالی ۱۴۰۶');
  await tv.act.fill(page.getByLabel('تاریخ شروع دوره'), '1406/01/01', { quick: true });
  await page.getByLabel('تاریخ شروع دوره').press('Tab');
  await page.keyboard.press('Escape');
  await tv.act.fill(page.getByLabel('تاریخ پایان دوره'), '1406/12/29', { quick: true });
  await page.getByLabel('تاریخ پایان دوره').press('Tab');
  await page.keyboard.press('Escape');
  await tv.act.click(page.getByRole('button', { name: 'ثبت و افتتاح دوره' }));
  await expect(page.getByText('سال مالی ۱۴۰۶').first()).toBeVisible({ timeout: 30_000 });
  await tv.expectNoErrors();

  // ─── بانک و شبا ───
  await tv.act.click(page.getByRole('tab', { name: /^(بانک و شبا|بانک)(\s|$)/ }).first());
  // multi-line labels do not match an anchored regex; the placeholder is the fallback handle here
  const sheba = page.getByRole('textbox', { name: /شبا/ }).or(page.getByPlaceholder('12 0120 0000 0000 1234 5678 90')).first();
  await expect(sheba).toBeVisible({ timeout: 30_000 });
  await tv.say('bank');
  await tv.act.fill(sheba, shebaDigits());
  await tv.say('bank_opening');
  const bank = page.getByLabel(/^بانک عامل/);
  await tv.act.fill(bank, 'بانک صادرات');
  const option = page.getByRole('button', { name: /^بانک صادرات/ }).first();
  if (await option.isVisible().catch(() => false)) await tv.act.click(option);
  await tv.act.fill(page.getByLabel('عنوان / کاربرد حساب'), ACCOUNT_TITLE);
  await tv.fillAmount(page.getByLabel('موجودی اولیه (ریال)'), 200_000_000);
  await tv.act.fill(page.getByLabel(/^تاریخ موجودی اولیه/), '1405/01/01', { quick: true });
  await page.getByLabel(/^تاریخ موجودی اولیه/).press('Tab');
  await page.keyboard.press('Escape');
  await tv.act.click(page.getByRole('button', { name: 'افزودن حساب' }));
  await expect(page.getByText(ACCOUNT_TITLE).first()).toBeVisible({ timeout: 30_000 });
  await tv.expectNoErrors();

  // ─── سرفصل‌های هزینه ───
  await tv.act.click(page.getByRole('tab', { name: /^(سرفصل‌های هزینه|سرفصل‌ها)(\s|$)/ }).first());
  const groups = page.getByRole('list', { name: 'گروه‌های سرفصل هزینه' });
  await expect(groups).toBeVisible({ timeout: 30_000 });
  await tv.say('heads');
  await tv.act.click(page.getByRole('button', { name: 'گروه تازه' }).first());
  await tv.act.fill(page.getByLabel('کد *'), HEAD_GROUP.code);
  await tv.act.fill(page.getByLabel('عنوان *'), HEAD_GROUP.title);
  await tv.act.click(page.getByRole('button', { name: 'ذخیره', exact: true }));
  const group = groups.getByRole('listitem').filter({ hasText: HEAD_GROUP.title }).first();
  await expect(group).toBeVisible({ timeout: 30_000 });
  await tv.say('head_new');
  await tv.act.click(group.getByRole('button', { name: 'سرفصل تازه' }));
  await tv.act.fill(page.getByLabel('کد *'), HEAD.code);
  await tv.act.fill(page.getByLabel('عنوان *'), HEAD.title);
  await tv.act.click(page.getByRole('button', { name: 'ذخیره', exact: true }));
  await expect(groups.getByText(HEAD.title).first()).toBeVisible({ timeout: 30_000 });
  await tv.expectNoErrors();

  // ─── خزانه‌دار ───
  await tv.say('treasury');
  await tv.loginAs('demo_treasury');
  await tv.pickCompany(COMPANY.name);
  await tv.openMenu('حساب‌های بانکی و صندوق', '/app/finance/treasurer-bank-accounts');
  await expect(page.getByRole('heading', { name: /حساب‌های بانکی فعال سازمان/ })).toBeVisible({ timeout: 30_000 });
  await tv.say('treasury_view');
  await tv.expectNoErrors();

  // ─── حسابدار و طرف حساب ───
  await tv.say('accountant');
  await tv.loginAs('demo_accountant');
  await tv.pickCompany(COMPANY.name);
  await tv.openMenu('طرف‌حساب‌های مالی', '/app/finance/accountant-counterparties');
  const name = page.getByLabel('نام شخص یا شرکت');
  await expect(name).toBeVisible({ timeout: 30_000 });
  await tv.say('counterparty');
  await tv.act.fill(name, COUNTERPARTY);
  await page.getByLabel('نوع طرف‌حساب').selectOption('repair_shop');
  await tv.act.fill(page.getByLabel('تلفن تماس / همراه'), '02166000000');
  await tv.act.click(page.getByRole('button', { name: 'ثبت طرف‌حساب' }));
  await expect(page.getByText(COUNTERPARTY).first()).toBeVisible({ timeout: 30_000 });
  await tv.expectNoErrors();
  await tv.say('end');
});
