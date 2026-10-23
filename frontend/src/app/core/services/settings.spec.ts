// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';
import { SettingsService } from './settings';
import { environment } from '../../../environments/environment';

describe('SettingsService (Backup & Restore)', () => {
  let service: SettingsService;
  let httpClientMock: any;

  beforeEach(() => {
    httpClientMock = {
      get: vi.fn().mockReturnValue(of({})),
      post: vi.fn().mockReturnValue(of({})),
      delete: vi.fn().mockReturnValue(of({})),
    };
    service = new SettingsService(httpClientMock);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should post password when downloadBackup is called', () => {
    const password = 'StrongPassword123!';
    service.downloadBackup(password);

    expect(httpClientMock.post).toHaveBeenCalledWith(
      `${environment.apiUrl}/backup/create/`,
      { password },
      expect.objectContaining({ responseType: 'blob' })
    );
  });

  it('should send FormData with file, password, and confirm_text when restoreBackup is called', () => {
    const file = new File(['fake-wbak-content'], 'test.wbak');
    const password = 'SecretPassword123!';
    const confirmText = 'RESTORE_DATABASE_CONFIRM';

    service.restoreBackup(file, password, confirmText);

    expect(httpClientMock.post).toHaveBeenCalled();
    const [url, formData] = httpClientMock.post.mock.calls[0];
    expect(url).toBe(`${environment.apiUrl}/backup/restore/`);
    expect(formData instanceof FormData).toBe(true);
    expect(formData.get('password')).toBe(password);
    expect(formData.get('confirm_text')).toBe(confirmText);
    expect(formData.get('file')).toBe(file);
  });
});
