import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SvgIconDirective } from '../../../../../../shared/icons/svg-icon.directive';

@Component({
  selector: 'app-manager-contracts-hub',
  standalone: true,
  imports: [CommonModule, SvgIconDirective],
  templateUrl: './manager-contracts.html',
  styleUrl: './manager-contracts.css'
})
export class ManagerContractsComponent {}
