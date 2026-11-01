// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { ShareOfferBarComponent } from './share-offer-bar.component';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('ShareOfferBarComponent (DOM)', () => {
  let fixture: ComponentFixture<ShareOfferBarComponent>;
  let component: ShareOfferBarComponent;

  const q = (id: string): HTMLElement | null => fixture.nativeElement.querySelector(`[data-testid="${id}"]`);

  beforeEach(() => {
    vi.useFakeTimers();

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
    expect(ShareOfferBarComponent.lastNotifier).not.toBeNull();
    const blob = new Blob(['test content'], { type: 'text/plain' });
    ShareOfferBarComponent.lastNotifier!({ blob, filename: 'invoice-101.pdf' });
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

    ShareOfferBarComponent.lastNotifier!({ blob: blob1, filename: 'first.xlsx' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('bdi')!.textContent).toBe('first.xlsx');

    ShareOfferBarComponent.lastNotifier!({ blob: blob2, filename: 'second.xlsx' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('bdi')!.textContent).toBe('second.xlsx');
    expect(component.offer()?.filename).toBe('second.xlsx');
  });

  it('کلیک روی دکمه اشتراک‌گذاری، shareBlob را صدا زده و نوار را پنهان می‌کند', async () => {
    const blob = new Blob(['data'], { type: 'text/plain' });
    const shareSpy = vi.spyOn(component, 'shareBlob').mockResolvedValue('shared');

    ShareOfferBarComponent.lastNotifier!({ blob, filename: 'report.xlsx' });
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

    const shareSpy = vi.spyOn(component, 'shareBlob').mockImplementation(async () => {
      ShareOfferBarComponent.lastNotifier!({ blob: blob2, filename: 'new-file.pdf' });
      return 'offered';
    });

    ShareOfferBarComponent.lastNotifier!({ blob: blob1, filename: 'old-file.pdf' });
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
    vi.spyOn(component, 'shareBlob').mockRejectedValue(new Error('Share failed'));

    ShareOfferBarComponent.lastNotifier!({ blob, filename: 'error.pdf' });
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
    ShareOfferBarComponent.lastNotifier!({ blob, filename: 'document.pdf' });
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
    ShareOfferBarComponent.lastNotifier!({ blob, filename: 'auto-hide.pdf' });
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
    expect(ShareOfferBarComponent.lastNotifier).not.toBeNull();
    fixture.destroy();
    expect(ShareOfferBarComponent.lastNotifier).toBeNull();
  });
});
