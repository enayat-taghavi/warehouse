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

  describe('Web Platform (disabled)', () => {
    const LEGACY_KEYS = ['bio_web_cipher', 'bio_web_iv', 'bio_web_username', 'bio_web_salt', 'bio_web_credential_id'];

    function seedLegacyWebKeys() {
      for (const key of LEGACY_KEYS) localStorage.setItem(key, '1,2,3');
    }

    afterEach(() => {
      delete (window as any).PublicKeyCredential;
    });

    it('8. isAvailable is false in the browser even with a platform authenticator', async () => {
      (window as any).PublicKeyCredential = {
        isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(true)
      };

      expect(await service.isAvailable()).toBe(false);
    });

    it('9. hasSavedCredentials returns false when web storage is empty', async () => {
      expect(await service.hasSavedCredentials()).toBe(false);
    });

    it('10. clearCredentials removes every legacy web key', async () => {
      seedLegacyWebKeys();

      await service.clearCredentials();
      for (const key of LEGACY_KEYS) expect(localStorage.getItem(key)).toBeNull();
    });

    it('11. hasSavedCredentials purges a complete legacy web record and returns false', async () => {
      (window as any).PublicKeyCredential = {};
      seedLegacyWebKeys();

      expect(await service.hasSavedCredentials()).toBe(false);
      for (const key of LEGACY_KEYS) expect(localStorage.getItem(key)).toBeNull();
    });

    it('12. saveCredentials stores nothing and authenticate never decrypts on web', async () => {
      (window as any).PublicKeyCredential = {};
      const get = vi.fn();
      const create = vi.fn();
      (navigator as any).credentials = { get, create };

      expect(await service.saveCredentials('user1', 'secret')).toBe(false);
      expect(mockStorage.length).toBe(0);

      seedLegacyWebKeys();
      expect(await service.authenticate()).toBeNull();
      expect(get).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
    });
  });
});
