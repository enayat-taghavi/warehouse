import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth/auth.service';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { ToastService } from '../../shared/components/toast/toast.component';
import { SvgIconDirective } from '../../shared/icons/svg-icon.directive';

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
        this.isSubmitting = false;
        this.cdr.detectChanges();
        this.toast.success('رمز عبور با موفقیت تغییر پیدا کرد.');
        
        setTimeout(() => {
          const user = this.auth.user();
          if (user) {
            this.auth.updateUser({ requires_password_change: false });

            const perms = this.auth.userPermissions() || [];
            const isSuper = perms.includes('admin_all') || user.is_superuser;
            let targetRoute = '/app/launcher';

            const hasWarehouse = isSuper || [
              'view_sys_dashboard', 'view_wh_dashboard', 'view_sys_counter',
              'view_sys_supervisor', 'view_sys_manager_review', 'view_wh_docs',
              'view_wh_dispatch'
            ].some(p => perms.includes(p));

            const hasFinance = isSuper || [
              'view_sys_personnel', 'view_sys_personnel_attendance', 'view_sys_fleet_attendance',
              'view_sys_payroll', 'view_sys_fleet_settlement', 'view_sys_treasury',
              'perm_approve_personnel_finance', 'perm_treasury_disburse_action',
              'perm_approve_personnel_manager', 'perm_manage_projects_sections'
            ].some(p => perms.includes(p));

            if (hasWarehouse && hasFinance) {
              targetRoute = '/app/launcher';
            } else if (hasFinance && !hasWarehouse) {
              localStorage.setItem('active_app_module', 'personnel');
              // صفحهٔ آغاز را ریشهٔ سامانه مالی بر اساس پرسونای نقش تعیین می‌کند (accounting.routes)
              targetRoute = '/app/finance';
            } else if (hasWarehouse && !hasFinance) {
              localStorage.setItem('active_app_module', 'warehouse');
              if (perms.includes('view_sys_dashboard') || perms.includes('view_wh_dashboard')) {
                targetRoute = '/app/warehouse/dashboard';
              } else if (perms.includes('view_sys_counter')) {
                targetRoute = '/app/warehouse/counter';
              } else if (perms.includes('view_sys_supervisor')) {
                targetRoute = '/app/warehouse/supervisor';
              } else if (perms.includes('view_sys_manager_review')) {
                targetRoute = '/app/warehouse/manager-review';
              } else if (perms.includes('view_wh_docs')) {
                targetRoute = '/app/warehouse/docs';
              } else if (perms.includes('view_wh_dispatch')) {
                targetRoute = '/app/warehouse/dispatch';
              } else {
                targetRoute = '/app/warehouse/dashboard';
              }
            }

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
    const hasWarehouse = perms.includes('admin_all') || ['view_sys_dashboard', 'view_wh_dashboard'].some(p => perms.includes(p));
    if (hasWarehouse) {
      this.router.navigate(['/app/warehouse/dashboard']);
    } else {
      this.router.navigate(['/app/finance']);
    }
  }
}
