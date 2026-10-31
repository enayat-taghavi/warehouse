import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CounterpartyKind } from '../../../../models/personnel.model';
import { SvgIconDirective } from '../../../../../../shared/icons/svg-icon.directive';
import { CounterpartyFormState } from './counterparty-form.state';

export interface CounterpartyTypeOption {
  key: 'driver' | 'repair_shop' | 'fuel_station' | 'contractor' | 'other';
  label: string;
  badgeClass: string;
  bgClass: string;
  icon: string;
}

// تعاریف ۵ گانه انواع طرف‌حساب
export const COUNTERPARTY_TYPE_OPTIONS: CounterpartyTypeOption[] = [
  { key: 'driver', label: 'راننده / مالک خودرو', badgeClass: 'bg-blue-100 text-blue-800 border-blue-200', bgClass: 'bg-blue-50', icon: '🚚' },
  { key: 'repair_shop', label: 'تعمیرگاه و قطعات', badgeClass: 'bg-amber-100 text-amber-800 border-amber-200', bgClass: 'bg-amber-50', icon: '🔧' },
  { key: 'fuel_station', label: 'جایگاه سوخت', badgeClass: 'bg-rose-100 text-rose-800 border-rose-200', bgClass: 'bg-rose-50', icon: '⛽' },
  { key: 'contractor', label: 'پیمانکار خدماتی', badgeClass: 'bg-purple-100 text-purple-800 border-purple-200', bgClass: 'bg-purple-50', icon: '🏗️' },
  { key: 'other', label: 'سایر اشخاص حقیقی/حقوقی', badgeClass: 'bg-slate-100 text-slate-800 border-slate-200', bgClass: 'bg-slate-50', icon: '🏢' },
];

/**
 * فیلدهای مشترک فرم طرف‌حساب (هویت + حساب بانکی با اعتبارسنجی شبا).
 * میزبان `display: contents` است تا فیلدها در گرید والد بنشینند.
 */
@Component({
  selector: 'app-counterparty-form-fields',
  standalone: true,
  imports: [CommonModule, FormsModule, SvgIconDirective],
  templateUrl: './counterparty-form-fields.component.html',
  host: { class: 'contents' }
})
export class CounterpartyFormFieldsComponent {
  @Input({ required: true }) form!: CounterpartyFormState;
  /** page: گرید ۴ستونه (md)؛ modal: گرید ۲ستونه (sm) */
  @Input() layout: 'page' | 'modal' = 'page';
  /** در ویرایش حسابدار، فیلدهای بانکی «حساب تازه» هستند */
  @Input() bankTitle = 'حساب بانکی (اصلی)';
  @Input() showAccountCode = true;

  readonly typeOptions = COUNTERPARTY_TYPE_OPTIONS;
  readonly kindOptions: { key: CounterpartyKind; label: string }[] = [
    { key: 'person', label: 'حقیقی' },
    { key: 'legal', label: 'حقوقی' },
  ];

  get halfRow(): string {
    return this.layout === 'modal' ? 'sm:col-span-2' : 'md:col-span-2';
  }

  get fullRow(): string {
    return this.layout === 'modal' ? 'col-span-1 sm:col-span-2' : 'col-span-1 md:col-span-4';
  }
}
