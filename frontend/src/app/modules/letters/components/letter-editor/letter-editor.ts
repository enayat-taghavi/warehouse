import { Directive, ElementRef, OnChanges, computed, inject, input, model, output, signal, Component } from '@angular/core';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { SvgIconDirective } from '../../../../shared/icons/svg-icon.directive';
import {
  LETTER_MAX_BLOCKS, LETTER_MAX_CHARS, LetterAlign, LetterBlock, LetterListBlock, LetterParagraphBlock, LetterTableBlock,
  countBlockChars, runsText,
} from '../../letters.models';

/** متن ساده را جای انتخاب فعلی می‌گذارد (بی HTML). */
export function insertPlainText(el: HTMLElement, text: string): void {
  const sel = typeof window !== 'undefined' ? window.getSelection() : null;
  const node = document.createTextNode(text);
  if (sel && sel.rangeCount && el.contains(sel.anchorNode)) {
    const range = sel.getRangeAt(0);
    range.deleteContents();
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  } else {
    el.appendChild(node);
  }
}

/**
 * یک ناحیهٔ contenteditable فقط-متن: چسباندن و رها کردن فقط `text/plain` را می‌پذیرد (ن۱۴)،
 * و متن را فقط وقتی از بیرون عوض شده باشد دوباره می‌نویسد (مکان‌نما نمی‌پرد).
 */
@Directive({
  selector: '[letterEditable]',
  standalone: true,
  host: {
    '[attr.contenteditable]': 'editableDisabled() ? "false" : "plaintext-only"',
    '[attr.aria-disabled]': 'editableDisabled() || null',
    '(paste)': 'onPaste($event)',
    '(drop)': 'onDrop($event)',
    '(input)': 'emit()',
    '(keydown.enter)': 'onEnter($event)',
  },
})
export class LetterEditableDirective implements OnChanges {
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly letterEditable = input<string>('');
  readonly editableDisabled = input(false);
  /** Enter به‌جای شکستن خط، بند تازه بسازد (بند فهرست) */
  readonly enterCreates = input(false);
  readonly textChange = output<string>();
  readonly enterPressed = output<void>();

  ngOnChanges(): void {
    const text = this.letterEditable() ?? '';
    if (this.el.nativeElement.textContent !== text) this.el.nativeElement.textContent = text;
  }

  onPaste(ev: ClipboardEvent): void {
    ev.preventDefault();
    if (this.editableDisabled()) return;
    const text = (ev.clipboardData?.getData('text/plain') ?? '').replace(/\r\n?/g, '\n');
    insertPlainText(this.el.nativeElement, text);
    this.emit();
  }

  onDrop(ev: DragEvent): void {
    ev.preventDefault();
    if (this.editableDisabled()) return;
    const text = (ev.dataTransfer?.getData('text/plain') ?? '').replace(/\r\n?/g, '\n');
    if (text) {
      insertPlainText(this.el.nativeElement, text);
      this.emit();
    }
  }

  onEnter(ev: Event): void {
    ev.preventDefault();
    if (this.editableDisabled()) return;
    if (this.enterCreates() && !(ev as KeyboardEvent).shiftKey) {
      this.enterPressed.emit();
      return;
    }
    insertPlainText(this.el.nativeElement, '\n');
    this.emit();
  }

  emit(): void {
    this.textChange.emit(this.el.nativeElement.textContent ?? '');
  }
}

const ALIGN_LABELS: Record<LetterAlign, string> = { right: 'راست', center: 'وسط', justify: 'دوطرفه' };

/** ویرایشگر بلوکی نامه (ن۱۴): پاراگراف با تراز و پررنگ، فهرست شماره‌دار/نقطه‌ای و جدول ساده. */
@Component({
  selector: 'app-letter-editor',
  standalone: true,
  imports: [SvgIconDirective, LetterEditableDirective],
  templateUrl: './letter-editor.html',
})
export class LetterEditorComponent {
  readonly blocks = model<LetterBlock[]>([]);
  readonly disabled = input(false);
  readonly invalid = input<string | null>(null);

