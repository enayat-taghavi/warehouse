import { Injectable } from '@angular/core';
import { HttpClient, HttpParams, HttpRequest, HttpEvent, HttpContext } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

/**
 * سرویس پایه HTTP — تمام سرویس‌های API از این ارث‌بری می‌کنند
 * BaseURL را از environment می‌خواند و trailing slash اضافه می‌کند
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly baseUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  get<T>(
    endpoint: string,
    params?: Record<string, unknown>,
    options?: { context?: HttpContext },
  ): Observable<T> {
    return this.http.get<T>(this.url(endpoint), {
      params: this.buildParams(params),
      context: options?.context,
    });
  }

  post<T>(
    endpoint: string,
    body: unknown = {},
    options?: { context?: HttpContext },
  ): Observable<T> {
    return this.http.post<T>(this.url(endpoint), body, { context: options?.context });
  }

  patch<T>(endpoint: string, body: unknown): Observable<T> {
    return this.http.patch<T>(this.url(endpoint), body);
  }

  put<T>(endpoint: string, body: unknown, options?: { context?: HttpContext }): Observable<T> {
    return this.http.put<T>(this.url(endpoint), body, { context: options?.context });
  }

  /** پارامتر کوئری را در params بدهید، نه در endpoint؛ url() پس از endpoint اسلش می‌گذارد و مقدار کوئری را خراب می‌کند. */
  delete<T>(endpoint: string, options?: { context?: HttpContext; params?: Record<string, unknown> }): Observable<T> {
    return this.http.delete<T>(this.url(endpoint), {
      params: this.buildParams(options?.params),
      context: options?.context,
    });
  }

  /**
   * آپلود فایل با FormData
   * برای import اکسل و آپلود مدارک
   */
  upload<T>(endpoint: string, formData: FormData): Observable<T> {
    return this.http.post<T>(this.url(endpoint), formData);
  }

  /**
   * آپلود فایل با گزارش پیشرفت
   */
  uploadWithProgress(endpoint: string, formData: FormData): Observable<HttpEvent<any>> {
    const req = new HttpRequest('POST', this.url(endpoint), formData, {
      reportProgress: true
    });
    return this.http.request(req);
  }

  /**
   * دانلود فایل (Excel, PDF) به صورت Blob
   */
  download(endpoint: string, params?: Record<string, unknown>): Observable<Blob> {
    return this.http.get(this.url(endpoint), {
      params: this.buildParams(params),
      responseType: 'blob',
    });
  }

  /**
   * دانلود فایل با درخواست POST
   */
  downloadPost(
    endpoint: string,
    body: unknown = {},
    options?: { context?: HttpContext },
  ): Observable<Blob> {
    return this.http.post(this.url(endpoint), body, {
      responseType: 'blob',
      context: options?.context,
    });
  }

  /** ساخت URL کامل با trailing slash (مورد نیاز DRF) */
  private url(endpoint: string): string {
    const cleanEndpoint = endpoint.replace(/^\/|\/$/g, '');
    return `${this.baseUrl}/${cleanEndpoint}/`;
  }

  /** تبدیل object به HttpParams — فیلتر کردن null و undefined */
  private buildParams(params?: Record<string, unknown>): HttpParams {
    let httpParams = new HttpParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== null && value !== undefined && value !== '') {
          httpParams = httpParams.set(key, String(value));
        }
      });
    }
    return httpParams;
  }
}
