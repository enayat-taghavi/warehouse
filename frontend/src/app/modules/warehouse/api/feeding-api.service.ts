import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../../core/api/api.service';

@Injectable({ providedIn: 'root' })
export class FeedingApiService {
  constructor(private api: ApiService) {}

  /** صدور فایل MT26 */
  exportMT26(recordIds: number[]): Observable<{ updated_count: number }> {
    return this.api.post('feeding/export-mt26', { record_ids: recordIds });
  }

  /** صدور فایل MT49 */
  exportMT49(recordIds: number[]): Observable<{ updated_count: number }> {
    return this.api.post('feeding/export-mt49', { record_ids: recordIds });
  }

  /** ثبت بازخورد MT26 (تایید تغذیه موفق) */
  confirmMT26(recordIds: number[]): Observable<{ updated_count: number }> {
    return this.api.post('feeding/confirm-mt26', { record_ids: recordIds });
  }

  /** ثبت بازخورد MT49 */
  confirmMT49(recordIds: number[]): Observable<{ updated_count: number }> {
    return this.api.post('feeding/confirm-mt49', { record_ids: recordIds });
  }
}
