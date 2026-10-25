// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { PersonRolePickerComponent } from './person-role-picker.component';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('PersonRolePickerComponent DOM Spec', () => {
  let fixture: ComponentFixture<PersonRolePickerComponent>;
  let component: PersonRolePickerComponent;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PersonRolePickerComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });

    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(PersonRolePickerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    httpMock.verify();
  });

  it('search is debounced', () => {
    const inputEl = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    inputEl.value = 'al';
    inputEl.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    vi.advanceTimersByTime(299);
    httpMock.expectNone((r) => r.url.includes('/api/auth/users/'));

    vi.advanceTimersByTime(1);
    const usersReq = httpMock.expectOne((r) => r.url.includes('/api/auth/users/') && r.params.get('search') === 'al');
    expect(usersReq.request.params.get('search')).toBe('al');
    usersReq.flush({
      results: [
        { id: 1, first_name: 'Ali', last_name: 'A', username: 'ali' },
        { id: 2, first_name: '', last_name: '', username: 'bob' },
      ],
    });

    const rolesReq = httpMock.expectOne((r) => r.url.includes('/api/auth/roles/'));
    rolesReq.flush([{ id: 10, title: 'Manager' }]);
  });

  it('enter adds active option as chip', () => {
    const onChange = vi.fn();
    component.registerOnChange(onChange);

    const inputEl = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    inputEl.value = 'al';
    inputEl.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    vi.advanceTimersByTime(300);

    const usersReq = httpMock.expectOne((r) => r.url.includes('/api/auth/users/'));
    usersReq.flush({
      results: [
        { id: 1, first_name: 'Ali', last_name: 'A', username: 'ali' },
        { id: 2, first_name: '', last_name: '', username: 'bob' },
      ],
    });

    const rolesReq = httpMock.expectOne((r) => r.url.includes('/api/auth/roles/'));
    rolesReq.flush([{ id: 10, title: 'Manager' }]);
    fixture.detectChanges();

    inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.detectChanges();

    expect(onChange).toHaveBeenCalledWith([{ type: 'user', id: 1, label: 'Ali A' }]);
    expect(fixture.nativeElement.textContent).toContain('Ali A');
  });

  it('username fallback label', () => {
    const inputEl = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    inputEl.value = 'al';
    inputEl.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    vi.advanceTimersByTime(300);

    const usersReq = httpMock.expectOne((r) => r.url.includes('/api/auth/users/'));
    usersReq.flush({
      results: [
        { id: 1, first_name: 'Ali', last_name: 'A', username: 'ali' },
        { id: 2, first_name: '', last_name: '', username: 'bob' },
      ],
    });

    const rolesReq = httpMock.expectOne((r) => r.url.includes('/api/auth/roles/'));
    rolesReq.flush([{ id: 10, title: 'Manager' }]);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('bob');
  });

  it('backspace on empty input removes last chip', () => {
    const onChange = vi.fn();
    component.registerOnChange(onChange);

    component.writeValue([{ type: 'role', id: 10, label: 'Manager' }]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Manager');

    const inputEl = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    inputEl.value = '';
    inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('Manager');
    expect(onChange).toHaveBeenCalledWith([]);
    expect(component.value()).toEqual([]);
  });

  it('max is respected', () => {
    fixture.componentRef.setInput('max', 1);
    component.writeValue([{ type: 'user', id: 1, label: 'Ali A' }]);
    fixture.detectChanges();

    const inputEl = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    expect(inputEl.disabled).toBe(true);

    component.add({ type: 'user', id: 2, label: 'bob' });
    expect(component.value().length).toBe(1);
  });

  it('allowRoles false hides roles', () => {
    fixture.componentRef.setInput('allowRoles', false);
    fixture.detectChanges();

    const inputEl = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    inputEl.value = 'al';
    inputEl.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    vi.advanceTimersByTime(300);

    const usersReq = httpMock.expectOne((r) => r.url.includes('/api/auth/users/'));
    usersReq.flush({
      results: [{ id: 1, first_name: 'Ali', last_name: 'A', username: 'ali' }],
    });

    httpMock.expectNone((r) => r.url.includes('/api/auth/roles/'));
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('Manager');
  });

  it('remove button has aria label', () => {
    component.writeValue([{ type: 'user', id: 1, label: 'Ali A' }]);
    fixture.detectChanges();

    const removeBtn = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(removeBtn).not.toBeNull();
    expect(removeBtn.getAttribute('aria-label')).toContain('Ali A');
  });

  it('error state shown', () => {
    const inputEl = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    inputEl.value = 'al';
    inputEl.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    vi.advanceTimersByTime(300);

    const usersReq = httpMock.expectOne((r) => r.url.includes('/api/auth/users/'));
    usersReq.flush('Server Error', { status: 500, statusText: 'Internal Server Error' });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('جست‌وجو ناموفق بود');
  });
});
