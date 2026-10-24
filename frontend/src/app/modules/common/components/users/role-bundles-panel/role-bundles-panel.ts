import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { PermissionService } from '../../../../../core/services/permission.service';
import { PermissionApiService } from '../../../../../core/api/permission-api.service';
import { NetworkStatusService } from '../../../../../core/services/network-status.service';
import { ModuleRegistryService } from '../../../../../core/modules/module-registry.service';
import { ConfirmDialogService } from '../../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { ToastService } from '../../../../../shared/components/toast/toast.component';
import { SvgIconDirective } from '../../../../../shared/icons/svg-icon.directive';
import { ActionButtonComponent } from '../../../../../shared/components/action-button/action-button.component';
import { LoadingSkeletonComponent } from '../../../../../shared/components/loading-skeleton/loading-skeleton.component';
import { isServerUnreachable } from '../../../../../core/services/server-reachability';
import { PermissionSpec, RoleBundleDetail } from '../../../../../core/models/permission.model';

/** یک مجوز در فهرست بسته، با نشانهٔ تفاوت با پیش‌فرض */
export interface BundlePermissionRow {
  code: string;
  label: string;
  /** وضعیت سرور: افزوده یا برداشته نسبت به پیش‌فرض ماژول */
  diff: 'added' | 'removed' | null;
}

export interface BundleCategoryGroup {
  key: string;
  label: string;
  items: BundlePermissionRow[];
}

export interface BundleModuleGroup {
  module: string;
  label: string;
  categories: BundleCategoryGroup[];
}

/**
 * «نقش‌های انتساب» (طرح ۲.۲، ت۳ و ت۱۰-۱): بستهٔ مجوز هر نقش انتساب، دسته‌بندی‌شده بر اساس ماژول و دسته.
 * همه‌چیز از فهرست سرور (`PermissionService.catalog()`) می‌آید؛ ویرایش فقط برای مدیر کل سامانه.
 */
@Component({
  selector: 'app-role-bundles-panel',
  imports: [SvgIconDirective, ActionButtonComponent, LoadingSkeletonComponent],
  templateUrl: './role-bundles-panel.html',
})
export class RoleBundlesPanel implements OnInit {
  private readonly perm = inject(PermissionService);
  private readonly api = inject(PermissionApiService);
  private readonly registry = inject(ModuleRegistryService);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  /** اولین بارگذاری فهرست در جریان است */
  readonly loading = signal(false);
  /** ذخیره یا بازگشت در جریان است */
  readonly busy = signal(false);
  readonly online = signal(true);
  readonly selectedRole = signal<string | null>(null);
  /** پیش‌نویس ذخیره‌نشدهٔ هر نقش: کلید نقش → فهرست مؤثر */
  private readonly drafts = signal<Record<string, string[]>>({});
  /** پاسخ ذخیره/بازگشت تا رسیدن فهرست تازه */
  private readonly savedBundles = signal<Record<string, RoleBundleDetail>>({});

  readonly catalog = this.perm.catalog;
  readonly canEdit = computed(() => this.perm.isSuperuser());
  readonly offline = computed(() => !this.online() || this.perm.isStale());
  readonly canSave = computed(() => this.canEdit() && !this.offline() && !this.busy());

  readonly roles = computed(() => this.catalog()?.roles ?? []);
  readonly hasBundles = computed(() => Object.keys(this.catalog()?.bundles ?? {}).length > 0);

  /** مجوزهای بخشیِ غیرحساس (فقط این‌ها در بسته مجازند) */
  private readonly bundleSpecs = computed<PermissionSpec[]>(() =>
    (this.catalog()?.permissions ?? []).filter((p) => p.scope === 'section' && !p.sensitive),
  );

  readonly activeRole = computed(() => {
    const roles = this.roles();
    const key = this.selectedRole();
    return roles.find((r) => r.key === key) ?? roles[0] ?? null;
  });

