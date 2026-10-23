import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActiveCompanyService } from '../../../../../core/services/active-company.service';
import { Company } from '../../../../../core/models/company.model';
import { SvgIconDirective } from '../../../../../shared/icons/svg-icon.directive';

@Component({
  selector: 'app-company-selection-modal',
  standalone: true,
  imports: [CommonModule, SvgIconDirective],
  templateUrl: './company-selection-modal.html',
  styleUrls: ['./company-selection-modal.css']
})
export class CompanySelectionModalComponent {
  public companyService = inject(ActiveCompanyService);

  onSelect(company: Company): void {
    this.companyService.selectCompany(company);
  }

  onClose(): void {
    this.companyService.closeSwitchModal();
  }
}
