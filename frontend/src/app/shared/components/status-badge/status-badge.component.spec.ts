// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { StatusBadgeComponent } from './status-badge.component';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('StatusBadgeComponent', () => {
  let fixture: ComponentFixture<StatusBadgeComponent>;
  let component: StatusBadgeComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StatusBadgeComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(StatusBadgeComponent);
    component = fixture.componentInstance;
  });

  it('settled_outside shows the outside-payment label', async () => {
    component.status = 'settled_outside';
    fixture.detectChanges();
    await fixture.whenStable();

    const text = fixture.nativeElement.textContent || '';
    expect(text).toContain('تأییدشده، پرداخت بیرون از سامانه');
  });
});
