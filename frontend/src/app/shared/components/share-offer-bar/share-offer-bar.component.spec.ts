// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { ShareOfferBarComponent } from './share-offer-bar.component';
import { setFileShareOfferNotifier, shareBlob } from '../../../core/platform/file-output';

vi.hoisted(() => {
  const mocker = (globalThis as any).__vitest_mocker__;
  if (mocker) {
    vi.mock = ((path: string, factory?: any) => {
      const importer = ((import.meta as any).filename || (import.meta as any).url || '').replace(/^file:\/\/\/?/, '').replace(/\\/g, '/');
      const wrappedFactory = typeof factory === 'function'
        ? () => factory(async () => {
            try {
              return await mocker.importActual(path, importer, mocker.getMockContext?.()?.callstack);
            } catch {
              return {};
            }
          })
        : factory;
      mocker.queueMock(path, importer, wrappedFactory);
    }) as any;
  }
});

vi.mock('../../../core/platform/file-output', async (orig) => ({
  ...(await orig<typeof import('../../../core/platform/file-output')>()),
  setFileShareOfferNotifier: vi.fn(),
  shareBlob: vi.fn(),
}));

function setupMock(target: any) {
  const mockFn = vi.fn();
  target.__mock = mockFn;
  Object.assign(target, mockFn);
  Object.setPrototypeOf(target, Object.getPrototypeOf(mockFn));
  target.mockReset = () => { mockFn.mockReset(); return target; };
  target.mockClear = () => { mockFn.mockClear(); return target; };
  target.mockResolvedValue = (v: any) => { mockFn.mockResolvedValue(v); return target; };
  target.mockRejectedValue = (e: any) => { mockFn.mockRejectedValue(e); return target; };
  target.mockImplementation = (f: any) => { mockFn.mockImplementation(f); return target; };
  Object.defineProperty(target, 'mock', { get: () => mockFn.mock, configurable: true });
  return mockFn;
}

setupMock(setFileShareOfferNotifier);
setupMock(shareBlob);

