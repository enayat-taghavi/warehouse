// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { DocumentPreviewComponent } from './document-preview.component';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('DocumentPreviewComponent (لایت‌باکس مشترک پیش‌نمایش مدرک)', () => {
  let fixture: ComponentFixture<DocumentPreviewComponent>;
  let component: DocumentPreviewComponent;
  let backSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    await TestBed.configureTestingModule({
      imports: [DocumentPreviewComponent],
      providers: [{ provide: HttpClient, useValue: { get: vi.fn().mockReturnValue(of(new ArrayBuffer(8))) } }]
    }).compileComponents();
    fixture = TestBed.createComponent(DocumentPreviewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('بسته رندر نمی‌شود', () => {
    expect(fixture.nativeElement.querySelector('div.fixed')).toBeNull();
  });

  it('PDF: پرچم isPdf، عنوان و بوم رندر در لایه‌ای بالاتر از استودیو (z-[70])', () => {
    component.open({ title: 'اساسنامه رسمی', url: '/media/documents/sample.pdf' });
    fixture.detectChanges();
    expect(component.previewModal.isOpen).toBe(true);
    expect(component.previewModal.isPdf).toBe(true);
    expect(component.previewModal.isImage).toBe(false);
    const overlay = fixture.nativeElement.querySelector('div.fixed.z-\\[70\\]') as HTMLElement;
    expect(overlay).not.toBeNull();
    expect(overlay.textContent).toContain('اساسنامه رسمی');
    expect(overlay.querySelector('canvas#pdf-render-canvas')).not.toBeNull();
    component.closePreview();
  });

  it('تصویر: isImage و نشانی مطلق /media/ نسبی می‌شود', () => {
    component.open({ title: 'تصویر', url: 'https://app.example.ir/media/docs/a.jpg' });
    fixture.detectChanges();
    expect(component.previewModal.isImage).toBe(true);
    expect(component.previewModal.isPdf).toBe(false);
    expect(component.previewModal.fileUrl).toBe('/media/docs/a.jpg');
    expect(fixture.nativeElement.querySelector('img')).not.toBeNull();
  });

  it('زوم بین ۵۰٪ و ۳۰۰٪ محدود است و چرخش ۹۰ درجه‌ای دور می‌زند', () => {
    component.open({ title: 'تصویر', url: '/media/a.png' });
    for (let i = 0; i < 20; i++) component.zoomIn();
    expect(component.previewScale).toBe(3);
    for (let i = 0; i < 20; i++) component.zoomOut();
    expect(component.previewScale).toBe(0.5);
    for (let i = 0; i < 4; i++) component.rotatePreview();
    expect(component.previewRotation).toBe(0);
    component.resetZoom();
    expect(component.previewScale).toBe(1);
  });

  const pointer = (pointerId: number, clientX: number, clientY: number, pointerType = 'touch', button = 0) =>
    ({ pointerId, clientX, clientY, pointerType, button, currentTarget: null } as unknown as PointerEvent);

  it('کشیدن با ماوس سند را جابه‌جا می‌کند و دکمهٔ غیرچپ اثری ندارد', () => {
    component.open({ title: 'تصویر', url: '/media/a.png' });
    component.onPointerDown(pointer(1, 0, 0, 'mouse', 2));
    component.onPointerMove(pointer(1, 50, 50, 'mouse'));
    expect(component.panX).toBe(0);
    component.onPointerDown(pointer(1, 10, 10, 'mouse'));
    component.onPointerMove(pointer(1, 40, 25, 'mouse'));
    component.onPointerUp(pointer(1, 40, 25, 'mouse'));
    component.onPointerMove(pointer(1, 100, 100, 'mouse'));
    expect(component.panX).toBe(30);
    expect(component.panY).toBe(15);
  });

  it('B12: کشیدن با یک انگشت جابه‌جا می‌کند و لغو اشاره از سوی مرورگر کشیدن را پایان می‌دهد', () => {
    component.open({ title: 'تصویر', url: '/media/a.png' });
    component.onPointerDown(pointer(7, 100, 100));
    component.onPointerMove(pointer(7, 80, 130));
    expect(component.panX).toBe(-20);
    expect(component.panY).toBe(30);
    component.onPointerUp(pointer(7, 80, 130)); // pointercancel هم همین متد است
    expect(component.isDragging).toBe(false);
    component.onPointerMove(pointer(7, 0, 0));
    expect(component.panX).toBe(-20);
  });

  it('B12: دو انگشت زوم می‌کنند (محدود به ۵۰٪ تا ۳۰۰٪) و انگشت باقی‌مانده بدون پرش به کشیدن ادامه می‌دهد', () => {
    component.open({ title: 'تصویر', url: '/media/a.png' });
    component.onPointerDown(pointer(1, 100, 100));
    component.onPointerDown(pointer(2, 200, 100)); // فاصلهٔ ۱۰۰
    expect(component.isPinching).toBe(true);
    component.onPointerMove(pointer(2, 250, 100)); // فاصلهٔ ۱۵۰
    expect(component.previewScale).toBe(1.5);
    expect(component.panX).toBe(0);
    component.onPointerMove(pointer(2, 2000, 100));
    expect(component.previewScale).toBe(3);
    component.onPointerMove(pointer(2, 110, 100));
    expect(component.previewScale).toBe(0.5);

    component.onPointerUp(pointer(2, 110, 100));
    expect(component.isPinching).toBe(false);
    expect(component.isDragging).toBe(true);
    component.onPointerMove(pointer(1, 100, 100));
    expect(component.panX).toBe(0); // بدون پرش
    component.onPointerMove(pointer(1, 120, 90));
    expect(component.panX).toBe(20);
    expect(component.panY).toBe(-10);
  });

  it('B12: اشاره روی دکمهٔ درون بدنه گرفته نمی‌شود تا کلیک آن گم نشود', () => {
    component.open({ title: 'فایل', url: '/media/a.zip' });
    fixture.detectChanges();
    const btn = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
      .find(b => b.textContent?.includes('دانلود مستقیم فایل'))!;
    component.onPointerDown({ pointerId: 3, clientX: 0, clientY: 0, pointerType: 'touch', button: 0, target: btn, currentTarget: null } as unknown as PointerEvent);
    expect(component.isDragging).toBe(false);
  });

  it('B12: پایان زوم دوانگشتی روی PDF بوم را یک بار دوباره رندر می‌کند', () => {
    component.open({ title: 'سند', url: '/media/a.pdf' });
    component.pdfDoc = {} as any;
    const render = vi.spyOn(component, 'renderPdfPage').mockResolvedValue();
    component.onPointerDown(pointer(1, 0, 0));
    component.onPointerDown(pointer(2, 100, 0));
    component.onPointerMove(pointer(2, 200, 0));
    expect(render).not.toHaveBeenCalled();
    expect(component.pinchCanvasScale).toBe(2); // بازخورد زنده با CSS تا رندر دوباره
    component.onPointerUp(pointer(1, 0, 0));
    expect(render).toHaveBeenCalledTimes(1);
    component.closePreview();
  });

  it('ت۸: پنجره role="dialog" و aria-modal دارد، عنوانش برچسب آن است و همهٔ دکمه‌ها نام دسترس‌پذیر دارند', () => {
    component.open({ title: 'روزنامهٔ رسمی', url: '/media/a.png' });
    fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const title = fixture.nativeElement.querySelector(`#${dialog.getAttribute('aria-labelledby')}`) as HTMLElement;
    expect(title.textContent).toContain('روزنامهٔ رسمی');
    const buttons = Array.from(dialog.querySelectorAll('button')) as HTMLButtonElement[];
    expect(buttons.length).toBeGreaterThan(5);
    for (const b of buttons) {
      expect(b.getAttribute('aria-label') || b.textContent?.trim()).toBeTruthy();
    }
    // ابزارهای کم‌کاربرد درون منوی «بیشتر» هستند و در موبایل تمام‌صفحه است
    const menu = dialog.querySelector('app-overflow-menu') as HTMLElement;
    expect(menu.querySelector('button[aria-label="چرخش ۹۰ درجه"]')).not.toBeNull();
    expect(menu.querySelector('button[aria-label="بزرگ‌نمایی"]')).not.toBeNull();
    expect(dialog.className).toContain('h-[100dvh]');
    expect(dialog.className).toContain('md:max-w-5xl');
    component.closePreview();
  });

  it('ت۸: کانون به دکمهٔ بستن می‌رود، Tab درون پنجره می‌چرخد و پس از بستن به دکمهٔ بازکننده برمی‌گردد', async () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    component.open({ title: 'سند', url: '/media/a.png' });
    fixture.detectChanges();
    await new Promise(r => setTimeout(r, 0));
    const dialog = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
    const closeBtn = dialog.querySelector('button[aria-label="بستن پیش‌نمایش"]') as HTMLButtonElement;
    expect(document.activeElement).toBe(closeBtn);

    const buttons = Array.from(dialog.querySelectorAll('button:not([disabled])')) as HTMLButtonElement[];
    const last = buttons[buttons.length - 1];
    last.focus();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    last.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(buttons[0]);
    const shiftTab = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    buttons[0].dispatchEvent(shiftTab);
    expect(document.activeElement).toBe(last);

    component.closePreview();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('ت۸: دکمهٔ برگشت مرورگر پیش‌نمایش را می‌بندد و history.back() دوباره زده نمی‌شود', () => {
    const push = vi.spyOn(window.history, 'pushState');
    const back = backSpy;
    const closed = vi.fn();
    component.closed.subscribe(closed);
    component.open({ title: 'سند', url: '/media/a.png' });
    expect(push).toHaveBeenCalledTimes(1);
    expect((push.mock.calls[0][0] as any).documentPreview).toBe(true);

    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(component.previewModal.isOpen).toBe(false);
    expect(closed).toHaveBeenCalledTimes(1);
    expect(back).not.toHaveBeenCalled();
  });

  it('ت۸: بستن با دکمه یا Esc ورودی تاریخچه را با یک history.back() برمی‌دارد و popstate حاصل نادیده گرفته می‌شود', () => {
    const back = backSpy;
    component.open({ title: 'سند', url: '/media/a.png' });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(back).toHaveBeenCalledTimes(1);

    // پیش‌نمایش تازه پیش از رسیدن popstate برگشت قبلی باز می‌شود و نباید بسته شود
    component.open({ title: 'سند دوم', url: '/media/b.png' });
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(component.previewModal.isOpen).toBe(true);
    // برگشت واقعی کاربر همان پیش‌نمایش را می‌بندد
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(component.previewModal.isOpen).toBe(false);
    expect(back).toHaveBeenCalledTimes(1);
  });

  it('ت۸: باز کردن دوباره روی پیش‌نمایش باز ورودی تاریخچهٔ تازه نمی‌سازد و از بین رفتن میزبان history.back() نمی‌زند', () => {
    const push = vi.spyOn(window.history, 'pushState');
    const back = backSpy;
    component.open({ title: 'الف', url: '/media/a.png' });
    component.open({ title: 'ب', url: '/media/b.png' });
    expect(push).toHaveBeenCalledTimes(1);
    fixture.destroy();
    expect(back).not.toHaveBeenCalled();
  });

  it('Escape و دکمهٔ بستن لایت‌باکس را می‌بندند و رویداد closed یک بار می‌آید', () => {
    const closed = vi.fn();
    component.closed.subscribe(closed);
    component.open({ title: 'سند', url: '/media/a.pdf' });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(component.previewModal.isOpen).toBe(false);
    expect(closed).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(closed).toHaveBeenCalledTimes(1);

    component.open({ title: 'سند', url: '/media/a.png' });
    fixture.detectChanges();
    const closeBtn = fixture.nativeElement.querySelector('button[title="بستن پیش‌نمایش (Esc)"]') as HTMLButtonElement;
    closeBtn.click();
    expect(component.previewModal.isOpen).toBe(false);
    expect(closed).toHaveBeenCalledTimes(2);
  });
});
