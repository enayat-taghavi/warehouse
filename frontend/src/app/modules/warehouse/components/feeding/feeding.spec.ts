import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { Feeding } from './feeding';

describe('Feeding', () => {
  let component: Feeding;
  let fixture: ComponentFixture<Feeding>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Feeding],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(Feeding);
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

