// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { Router, ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree } from '@angular/router';
import { LoginGuard } from './login.guard';
import { AuthService } from './auth.service';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('LoginGuard', () => {
  let authMock: any;
  let routerMock: any;

  beforeEach(() => {
    TestBed.resetTestingModule();

    authMock = {
      isLoggedIn: vi.fn(),
      user: vi.fn(),
      userPermissions: vi.fn().mockReturnValue([])
    };

    routerMock = {
      createUrlTree: vi.fn((commands: any[]) => ({
        toString: () => commands.join('/'),
        commands
      }))
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authMock },
        { provide: Router, useValue: routerMock }
      ]
    });
  });

  it('1. allows access to /login if user is not logged in', () => {
    authMock.isLoggedIn.mockReturnValue(false);

    const result = TestBed.runInInjectionContext(() =>
      LoginGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot)
    );

    expect(result).toBe(true);
    expect(routerMock.createUrlTree).not.toHaveBeenCalled();
  });

  it('2. redirects logged-in user to /app/launcher or landing route', () => {
    authMock.isLoggedIn.mockReturnValue(true);
    authMock.user.mockReturnValue({ is_superuser: true });
    authMock.userPermissions.mockReturnValue(['admin_all']);

    const result = TestBed.runInInjectionContext(() =>
      LoginGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot)
    );

    expect(result).not.toBe(true);
    expect(routerMock.createUrlTree).toHaveBeenCalledWith(['/app/launcher']);
  });

  it('3. redirects user requiring password change to /change-password', () => {
    authMock.isLoggedIn.mockReturnValue(true);
    authMock.user.mockReturnValue({ requires_password_change: true });

    const result = TestBed.runInInjectionContext(() =>
      LoginGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot)
    );

    expect(result).not.toBe(true);
    expect(routerMock.createUrlTree).toHaveBeenCalledWith(['/change-password']);
  });
});
