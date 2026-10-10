// @vitest-environment jsdom
import '@angular/compiler';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SvgIconDirective } from './svg-icon.directive';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

@Component({
  standalone: true,
  imports: [SvgIconDirective],
  template: `
    <svg id="registry-icon" appIcon="trash-2" class="w-4 h-4"></svg>
    <svg id="action-icon" appIcon="action-create" class="w-4 h-4"></svg>
    <svg id="status-icon" appIcon="status-pending" class="w-4 h-4"></svg>
    <svg id="invalid-icon" appIcon="action-invalid-test" class="w-4 h-4"></svg>
    <svg id="proto-icon" appIcon="constructor" class="w-4 h-4"></svg>
    <svg id="ref-plus" appIcon="plus" class="w-4 h-4"></svg>
    <svg id="ref-clock" appIcon="clock" class="w-4 h-4"></svg>
  `
})
class TestHostComponent {}

describe('SvgIconDirective', () => {
  let fixture: ComponentFixture<TestHostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestHostComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('باید آیکون مستقیم رجیستری را رندر کند', () => {
    const el = fixture.nativeElement.querySelector('#registry-icon');
    expect(el.innerHTML).toContain('polyline');
  });

  it('باید نام معنایی action-create را به آیکون plus نگاشت و رندر کند', () => {
    const el = fixture.nativeElement.querySelector('#action-icon');
    const ref = fixture.nativeElement.querySelector('#ref-plus');
    expect(el.innerHTML).not.toBe('');
    expect(el.innerHTML).toBe(ref.innerHTML);
  });

  it('باید نام معنایی status-pending را به آیکون clock نگاشت و رندر کند', () => {
    const el = fixture.nativeElement.querySelector('#status-icon');
    const ref = fixture.nativeElement.querySelector('#ref-clock');
    expect(el.innerHTML).not.toBe('');
    expect(el.innerHTML).toBe(ref.innerHTML);
  });

  it('در صورت نام نامعتبر باید محتوای درونی خالی باشد', () => {
    const el = fixture.nativeElement.querySelector('#invalid-icon');
    expect(el.innerHTML).toBe('');
  });

  it('کلید prototype (مثل constructor) نباید چیزی رندر کند', () => {
    const el = fixture.nativeElement.querySelector('#proto-icon');
    expect(el.innerHTML).toBe('');
  });
});