  readonly activeBundle = computed<RoleBundleDetail | null>(() => {
    const role = this.activeRole();
    if (!role) return null;
    return this.savedBundles()[role.key] ?? this.catalog()?.bundles?.[role.key] ?? null;
  });

  /** فهرست مؤثر جاری (پیش‌نویس یا سرور) */
  readonly effective = computed<ReadonlySet<string>>(() => {
    const role = this.activeRole();
    if (!role) return new Set();
    const draft = this.drafts()[role.key];
    return new Set(draft ?? this.activeBundle()?.effective ?? []);
  });

  readonly isDirty = computed(() => {
    const role = this.activeRole();
    if (!role) return false;
    const draft = this.drafts()[role.key];
    if (!draft) return false;
    return !sameSet(draft, this.activeBundle()?.effective ?? []);
  });

  /** هر نقشی پیش‌نویس ذخیره‌نشده دارد (برای پرسش پیش از ترک صفحه) */
  hasUnsavedChanges(): boolean {
    const drafts = this.drafts();
    return Object.keys(drafts).some((key) => {
      const bundle = this.savedBundles()[key] ?? this.catalog()?.bundles?.[key] ?? null;
      return !sameSet(drafts[key], bundle?.effective ?? []);
    });
  }

  readonly groups = computed<BundleModuleGroup[]>(() => {
    const cat = this.catalog();
    const bundle = this.activeBundle();
    if (!cat || !bundle) return [];
    const added = new Set(bundle.added);
    const removed = new Set(bundle.removed);
    const categoryLabel = new Map(cat.categories.map((c) => [`${c.module}::${c.key}`, c.label_fa]));
    const categoryOrder = new Map(cat.categories.map((c, i) => [`${c.module}::${c.key}`, i]));
    const modules: string[] = [];
    const byModule = new Map<string, Map<string, BundlePermissionRow[]>>();
    for (const p of this.bundleSpecs()) {
      const mod = p.module ?? '';
      if (!byModule.has(mod)) {
        byModule.set(mod, new Map());
        modules.push(mod);
      }
      const catKey = p.category ?? '';
      const bucket = byModule.get(mod)!;
      if (!bucket.has(catKey)) bucket.set(catKey, []);
      bucket.get(catKey)!.push({
        code: p.code,
        label: p.label_fa || p.code,
        diff: added.has(p.code) ? 'added' : removed.has(p.code) ? 'removed' : null,
      });
    }
    return modules.map((mod) => {
      const cats = [...byModule.get(mod)!.entries()]
        .sort(([a], [b]) => (categoryOrder.get(`${mod}::${a}`) ?? 9999) - (categoryOrder.get(`${mod}::${b}`) ?? 9999))
        .map(([key, items]) => ({
          key,
          label: categoryLabel.get(`${mod}::${key}`) ?? 'سایر',
          items: items.sort((x, y) => x.label.localeCompare(y.label, 'fa')),
        }));
      return { module: mod, label: mod ? (this.registry.getSpec(mod)?.titleFa || mod) : 'هستهٔ سامانه', categories: cats };
    });
  });

  readonly selectedCount = computed(() => this.effective().size);

  ngOnInit(): void {
    const net = NetworkStatusService.getInstance();
    this.online.set(net.isOnline);
    net.state$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((s) => this.online.set(s === 'online'));

    this.perm.permissionsChanged$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((e) => {
      if (e.reason === 'bundle') void this.reload();
    });

    if (!this.catalog()) {
      this.loading.set(true);
      void this.perm.ensureCatalog().finally(() => this.loading.set(false));
    }
  }

  /** بارگذاری دوبارهٔ فهرست از سرور (دکمهٔ «تلاش دوباره» و رویداد زنده) */
  async reload(): Promise<void> {
    this.loading.set(!this.catalog());
    try {
      await this.perm.ensureCatalog(true);
      this.savedBundles.set({});
    } finally {
      this.loading.set(false);
    }
  }