  readonly alignLabels = ALIGN_LABELS;
  readonly aligns: LetterAlign[] = ['right', 'center', 'justify'];
  readonly maxBlocks = LETTER_MAX_BLOCKS;
  readonly maxChars = LETTER_MAX_CHARS;
  readonly chars = computed(() => countBlockChars(this.blocks()));
  readonly full = computed(() => this.blocks().length >= LETTER_MAX_BLOCKS);
  readonly runsText = runsText;
  readonly moveNote = signal('');

  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** پیش از پاک کردن چیزی که متن دارد می‌پرسد؛ خالی را بی‌پرسش پاک می‌کند */
  private async okToDelete(hasText: boolean, title: string, message: string): Promise<boolean> {
    if (!hasText) return true;
    const result = await this.confirmDialog.open({ title, message, type: 'danger', confirmText: 'حذف', cancelText: 'انصراف' });
    return result === true;
  }

  /** همیشه نسخهٔ فعلی بلوک (نه نسخهٔ گرفته‌شده در قالب) تا دو تغییر پشت‌سرهم همدیگر را پاک نکنند */
  private cur<T extends LetterBlock>(i: number, b: T): T {
    const now = this.blocks()[i];
    return now && now.type === b.type ? (now as T) : b;
  }

  private replace(i: number, block: LetterBlock): void {
    this.blocks.update(list => list.map((b, j) => (j === i ? block : b)));
  }

  add(type: LetterBlock['type']): void {
    if (this.full() || this.disabled()) return;
    const block: LetterBlock = type === 'paragraph' ? { type, align: 'right', runs: [{ text: '' }] }
      : type === 'list' ? { type, style: 'bullet', items: [[{ text: '' }]] }
        : { type, header: true, rows: [['', ''], ['', '']] };
    this.blocks.update(list => [...list, block]);
  }

  async remove(i: number): Promise<void> {
    const b = this.blocks()[i];
    if (!b) return;
    if (!await this.okToDelete(countBlockChars([b]) > 0, 'حذف بلوک', 'این بلوک متن دارد. حذف شود؟')) return;
    this.blocks.update(list => list.filter((_, j) => j !== i));
  }

