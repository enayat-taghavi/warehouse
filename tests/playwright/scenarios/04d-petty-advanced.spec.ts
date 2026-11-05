/**
 * Video 4-d: petty cash, advanced work (plan §4 row 4-d): approver on the account, manager ceiling, two companies,
 * supervisor approval, the shorter flow under the ceiling, and debt settlement (charge offset, void, payroll).
 * Seed: --purge, then --base --with-petty-account --with-second-company.
 * demo_accountant edits the account of demo_employee (opening balance + approver demo_supervisor);
 * demo_manager shows his «تن‌خواه» page and sets the ceiling; demo_employee sees both accounts (two companies) and
 * asks for a charge under the ceiling; demo_supervisor approves it in «تن‌خواه من» -> «تأیید سرپرست»;
 * demo_accountant reviews it (no manager step under the ceiling); demo_treasury pays it (tracking code + receipt);
 * then a cash shortage (reconcile), a debt settlement by charge offset, its void, and a payroll deduction.
 */
import type { Locator, Page } from '@playwright/test';
import captions from './04d-petty-advanced.captions.json';
import { expect, todayShamsi, videoTest, type TrainingVideo } from '../helpers/video';

const test = videoTest(captions);

const CHARGE_TITLE = 'شارژ تنخواه کارگاه';
const CHARGE2_TITLE = 'شارژ تنخواه دوم';
// «شرکت نمایشی» بدون «دوم» (شرکت اول)
const FIRST_COMPANY = 'شرکت نمایشی(?! دوم)';
const FIRST_COMPANY_RE = /شرکت نمایشی(?! دوم)/;
const SECOND_COMPANY_RE = /شرکت نمایشی دوم/;

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

function chargeCard(page: Page): Locator {
  return page.locator('div.rounded-2xl').filter({ hasText: 'شارژ تنخواه' }).filter({ has: page.getByRole('button') }).first();
}

async function openMyTasks(tv: TrainingVideo, page: Page): Promise<void> {
  await tv.openMenu('کارهای من', '/app/my-tasks');
  await expect(chargeCard(page)).toBeVisible({ timeout: 30_000 });
}

/** کارت حساب مریم کارمند در شرکت اول (شرکت دوم هم یک حساب مریم دارد). */
function firstCompanyCard(page: Page): Locator {
  return page.locator('article').filter({ hasText: 'مریم کارمند' }).filter({ hasNotText: 'شرکت نمایشی دوم' }).first();
}

