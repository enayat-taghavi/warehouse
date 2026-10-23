import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ActiveCompanyService } from '../../../../../core/services/active-company.service';
import { ModuleRegistryService } from '../../../../../core/modules/module-registry.service';
import { CompanyApiService } from '../../../../../core/api/company-api.service';
import { ToastService } from '../../../../../shared/components/toast/toast.component';
import { Company } from '../../../../../core/models/company.model';
import { BRANDING } from '../../../../../core/branding';
import { SvgIconDirective } from '../../../../../shared/icons/svg-icon.directive';

@Component({
  selector: 'app-first-boot-wizard',
  standalone: true,
  imports: [CommonModule, FormsModule, SvgIconDirective],
  templateUrl: './first-boot-wizard.html',
  styleUrls: ['./first-boot-wizard.css']
})
export class FirstBootWizardComponent {
  public companyService = inject(ActiveCompanyService);
  private moduleRegistry = inject(ModuleRegistryService);
  private companyApi = inject(CompanyApiService);
  private toast = inject(ToastService);
  private router = inject(Router);

  readonly branding = BRANDING;

  /** ماژول‌های نصب‌شده که برای شرکت تازه روشن یا خاموش می‌شوند (از رجیستری؛ پوسته نام ماژولی را نمی‌داند) */
  get switchableModules(): { code: string; titleFa: string; descriptionFa: string; icon: string }[] {
    return this.moduleRegistry.getInstalledModules()
      .filter(m => !m.isSuperuserOnly)
      .map(m => ({ code: m.code, titleFa: m.titleFa, descriptionFa: m.descriptionFa, icon: m.icon }));
  }

  public formData = {
    name: '',
    code: '',
    national_id: '',
    economic_code: '',
    address: '',
    /** کد ماژول‌هایی که برای این شرکت خاموش‌اند (پیش‌فرض: همه روشن) */
    disabled_modules: [] as string[],
    is_active: true
  };

  public isSubmitting = false;
  public errorMessage: string | null = null;

  isModuleOn(code: string): boolean {
    return !this.formData.disabled_modules.includes(code);
  }

  toggleModule(code: string): void {
    this.formData.disabled_modules = this.isModuleOn(code)
      ? [...this.formData.disabled_modules, code]
      : this.formData.disabled_modules.filter(c => c !== code);
  }

  onSubmit(): void {
    this.errorMessage = null;

    const trimmedName = (this.formData.name || '').trim();
    const trimmedCode = (this.formData.code || '').trim().toUpperCase();

    if (!trimmedName) {
      this.errorMessage = 'لطفاً نام رسمی شرکت را وارد فرمایید.';
      return;
    }

    if (!trimmedCode) {
      this.errorMessage = 'لطفاً کد اختصاری شرکت (لاتین ۲ تا ۶ حرف) را مشخص فرمایید.';
      return;
    }

    if (this.formData.national_id && this.formData.national_id.trim().length !== 11) {
      this.errorMessage = 'شناسه ملی شرکت باید دقیقاً ۱۱ رقم باشد.';
      return;
    }

    this.isSubmitting = true;

    const payload: Partial<Company> = {
      name: trimmedName,
      code: trimmedCode,
      national_id: this.formData.national_id ? this.formData.national_id.trim() : null,
      economic_code: this.formData.economic_code ? this.formData.economic_code.trim() : null,
      address: this.formData.address ? this.formData.address.trim() : null,
      disabled_modules: [...this.formData.disabled_modules],
      is_active: true
    };

    this.companyApi.create(payload).subscribe({
      next: (createdCompany) => {
        this.isSubmitting = false;
        this.toast.success(`شرکت «${createdCompany.name}» با موفقیت تعریف و راه‌اندازی شد.`);
        
        // انتصاب آنی شرکت ثبت‌شده به عنوان فضای کاری فعال
        this.companyService.selectCompany(createdCompany);
        this.companyService.closeFirstBootWizard();
        this.companyService.loadAvailableCompanies().subscribe();

        // هدایت به مرکز عملیات
        this.router.navigate(['/app/operations/companies']);
      },
      error: (err) => {
        this.isSubmitting = false;
        const errDetail = err?.error?.detail || err?.error?.name?.[0] || err?.error?.code?.[0] || 'خطایی در ثبت اطلاعات شرکت رخ داد. لطفاً مجدداً تلاش فرمایید.';
        this.errorMessage = typeof errDetail === 'string' ? errDetail : JSON.stringify(errDetail);
      }
    });
  }
}