  move(i: number, delta: number): void {
    const j = i + delta;
    if (j < 0 || j >= this.blocks().length) return;
    this.blocks.update(list => {
      const copy = [...list];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
    this.moveNote.set(`بلوک ${this.faNumber(i + 1)} به جای ${this.faNumber(j + 1)} رفت`);
    // فوکوس روی دکمهٔ همان جهتِ بلوکِ جابه‌جاشده می‌ماند
    setTimeout(() => {
      const root = this.host.nativeElement;
      const same = root.querySelector<HTMLButtonElement>(`#move-${delta < 0 ? 'up' : 'down'}-${j}`);
      const other = root.querySelector<HTMLButtonElement>(`#move-${delta < 0 ? 'down' : 'up'}-${j}`);
      (same && !same.disabled ? same : other)?.focus();
    });
  }

  // ─── پاراگراف ───
  setParagraphText(i: number, b: LetterParagraphBlock, text: string): void {
    b = this.cur(i, b);
    const bold = !!b.runs[0]?.bold;
    this.replace(i, { ...b, runs: [bold ? { text, bold: true } : { text }] });
  }
  setAlign(i: number, b: LetterParagraphBlock, align: string): void {
    b = this.cur(i, b);
    this.replace(i, { ...b, align: (this.aligns as string[]).includes(align) ? align as LetterAlign : 'right' });
  }
  toggleBold(i: number, b: LetterParagraphBlock): void {
    b = this.cur(i, b);
    const text = runsText(b.runs);
    const bold = !this.isBold(b);
    this.replace(i, { ...b, runs: [bold ? { text, bold: true } : { text }] });
  }
  isBold(b: LetterParagraphBlock): boolean {
    return b.runs.length > 0 && b.runs.every(r => r.bold);
  }

  // ─── فهرست ───
  setListStyle(i: number, b: LetterListBlock, style: string): void {
    b = this.cur(i, b);
    this.replace(i, { ...b, style: style === 'ordered' ? 'ordered' : 'bullet' });
  }
  setItem(i: number, b: LetterListBlock, k: number, text: string): void {
    b = this.cur(i, b);
    this.replace(i, { ...b, items: b.items.map((it, j) => (j === k ? [{ text }] : it)) });
  }
  addItem(i: number, b: LetterListBlock, after: number): void {
    b = this.cur(i, b);
    const items = [...b.items];
    items.splice(after + 1, 0, [{ text: '' }]);
    this.replace(i, { ...b, items });
  }
  async removeItem(i: number, b: LetterListBlock, k: number): Promise<void> {
    b = this.cur(i, b);
    if (b.items.length <= 1) return;
    if (!await this.okToDelete(runsText(b.items[k] ?? []).length > 0, 'حذف بند', 'این بند متن دارد. حذف شود؟')) return;
    b = this.cur(i, b);
    this.replace(i, { ...b, items: b.items.filter((_, j) => j !== k) });
  }

  // ─── جدول ───
  setCell(i: number, b: LetterTableBlock, r: number, c: number, text: string): void {
    b = this.cur(i, b);
    this.replace(i, { ...b, rows: b.rows.map((row, j) => (j === r ? row.map((cell, k) => (k === c ? text : cell)) : row)) });
  }
  addRow(i: number, b: LetterTableBlock): void {
    b = this.cur(i, b);
    if (b.rows.length >= 100) return;
    const cols = b.rows[0]?.length || 1;
    this.replace(i, { ...b, rows: [...b.rows, Array(cols).fill('')] });
  }
  addCol(i: number, b: LetterTableBlock): void {
    b = this.cur(i, b);
    if ((b.rows[0]?.length || 0) >= 12) return;
    this.replace(i, { ...b, rows: b.rows.map(row => [...row, '']) });
  }
  async removeRow(i: number, b: LetterTableBlock): Promise<void> {
    b = this.cur(i, b);
    if (b.rows.length <= 1) return;
    const last = b.rows[b.rows.length - 1];
    if (!await this.okToDelete(last.some(c => c.trim()), 'حذف ردیف', 'ردیف آخر متن دارد. حذف شود؟')) return;
    b = this.cur(i, b);
    if (b.rows.length <= 1) return;
    this.replace(i, { ...b, rows: b.rows.slice(0, -1) });
  }
  async removeCol(i: number, b: LetterTableBlock): Promise<void> {
    b = this.cur(i, b);
    if ((b.rows[0]?.length || 0) <= 1) return;
    if (!await this.okToDelete(b.rows.some(r => (r[r.length - 1] ?? '').trim()), 'حذف ستون', 'ستون آخر متن دارد. حذف شود؟')) return;
    b = this.cur(i, b);
    if ((b.rows[0]?.length || 0) <= 1) return;
    this.replace(i, { ...b, rows: b.rows.map(row => row.slice(0, -1)) });
  }
  toggleHeader(i: number, b: LetterTableBlock): void {
    b = this.cur(i, b);
    this.replace(i, { ...b, header: !b.header });
  }

  asParagraph(b: LetterBlock): LetterParagraphBlock { return b as LetterParagraphBlock; }
  asList(b: LetterBlock): LetterListBlock { return b as LetterListBlock; }
  asTable(b: LetterBlock): LetterTableBlock { return b as LetterTableBlock; }
  faNumber(n: number): string { return new Intl.NumberFormat('fa-IR').format(n); }
}
