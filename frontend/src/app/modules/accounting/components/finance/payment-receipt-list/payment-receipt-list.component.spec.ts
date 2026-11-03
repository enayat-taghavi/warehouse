// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('PaymentReceiptListComponent sticky actions column', () => {
  const templatePath = path.resolve(__dirname, 'payment-receipt-list.component.html');

  it('template file exists', () => {
    expect(fs.existsSync(templatePath)).toBe(true);
  });

  it('pins operations header with sticky left-0 and clean styling without separator border', () => {
    const html = fs.readFileSync(templatePath, 'utf-8');
    expect(html).toContain('sticky left-0 z-10 bg-surface-muted min-w-[140px]');
    expect(html).toContain('>عملیات</th>');
    expect(html).not.toContain('border-s border-slate-200');
  });

  it('pins operations row cells with sticky left-0, group hover, and no separator border', () => {
    const html = fs.readFileSync(templatePath, 'utf-8');
    expect(html).toContain('<tr class="group hover:bg-slate-50/80 transition-colors whitespace-nowrap">');
    expect(html).toContain('sticky left-0 z-10 bg-surface group-hover:bg-surface-muted transition-colors min-w-[140px]');
    expect(html).toContain('flex items-center justify-center gap-1 min-w-max');
    expect(html).not.toContain('border-s border-slate-200/80');
  });

  it('retains all standard actions in the actions template', () => {
    const html = fs.readFileSync(templatePath, 'utf-8');
    expect(html).toContain('appAction="view"');
    expect(html).toContain('appAction="share"');
    expect(html).toContain('appAction="print"');
  });
});
