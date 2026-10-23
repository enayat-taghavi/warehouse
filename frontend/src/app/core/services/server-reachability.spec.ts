// Data-loss boundary: تشخیص نرسیدن به سرور جهت نگه‌داشتن داده در صف آفلاین
import { describe, it, expect } from 'vitest';
import { isServerUnreachable } from './server-reachability';

describe('isServerUnreachable', () => {
  it('returns true for network error (0)', () => {
    expect(isServerUnreachable(0)).toBe(true);
  });

  it('returns true for gateway statuses (502, 503, 504)', () => {
    [502, 503, 504].forEach((status) => {
      expect(isServerUnreachable(status)).toBe(true);
    });
  });

  it('returns true for the whole Cloudflare range (520 to 530)', () => {
    for (let status = 520; status <= 530; status++) {
      expect(isServerUnreachable(status)).toBe(true);
    }
  });

  it('returns false for answered statuses', () => {
    const answeredStatuses = [200, 201, 204, 301, 304, 400, 401, 403, 404, 409, 422, 429, 500, 501];
    answeredStatuses.forEach((status) => {
      expect(isServerUnreachable(status)).toBe(false);
    });
  });

  it('returns false for boundary cases', () => {
    const boundaryStatuses = [505, 519, 531, 599, -1];
    boundaryStatuses.forEach((status) => {
      expect(isServerUnreachable(status)).toBe(false);
    });
  });
});
