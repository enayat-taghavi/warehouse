// @vitest-environment jsdom
import '@angular/compiler';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { SmartDeleteModalComponent } from './smart-delete-modal';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('SmartDeleteModalComponent', () => {
  let fixture: ComponentFixture<SmartDeleteModalComponent>;
  let component: SmartDeleteModalComponent;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SmartDeleteModalComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(SmartDeleteModalComponent);
    component = fixture.componentInstance;
    component.deleteImpactUrl = '/api/x/1/delete_impact/';
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => {
    component.ngOnDestroy();
    TestBed.resetTestingModule();
  });

  it('۴۰۳ از سرور: متن فارسی detail نمایش داده می‌شود و حذف مسدود می‌ماند', () => {
    http.expectOne('/api/x/1/delete_impact/').flush(
      { detail: 'این مورد در دامنهٔ دسترسی شما نیست.' },
      { status: 403, statusText: 'Forbidden' },
    );
    fixture.detectChanges();

    expect(component.impactError).toBe('این مورد در دامنهٔ دسترسی شما نیست.');
    expect(fixture.nativeElement.textContent).toContain('این مورد در دامنهٔ دسترسی شما نیست.');
    component.countdown = 0;
    component.confirmationText = 'حذف';
    expect(component.isHardDeleteEnabled).toBe(false);
  });

  it('پاسخ موفق بدون مانع: حذف پس از تأیید فعال می‌شود', () => {
    http.expectOne('/api/x/1/delete_impact/').flush({ impact: [], total_affected: 0, blocked: false });
    component.countdown = 0;
    component.confirmationText = 'حذف';
    expect(component.isHardDeleteEnabled).toBe(true);
  });
});