function toLatinDigits(text: string): string {
  return text
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

/** «موجودی دفتری فعلی: X ریال» در پنجرهٔ تطبیق نقد، به ریال. */
async function bookBalance(dialog: Locator): Promise<number> {
  const text = toLatinDigits(await dialog.getByText(/موجودی دفتری فعلی/).first().innerText());
  const m = text.match(/موجودی دفتری فعلی:?\s*([\d٬,،]+)/);
  if (!m) throw new Error(`Book balance not found in: ${text}`);
  return Number(m[1].replace(/\D/g, ''));
}

async function openAccountsTab(tv: TrainingVideo, page: Page): Promise<void> {
  await tv.act.click(page.getByRole('tab', { name: /حساب‌ها/ }));
}

/** باز بودن جزئیات تسویه‌ها و تطبیق‌ها (دکمهٔ باز و بسته یکی است). */
async function ensureExpanded(tv: TrainingVideo, card: Locator): Promise<void> {
  const toggle = card.getByRole('button', { name: 'نمایش تسویه‌ها و تطبیق‌ها' });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await tv.act.click(toggle);
  await expect(card.getByText('تسویه‌های بدهی')).toBeVisible({ timeout: 30_000 });
}

test('video 4-d: petty cash approver, ceiling, two companies and debt', async ({ page, tv }) => {
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

  // ─── ۱. حسابدار: ویرایش حساب (موجودی اولیه و سرپرست تأییدکننده) ───
  await tv.say('opener');
  await tv.loginAs('demo_accountant');
  await tv.pickCompany(FIRST_COMPANY);
  await tv.openMenu('رسیدگی تن‌خواه', '/app/finance/accountant-petty-cash');
  await openAccountsTab(tv, page);
  const card = firstCompanyCard(page);
  await expect(card).toBeVisible({ timeout: 30_000 });
  await tv.say('edit_open');
  await tv.act.click(card.getByRole('button', { name: 'ویرایش', exact: true }));
  const form = page.getByRole('dialog').filter({ hasText: 'ویرایش حساب تنخواه' });
  await expect(form).toBeVisible({ timeout: 30_000 });

  const opening = form.locator('#pam_opening');
  if (await opening.isEnabled().catch(() => false)) {
    await tv.say('opening');
    await tv.fillAmount(opening, 32_000_000);
    const reason = form.locator('#pam_reason');
    if (await reason.isVisible().catch(() => false)) {
      await tv.act.fill(reason, 'اصلاح موجودی اولیه پس از شمارش صندوق', { quick: true });
    }
  }
  await tv.say('approver');
  const approverPicker = form.getByRole('combobox', { name: 'جست‌وجوی سرپرست' });
  await expect(approverPicker).toBeEnabled({ timeout: 30_000 });
  await tv.act.fill(approverPicker, 'زهرا');
  await tv.act.click(page.getByRole('option', { name: /زهرا/ }).first());
  await tv.act.click(form.getByRole('button', { name: 'ذخیره', exact: true }));
  await expect(form).toBeHidden({ timeout: 30_000 });
  await expect(firstCompanyCard(page).getByText(/سرپرست:/)).toBeVisible({ timeout: 30_000 });
  await tv.expectNoErrors();

  // ─── ۲. مدیر: صفحهٔ «تن‌خواه» و سقف حساب ───
  await tv.loginAs('demo_manager');
  await tv.pickCompany(FIRST_COMPANY);
  await tv.openMenu('تن‌خواه', '/app/finance/manager-petty-cash');
  await expect(page.getByRole('tab').first()).toContainText('همه', { timeout: 30_000 });
  await tv.say('manager_tabs');
  await openAccountsTab(tv, page);
  const mgrCard = firstCompanyCard(page);
  await expect(mgrCard).toBeVisible({ timeout: 30_000 });
  await expect(mgrCard.getByText('سقف (ریال)')).toBeVisible({ timeout: 30_000 });
  await tv.say('ceiling');
  await tv.act.click(mgrCard.getByRole('button', { name: 'ویرایش', exact: true }));
  const mgrForm = page.getByRole('dialog').filter({ hasText: 'ویرایش حساب تنخواه' });
  await expect(mgrForm).toBeVisible({ timeout: 30_000 });
  await tv.fillAmount(mgrForm.locator('#pam_ceiling'), 60_000_000);
  await tv.act.click(mgrForm.getByRole('button', { name: 'ذخیره', exact: true }));
  await expect(mgrForm).toBeHidden({ timeout: 30_000 });
  await tv.expectNoErrors();

  // ─── ۳. کارمند: دو حساب در دو شرکت و درخواست شارژ زیر سقف ───
  await tv.loginAs('demo_employee');
  await tv.pickCompany(FIRST_COMPANY);
  await tv.openMenu('تن‌خواه من', '/app/finance/employee-petty-cash');
  const picker = page.locator('#myPettyAccountsPicker');
  await expect(picker).toBeVisible({ timeout: 30_000 });
  await tv.say('two_accounts');
  await tv.act.click(picker.getByRole('button', { name: SECOND_COMPANY_RE }));
  await expect(page.getByRole('region', { name: 'حساب تنخواه شما' }).getByText(SECOND_COMPANY_RE)).toBeVisible({ timeout: 30_000 });
  await tv.act.click(picker.getByRole('button', { name: FIRST_COMPANY_RE }));
  await expect(page.locator('#balanceCard')).toBeVisible({ timeout: 30_000 });
  await tv.say('charge_under');
  await tv.act.click(page.getByRole('button', { name: /درخواست شارژ/ }).first());
  const charge = page.getByRole('dialog').filter({ hasText: 'ارسال درخواست شارژ' });
  await expect(charge.getByLabel('عنوان درخواست')).toBeVisible({ timeout: 30_000 });
  await tv.act.fill(charge.getByLabel('عنوان درخواست'), CHARGE_TITLE);
  await tv.fillAmount(charge.getByLabel('مبلغ مورد نیاز (ریال)'), 10_000_000);
  await tv.act.fill(charge.getByLabel('علت و توضیحات درخواست شارژ'), 'خرید ابزار کارگاه.', { quick: true });
  await tv.act.click(charge.getByRole('button', { name: 'ارسال درخواست شارژ' }));
  await expect(charge).toBeHidden({ timeout: 30_000 });
  await tv.expectNoErrors();

  // ─── ۴. سرپرست: تأیید در «تأیید سرپرست» ───
  await tv.loginAs('demo_supervisor');
  await tv.pickCompany(FIRST_COMPANY);
  await tv.openMenu('تن‌خواه من', '/app/finance/employee-petty-cash');
  await tv.act.click(page.getByRole('tab', { name: /تأیید/ }));
  const approvals = page.locator('#pettyApprovals');
  await expect(approvals).toBeVisible({ timeout: 30_000 });
  const supRow = approvals.locator('li').filter({ hasText: 'شارژ' }).first();
  await expect(supRow).toBeVisible({ timeout: 30_000 });
  await tv.say('supervisor');
  await tv.act.click(supRow.getByRole('button', { name: /^تأیید/ }));
  // پنجرهٔ تأیید سند؛ دکمهٔ تأیید آن آخرین «تأیید» روی صفحه است
  await tv.act.click(page.locator('.confirm-panel').getByRole('button', { name: 'تأیید', exact: true }));
  await expect(supRow).toBeHidden({ timeout: 30_000 });
  await tv.expectNoErrors();

  // ─── ۵. حسابدار: بررسی؛ زیر سقف است، پس مرحلهٔ مدیر ندارد ───
  await tv.loginAs('demo_accountant');
  await tv.pickCompany(FIRST_COMPANY);
  await openMyTasks(tv, page);
  await tv.say('accountant');
  await tv.act.click(chargeCard(page).getByRole('button', { name: 'بررسی' }));
  await expect(chargeCard(page)).toBeHidden({ timeout: 30_000 });
  await tv.expectNoErrors();

  // ─── ۶. خزانه‌دار: صفحهٔ «تن‌خواه» و ثبت واریز (مستقیم، بدون مدیر) ───
  await tv.loginAs('demo_treasury');
  await tv.pickCompany(FIRST_COMPANY);
  await tv.openMenu('تن‌خواه', '/app/finance/treasurer-petty-cash');
  await expect(page.getByRole('tab').first()).toContainText('همه', { timeout: 30_000 });
  await tv.say('treasury_page');
  await openMyTasks(tv, page);
  await tv.say('treasury');
  await tv.act.click(chargeCard(page).getByRole('button', { name: 'مشاهدهٔ جزئیات سند' }));
  const tracking = page.getByLabel(/شمارهٔ پیگیری یا سند بانکی واریز/);
  await expect(tracking).toBeVisible({ timeout: 30_000 });
  await tv.act.fill(tracking, 'TRK-4101');
  await page.locator('#payReceiptCh').setInputFiles({ name: 'deposit-4101.png', mimeType: 'image/png', buffer: PNG });
  await tv.act.click(page.getByRole('button', { name: 'ثبت واریز' }));
  await expect(tracking).toBeHidden({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  await tv.expectNoErrors();

  // ─── ۷. حسابدار: تطبیق نقد با کسری (پیش از شارژ دوم؛ با شارژ در جریان، تطبیق بسته است) ───
  await tv.loginAs('demo_accountant');
  await tv.pickCompany(FIRST_COMPANY);
  await tv.openMenu('رسیدگی تن‌خواه', '/app/finance/accountant-petty-cash');
  await openAccountsTab(tv, page);
  const recAcc = firstCompanyCard(page);
  await expect(recAcc).toBeVisible({ timeout: 30_000 });

  await tv.say('shortage');
  await tv.act.click(recAcc.getByRole('button', { name: 'تطبیق نقد' }));
  const rec = page.getByRole('dialog').filter({ hasText: 'تطبیق نقد' });
  await expect(rec.getByText(/موجودی دفتری فعلی/)).toBeVisible({ timeout: 30_000 });
  const expected = await bookBalance(rec);
  await tv.act.fill(rec.locator('#pam_rec_date'), todayShamsi(), { quick: true });
  if (await page.locator('.datepicker-outer-container').isVisible().catch(() => false)) {
    await rec.getByTitle('انتخاب تاریخ از تقویم').click();
  }
  await tv.fillAmount(rec.locator('#pam_rec_counted'), expected - 2_000_000);
  await tv.act.fill(rec.locator('#pam_rec_note'), 'شمارش صندوق؛ دو میلیون ریال کسری');
  await tv.act.click(rec.getByRole('button', { name: 'ثبت تطبیق' }));
  await expect(rec).toBeHidden({ timeout: 30_000 });
  await tv.expectNoErrors();

  // ─── ۸. کارمند: شارژ دوم (باز می‌ماند تا تسویهٔ بدهی از آن کسر شود) ───
  await tv.loginAs('demo_employee');
  await tv.pickCompany(FIRST_COMPANY);
  await tv.openMenu('تن‌خواه من', '/app/finance/employee-petty-cash');
  await expect(page.locator('#balanceCard')).toBeVisible({ timeout: 30_000 });
  await tv.say('second_charge');
  await tv.act.click(page.getByRole('button', { name: /درخواست شارژ/ }).first());
  const charge2 = page.getByRole('dialog').filter({ hasText: 'ارسال درخواست شارژ' });
  await expect(charge2.getByLabel('عنوان درخواست')).toBeVisible({ timeout: 30_000 });
  await tv.act.fill(charge2.getByLabel('عنوان درخواست'), CHARGE2_TITLE, { quick: true });
  await tv.fillAmount(charge2.getByLabel('مبلغ مورد نیاز (ریال)'), 5_000_000);
  await tv.act.click(charge2.getByRole('button', { name: 'ارسال درخواست شارژ' }));
  await expect(charge2).toBeHidden({ timeout: 30_000 });
  await tv.expectNoErrors();

  // ─── ۹. حسابدار: تسویه با کسر از شارژ، ابطال، کسر از حقوق ───
  await tv.loginAs('demo_accountant');
  await tv.pickCompany(FIRST_COMPANY);
  await tv.openMenu('رسیدگی تن‌خواه', '/app/finance/accountant-petty-cash');
  await openAccountsTab(tv, page);
  const acc = firstCompanyCard(page);
  await expect(acc).toBeVisible({ timeout: 30_000 });

  // تسویهٔ بخشی از بدهی با کسر از شارژ بعدی
  await tv.say('offset');
  await tv.act.click(acc.getByRole('button', { name: 'تسویهٔ بدهی' }));
  const settle = page.getByRole('dialog').filter({ hasText: 'تسویهٔ بدهی' });
  await expect(settle.getByText(/بدهی کل/)).toBeVisible({ timeout: 30_000 });
  await tv.act.click(settle.getByRole('radio', { name: /کسر از شارژ بعدی/ }));
  await tv.fillAmount(settle.locator('#pam_settle_amount'), 1_000_000);
  const chargeSelect = settle.locator('#pam_settle_charge');
  await expect(chargeSelect).toBeVisible({ timeout: 30_000 });
  await expect(chargeSelect.locator('option')).not.toHaveCount(1, { timeout: 30_000 });
  await chargeSelect.selectOption({ index: 1 });
  await tv.act.fill(settle.locator('#pam_settle_note'), 'کسر یک میلیون ریال از شارژ دوم', { quick: true });
  await tv.act.click(settle.getByRole('button', { name: 'ثبت تسویه' }));
  await expect(settle).toBeHidden({ timeout: 30_000 });
  await tv.expectNoErrors();

  // ابطال همین تسویه
  await ensureExpanded(tv, acc);
  const voidButton = acc.getByRole('button', { name: 'ابطال تسویه' }).first();
  await expect(voidButton).toBeVisible({ timeout: 30_000 });
  await tv.say('void');
  await tv.act.click(voidButton);
  const voidDialog = page.getByRole('dialog', { name: 'دلیل ابطال تسویه' });
  await expect(voidDialog).toBeVisible({ timeout: 30_000 });
  await tv.act.fill(voidDialog.locator('#workflow-reason-input'), 'مبلغ باید از حقوق کسر شود، نه از شارژ.');
  await tv.act.click(voidDialog.getByRole('button', { name: 'ابطال تسویه' }));
  await expect(voidDialog).toBeHidden({ timeout: 30_000 });
  await expect(acc.getByRole('button', { name: 'ابطال تسویه' })).toHaveCount(0, { timeout: 30_000 });
  await tv.expectNoErrors();

  // تسویه با کسر از حقوق (فقط وقتی حقوق تنخواه‌گردان در سامانه هست)
  await tv.say('payroll');
  await tv.act.click(acc.getByRole('button', { name: 'تسویهٔ بدهی' }));
  const settle2 = page.getByRole('dialog').filter({ hasText: 'تسویهٔ بدهی' });
  await expect(settle2.getByText(/بدهی کل/)).toBeVisible({ timeout: 30_000 });
  const payroll = settle2.getByRole('radio', { name: /کسر از حقوق/ });
  if (await payroll.isVisible().catch(() => false)) {
    await tv.act.click(payroll);
    await tv.fillAmount(settle2.locator('#pam_settle_amount'), 1_000_000);
    await tv.act.fill(settle2.locator('#pam_settle_note'), 'کسر از حقوق آبان', { quick: true });
    await tv.act.click(settle2.getByRole('button', { name: 'ثبت تسویه' }));
    await expect(settle2).toBeHidden({ timeout: 30_000 });
  } else {
    test.info().annotations.push({ type: 'warning', description: 'گزینهٔ «کسر از حقوق» در پنجرهٔ تسویه نبود (حقوق تنخواه‌گردان در دادهٔ نمایشی نیست)' });
    await tv.act.click(settle2.getByRole('button', { name: 'انصراف' }));
    await expect(settle2).toBeHidden({ timeout: 30_000 });
  }
  await page.waitForTimeout(1000);
  await tv.expectNoErrors();
  await tv.say('end');
});
