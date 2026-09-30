import {
  Component,
  Input,
  Output,
  EventEmitter,
  ElementRef,
  ViewChild,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { SvgIconDirective } from '../../icons/svg-icon.directive';

/**
 * آپلود فایل با Drag & Drop و Progress Bar
 *
 * استفاده:
 *   <app-file-upload
 *     accept=".xlsx,.xls,.csv"
 *     label="فایل اکسل پایه انبار"
 *     (fileSelected)="onFile($event)"
 *   />
 */
@Component({
  selector: 'app-file-upload',
  standalone: true,
  imports: [CommonModule, SvgIconDirective],
  template: `
    <div
      #dropZone
      class="drag-zone border-2 border-dashed rounded-2xl p-6 text-center transition-all cursor-pointer"
      [ngClass]="isDragging ? 'border-indigo-400 bg-indigo-50/50' : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100/50'"
      (click)="fileInput.click()"
      (dragover)="onDragOver($event)"
      (dragleave)="onDragLeave($event)"
      (drop)="onDrop($event)"
    >
      @if (!selectedFile) {
        <!-- Empty State -->
        <div class="text-slate-400">
          <svg class="mx-auto mb-3" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" appIcon="upload-cloud"></svg>
          <p class="text-xs font-bold text-slate-600 mb-1">{{ label }}</p>
          <p class="text-[10px] text-slate-400">
            فایل را اینجا بکشید یا <span class="text-indigo-500 font-bold">کلیک</span> کنید
          </p>
          @if (accept) {
            <p class="text-[10px] text-slate-400 mt-1">فرمت مجاز: {{ accept }}</p>
          }
          @if (maxSizeMB) {
            <p class="text-[10px] text-slate-400">حداکثر حجم: {{ maxSizeMB }} مگابایت</p>
          }
        </div>
      } @else {
        <!-- File Selected -->
        <div class="flex items-center gap-3 justify-center">
          <div class="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" appIcon="file"></svg>
          </div>
          <div class="text-right min-w-0">
            <p class="text-xs font-bold text-slate-700 truncate">{{ selectedFile.name }}</p>
            <p class="text-[10px] text-slate-400">{{ formatSize(selectedFile.size) }}</p>
          </div>
          <button
            (click)="removeFile($event)"
            class="p-1.5 rounded-lg hover:bg-rose-100 text-slate-400 hover:text-rose-500 transition-colors shrink-0"
            title="حذف فایل"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" appIcon="x"></svg>
          </button>
        </div>
      }

      <input
        #fileInput
        type="file"
        [accept]="accept"
        (change)="onFileChange($event)"
        class="hidden"
      />
    </div>

    @if (errorMessage) {
      <p class="mt-2 text-[10px] text-rose-500 font-bold">{{ errorMessage }}</p>
    }
  `,
})
export class FileUploadComponent {
  @Input() accept = '';
  @Input() label = 'فایل خود را انتخاب کنید';
  @Input() maxSizeMB = 10;
  @Output() fileSelected = new EventEmitter<File>();
  @Output() fileRemoved = new EventEmitter<void>();

  @ViewChild('fileInput') fileInputRef!: ElementRef<HTMLInputElement>;

  isDragging = false;
  @Input() selectedFile: File | null = null;
  errorMessage = '';

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = false;

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.processFile(files[0]);
    }
  }

  onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.processFile(input.files[0]);
    }
  }

  removeFile(event: Event): void {
    event.stopPropagation();
    this.selectedFile = null;
    this.errorMessage = '';
    if (this.fileInputRef) {
      this.fileInputRef.nativeElement.value = '';
    }
    this.fileRemoved.emit();
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  }

  private processFile(file: File): void {
    this.errorMessage = '';

    // Validate size
    if (this.maxSizeMB && file.size > this.maxSizeMB * 1048576) {
      this.errorMessage = `حجم فایل (${this.formatSize(file.size)}) از حداکثر مجاز (${this.maxSizeMB} مگابایت) بیشتر است.`;
      return;
    }

    // Validate extension
    if (this.accept) {
      const allowedExts = this.accept.split(',').map((e) => e.trim().toLowerCase());
      const fileExt = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!allowedExts.includes(fileExt)) {
        this.errorMessage = `فرمت فایل مجاز نیست. فرمت‌های مجاز: ${this.accept}`;
        return;
      }
    }

    this.selectedFile = file;
    this.fileSelected.emit(file);
  }
}
