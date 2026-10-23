import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { HttpClient, HttpContext } from '@angular/common/http';
import { SKIP_GLOBAL_ERROR_TOAST } from '../../../../core/error/error.interceptor';
import { environment } from '../../../../../environments/environment';
import { BRANDING } from '../../../../core/branding';
import { SvgIconDirective } from '../../../../shared/icons/svg-icon.directive';
import { resolveServerUrl } from '../../../../core/platform/server-origin';

export interface VerifiedPersonnel {
  valid: boolean;
  is_active: boolean;
  id: number;
  personnel_code: string;
  first_name: string;
  last_name: string;
  national_code: string | null;
  phone_number: string | null;
  operational_zone: string | null;
  company: string | null;
  avatar: string | null;
  blood_type: string | null;
  emergency_contact: string | null;
  roles: { id: number; title: string; color: string }[];
  assigned_warehouses: string[];
  message?: string;
}

@Component({
  selector: 'app-verify-card',
  standalone: true,
  imports: [CommonModule, NgOptimizedImage, RouterModule, SvgIconDirective],
  templateUrl: './verify-card.html',
  styleUrl: './verify-card.css'
})
export class VerifyCard implements OnInit {
  readonly branding = BRANDING;
  code: string = '';
  isLoading: boolean = true;
  error: string | null = null;
  errorTitle: string = 'کارت شناسایی نامعتبر است';
  errorType: 'invalid' | 'network' | 'rate_limit' = 'invalid';
  personnel: VerifiedPersonnel | null = null;
  verificationTimestamp: string = '';

  constructor(
    private route: ActivatedRoute,
    private http: HttpClient,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.updateTimestamp();
    this.route.paramMap.subscribe(params => {
      const codeFromPath = params.get('code');
      if (codeFromPath) {
        this.code = codeFromPath;
        this.verifyCode(this.code);
      } else {
        this.route.queryParamMap.subscribe(qParams => {
          const codeFromQuery = qParams.get('code') || qParams.get('id');
          if (codeFromQuery) {
            this.code = codeFromQuery;
            this.verifyCode(this.code);
          } else {
            this.isLoading = false;
            this.errorType = 'invalid';
            this.errorTitle = 'شناسه کارت مشخص نشده است';
            this.error = 'کد یا شناسه کارتی جهت استعلام در آدرس مشخص نشده است.';
            this.cdr.markForCheck();
          }
        });
      }
    });
  }

  updateTimestamp() {
    const now = new Date();
    const dateStr = new Intl.DateTimeFormat('fa-IR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(now);
    this.verificationTimestamp = dateStr;
  }

  verifyCode(codeStr: string) {
    this.isLoading = true;
    this.error = null;
    this.updateTimestamp();

    const cleanCode = (codeStr || '').trim();
    const url = `${environment.apiUrl}/auth/users/verify_card/?code=${encodeURIComponent(cleanCode)}`;

    this.http.get<VerifiedPersonnel>(url, {
      context: new HttpContext().set(SKIP_GLOBAL_ERROR_TOAST, true)
    }).subscribe({
      next: (res) => {
        this.personnel = res;
        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.isLoading = false;
        this.personnel = null;
        if (err.status === 404) {
          this.errorType = 'invalid';
          this.errorTitle = 'کارت شناسایی نامعتبر است';
          this.error = 'کارت شناسایی با این کد یا مشخصات در سامانه یافت نشد یا باطل شده است.';
        } else if (err.status === 429) {
          this.errorType = 'rate_limit';
          this.errorTitle = 'محدودیت تعداد استعلام';
          this.error = 'تعداد استعلام‌های شما بیش از حد مجاز است. لطفاً چند دقیقه دیگر دوباره امتحان کنید.';
        } else {
          this.errorType = 'network';
          this.errorTitle = 'عدم برقراری ارتباط با سرور';
          this.error = 'خطا در برقراری ارتباط با سرور مرکزی. امکان استعلام و تایید اصالت کارت در این لحظه وجود ندارد.';
        }
        this.cdr.markForCheck();
      }
    });
  }

  getAvatarInitial(name?: string): string {
    if (name && name.length > 0) return name[0];
    return 'پ';
  }

  getAvatarUrl(avatar: string | null | undefined): string | null {
    if (!avatar) return null;
    const mediaIdx = avatar.indexOf('/media/');
    if (mediaIdx !== -1) {
      return resolveServerUrl(avatar.substring(mediaIdx));
    }
    return resolveServerUrl(avatar);
  }
}
