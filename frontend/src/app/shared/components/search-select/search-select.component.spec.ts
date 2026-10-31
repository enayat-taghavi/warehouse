import { TestBed } from '@angular/core/testing';
import { SearchSelectComponent } from './search-select.component';

describe('SearchSelectComponent', () => {
  function setup() {
    const fixture = TestBed.createComponent(SearchSelectComponent);
    const c = fixture.componentInstance;
    c.options = [
      { value: 'بانک ملت', label: 'بانک ملت', hint: '012', keywords: '012' },
      { value: 'بانک ملی ایران', label: 'بانک ملی ایران', hint: '017', keywords: '017' },
      { value: 'بانک سپه', label: 'بانک سپه', hint: '015', keywords: '015' }
    ];
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    const type = (text: string) => {
      input.dispatchEvent(new Event('focus'));
      input.value = text;
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    };
    const options = () => fixture.nativeElement.querySelectorAll('[role="option"]') as NodeListOf<HTMLElement>;
    return { fixture, c, input, type, options };
  }

  it('filters in the main box itself (no separate search box) and by code', () => {
    const { fixture, type, options } = setup();
    expect(fixture.nativeElement.querySelectorAll('input').length).toBe(1);
    type('مل');
    expect(options().length).toBe(2);
    type('۰۱۵');
    expect(options().length).toBe(1);
    expect(options()[0].textContent).toContain('بانک سپه');
  });

  it('Enter selects the active match, emits it and closes the list', () => {
    const { fixture, c, input, type } = setup();
    const changed: any[] = [];
    c.registerOnChange(v => changed.push(v));
    c.selected.subscribe(v => changed.push('emit:' + v));
    type('سپه');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    fixture.detectChanges();
    expect(changed).toEqual(['بانک سپه', 'emit:بانک سپه']);
    expect(fixture.nativeElement.querySelector('[role="listbox"]')).toBeNull();
    expect(input.value).toBe('بانک سپه');
  });

  it('Escape closes without changing the value; empty result shows the empty text', () => {
    const { fixture, c, input, type } = setup();
    c.writeValue('بانک ملت');
    type('zzz');
    expect(fixture.nativeElement.textContent).toContain(c.emptyText);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(c.value).toBe('بانک ملت');
    expect(input.value).toBe('بانک ملت');
  });
});