  selectRole(key: string): void {
    this.selectedRole.set(key);
  }

  isChecked(code: string): boolean {
    return this.effective().has(code);
  }

  toggle(code: string, event?: Event): void {
    const role = this.activeRole();
    if (!role || !this.canEdit()) {
      if (event?.target instanceof HTMLInputElement) event.target.checked = this.isChecked(code);
      return;
    }
    const next = new Set(this.effective());
    if (next.has(code)) next.delete(code);
    else next.add(code);
    this.drafts.update((d) => ({ ...d, [role.key]: [...next].sort() }));
  }

  discardDraft(): void {
    const role = this.activeRole();
    if (!role) return;
    this.drafts.update((d) => {
      const { [role.key]: _drop, ...rest } = d;
      return rest;
    });
  }

  async save(): Promise<void> {
    const role = this.activeRole();
    if (!role || !this.canSave()) return;
    const effective = [...this.effective()].sort();
    this.busy.set(true);
    try {
      const res = await firstValueFrom(this.api.updateRoleBundle(role.key, effective));
      this.applySaved(role.key, res);
      this.toast.success(`بستهٔ مجوز نقش «${role.label_fa}» ذخیره شد.`);
    } catch (err: any) {
      this.toast.error(errorText(err, 'ذخیرهٔ بسته انجام نشد.'));
    } finally {
      this.busy.set(false);
    }
  }

  async resetToDefault(): Promise<void> {
    const role = this.activeRole();
    if (!role || !this.canSave()) return;
    const ok = await this.confirm.open({
      title: 'بازگشت به پیش‌فرض',
      message: `همهٔ تغییرهای بستهٔ نقش «${role.label_fa}» پاک می‌شود و بسته به پیش‌فرض ماژول‌ها برمی‌گردد. مجوز همهٔ کاربران این نقش در همهٔ شرکت‌ها عوض می‌شود.`,
      confirmText: 'بازگشت',
      type: 'warning',
    });
    if (ok !== true) return;
    this.busy.set(true);
    try {
      const res = await firstValueFrom(this.api.resetRoleBundle(role.key));
      this.applySaved(role.key, res);
      this.toast.success(`بستهٔ نقش «${role.label_fa}» به پیش‌فرض برگشت.`);
    } catch (err: any) {
      this.toast.error(errorText(err, 'بازگشت به پیش‌فرض انجام نشد.'));
    } finally {
      this.busy.set(false);
    }
  }

  hasDiff(): boolean {
    const b = this.activeBundle();
    return !!b && (b.added.length > 0 || b.removed.length > 0);
  }

  roleDiffCount(key: string): number {
    const b = this.savedBundles()[key] ?? this.catalog()?.bundles?.[key];
    return b ? b.added.length + b.removed.length : 0;
  }

  formatFa(n: number): string {
    return n.toLocaleString('fa-IR');
  }

  private applySaved(key: string, res: RoleBundleDetail): void {
    this.savedBundles.update((s) => ({ ...s, [key]: res }));
    this.discardDraft();
    // نسخهٔ ذخیره‌شدهٔ محلی فهرست هم تازه شود (آفلاین)
    void this.perm.ensureCatalog(true).then(() => {
      if (this.catalog()?.bundles?.[key]) {
        this.savedBundles.update((s) => {
          const { [key]: _drop, ...rest } = s;
          return rest;
        });
      }
    });
  }
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(b);
  return a.every((x) => s.has(x));
}

function errorText(err: any, fallback: string): string {
  if (isServerUnreachable(err?.status ?? 0)) return 'سرور در دسترس نیست؛ دوباره تلاش کنید.';
  const body = err?.error;
  if (typeof body?.detail === 'string') return body.detail;
  if (body && typeof body === 'object') {
    const first = Object.values(body)[0];
    if (Array.isArray(first) && typeof first[0] === 'string') return first[0];
    if (typeof first === 'string') return first;
  }
  return fallback;
}
