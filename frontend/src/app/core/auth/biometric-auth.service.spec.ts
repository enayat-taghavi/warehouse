// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BiometricAuthService } from './biometric-auth.service';

function createStorageMock() {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, val: string) => {
      store[key] = String(val);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (i: number) => Object.keys(store)[i] || null,
  };
}

describe('BiometricAuthService', () => {
  let service: BiometricAuthService;
  let mockStorage: ReturnType<typeof createStorageMock>;

  beforeEach(() => {
    mockStorage = createStorageMock();
    Object.defineProperty(globalThis, 'localStorage', {
      value: mockStorage,
      configurable: true,
      writable: true,
    });
    delete (globalThis as any).Capacitor;
    service = new BiometricAuthService();
  });

  afterEach(() => {
    delete (globalThis as any).Capacitor;
    vi.restoreAllMocks();
  });

  describe('Native Platform', () => {
    it('1. isAvailable returns true when native plugin reports available and enrolled', async () => {
      const isAvailableMock = vi.fn().mockResolvedValue({ available: true, enrolled: true });
      (globalThis as any).Capacitor = {
        isNativePlatform: () => true,
        Plugins: {
          BiometricAuth: {
            isAvailable: isAvailableMock
          }
        }
      };

      const result = await service.isAvailable();
      expect(result).toBe(true);
      expect(isAvailableMock).toHaveBeenCalled();
    });

    it('2. isAvailable returns false when not enrolled or unavailable', async () => {
      const isAvailableMock = vi.fn().mockResolvedValue({ available: true, enrolled: false });
      (globalThis as any).Capacitor = {
        isNativePlatform: () => true,
        Plugins: {
          BiometricAuth: {
            isAvailable: isAvailableMock
          }
        }
      };

      const result = await service.isAvailable();
      expect(result).toBe(false);
    });

    it('3. hasSavedCredentials queries native plugin', async () => {
      const hasSavedMock = vi.fn().mockResolvedValue({ hasSaved: true, username: 'testuser' });
      (globalThis as any).Capacitor = {
        isNativePlatform: () => true,
        Plugins: {
          BiometricAuth: {
            hasSavedCredentials: hasSavedMock
          }
        }
      };

      const result = await service.hasSavedCredentials();
      expect(result).toBe(true);
      expect(hasSavedMock).toHaveBeenCalled();
    });

    it('4. saveCredentials passes trimmed username and password to native plugin', async () => {
      const saveMock = vi.fn().mockResolvedValue({ success: true });
      (globalThis as any).Capacitor = {
        isNativePlatform: () => true,
        Plugins: {
          BiometricAuth: {
            saveCredentials: saveMock
          }
        }
      };

      const ok = await service.saveCredentials('  testadmin  ', 'Secr3t!P@ss');
      expect(ok).toBe(true);
      expect(saveMock).toHaveBeenCalledWith({
        username: 'testadmin',
        password: 'Secr3t!P@ss'
      });
    });

    it('5. authenticate triggers prompt and returns credentials on success', async () => {
      const authMock = vi.fn().mockResolvedValue({
        success: true,
        username: 'admin',
        password: 'password123'
      });
      (globalThis as any).Capacitor = {
        isNativePlatform: () => true,
        Plugins: {
          BiometricAuth: {
            authenticate: authMock
          }
        }
      };

      const res = await service.authenticate({ title: 'ورود بومی' });
      expect(res).toEqual({ username: 'admin', password: 'password123' });
      expect(authMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'ورود بومی' }));
    });

    it('6. authenticate returns null on failure or user cancellation', async () => {
      const authMock = vi.fn().mockResolvedValue({
        success: false,
        error: 'User cancelled'
      });
      (globalThis as any).Capacitor = {
        isNativePlatform: () => true,
        Plugins: {
          BiometricAuth: {
            authenticate: authMock
          }
        }
      };

      const res = await service.authenticate();
      expect(res).toBeNull();
    });

    it('7. clearCredentials invokes clear on native plugin', async () => {
      const clearMock = vi.fn().mockResolvedValue({ success: true });
      (globalThis as any).Capacitor = {
        isNativePlatform: () => true,
        Plugins: {
          BiometricAuth: {
            clearCredentials: clearMock
          }
        }
      };

      await service.clearCredentials();
      expect(clearMock).toHaveBeenCalled();
    });
  });

  describe('Web Platform Fallback', () => {
    it('8. isAvailable delegates to PublicKeyCredential when in browser', async () => {
      (window as any).PublicKeyCredential = {
        isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(true)
      };

      const available = await service.isAvailable();
      expect(available).toBe(true);
    });

    it('9. hasSavedCredentials returns false when web storage is empty', async () => {
      const hasSaved = await service.hasSavedCredentials();
      expect(hasSaved).toBe(false);
    });

    it('10. clearCredentials cleans up localStorage keys on web', async () => {
      localStorage.setItem('bio_web_cipher', 'dummy-cipher');
      localStorage.setItem('bio_web_iv', 'dummy-iv');
      localStorage.setItem('bio_web_username', 'user1');
      localStorage.setItem('bio_web_credential_id', '1,2,3');

      await service.clearCredentials();
      expect(localStorage.getItem('bio_web_cipher')).toBeNull();
      expect(localStorage.getItem('bio_web_iv')).toBeNull();
      expect(localStorage.getItem('bio_web_username')).toBeNull();
      expect(localStorage.getItem('bio_web_credential_id')).toBeNull();
    });

    it('11. hasSavedCredentials purges orphaned ciphers without passkey ID and returns false', async () => {
      (window as any).PublicKeyCredential = {};
      localStorage.setItem('bio_web_cipher', 'cipher-bytes');
      localStorage.setItem('bio_web_iv', 'iv-bytes');
      localStorage.setItem('bio_web_username', 'user1');

      const hasSaved = await service.hasSavedCredentials();
      expect(hasSaved).toBe(false);
      // Confirms orphaned ciphers were cleared
      expect(localStorage.getItem('bio_web_cipher')).toBeNull();
      expect(localStorage.getItem('bio_web_iv')).toBeNull();
    });

    it('12. authenticate returns null when navigator.credentials.get fails or is cancelled', async () => {
      (window as any).PublicKeyCredential = {};
      localStorage.setItem('bio_web_cipher', '1,2,3');
      localStorage.setItem('bio_web_iv', '4,5,6');
      localStorage.setItem('bio_web_username', 'user1');
      localStorage.setItem('bio_web_salt', '7,8,9');
      localStorage.setItem('bio_web_credential_id', '10,11,12');

      (navigator as any).credentials = {
        get: vi.fn().mockRejectedValue(new Error('User cancelled biometric prompt'))
      };

      const result = await service.authenticate();
      expect(result).toBeNull();
    });
  });
});
