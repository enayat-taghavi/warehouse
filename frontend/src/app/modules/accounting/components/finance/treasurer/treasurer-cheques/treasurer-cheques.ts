import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SvgIconDirective } from '../../../../../../shared/icons/svg-icon.directive';

@Component({
  selector: 'app-treasurer-cheques-hub',
  standalone: true,
  imports: [CommonModule, SvgIconDirective],
  templateUrl: './treasurer-cheques.html',
  styleUrl: './treasurer-cheques.css'
})
export class TreasurerChequesComponent {}
