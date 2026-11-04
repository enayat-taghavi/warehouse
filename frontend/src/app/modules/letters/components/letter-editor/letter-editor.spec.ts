// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { LetterEditorComponent } from './letter-editor';

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

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [LetterEditorComponent] });
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
});
