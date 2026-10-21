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

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DocumentPreviewComponent],
      providers: [{ provide: HttpClient, useValue: { get: vi.fn().mockReturnValue(of(new ArrayBuffer(8))) } }]
    }).compileComponents();
    fixture = TestBed.createComponent(DocumentPreviewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
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

  it('کشیدن با ماوس سند را جابه‌جا می‌کند و دکمهٔ غیرچپ اثری ندارد', () => {
    component.open({ title: 'تصویر', url: '/media/a.png' });
    component.startPan({ button: 2, clientX: 0, clientY: 0 } as MouseEvent);
    component.onPan({ clientX: 50, clientY: 50 } as MouseEvent);
    expect(component.panX).toBe(0);
    component.startPan({ button: 0, clientX: 10, clientY: 10 } as MouseEvent);
    component.onPan({ clientX: 40, clientY: 25 } as MouseEvent);
    component.stopPan();
    component.onPan({ clientX: 100, clientY: 100 } as MouseEvent);
    expect(component.panX).toBe(30);
    expect(component.panY).toBe(15);
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
