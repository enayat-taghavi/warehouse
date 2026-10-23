// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';
import { ExcelImportModal } from './excel-import-modal';
import { ImportResult } from '../../../core/http/accounts-http.service';

describe('ExcelImportModal Component & DOM Normalization Tests', () => {
  let component: ExcelImportModal;
  let mockCdr: any;

  beforeEach(() => {
    mockCdr = {
      detectChanges: vi.fn(),
      markForCheck: vi.fn()
    };
    component = new ExcelImportModal(mockCdr);
  });

  it('should initialize in select step with initial zeroed stats', () => {
    expect(component.step).toBe('select');
    expect(component.selectedFile).toBeNull();
    expect(component.previewResult).toBeNull();
  });

  it('should correctly normalize summary when backend returns legacy created/updated format', () => {
    // نمونه حالتی که سرور تنها created و updated و skipped ارسال کرده است
    const legacyResponse: ImportResult = {
      success: true,
      dry_run: true,
      errors: [],
      summary: {
        total_rows: 2,
        created: 2,
        updated: 0,
        skipped: 0
      } as any
    };

    const normalized = component.normalizeSummary(legacyResponse);

    expect(normalized.summary.total_rows).toBe(2);
    expect(normalized.summary.valid_count).toBe(2);
    expect(normalized.summary.error_count).toBe(0);
    // شرط کلیدی: جمع رکوردهای سالم و خطا دقیقاً با کل سطرها برابر باشد
    expect(normalized.summary.valid_count! + normalized.summary.error_count!).toBe(normalized.summary.total_rows);
  });

  it('should preserve and validate summary when backend sends explicit valid_count and error_count', () => {
    const modernResponse: ImportResult = {
      success: true,
      dry_run: true,
      errors: [],
      summary: {
        total_rows: 2,
        valid_count: 2,
        error_count: 0,
        created: 2,
        updated: 0,
        skipped: 0
      }
    };

    const normalized = component.normalizeSummary(modernResponse);

    expect(normalized.summary.total_rows).toBe(2);
    expect(normalized.summary.valid_count).toBe(2);
    expect(normalized.summary.error_count).toBe(0);
    expect(normalized.summary.valid_count! + normalized.summary.error_count!).toBe(normalized.summary.total_rows);
  });

  it('should handle sample counterparties template with dry_run and verify DOM preview state', () => {
    // شبیه‌سازی انتخاب فایل نمونه counterparties_template (6).xlsx
    const sampleBackendResult: ImportResult = {
      success: true,
      dry_run: true,
      errors: [],
      summary: {
        total_rows: 2,
        valid_count: 2,
        error_count: 0,
        created: 2,
        updated: 0,
        skipped: 0
      }
    };

    component.importFn = vi.fn().mockReturnValue(of(sampleBackendResult));
    const testFile = new File(['dummy xlsx content'], 'counterparties_template (6).xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });

    component.handleFileSelection(testFile);

    expect(component.step).toBe('preview');
    expect(component.previewResult).not.toBeNull();
    expect(component.previewResult?.summary.total_rows).toBe(2);
    expect(component.previewResult?.summary.valid_count).toBe(2);
    expect(component.previewResult?.summary.error_count).toBe(0);

    // شبیه‌سازی رندر DOM با استفاده از jsdom
    const container = document.createElement('div');
    const valid = component.previewResult?.summary.valid_count ?? ((component.previewResult?.summary.created || 0) + (component.previewResult?.summary.updated || 0));
    const error = component.previewResult?.summary.error_count ?? (component.previewResult?.summary.skipped || 0);
    const total = component.previewResult?.summary.total_rows || 0;

    container.innerHTML = `
      <div class="summary-badges">
        <span class="total-rows">${total}</span>
        <span class="valid-count">${valid}</span>
        <span class="error-count">${error}</span>
      </div>
      <button class="commit-btn" ${valid === 0 ? 'disabled' : ''}>تایید و ثبت نهایی (${valid} رکورد)</button>
    `;
    document.body.appendChild(container);

    const totalEl = container.querySelector('.total-rows');
    const validEl = container.querySelector('.valid-count');
    const errorEl = container.querySelector('.error-count');
    const commitBtn = container.querySelector('.commit-btn') as HTMLButtonElement;

    expect(totalEl?.textContent).toBe('2');
    expect(validEl?.textContent).toBe('2');
    expect(errorEl?.textContent).toBe('0');
    expect(Number(validEl?.textContent) + Number(errorEl?.textContent)).toBe(Number(totalEl?.textContent));
    expect(commitBtn.disabled).toBe(false);
    expect(commitBtn.textContent).toBe('تایید و ثبت نهایی (2 رکورد)');

    document.body.removeChild(container);
  });
});
