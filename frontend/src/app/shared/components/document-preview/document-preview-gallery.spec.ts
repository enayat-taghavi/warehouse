// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { DocumentPreviewComponent, DocumentPreviewSource } from './document-preview.component';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('DocumentPreviewComponent - Gallery & Sources (chat stage 5-c)', () => {
  let fixture: ComponentFixture<DocumentPreviewComponent>;
  let component: DocumentPreviewComponent;

  const q = (sel: string) => fixture.nativeElement.querySelector(sel) as HTMLElement | null;

  beforeEach(async () => {
    vi.spyOn(window.history, 'back').mockImplementation(() => {});
    await TestBed.configureTestingModule({
      imports: [DocumentPreviewComponent],
      providers: [
        { provide: HttpClient, useValue: { get: vi.fn().mockReturnValue(of(new ArrayBuffer(8))) } }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(DocumentPreviewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('1. openGallery([a, b, c], 1) shows gallery-prev and gallery-next enabled and preview-subtitle containing «۲ از ۳»', () => {
    const items: DocumentPreviewSource[] = [
      { title: 'a.png', url: '/media/a.png', kind: 'image' },
      { title: 'b.png', url: '/media/b.png', kind: 'image' },
      { title: 'c.png', url: '/media/c.png', kind: 'image' }
    ];
    component.openGallery(items, 1);
    fixture.detectChanges();

    const prevBtn = q('[data-testid="gallery-prev"]') as HTMLButtonElement;
    const nextBtn = q('[data-testid="gallery-next"]') as HTMLButtonElement;
    const subtitle = q('[data-testid="preview-subtitle"]');

    expect(prevBtn).not.toBeNull();
    expect(nextBtn).not.toBeNull();
    expect(prevBtn.disabled).toBe(false);
    expect(nextBtn.disabled).toBe(false);
    expect(subtitle).not.toBeNull();
    expect(subtitle?.textContent).toContain('۲ از ۳');
  });

  it('2. clicking gallery-next shows the third title and disables gallery-next', () => {
    const items: DocumentPreviewSource[] = [
      { title: 'a.png', url: '/media/a.png', kind: 'image' },
      { title: 'b.png', url: '/media/b.png', kind: 'image' },
      { title: 'c.png', url: '/media/c.png', kind: 'image' }
    ];
    component.openGallery(items, 1);
    fixture.detectChanges();

    const nextBtn = q('[data-testid="gallery-next"]') as HTMLButtonElement;
    nextBtn.click();
    fixture.detectChanges();

    expect(component.current?.title).toBe('c.png');
    expect(nextBtn.disabled).toBe(true);
  });

  it('3. dispatching ArrowLeft on document moves to the next item; ArrowRight moves back', () => {
    const items: DocumentPreviewSource[] = [
      { title: 'a.png', url: '/media/a.png', kind: 'image' },
      { title: 'b.png', url: '/media/b.png', kind: 'image' },
      { title: 'c.png', url: '/media/c.png', kind: 'image' }
    ];
    component.openGallery(items, 0);
    fixture.detectChanges();
    expect(component.current?.title).toBe('a.png');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    fixture.detectChanges();
    expect(component.current?.title).toBe('b.png');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    fixture.detectChanges();
    expect(component.current?.title).toBe('a.png');
  });

  it('4. a source with url: "" and load: () => Promise.resolve("blob:z") shows preview-resolving first then img blob:z; load rejecting shows preview-resolve-failed', async () => {
    let resolveFn!: (url: string) => void;
    const loadPromise = new Promise<string>((res) => { resolveFn = res; });
    const source: DocumentPreviewSource = {
      title: 'dyn.png',
      url: '',
      kind: 'image',
      load: () => loadPromise
    };

    component.open(source);
    fixture.detectChanges();

    expect(q('[data-testid="preview-resolving"]')).not.toBeNull();

    resolveFn('blob:z');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(q('[data-testid="preview-resolving"]')).toBeNull();
    const img = q('img') as HTMLImageElement;
    expect(img).not.toBeNull();
    expect(img.src).toContain('blob:z');

    // Failing load
    const failingSource: DocumentPreviewSource = {
      title: 'fail.png',
      url: '',
      kind: 'image',
      load: () => Promise.reject(new Error('Network failure'))
    };
    component.open(failingSource);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(q('[data-testid="preview-resolve-failed"]')).not.toBeNull();
  });

  it('5. a source with messageId: "7" shows preview-goto; clicking it emits goToMessage with that source and closes the lightbox', () => {
    const source: DocumentPreviewSource = {
      title: 'doc.png',
      url: '/media/doc.png',
      kind: 'image',
      messageId: '7'
    };
    component.open(source);
    fixture.detectChanges();

    const gotoBtn = q('[data-testid="preview-goto"]') as HTMLButtonElement;
    expect(gotoBtn).not.toBeNull();

    let emittedSource: DocumentPreviewSource | null = null;
    component.goToMessage.subscribe((s) => { emittedSource = s; });

    gotoBtn.click();
    fixture.detectChanges();

    expect(emittedSource).toEqual(source);
    expect(component.previewModal.isOpen).toBe(false);
  });

  it('6. single open({ title: "x.png", url: "/media/x.png" }) shows no gallery-prev/gallery-next and no counter', () => {
    component.open({ title: 'x.png', url: '/media/x.png' });
    fixture.detectChanges();

    expect(q('[data-testid="gallery-prev"]')).toBeNull();
    expect(q('[data-testid="gallery-next"]')).toBeNull();
    const subtitle = q('[data-testid="preview-subtitle"]');
    if (subtitle) {
      expect(subtitle.textContent).not.toContain('از');
    }
  });
});
