import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { Dispatch } from './dispatch';

describe('Dispatch', () => {
  let component: Dispatch;
  let fixture: ComponentFixture<Dispatch>;

  beforeEach(async () => {
    TestBed.overrideComponent(Dispatch, {
      set: { schemas: [NO_ERRORS_SCHEMA] }
    });

    await TestBed.configureTestingModule({
      imports: [Dispatch],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(Dispatch);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    try { localStorage.clear(); } catch {}
    try { sessionStorage.clear(); } catch {}
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

