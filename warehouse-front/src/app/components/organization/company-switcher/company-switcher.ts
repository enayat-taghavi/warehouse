import { Component, inject, HostListener, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActiveCompanyService } from '../../../core/services/active-company.service';
import { Company } from '../../../core/models/company.model';
import { SvgIconDirective } from '../../../shared/icons/svg-icon.directive';

@Component({
  selector: 'app-company-switcher',
  standalone: true,
  imports: [CommonModule, SvgIconDirective],
  templateUrl: './company-switcher.html',
  styleUrls: ['./company-switcher.css']
})
export class CompanySwitcherComponent {
  public companyService = inject(ActiveCompanyService);
  private elementRef = inject(ElementRef);

  isOpen = false;

  toggleDropdown(event: MouseEvent): void {
    event.stopPropagation();
    this.isOpen = !this.isOpen;
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
