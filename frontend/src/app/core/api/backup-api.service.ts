import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface DatabaseBackup {
  id: string;
  filename: string;
  description: string;
  engine: string;
  size: number;
  checksum: string;
  is_emergency: boolean;
  created_by: string;
  created_by_name: string;
  created_at: string;
  file_exists?: boolean;
}

export interface BackupVerifyResult {
  is_valid: boolean;
  size?: number;
  checksum?: string;
  error?: string;
}

export interface BackupRestoreResult {
  success: boolean;
  message?: string;
  emergency_snapshot?: string;
  error?: string;
}

@Injectable({ providedIn: 'root' })
export class BackupApiService {
  private readonly endpoint = 'auth/backups';

  constructor(
    private api: ApiService,
    private http: HttpClient
  ) {}

  getBackups(): Observable<DatabaseBackup[]> {
    return this.api.get<DatabaseBackup[]>(this.endpoint);
  }

  createBackup(description?: string): Observable<{ success: boolean; backup: DatabaseBackup }> {
    return this.api.post<{ success: boolean; backup: DatabaseBackup }>(this.endpoint, { description });
  }

  verifyBackup(filename: string): Observable<BackupVerifyResult> {
    return this.api.post<BackupVerifyResult>(`${this.endpoint}/verify`, { filename });
  }

  restoreBackup(filename: string, confirmText: string): Observable<BackupRestoreResult> {
    return this.api.post<BackupRestoreResult>(`${this.endpoint}/restore`, {
      filename,
      confirm_text: confirmText
    });
  }

  downloadBackupUrl(filename: string): string {
    return `${environment.apiUrl}/${this.endpoint}/download/?filename=${encodeURIComponent(filename)}`;
  }
}
