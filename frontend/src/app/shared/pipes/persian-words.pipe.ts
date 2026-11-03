import { Pipe, PipeTransform } from '@angular/core';
import { numberToPersianWords, NumberToWordsOptions } from '../../core/utils/number-to-words';

/**
 * پایپ تبدیل عدد/مبلغ به حروف فارسی
 *
 * استفاده در قالب‌ها:
 *   {{ amount | persianWords }}
 *     => "یک میلیون و دویست و پنجاه هزار"
 *
 *   {{ amount | persianWords:'rial' }}
 *     => "یک میلیون و دویست و پنجاه هزار ریال"
 *
 *   {{ amount | persianWords:'rial':true }}
 *     => "دوازده میلیون و پانصد هزار ریال (معادل یک میلیون و دویست و پنجاه هزار تومان)"
 *
 *   {{ amount | persianWords:'toman' }}
 *     => "یک میلیون و دویست و پنجاه هزار تومان"
 */
@Pipe({
  name: 'persianWords',
  standalone: true,
  pure: true,
})
export class PersianWordsPipe implements PipeTransform {
  transform(
    value: number | string | bigint | null | undefined,
    unit?: 'rial' | 'toman' | 'ریال' | 'تومان' | string,
    showTomanEquiv = false
  ): string {
    if (value === null || value === undefined || value === '') return '';

    const opts: NumberToWordsOptions = {};
    if (unit) {
      opts.unit = unit;
    }
    if (showTomanEquiv) {
      opts.showTomanEquivalent = true;
    }

    return numberToPersianWords(value, opts);
  }
}
