// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, beforeAll, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { of, throwError } from 'rxjs';

import { AttachmentsComponent, AttachmentItem } from './attachments.component';
import { ApiService } from '../../../core/api/api.service';
import { ConfirmDialogService } from '../confirm-dialog/confirm-dialog.component';
import { ToastService } from '../toast/toast.component';
import { shareBlob } from '../../../core/platform/file-output';

const { mockCanShareFiles, mockShareBlob, mockSaveBlob } = vi.hoisted(() => {
  const mocker = (globalThis as any).__vitest_mocker__;
  if (mocker) {
    vi.mock = ((path: string, factory?: any) => {
      const importer = ((import.meta as any).filename || (import.meta as any).url || '').replace(/^file:\/\/\/?/, '').replace(/\\/g, '/');
      mocker.queueMock(path, importer, typeof factory === 'function' ? factory : undefined);
    }) as any;
  }
  return {
    mockCanShareFiles: vi.fn(() => false),
    mockShareBlob: vi.fn(),
    mockSaveBlob: vi.fn(),
  };
});

vi.mock('../../../core/platform/file-output', () => ({
  canShareFiles: () => mockCanShareFiles(),
  shareBlob: (...args: any[]) => mockShareBlob(...args),
  saveBlob: (...args: any[]) => mockSaveBlob(...args),
}));

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

function setNavigatorShareSupport(supported: boolean): void {
  if (supported) {
    Object.defineProperty(navigator, 'share', {
      value: vi.fn().mockResolvedValue(undefined),
      configurable: true,
      writable: true,
    });
    Object.defineProperty(navigator, 'canShare', {
      value: vi.fn().mockReturnValue(true),
      configurable: true,
      writable: true,
    });
  } else {
    try {
      delete (navigator as any).share;
      delete (navigator as any).canShare;
    } catch {}
  }
}

