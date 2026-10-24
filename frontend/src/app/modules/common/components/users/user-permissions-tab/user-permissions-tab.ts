import { ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, firstValueFrom } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { PermissionApiService } from '../../../../../core/api/permission-api.service';
import { PermissionService } from '../../../../../core/services/permission.service';
import { NetworkStatusService } from '../../../../../core/services/network-status.service';
import { isServerUnreachable } from '../../../../../core/services/server-reachability';
import { ModuleRegistryService } from '../../../../../core/modules/module-registry.service';
import { ConfirmDialogService } from '../../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { ActionButtonComponent } from '../../../../../shared/components/action-button/action-button.component';
import { SvgIconDirective } from '../../../../../shared/icons/svg-icon.directive';
import { LoadingSkeletonComponent } from '../../../../../shared/components/loading-skeleton/loading-skeleton.component';
import {
  PermissionCatalog,
  PermissionOverrideSet,
  PermissionSpec,
  UserPermissionAssignment,
  UserPermissionsDetail,
} from '../../../../../core/models/permission.model';

/** برچسب منشأ مجوز تیک‌خورده یا برداشته (ت۴) */
export type PermissionBadge = 'role' | 'added' | 'removed' | null;

export interface PermissionRowView {
  code: string;
  label: string;
  sensitive: boolean;
  checked: boolean;
  badge: PermissionBadge;
  /** دلیل فارسی قفل (ت۱۰)؛ null = قابل تغییر */
  lockReason: string | null;
}

export interface PermissionGroupView {
  key: string;
  moduleLabel: string;
  categoryLabel: string;
  rows: PermissionRowView[];
  /** کدهایی که «انتخاب همه» تیک می‌زند (بی‌حساس و بی‌قفل و تیک‌نخورده) */
  selectable: string[];
}

export interface PermissionBlockView {
  /** `system` یا `c<شناسهٔ شرکت>` */
  key: string;
  companyId: number | null;
  title: string;
  editable: boolean;
  readonlyReason: string | null;
  hasAssignment: boolean;
  checkedCount: number;
  groups: PermissionGroupView[];
}

const SENSITIVE_REASON = 'مجوز حساس؛ فقط مدیر کل سامانه.';
const BLOCK_READONLY_REASON = 'شما اجازهٔ تغییر مجوزهای این کاربر در این شرکت را ندارید.';
const CORE_GROUP_LABEL = 'مجوزهای پایهٔ سامانه';
const OTHER_CATEGORY_LABEL = 'سایر';

/**
 * تب «مجوزها» در پنجرهٔ کاربر (ت۴، ت۱۰ طرح ۲.۲): مجوزهای سامانه‌ای و مجوزهای بخشی هر شرکت، تیک‌خورده بر اساس
 * `effective` سرور. هر تیک فهرست کامل افزوده/برداشتهٔ همان دامنه را به `PUT users/<id>/permissions/` می‌فرستد.
 * داده‌های ماژول فقط از کاتالوگ سرور می‌آیند (پوسته نام ماژول یا کد مجوز ماژول نمی‌شناسد).
 */
@Component({
  selector: 'app-user-permissions-tab',
  standalone: true,
  imports: [CommonModule, SvgIconDirective, LoadingSkeletonComponent, ActionButtonComponent],
  templateUrl: './user-permissions-tab.html',
})
export class UserPermissionsTabComponent implements OnInit, OnChanges, OnDestroy {
  @Input() userId: number | null = null;
  /** درخواست رفتن به تب «پروژه‌ها و بخش‌ها»ی شرکتِ نخستین انتساب (شناسهٔ شرکت، یا null بی‌انتساب) */
  @Output() goToAssignments = new EventEmitter<number | null>();

  private api = inject(PermissionApiService);
  private permissions = inject(PermissionService);
  private registry = inject(ModuleRegistryService);
  private confirmDialog = inject(ConfirmDialogService);
  private cdr = inject(ChangeDetectorRef);
  private network = NetworkStatusService.getInstance();
  private destroy$ = new Subject<void>();
  private requestSeq = 0;

  payload: UserPermissionsDetail | null = null;
  catalog: PermissionCatalog | null = null;
  blocks: PermissionBlockView[] = [];
  isLoading = false;
  loadError: string | null = null;
  /** آخرین بارگذاری دوباره نرسید و دادهٔ پیشین نمایش داده می‌شود */
  isStale = false;
  /** کلید بلوکی که در حال ذخیره است */
  savingKey: string | null = null;
  /** خطای سرور هر بلوک (کلید بلوک → پیام فارسی) */
  blockErrors: Record<string, string> = {};
  private expanded = new Set<string>();

