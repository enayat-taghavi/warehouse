// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { LetterEditorComponent } from './letter-editor';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

function pasteEvent(plain: string, html: string): Event {
  const ev = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'clipboardData', {
    value: { getData: (type: string) => (type === 'text/plain' ? plain : type === 'text/html' ? html : '') },
  });
  return ev;
}

describe('LetterEditorComponent — ویرایشگر بلوکی (ن۱۴)', () => {
  let fixture: ComponentFixture<LetterEditorComponent>;
  let editor: LetterEditorComponent;
  const confirmOpen = vi.fn();

  beforeEach(() => {
    TestBed.resetTestingModule();
    confirmOpen.mockReset().mockResolvedValue(true);
    TestBed.configureTestingModule({ imports: [LetterEditorComponent], providers: [{ provide: ConfirmDialogService, useValue: { open: confirmOpen } }] });
    fixture = TestBed.createComponent(LetterEditorComponent);
    editor = fixture.componentInstance;
    editor.blocks.set([{ type: 'paragraph', align: 'right', runs: [{ text: '' }] }]);
    fixture.detectChanges();
  });

  it('چسباندن فقط متن ساده را می‌گذارد، نه HTML کلیپ‌بورد', () => {
    const box = fixture.nativeElement.querySelector('[role="textbox"]') as HTMLElement;
    const ev = pasteEvent('سلام دنیا', '<b onclick="alert(1)">سلام</b><script>x()</script><img src=x>');
    box.dispatchEvent(ev);
    fixture.detectChanges();

    expect(ev.defaultPrevented).toBe(true);
    expect(box.querySelector('*')).toBeNull();
    expect(box.innerHTML).not.toContain('<');
    expect(box.textContent).toBe('سلام دنیا');
    expect(editor.blocks()[0]).toEqual({ type: 'paragraph', align: 'right', runs: [{ text: 'سلام دنیا' }] });
  });

  it('ناحیهٔ ویرایش contenteditable فقط-متن است', () => {
    const box = fixture.nativeElement.querySelector('[role="textbox"]') as HTMLElement;
    expect(box.getAttribute('contenteditable')).toBe('plaintext-only');
  });

  it('پررنگ و تراز روی همان بلوک می‌نشیند و فهرست و جدول افزوده می‌شود', () => {
    const boldBtn = fixture.nativeElement.querySelector('button[aria-pressed]') as HTMLButtonElement;
    boldBtn.click();
    const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    select.value = 'center';
    select.dispatchEvent(new Event('change'));
    editor.add('list');
    editor.add('table');
    fixture.detectChanges();

    const [p, l, t] = editor.blocks();
    expect(p).toMatchObject({ type: 'paragraph', align: 'center', runs: [{ text: '', bold: true }] });
    expect(l).toMatchObject({ type: 'list', style: 'bullet' });
    expect(t).toMatchObject({ type: 'table', header: true });
    expect(fixture.nativeElement.querySelectorAll('table input').length).toBe(4);
  });

  it('غیرفعال: افزودن بلوک ممکن نیست و ناحیه قابل ویرایش نیست', () => {
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    const box = fixture.nativeElement.querySelector('[role="textbox"]') as HTMLElement;
    expect(box.getAttribute('contenteditable')).toBe('false');
    editor.add('paragraph');
    expect(editor.blocks().length).toBe(1);
  });

  it('حذف بلوک خالی بی‌پرسش و بلوک دارای متن با پرسش است', async () => {
    editor.blocks.set([
      { type: 'paragraph', align: 'right', runs: [{ text: '' }] },
      { type: 'paragraph', align: 'right', runs: [{ text: 'سلام' }] },
    ]);
    await editor.remove(0);
    expect(confirmOpen).not.toHaveBeenCalled();
    expect(editor.blocks().length).toBe(1);

    confirmOpen.mockResolvedValue(false);
    await editor.remove(0);
    expect(confirmOpen).toHaveBeenCalledTimes(1);
    expect(editor.blocks().length).toBe(1);

    confirmOpen.mockResolvedValue(true);
    await editor.remove(0);
    expect(editor.blocks().length).toBe(0);
  });

  it('حذف بند فهرست دارای متن می‌پرسد', async () => {
    editor.blocks.set([{ type: 'list', style: 'bullet', items: [[{ text: 'الف' }], [{ text: '' }]] }]);
    await editor.removeItem(0, editor.blocks()[0] as any, 1);
    expect(confirmOpen).not.toHaveBeenCalled();
    editor.blocks.set([{ type: 'list', style: 'bullet', items: [[{ text: 'الف' }], [{ text: 'ب' }]] }]);
    await editor.removeItem(0, editor.blocks()[0] as any, 1);
    expect(confirmOpen).toHaveBeenCalledTimes(1);
  });

  it('جدول: حذف ردیف و ستون آخر، دست‌کم یکی می‌ماند و متن‌دار می‌پرسد', async () => {
    editor.blocks.set([{ type: 'table', header: true, rows: [['a', ''], ['', '']] }]);
    fixture.detectChanges();
    const t = () => editor.blocks()[0] as any;
    await editor.removeRow(0, t());
    expect(t().rows).toEqual([['a', '']]);
    expect(confirmOpen).not.toHaveBeenCalled();
    await editor.removeRow(0, t());
    expect(t().rows.length).toBe(1);

    editor.blocks.set([{ type: 'table', header: true, rows: [['a', 'b'], ['c', 'd']] }]);
    await editor.removeCol(0, t());
    expect(confirmOpen).toHaveBeenCalledTimes(1);
    expect(t().rows).toEqual([['a'], ['c']]);
    await editor.removeCol(0, t());
    expect(t().rows[0].length).toBe(1);
  });

  it('Enter در خانهٔ جدول فرم را نمی‌فرستد', () => {
    editor.add('table');
    fixture.detectChanges();
    const cell = fixture.nativeElement.querySelector('table input') as HTMLInputElement;
    const ev = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    cell.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });
});