const getRegisteredNotifier = (): ((offer: any) => void) | null => {
  const calls = vi.mocked(setFileShareOfferNotifier).mock.calls;
  return calls.length > 0 ? calls[calls.length - 1][0] : null;
};

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('ShareOfferBarComponent (DOM)', () => {
  let fixture: ComponentFixture<ShareOfferBarComponent>;
  let component: ShareOfferBarComponent;

  const q = (id: string): HTMLElement | null => fixture.nativeElement.querySelector(`[data-testid="${id}"]`);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(shareBlob).mockReset();
    vi.mocked(setFileShareOfferNotifier).mockClear();

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ShareOfferBarComponent],
    });
    fixture = TestBed.createComponent(ShareOfferBarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('در ابتدا پنهان است (hidden at start)', () => {
    expect(q('share-offer-bar')).toBeNull();
    expect(component.offer()).toBeNull();
  });

  it('با صدا زدن نوتیفایر ثبت‌شده، نوار با نام فایل درون تگ bdi نمایش داده می‌شود', () => {
    expect(getRegisteredNotifier()).not.toBeNull();
    const blob = new Blob(['test content'], { type: 'text/plain' });
    getRegisteredNotifier()!({ blob, filename: 'invoice-101.pdf' });
    fixture.detectChanges();

    const bar = q('share-offer-bar');
    expect(bar).not.toBeNull();
    expect(bar!.getAttribute('role')).toBe('region');
    expect(bar!.getAttribute('aria-label')).toBe('اشتراک‌گذاری فایل دانلودشده');

    const bdi = fixture.nativeElement.querySelector('bdi');
    expect(bdi).not.toBeNull();
    expect(bdi!.textContent).toBe('invoice-101.pdf');
  });

  it('پیشنهاد دوم جایگزین پیشنهاد اول می‌شود (newest wins)', () => {
    const blob1 = new Blob(['1'], { type: 'text/plain' });
    const blob2 = new Blob(['2'], { type: 'text/plain' });

    getRegisteredNotifier()!({ blob: blob1, filename: 'first.xlsx' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('bdi')!.textContent).toBe('first.xlsx');

    getRegisteredNotifier()!({ blob: blob2, filename: 'second.xlsx' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('bdi')!.textContent).toBe('second.xlsx');
    expect(component.offer()?.filename).toBe('second.xlsx');
  });

  it('کلیک روی دکمه اشتراک‌گذاری، shareBlob را صدا زده و نوار را پنهان می‌کند', async () => {
    const blob = new Blob(['data'], { type: 'text/plain' });
    const shareSpy = vi.mocked(shareBlob).mockResolvedValue('shared');

    getRegisteredNotifier()!({ blob, filename: 'report.xlsx' });
    fixture.detectChanges();

    const shareBtn = q('share-offer-share') as HTMLButtonElement;
    expect(shareBtn).not.toBeNull();
    shareBtn.click();

    expect(component.busy()).toBe(true);
    await Promise.resolve();
    fixture.detectChanges();

    expect(shareSpy).toHaveBeenCalledWith(blob, 'report.xlsx');
    expect(component.busy()).toBe(false);
    expect(q('share-offer-bar')).toBeNull();
    expect(component.offer()).toBeNull();
  });

  it('نتیجه offered نوار پیشنهاد تازه را پنهان نمی‌کند', async () => {
    const blob1 = new Blob(['file 1'], { type: 'text/plain' });
    const blob2 = new Blob(['file 2'], { type: 'text/plain' });

    const shareSpy = vi.mocked(shareBlob).mockImplementation(async () => {
      getRegisteredNotifier()!({ blob: blob2, filename: 'new-file.pdf' });
      return 'offered';
    });

    getRegisteredNotifier()!({ blob: blob1, filename: 'old-file.pdf' });
    fixture.detectChanges();

    const shareBtn = q('share-offer-share') as HTMLButtonElement;
    shareBtn.click();

    await Promise.resolve();
    fixture.detectChanges();

    expect(shareSpy).toHaveBeenCalledWith(blob1, 'old-file.pdf');
    expect(q('share-offer-bar')).not.toBeNull();
    expect(component.offer()?.filename).toBe('new-file.pdf');
    expect(fixture.nativeElement.querySelector('bdi')!.textContent).toBe('new-file.pdf');
  });

  it('در صورت بروز خطا در shareBlob، نوار بسته شده و busy ریست می‌شود', async () => {
    const blob = new Blob(['data'], { type: 'text/plain' });
    vi.mocked(shareBlob).mockRejectedValue(new Error('Share failed'));

    getRegisteredNotifier()!({ blob, filename: 'error.pdf' });
    fixture.detectChanges();

    const shareBtn = q('share-offer-share') as HTMLButtonElement;
    shareBtn.click();

    await Promise.resolve();
    fixture.detectChanges();

    expect(component.busy()).toBe(false);
    expect(q('share-offer-bar')).toBeNull();
    expect(component.offer()).toBeNull();
  });

  it('کلیک روی دکمه بستن نوار را پنهان می‌کند', () => {
    const blob = new Blob(['data'], { type: 'text/plain' });
    getRegisteredNotifier()!({ blob, filename: 'document.pdf' });
    fixture.detectChanges();

    expect(q('share-offer-bar')).not.toBeNull();

    const closeBtn = q('share-offer-close') as HTMLButtonElement;
    expect(closeBtn).not.toBeNull();
    closeBtn.click();
    fixture.detectChanges();

    expect(q('share-offer-bar')).toBeNull();
    expect(component.offer()).toBeNull();
  });

  it('نوار پس از ۱۵۰۰۰ میلی‌ثانیه خودبه‌خود پنهان می‌شود', () => {
    const blob = new Blob(['data'], { type: 'text/plain' });
    getRegisteredNotifier()!({ blob, filename: 'auto-hide.pdf' });
    fixture.detectChanges();

    expect(q('share-offer-bar')).not.toBeNull();

    vi.advanceTimersByTime(14999);
    fixture.detectChanges();
    expect(q('share-offer-bar')).not.toBeNull();

    vi.advanceTimersByTime(1);
    fixture.detectChanges();
    expect(q('share-offer-bar')).toBeNull();
    expect(component.offer()).toBeNull();
  });

  it('ngOnDestroy ثبات نوتیفایر را لغو می‌کند (setFileShareOfferNotifier(null))', () => {
    expect(getRegisteredNotifier()).not.toBeNull();
    fixture.destroy();
    expect(getRegisteredNotifier()).toBeNull();
  });
});
