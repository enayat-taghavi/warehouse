import { Component, inject, HostListener, ElementRef, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { ActiveCompanyService } from '../../../core/services/active-company.service';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/components/toast/toast.component';
import { Company } from '../../../core/models/company.model';
import { SvgIconDirective } from '../../../shared/icons/svg-icon.directive';

@Component({
  selector: 'app-company-switcher',
  standalone: true,
  imports: [CommonModule, SvgIconDirective],
  templateUrl: './company-switcher.html',
  styleUrls: ['./company-switcher.css']
})
export class CompanySwitcherComponent implements OnInit, OnDestroy {
  public companyService = inject(ActiveCompanyService);
  private auth = inject(AuthService);
  private toast = inject(ToastService);
  private elementRef = inject(ElementRef);
  private cdr = inject(ChangeDetectorRef);
  private sub?: Subscription;

  isOpen = false;

  public get isMultiCompanyUser(): boolean {
    const companies = this.companyService.availableCompanies || [];
    const isSuper = Boolean(
      this.companyService.isSuperuser ||
      this.auth.user()?.is_superuser ||
      this.auth.userPermissions().includes('admin_all') ||
      this.auth.user()?.roles?.includes('superuser') ||
      this.auth.user()?.roles?.includes('admin')
    );
    return companies.length > 1 || isSuper;
  }

  ngOnInit(): void {
    // ۱. اطمینان از لود شدن لیست شرکت‌ها در هر نقطه‌ای از برنامه که سوئیچر قرار گرفته است
    if (this.companyService.availableCompanies.length === 0) {
      this.companyService.loadAvailableCompanies().subscribe(() => {
        this.cdr.markForCheck();
      });
    }

    // ۲. گوش دادن به بروزرسانی شرکت‌ها
    this.sub = this.companyService.availableCompanies$.subscribe(() => {
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  toggleDropdown(event: MouseEvent): void {
    event.stopPropagation();

    // ۱. در صورتی که لیست شرکت‌ها در حال بارگذاری اولیه است
    if (this.companyService.availableCompanies.length === 0) {
      this.companyService.loadAvailableCompanies().subscribe(() => {
        if (this.isMultiCompanyUser) {
          this.isOpen = true;
        } else {
          const comp = this.companyService.activeCompany;
          this.toast.info(comp ? `حساب شما به شرکت «${comp.name}» متصل است.` : 'شرکت مجاز تعریف نشده است.');
        }
        this.cdr.markForCheck();
      });
      return;
    }

    // ۲. اگر کاربر تک‌شرکتی است، با پیام راهنما پاسخ داده می‌شود نه بی‌تفاوتی
    if (!this.isMultiCompanyUser) {
      const comp = this.companyService.activeCompany;
      this.toast.info(comp ? `فضای کاری شما به شرکت «${comp.name}» اختصاص دارد.` : 'حساب شما دسترسی تک‌شرکتی دارد.');
      return;
    }

    // ۳. باز / بسته کردن منو برای کاربران چندشرکتی یا مدیران سیستم
    this.isOpen = !this.isOpen;
    this.cdr.markForCheck();
  }

  selectCompany(company: Company | null): void {
    this.companyService.selectCompany(company);
    this.isOpen = false;
  }

  openModal(): void {
    this.isOpen = false;
    this.companyService.openSwitchModal();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.isOpen = false;
    }
  }
}
