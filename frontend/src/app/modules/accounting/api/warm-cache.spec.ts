import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Injector } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
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

  it('1. warms my sections and seven lists per section with the toast skipped', async () => {
    const p = warmAccountingCache(TestBed.inject(Injector));

    const mySecReqs = httpMock.match(r => r.url.endsWith('/org/section-assignments/my-sections/'));
    const projSecReqs = httpMock.match(r => r.url.includes('org/project-sections'));

    expect(mySecReqs.length).toBe(1);
    expect(mySecReqs[0].request.method).toBe('GET');
    expect(mySecReqs[0].request.context.get(SKIP_GLOBAL_ERROR_TOAST)).toBe(true);

    expect(projSecReqs.length).toBe(1);
    expect(projSecReqs[0].request.method).toBe('GET');
    expect(projSecReqs[0].request.context.get(SKIP_GLOBAL_ERROR_TOAST)).toBe(true);
    expect(projSecReqs[0].request.urlWithParams).toContain('is_active=true');

    mySecReqs[0].flush([{ id: 11 }]);
    projSecReqs[0].flush([]);

    await new Promise(r => setTimeout(r, 10));

    const personnelReqs = httpMock.match(r => r.url.includes('personnel/'));
    expect(personnelReqs.length).toBe(7);

    for (const req of personnelReqs) {
      expect(req.request.method).toBe('GET');
      expect(req.request.context.get(SKIP_GLOBAL_ERROR_TOAST)).toBe(true);
      expect(req.request.urlWithParams).toContain('section_id=11');
    }

    const pendingSupervisorReqs = personnelReqs.filter(r =>
      r.request.urlWithParams.includes('approval_status=pending_supervisor')
    );
    expect(pendingSupervisorReqs.length).toBe(2);
    expect(pendingSupervisorReqs.some(r => r.request.url.includes('personnel/profiles'))).toBe(true);
    expect(pendingSupervisorReqs.some(r => r.request.url.includes('personnel/vehicles'))).toBe(true);

    for (const req of personnelReqs) {
      req.flush([]);
    }

    await p;
    httpMock.verify();
  });

  it('2. falls back to active sections when my sections is empty', async () => {
    const p = warmAccountingCache(TestBed.inject(Injector));

    const mySecReqs = httpMock.match(r => r.url.endsWith('/org/section-assignments/my-sections/'));
    const projSecReqs = httpMock.match(r => r.url.includes('org/project-sections'));

    expect(mySecReqs.length).toBe(1);
    expect(projSecReqs.length).toBe(1);

    mySecReqs[0].flush([]);
    projSecReqs[0].flush([{ id: 21 }, { id: 22 }]);

    await new Promise(r => setTimeout(r, 10));

    const batch1 = httpMock.match(r => r.url.includes('personnel/'));
    expect(batch1.length).toBe(7);
    for (const req of batch1) {
      expect(req.request.urlWithParams).toContain('section_id=21');
      req.flush([]);
    }

    await new Promise(r => setTimeout(r, 10));

    const batch2 = httpMock.match(r => r.url.includes('personnel/'));
    expect(batch2.length).toBe(7);
    for (const req of batch2) {
      expect(req.request.urlWithParams).toContain('section_id=22');
      req.flush([]);
    }

    await p;
    httpMock.verify();
  });

  it('3. a failed my-sections request does not throw', async () => {
    const p = warmAccountingCache(TestBed.inject(Injector));

    const mySecReqs = httpMock.match(r => r.url.endsWith('/org/section-assignments/my-sections/'));
    const projSecReqs = httpMock.match(r => r.url.includes('org/project-sections'));

    expect(mySecReqs.length).toBe(1);
    expect(projSecReqs.length).toBe(1);

    mySecReqs[0].flush('Server Error', { status: 500, statusText: 'Internal Server Error' });
    projSecReqs[0].flush([]);

    await new Promise(r => setTimeout(r, 10));
    await expect(p).resolves.toBeUndefined();

    const personnelReqs = httpMock.match(r => r.url.includes('personnel/'));
    expect(personnelReqs.length).toBe(0);

    httpMock.verify();
  });
});
