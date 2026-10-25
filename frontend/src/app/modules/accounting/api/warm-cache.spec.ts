import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Injector } from '@angular/core';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { warmAccountingCache } from './warm-cache';
import { SKIP_GLOBAL_ERROR_TOAST } from '../../../core/error/error.interceptor';

describe('warmAccountingCache', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('1. warms my sections and seven lists per section with the toast skipped', async () => {
    const p = warmAccountingCache(TestBed.inject(Injector));

    const reqMy = httpMock.expectOne(r => r.url.endsWith('/org/section-assignments/my-sections/'));
    const reqActive = httpMock.expectOne(r => r.url.endsWith('/org/project-sections') || r.url.includes('org/project-sections'));

    expect(reqMy.request.method).toBe('GET');
    expect(reqMy.request.context.get(SKIP_GLOBAL_ERROR_TOAST)).toBe(true);

    expect(reqActive.request.method).toBe('GET');
    expect(reqActive.request.context.get(SKIP_GLOBAL_ERROR_TOAST)).toBe(true);
    expect(reqActive.request.urlWithParams).toContain('is_active=true');

    reqMy.flush([{ id: 11 }]);
    reqActive.flush([]);

    await new Promise(r => setTimeout(r, 0));

    const sectionReqs = httpMock.match(r => r.url.includes('personnel/'));
    expect(sectionReqs).toHaveLength(7);

    for (const req of sectionReqs) {
      expect(req.request.method).toBe('GET');
      expect(req.request.context.get(SKIP_GLOBAL_ERROR_TOAST)).toBe(true);
      expect(req.request.urlWithParams).toContain('section_id=11');
    }

    const pendingSupervisorReqs = sectionReqs.filter(r =>
      r.request.urlWithParams.includes('approval_status=pending_supervisor')
    );
    expect(pendingSupervisorReqs).toHaveLength(2);
    expect(pendingSupervisorReqs.some(r => r.request.url.includes('personnel/profiles'))).toBe(true);
    expect(pendingSupervisorReqs.some(r => r.request.url.includes('personnel/vehicles'))).toBe(true);

    sectionReqs.forEach(r => r.flush([]));

    await p;
  });

  it('2. falls back to active sections when my sections is empty', async () => {
    const p = warmAccountingCache(TestBed.inject(Injector));

    const reqMy = httpMock.expectOne(r => r.url.includes('org/section-assignments/my-sections/'));
    const reqActive = httpMock.expectOne(r => r.url.includes('org/project-sections'));

    reqMy.flush([]);
    reqActive.flush([{ id: 21 }, { id: 22 }]);

    await new Promise(r => setTimeout(r, 0));

    const reqs21 = httpMock.match(r => r.url.includes('personnel/'));
    expect(reqs21).toHaveLength(7);
    reqs21.forEach(r => {
      expect(r.request.urlWithParams).toContain('section_id=21');
      r.flush([]);
    });

    await new Promise(r => setTimeout(r, 0));

    const reqs22 = httpMock.match(r => r.url.includes('personnel/'));
    expect(reqs22).toHaveLength(7);
    reqs22.forEach(r => {
      expect(r.request.urlWithParams).toContain('section_id=22');
      r.flush([]);
    });

    await p;
  });

  it('3. a failed my-sections request does not throw', async () => {
    const p = warmAccountingCache(TestBed.inject(Injector));

    const reqMy = httpMock.expectOne(r => r.url.includes('org/section-assignments/my-sections/'));
    const reqActive = httpMock.expectOne(r => r.url.includes('org/project-sections'));

    reqMy.flush('Server error', { status: 500, statusText: 'Internal Server Error' });
    reqActive.flush([]);

    await new Promise(r => setTimeout(r, 0));

    await expect(p).resolves.toBeUndefined();

    const personnelReqs = httpMock.match(r => r.url.includes('personnel/'));
    expect(personnelReqs).toHaveLength(0);
  });
});
