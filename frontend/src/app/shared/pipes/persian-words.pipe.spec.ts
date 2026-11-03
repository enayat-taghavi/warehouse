import { describe, it, expect } from 'vitest';
import { PersianWordsPipe } from './persian-words.pipe';

describe('PersianWordsPipe Spec', () => {
  const pipe = new PersianWordsPipe();

  it('transforms numbers to persian words without unit', () => {
    expect(pipe.transform(1250000)).toBe('یک میلیون و دویست و پنجاه هزار');
  });

  it('transforms with rial unit', () => {
    expect(pipe.transform(10000000, 'rial')).toBe('ده میلیون ریال');
  });

  it('transforms with rial and toman equivalent', () => {
    expect(pipe.transform(12500000, 'rial', true)).toBe(
      'دوازده میلیون و پانصد هزار ریال (معادل یک میلیون و دویست و پنجاه هزار تومان)'
    );
  });

  it('transforms with toman unit', () => {
    expect(pipe.transform(1500000, 'toman')).toBe('یک میلیون و پانصد هزار تومان');
  });

  it('handles empty and null values gracefully', () => {
    expect(pipe.transform(null)).toBe('');
    expect(pipe.transform(undefined)).toBe('');
    expect(pipe.transform('')).toBe('');
  });
});
