import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, catchError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ModuleRegistryService } from '../modules/module-registry.service';
import { getScopeDirectoryEndpoint } from '../modules/scope-directory';

export { getScopeDirectoryEndpoint };

/** یک قلمرو عملیاتی در فهرست (مثلاً یک انبار)؛ فیلدهای دیگر را ماژول صاحب آن تعیین می‌کند */
export interface ScopeDirectoryEntry {
  id: number;
  name: string;
  code?: string | null;
  [field: string]: any;
}

/**
 * فهرست فقط‌خواندنی قلمروهای عملیاتی برای پوسته و ماژول‌های دیگر.
 * اندپوینت را ماژول صاحب فهرست با extension `scopeDirectory` اعلام می‌کند؛ بی آن ماژول فهرست خالی است.
 * ساخت و ویرایش رکوردها با سرویس خود ماژول صاحب است، نه این سرویس.
 */
@Injectable({
  providedIn: 'root'
})
export class ScopeDirectoryService {
  private moduleRegistry = inject(ModuleRegistryService);
  private http = inject(HttpClient);

  /** ماژول صاحب فهرست نصب است */
  get isAvailable(): boolean {
    return !!getScopeDirectoryEndpoint(this.moduleRegistry);
  }

  getAll(companyId?: number): Observable<ScopeDirectoryEntry[]> {
    const endpoint = getScopeDirectoryEndpoint(this.moduleRegistry);
    if (!endpoint) {
      return of([]);
    }
    let url = `${environment.apiUrl}${endpoint}`;
    if (companyId) {
      url += `?company_id=${companyId}`;
    }
    return this.http.get<ScopeDirectoryEntry[]>(url).pipe(
      catchError(() => of([]))
    );
  }
}
