import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { StateService } from '../../../../core/services/state.service';
import { SvgIconDirective } from '../../../../shared/icons/svg-icon.directive';

/**
 * کامپوننت مدیریت و تغذیه اطلاعات (MT26 / MT49)
 * در فاز جاری به عنوان صفحه پیش‌نمایش معماری و نقشه راه توسعه نسخه‌های آینده (Roadmap) نمایش داده می‌شود.
 */
@Component({
  selector: 'app-feeding',
  standalone: true,
  imports: [CommonModule, RouterLink, SvgIconDirective],
  templateUrl: './feeding.html',
  styleUrl: './feeding.css'
})
export class Feeding implements OnInit {
  constructor(public state: StateService) {}

  ngOnInit(): void {}

  get activeWh() {
    return (
      this.state.appState.projects?.find((p: any) => p.id === this.state.appState.activeWarehouseId) ||
      this.state.appState.projects?.[0]
    );
  }
}
