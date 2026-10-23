import { describe, it, expect, beforeEach } from 'vitest';
import { CompanyStudioContextService } from './company-studio-context.service';
import { Company } from '../models/company.model';

describe('CompanyStudioContextService (context مشترک استودیوی شرکت)', () => {
  let ctx: CompanyStudioContextService;
  const company = (id: number) => ({ id, code: 'C' + id, name: 'شرکت ' + id } as Company);

  beforeEach(() => {
    ctx = new CompanyStudioContextService();
  });

  it('شرکت ذخیره‌شده شناسه دارد و شرکت تازه یا شناسهٔ موقت منفی null است', () => {
    expect(ctx.companyId()).toBeNull();
    ctx.setCompany(company(5));
    expect(ctx.companyId()).toBe(5);
    expect(ctx.company()?.name).toBe('شرکت 5');
    ctx.setCompany(company(-3));
    expect(ctx.companyId()).toBeNull();
    ctx.setCompany(null);
    expect(ctx.company()).toBeNull();
  });

  it('شمارنده و خطای تب ثبت می‌شوند و صفر شمارنده‌ای نشان نمی‌دهد', () => {
    ctx.setCount('bank', 3);
    expect(ctx.count('bank')).toBe(3);
    ctx.setCount('bank', 0);
    expect(ctx.count('bank')).toBeUndefined();
    expect(ctx.hasError('bank')).toBe(false);
    ctx.reportError('bank');
    expect(ctx.hasError('bank')).toBe(true);
    ctx.reportError('bank', false);
    expect(ctx.hasError('bank')).toBe(false);
  });

  it('با عوض شدن شرکت شمارنده‌ها و خطاهای شرکت پیشین پاک می‌شوند، ولی با همان شرکت می‌مانند', () => {
    ctx.setCompany(company(1));
    ctx.setCount('bank', 2);
    ctx.reportError('bank');
    ctx.setCompany(company(1));
    expect(ctx.count('bank')).toBe(2);
    ctx.setCompany(company(2));
    expect(ctx.count('bank')).toBeUndefined();
    expect(ctx.hasError('bank')).toBe(false);
  });

  it('registerDirty: هر فرم ثبت‌شده‌ای که تغییر دارد isDirty را true می‌کند و لغو ثبت آن را کنار می‌گذارد', () => {
    let a = false;
    let b = false;
    const offA = ctx.registerDirty('a', () => a);
    ctx.registerDirty('b', () => b);
    expect(ctx.isDirty()).toBe(false);
    a = true;
    expect(ctx.isDirty()).toBe(true);
    offA();
    expect(ctx.isDirty()).toBe(false);
    b = true;
    expect(ctx.isDirty()).toBe(true);
  });

  it('لغو ثبت کهنه ثبت تازهٔ همان کلید را پاک نمی‌کند', () => {
    const offOld = ctx.registerDirty('form', () => false);
    ctx.registerDirty('form', () => true);
    offOld();
    expect(ctx.isDirty()).toBe(true);
  });
});