describe('AttachmentsComponent DOM Spec', () => {
  let fixture: ComponentFixture<AttachmentsComponent>;
  let component: AttachmentsComponent;
  let api: {
    get: ReturnType<typeof vi.fn>;
    upload: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    download: ReturnType<typeof vi.fn>;
  };
  let confirmDialog: { open: ReturnType<typeof vi.fn> };
  let toast: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };

  const sampleItems: AttachmentItem[] = [
    {
      id: 1,
      entity_kind: 'zz_doc',
      entity_id: '7',
      label: 'doc',
      order: 1,
      description: '',
      original_name: 'test-contract.pdf',
      size: 1024,
      content_type: 'application/pdf',
      status: 'active',
      created_at: '2026-10-24T10:00:00Z',
      download_url: '/api/attachments/1/download/'
    },
    {
      id: 2,
      entity_kind: 'zz_doc',
      entity_id: '7',
      label: 'doc',
      order: 2,
      description: '',
      original_name: 'receipt.png',
      size: 2048,
      content_type: 'image/png',
      status: 'active',
      created_at: '2026-10-24T11:00:00Z',
      download_url: '/api/attachments/2/download/'
    }
  ];

  beforeAll(() => {
    window.URL.createObjectURL = vi.fn().mockReturnValue('blob:test');
    window.URL.revokeObjectURL = vi.fn();
  });

  beforeEach(async () => {
    (shareBlob as any).__mock = mockShareBlob;
    setNavigatorShareSupport(false);
    mockCanShareFiles.mockReturnValue(false);
    mockShareBlob.mockReset().mockResolvedValue('shared');
    mockSaveBlob.mockReset().mockResolvedValue(undefined);

    api = {
      get: vi.fn().mockReturnValue(of(sampleItems)),
      upload: vi.fn().mockReturnValue(of({})),
      delete: vi.fn().mockReturnValue(of({})),
      download: vi.fn().mockReturnValue(of(new Blob(['dummy'])))
    };
    confirmDialog = {
      open: vi.fn().mockResolvedValue(true)
    };
    toast = {
      success: vi.fn(),
      error: vi.fn()
    };

    await TestBed.configureTestingModule({
      imports: [AttachmentsComponent],
      providers: [
        { provide: ApiService, useValue: api },
        { provide: ConfirmDialogService, useValue: confirmDialog },
        { provide: ToastService, useValue: toast }
      ]
    }).compileComponents();
  });

  afterEach(() => {
    setNavigatorShareSupport(false);
    fixture?.destroy();
    TestBed.resetTestingModule();
  });

  async function createComponent(canEdit = false, items: AttachmentItem[] | null = sampleItems): Promise<void> {
    if (items !== null) {
      api.get.mockReturnValue(of(items));
    }
    fixture = TestBed.createComponent(AttachmentsComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('kind', 'zz_doc');
    fixture.componentRef.setInput('entityId', 7);
    if (canEdit) {
      fixture.componentRef.setInput('canEdit', true);
    }
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('loads list with kind and id', async () => {
    await createComponent();
    expect(api.get).toHaveBeenCalledWith('attachments', expect.objectContaining({ kind: 'zz_doc', id: 7 }));
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('test-contract.pdf');
    expect(text).toContain('receipt.png');
  });

  it('shows empty state', async () => {
    await createComponent(false, []);
    expect(fixture.nativeElement.textContent).toContain('پیوستی ثبت نشده است');
  });

  it('shows error detail and retries', async () => {
    api.get.mockReturnValue(throwError(() => ({ error: { detail: 'boom' } })));
    await createComponent(false, null);
    expect(fixture.nativeElement.textContent).toContain('boom');

    api.get.mockReturnValue(of(sampleItems));
    const retryBtn = fixture.nativeElement.querySelector('button[aria-label="تلاش دوباره"]') as HTMLButtonElement;
    expect(retryBtn).toBeTruthy();
    retryBtn.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it('hides edit buttons without canEdit', async () => {
    await createComponent(false);
    expect(fixture.nativeElement.querySelector('button[aria-label="بارگذاری"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('button[aria-label="جایگزینی"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('button[aria-label="حذف"]')).toBeNull();
  });

  it('delete asks confirm and reloads', async () => {
    await createComponent(true);
    const deleteBtn = fixture.nativeElement.querySelector('button[aria-label="حذف"]') as HTMLButtonElement;
    expect(deleteBtn).toBeTruthy();

    deleteBtn.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(confirmDialog.open).toHaveBeenCalled();
    expect(api.delete).toHaveBeenCalledWith('attachments/1');
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it('download uses api not a link', async () => {
    await createComponent();
    expect(fixture.nativeElement.querySelector('a[href*="/api/attachments/"]')).toBeNull();

    const downloadBtn = fixture.nativeElement.querySelector('button[aria-label="دانلود"]') as HTMLButtonElement;
    expect(downloadBtn).toBeTruthy();

    downloadBtn.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(api.download).toHaveBeenCalled();
    const calledPath = api.download.mock.calls[0]?.[0];
    expect(['attachments/1/download/', 'attachments/1/download']).toContain(calledPath);
  });

  it('sends label on list request', async () => {
    await createComponent();
    api.get.mockClear();

    fixture.componentRef.setInput('label', 'signature');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(api.get).toHaveBeenCalledWith('attachments', expect.objectContaining({ label: 'signature' }));
  });

  it('hides share button when canShareFiles returns false', async () => {
    setNavigatorShareSupport(false);
    mockCanShareFiles.mockReturnValue(false);
    await createComponent();
    expect(fixture.nativeElement.querySelector('button[aria-label="اشتراک‌گذاری"]')).toBeNull();
  });

  it('shows share button when canShareFiles returns true', async () => {
    setNavigatorShareSupport(true);
    mockCanShareFiles.mockReturnValue(true);
    await createComponent();
    const shareBtn = fixture.nativeElement.querySelector('button[aria-label="اشتراک‌گذاری"]') as HTMLButtonElement;
    expect(shareBtn).toBeTruthy();
    expect(shareBtn.getAttribute('title')).toBe('اشتراک‌گذاری');
  });

  it('downloads through api and calls shareBlob on share click', async () => {
    setNavigatorShareSupport(true);
    mockCanShareFiles.mockReturnValue(true);
    const dummyBlob = new Blob(['sample-data'], { type: 'application/pdf' });
    api.download.mockReturnValue(of(dummyBlob));
    await createComponent();

    const shareBtn = fixture.nativeElement.querySelector('button[aria-label="اشتراک‌گذاری"]') as HTMLButtonElement;
    expect(shareBtn).toBeTruthy();

    shareBtn.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(api.download).toHaveBeenCalled();
    const calledPath = api.download.mock.calls[0]?.[0];
    expect(['attachments/1/download/', 'attachments/1/download']).toContain(calledPath);

    if (mockShareBlob.mock.calls.length > 0) {
      expect(mockShareBlob).toHaveBeenCalledWith(dummyBlob, 'test-contract.pdf');
    } else {
      expect((navigator as any).share).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'test-contract.pdf' })
      );
    }
  });

  it('shows toast on share download error', async () => {
    setNavigatorShareSupport(true);
    mockCanShareFiles.mockReturnValue(true);
    api.download.mockReturnValue(throwError(() => ({ error: { detail: 'خطای سرور' } })));
    await createComponent();

    const shareBtn = fixture.nativeElement.querySelector('button[aria-label="اشتراک‌گذاری"]') as HTMLButtonElement;
    expect(shareBtn).toBeTruthy();

    shareBtn.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(toast.error).toHaveBeenCalledWith('خطای سرور');

    api.download.mockReturnValue(throwError(() => new Error('network failure')));
    shareBtn.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(toast.error).toHaveBeenCalledWith('اشتراک‌گذاری پیوست انجام نشد');
  });

  it('shows no toast when shareBlob is rejected', async () => {
    setNavigatorShareSupport(true);
    mockCanShareFiles.mockReturnValue(true);
    const dummyBlob = new Blob(['sample-data'], { type: 'application/pdf' });
    api.download.mockReturnValue(of(dummyBlob));
    mockShareBlob.mockRejectedValue(new Error('share failed'));
    await createComponent();

    const shareBtn = fixture.nativeElement.querySelector('button[aria-label="اشتراک‌گذاری"]') as HTMLButtonElement;
    expect(shareBtn).toBeTruthy();

    await component.share(sampleItems[0]);
    fixture.detectChanges();

    expect(mockShareBlob).toHaveBeenCalledWith(dummyBlob, 'test-contract.pdf');
    expect(toast.error).not.toHaveBeenCalled();
    expect(component.busy).toBe(false);
  });
});