  get isOnline(): boolean {
    return this.network.isOnline;
  }

  get assignments(): UserPermissionAssignment[] {
    return this.payload?.assignments ?? [];
  }

  ngOnInit(): void {
    this.network.state$.pipe(takeUntil(this.destroy$)).subscribe(() => this.cdr.markForCheck());
    this.permissions.permissionsChanged$.pipe(takeUntil(this.destroy$)).subscribe(ev => {
      if (!this.userId || this.savingKey) return;
      if (ev.user_id === this.userId || (ev.user_id == null && ev.company_id != null)) void this.load();
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['userId']) {
      this.payload = null;
      this.blocks = [];
      this.blockErrors = {};
      this.expanded.clear();
      if (this.userId) void this.load();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  async load(): Promise<void> {
    const userId = this.userId;
    if (!userId) return;
    const seq = ++this.requestSeq;
    this.isLoading = !this.payload;
    this.loadError = null;
    this.cdr.markForCheck();
    try {
      const [detail, catalog] = await Promise.all([
        firstValueFrom(this.api.getUserPermissions(userId)),
        this.permissions.ensureCatalog(),
      ]);
      if (seq !== this.requestSeq || userId !== this.userId) return;
      this.catalog = catalog ?? this.permissions.catalog();
      this.applyPayload(detail);
      this.isStale = false;
    } catch (err: any) {
      if (seq !== this.requestSeq || userId !== this.userId) return;
      if (this.payload) {
        this.isStale = true;
      } else {
        this.loadError = UserPermissionsTabComponent.errorMessage(err, 'مجوزهای کاربر دریافت نشد.');
      }
    } finally {
      if (seq === this.requestSeq) {
        this.isLoading = false;
        this.cdr.markForCheck();
      }
    }
  }

  private applyPayload(detail: UserPermissionsDetail): void {
    const first = !this.payload;
    this.payload = detail;
    this.rebuild();
    if (first) {
      this.expanded.add('system');
      const firstCompany = this.blocks.find(b => b.companyId != null);
      if (firstCompany) this.expanded.add(firstCompany.key);
    }
  }

  // ─────────────────────────── ساختن نما ───────────────────────────

  private rebuild(): void {
    const p = this.payload;
    if (!p) {
      this.blocks = [];
      return;
    }
    const blocks: PermissionBlockView[] = [];
    const systemEditable = !!p.editable?.system;
    blocks.push(this.buildBlock({
      key: 'system',
      companyId: null,
      title: 'مجوزهای سامانه‌ای',
      editable: systemEditable,
      readonlyReason: systemEditable ? null : (p.editable?.system_reason_fa || 'شما اجازهٔ تغییر مجوزهای سامانه‌ای این کاربر را ندارید.'),
      hasAssignment: true,
      set: p.system,
      scope: 'system',
      locks: p.editable?.locked_codes ?? {},
    }));
    const companyIds = Object.keys(p.companies ?? {}).sort((a, b) =>
      (p.companies[a].name || '').localeCompare(p.companies[b].name || '', 'fa'));
    for (const cid of companyIds) {
      const set = p.companies[cid];
      const id = Number(cid);
      const editable = (p.editable?.companies ?? []).map(Number).includes(id);
      blocks.push(this.buildBlock({
        key: `c${id}`,
        companyId: id,
        title: set.name || `شرکت ${id}`,
        editable,
        readonlyReason: editable ? null : BLOCK_READONLY_REASON,
        hasAssignment: set.has_assignment !== false,
        set,
        scope: 'section',
        locks: p.editable?.company_locked_codes?.[cid] ?? {},
      }));
    }
    this.blocks = blocks;
  }

  private buildBlock(opts: {
    key: string; companyId: number | null; title: string; editable: boolean; readonlyReason: string | null;
    hasAssignment: boolean; set: PermissionOverrideSet; scope: 'system' | 'section'; locks: Record<string, string>;
  }): PermissionBlockView {
    const { set } = opts;
    const effective = new Set(set.effective ?? []);
    const added = new Set(set.added ?? []);
    const removed = new Set(set.removed ?? []);
    const fromRoles = new Set(set.from_roles ?? []);
    const editorSuperuser = this.permissions.isSuperuser();

    const specs = new Map<string, PermissionSpec>();
    for (const s of this.catalog?.permissions ?? []) if (s.scope === opts.scope) specs.set(s.code, s);
    // کد بی‌کاتالوگ (مثلاً کاتالوگ در دسترس نیست) هم دیده شود تا تفاوت ذخیره‌شده گم نشود
    const codes = new Set<string>([...specs.keys(), ...effective, ...added, ...removed, ...fromRoles]);

    const categoryOrder = new Map<string, { label: string; order: number }>();
    (this.catalog?.categories ?? []).forEach((c, i) => categoryOrder.set(`${c.module}:${c.key}`, { label: c.label_fa, order: i }));
    const moduleOrder: string[] = [];
    for (const c of this.catalog?.categories ?? []) if (!moduleOrder.includes(c.module)) moduleOrder.push(c.module);

    const groups = new Map<string, PermissionGroupView & { sortKey: [number, number] }>();
    for (const code of codes) {
      const spec = specs.get(code);
      const module = spec?.module ?? null;
      const catKey = spec?.category ?? null;
      const cat = module && catKey ? categoryOrder.get(`${module}:${catKey}`) : undefined;
      const groupKey = `${module ?? ''}:${cat ? catKey : ''}`;
      let group = groups.get(groupKey);
      if (!group) {
        const modIdx = module == null ? -1 : (moduleOrder.indexOf(module) >= 0 ? moduleOrder.indexOf(module) : moduleOrder.length);
        group = {
          key: groupKey,
          moduleLabel: module == null ? CORE_GROUP_LABEL : (this.registry.getSpec(module)?.titleShortFa || module),
          categoryLabel: cat?.label ?? (module == null ? '' : OTHER_CATEGORY_LABEL),
          rows: [],
          selectable: [],
          sortKey: [modIdx, cat ? cat.order : Number.MAX_SAFE_INTEGER],
        };
        groups.set(groupKey, group);
      }
      const sensitive = !!spec?.sensitive;
      let lockReason: string | null = opts.locks[code] ?? null;
      if (!lockReason && sensitive && !editorSuperuser) lockReason = SENSITIVE_REASON;
      const checked = effective.has(code);
      const badge: PermissionBadge = added.has(code) ? 'added'
        : removed.has(code) ? 'removed'
        : (fromRoles.has(code) && checked) ? 'role' : null;
      group.rows.push({ code, label: spec?.label_fa || code, sensitive, checked, badge, lockReason });
      if (!checked && !sensitive && !lockReason) group.selectable.push(code);
    }
    const sorted = [...groups.values()].sort((a, b) => a.sortKey[0] - b.sortKey[0] || a.sortKey[1] - b.sortKey[1]);
    for (const g of sorted) g.rows.sort((a, b) => a.label.localeCompare(b.label, 'fa'));
    return {
      key: opts.key,
      companyId: opts.companyId,
      title: opts.title,
      editable: opts.editable,
      readonlyReason: opts.readonlyReason,
      hasAssignment: opts.hasAssignment,
      checkedCount: effective.size,
      groups: sorted.map(({ sortKey: _s, ...g }) => g),
    };
  }

  // ─────────────────────────── تعامل ───────────────────────────

  isExpanded(block: PermissionBlockView): boolean {
    return this.expanded.has(block.key);
  }

  toggleBlock(block: PermissionBlockView): void {
    if (this.expanded.has(block.key)) this.expanded.delete(block.key);
    else this.expanded.add(block.key);
  }

  canEdit(block: PermissionBlockView): boolean {
    return block.editable && this.isOnline && !this.isStale;
  }

  rowDisabled(block: PermissionBlockView, row: PermissionRowView): boolean {
    return !this.canEdit(block) || !!row.lockReason;
  }

  /** رابط خوش‌بینانه نیست: تیک DOM تا رسیدن پاسخ سرور همان حالت سرور می‌ماند */
  onCheckboxChange(event: Event, block: PermissionBlockView, row: PermissionRowView): void {
    const input = event.target as HTMLInputElement | null;
    if (input) input.checked = row.checked;
    void this.toggle(block, row);
  }

  async toggle(block: PermissionBlockView, row: PermissionRowView): Promise<void> {
    if (this.savingKey !== null || this.rowDisabled(block, row)) return;
    if (row.checked) {
      this.save(block, [], [row.code]);
      return;
    }
    if (row.sensitive) {
      const ok = await this.confirmDialog.open({
        title: 'دادن مجوز حساس',
        message: `«${row.label}» مجوز حساس است و دسترسی گسترده‌ای می‌دهد. آیا به این کاربر داده شود؟`,
        confirmText: 'بله، داده شود',
        type: 'danger',
      });
      if (ok !== true) {
        this.cdr.markForCheck();
        return;
      }
    }
    this.save(block, [row.code], []);
  }

  selectAll(block: PermissionBlockView, group: PermissionGroupView): void {
    if (this.savingKey !== null || !this.canEdit(block) || group.selectable.length === 0) return;
    this.save(block, group.selectable, []);
  }

  /** فهرست کامل افزوده/برداشتهٔ دامنه پس از تیک‌زدن `check` و برداشتن `uncheck` (نسبت به `from_roles`) */
  static nextOverrides(set: PermissionOverrideSet, check: string[], uncheck: string[]): { add: string[]; remove: string[] } {
    const add = new Set(set.added ?? []);
    const remove = new Set(set.removed ?? []);
    const fromRoles = new Set(set.from_roles ?? []);
    for (const c of check) {
      remove.delete(c);
      if (!fromRoles.has(c)) add.add(c);
    }
    for (const c of uncheck) {
      add.delete(c);
      if (fromRoles.has(c)) remove.add(c);
    }
    return { add: [...add].sort(), remove: [...remove].sort() };
  }

  private scopeSet(block: PermissionBlockView): PermissionOverrideSet | null {
    const p = this.payload;
    if (!p) return null;
    return block.companyId == null ? p.system : (p.companies[String(block.companyId)] ?? null);
  }

  private save(block: PermissionBlockView, check: string[], uncheck: string[]): void {
    const userId = this.userId;
    const set = this.scopeSet(block);
    if (!userId || !set) return;
    const { add, remove } = UserPermissionsTabComponent.nextOverrides(set, check, uncheck);
    this.savingKey = block.key;
    const errors = { ...this.blockErrors };
    delete errors[block.key];
    this.blockErrors = errors;
    this.cdr.markForCheck();
    this.api.updateUserPermissions(userId, { company_id: block.companyId, add, remove }).subscribe({
      next: detail => {
        this.savingKey = null;
        if (userId !== this.userId) return;
        this.applyPayload(detail);
        this.isStale = false;
        this.cdr.markForCheck();
      },
      error: err => {
        this.savingKey = null;
        if (userId !== this.userId) return;
        this.blockErrors = { ...this.blockErrors, [block.key]: UserPermissionsTabComponent.errorMessage(err, 'ذخیرهٔ مجوزها انجام نشد.') };
        // نمای تیک‌ها همان دادهٔ سرور می‌ماند؛ ورودی کاربر را به حالت پیشین برمی‌گرداند
        this.rebuild();
        this.cdr.markForCheck();
      },
    });
  }

  static errorMessage(err: any, fallback: string): string {
    if (isServerUnreachable(err?.status ?? 0)) return 'سرور در دسترس نیست؛ اتصال را بررسی کنید.';
    const body = err?.error;
    if (typeof body?.detail === 'string' && body.detail) return body.detail;
    if (body && typeof body === 'object') {
      const parts = Object.values(body)
        .flatMap(v => (Array.isArray(v) ? v : [v]))
        .filter((v): v is string => typeof v === 'string' && !!v);
      if (parts.length) return parts.join(' ');
    }
    return fallback;
  }

  formatFa(n: number): string {
    return n.toLocaleString('fa-IR');
  }

  assignmentPath(a: UserPermissionAssignment): string {
    return [a.company_name, a.project_name, a.section_name].filter(Boolean).join(' › ');
  }

  levelLabel(a: UserPermissionAssignment): string {
    return a.level === 'company' ? 'کل شرکت' : a.level === 'project' ? 'کل پروژه' : 'بخش';
  }

  badgeLabel(badge: PermissionBadge): string {
    return badge === 'role' ? 'از نقش' : badge === 'added' ? 'افزوده' : badge === 'removed' ? 'برداشته' : '';
  }

  badgeClass(badge: PermissionBadge): string {
    return badge === 'added' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : badge === 'removed' ? 'bg-rose-50 text-rose-700 border-rose-200'
      : 'bg-surface-muted text-fg-muted border-line';
  }
}
