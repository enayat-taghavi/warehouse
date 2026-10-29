import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../../core/auth/auth.service';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../../environments/environment';
import { ToastService } from '../../../../shared/components/toast/toast.component';
import { SvgIconDirective } from '../../../../shared/icons/svg-icon.directive';
import { getModuleRegistry } from '../../../../core/modules/module-registry.service';
import { resolveLoginLanding } from '../../../../core/modules/login-landing';

@Component({
  selector: 'app-change-password',
  imports: [CommonModule, FormsModule, SvgIconDirective],
  templateUrl: './change-password.html'
})
export class ChangePassword implements OnInit {
  oldPassword = '';
  newPassword = '';
  confirmPassword = '';
  oldPasswordFieldType = 'password';
  newPasswordFieldType = 'password';
  confirmPasswordFieldType = 'password';
  isSubmitting = false;
  errorMessage = '';
  isMandatory = true;

  constructor(
    private auth: AuthService,
    private router: Router,
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
    private toast: ToastService
  ) {}

  ngOnInit() {
    const user = this.auth.user();
    if (user) {
      this.isMandatory = !!user.requires_password_change;
    }
  }

  toggleOldPassword() {
    this.oldPasswordFieldType = this.oldPasswordFieldType === 'password' ? 'text' : 'password';
    this.cdr.detectChanges();
  }

  toggleNewPassword() {
    this.newPasswordFieldType = this.newPasswordFieldType === 'password' ? 'text' : 'password';
    this.cdr.detectChanges();
  }

  toggleConfirmPassword() {
    this.confirmPasswordFieldType = this.confirmPasswordFieldType === 'password' ? 'text' : 'password';
    this.cdr.detectChanges();
  }

  handleChangePassword() {
    this.errorMessage = '';

    if (!this.oldPassword || !this.newPassword || !this.confirmPassword) {
      this.errorMessage = 'لطفا تمام فیلدها را پر کنید.';
      this.cdr.detectChanges();
      return;
    }

    if (this.newPassword !== this.confirmPassword) {
      this.errorMessage = 'رمز عبور جدید و تکرار آن مطابقت ندارند.';
      this.cdr.detectChanges();
      return;
    }
    
    if (this.newPassword.length < 6) {
      this.errorMessage = 'رمز عبور جدید باید حداقل 6 کاراکتر باشد.';
      this.cdr.detectChanges();
      return;
    }

    if (this.newPassword === '123456') {
      this.errorMessage = 'استفاده از رمز عبور پیش‌فرض (123456) مجاز نیست.';
      this.cdr.detectChanges();
      return;
    }

    this.isSubmitting = true;
    this.cdr.detectChanges();

    this.http.post(`${environment.apiUrl}/auth/users/change_password/`, {
      old_password: this.oldPassword,
      new_password: this.newPassword
    }).subscribe({
      next: (res: any) => {
        // توکن‌های پیش از تغییر رمز باطل شده‌اند؛ بی این جایگزینی درخواست‌های بعدی ۴۰۱ می‌گیرند
        this.auth.applyReissuedTokens(res?.tokens);
        this.isSubmitting = false;
        this.cdr.detectChanges();
        this.toast.success('رمز عبور با موفقیت تغییر پیدا کرد.');
        
        setTimeout(() => {
          const user = this.auth.user();
          if (user) {
            this.auth.updateUser({ requires_password_change: false });

            const perms = this.auth.userPermissions() || [];
            const isSuper = perms.includes('admin_all') || user.is_superuser;
            // همان مقصد صفحهٔ ورود: یک ماژول در دسترس → صفحهٔ آن ماژول، وگرنه لانچر
            const landing = resolveLoginLanding(getModuleRegistry(), perms, !!isSuper);
            if (landing.activeAppModule) {
              localStorage.setItem('active_app_module', landing.activeAppModule);
            }
            const targetRoute = landing.route;

            this.router.navigate([targetRoute]);
          } else {
            this.auth.logout();
          }
        }, 1200);
      },
      error: (err) => {
        this.isSubmitting = false;
        this.errorMessage = err.error?.error || 'خطایی رخ داد. لطفا دوباره تلاش کنید.';
        this.cdr.detectChanges();
      }
    });
  }

  logout() {
    this.auth.logout();
  }

  goBack() {
    const perms = this.auth.userPermissions() || [];
    const isSuper = perms.includes('admin_all') || !!this.auth.user()?.is_superuser;
    this.router.navigate([resolveLoginLanding(getModuleRegistry(), perms, isSuper).route]);
  }
}
