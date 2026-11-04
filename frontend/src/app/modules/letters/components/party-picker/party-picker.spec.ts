// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { PartyPickerComponent } from './party-picker';
import { LettersApiService } from '../../services/letters-api.service';
import { LettersOfflineService } from '../../services/letters-offline';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('PartyPickerComponent — انتخابگر طرف بیرونی', () => {
  let fixture: ComponentFixture<PartyPickerComponent>;
  let api: { parties: any; createParty: any };
  const online = signal(true);

  beforeEach(() => {
    vi.useFakeTimers();
    online.set(true);
    api = {
      parties: vi.fn().mockReturnValue(of([{ id: 4, company: 3, kind: 'legal', name: 'شرکت نمونه', national_id: '10101010101' }])),
      createParty: vi.fn().mockReturnValue(of({ id: 9, company: 3, kind: 'legal', name: 'طرف تازه', national_id: null })),
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PartyPickerComponent],
      providers: [
        { provide: LettersApiService, useValue: api },
        { provide: LettersOfflineService, useValue: { online } },
      ],
    });
    fixture = TestBed.createComponent(PartyPickerComponent);
    fixture.componentRef.setInput('company', 3);
    fixture.detectChanges();
  });

  afterEach(() => vi.useRealTimers());

  it('جست‌وجو با شرکت فعال و انتخاب طرف', () => {
    const picked: any[] = [];
    fixture.componentInstance.picked.subscribe(p => picked.push(p));
    fixture.componentInstance.onQuery('نمونه');
    vi.advanceTimersByTime(350);
    fixture.detectChanges();

    expect(api.parties).toHaveBeenCalledWith(3, 'نمونه');
    const option = fixture.nativeElement.querySelector('ul li button') as HTMLButtonElement;
    expect(option.textContent).toContain('شرکت نمونه');
    option.click();
    expect(picked.map(p => p.id)).toEqual([4]);
  });

  it('طرف تازه با نام و نوع ساخته و انتخاب می‌شود', () => {
    const picked: any[] = [];
    fixture.componentInstance.picked.subscribe(p => picked.push(p));
    fixture.componentInstance.startCreate();
    fixture.componentInstance.newName.set('طرف تازه');
    fixture.componentInstance.create();
    expect(api.createParty).toHaveBeenCalledWith(3, { name: 'طرف تازه', kind: 'legal' });
    expect(picked.map(p => p.id)).toEqual([9]);
  });

  it('آفلاین: جست‌وجو و «طرف تازه» غیرفعال و پیام اتصال', () => {
    online.set(false);
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('#letter-party-search') as HTMLInputElement;
    const btn = fixture.nativeElement.querySelector('button[aria-label="طرف بیرونی تازه"]') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('نیاز به اتصال');
    expect(input).toBeTruthy();
  });

  it('Enter در کادرهای انتخابگر فرم نامه را نمی‌فرستد', () => {
    const search = fixture.nativeElement.querySelector('#letter-party-search') as HTMLInputElement;
    const ev = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    search.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    vi.advanceTimersByTime(350);

    fixture.componentInstance.startCreate();
    fixture.componentInstance.newName.set('طرف تازه');
    fixture.detectChanges();
    const name = fixture.nativeElement.querySelector('#letter-party-name') as HTMLInputElement;
    const ev2 = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    name.dispatchEvent(ev2);
    expect(ev2.defaultPrevented).toBe(true);
    expect(api.createParty).toHaveBeenCalled();
  });
});
