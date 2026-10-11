import { Component, EventEmitter, Input, Output, OnInit, OnDestroy, ChangeDetectorRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { SvgIconDirective } from '../../icons/svg-icon.directive';
import { ActionButtonComponent } from '../action-button/action-button.component';

@Component({
  selector: 'app-smart-delete-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, SvgIconDirective, ActionButtonComponent],
  templateUrl: './smart-delete-modal.html',
  styleUrl: './smart-delete-modal.css'
})
export class SmartDeleteModalComponent implements OnInit, OnDestroy {
  @Input() title: string = 'حذف موجودیت';
  @Input() entityName: string = '';
  @Input() deleteImpactUrl: string = '';
  @Input() isSubmitting: boolean = false;
  @Input() errorMessage: string = '';

  @Output() hardDelete = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();

  isLoadingImpact = false;
  impactData: any[] = [];
  totalAffected = 0;
  
  countdown = 3;
  timerInterval: any;
  confirmationText = '';

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.startCountdown();
    if (this.deleteImpactUrl) {
      this.fetchImpact();
    }
  }

  ngOnDestroy() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
  }

  fetchImpact() {
    this.isLoadingImpact = true;
    this.http.get<any>(this.deleteImpactUrl).subscribe({
      next: (res) => {
        this.impactData = res.impact || [];
        this.totalAffected = res.total_affected || 0;
        this.isLoadingImpact = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.isLoadingImpact = false;
        this.cdr.detectChanges();
      }
    });
  }

  startCountdown() {
    this.timerInterval = setInterval(() => {
      this.countdown--;
      if (this.countdown <= 0) {
        clearInterval(this.timerInterval);
      }
      this.cdr.detectChanges();
    }, 1000);
  }

  get isHardDeleteEnabled(): boolean {
    return this.countdown <= 0 && this.confirmationText.trim() === 'حذف';
  }

  onHardDelete() {
    if (this.isHardDeleteEnabled) {
      this.hardDelete.emit();
    }
  }

  onCancel() {
    this.cancel.emit();
  }

  @HostListener('document:keydown.escape')
  handleEscape() {
    if (!this.isSubmitting) {
      this.onCancel();
    }
  }

  @HostListener('document:keydown.enter')
  handleEnter() {
    if (this.isSubmitting) return;
    if (this.isHardDeleteEnabled) {
      this.onHardDelete();
    }
  }
}
