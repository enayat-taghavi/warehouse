import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, ParamMap, Router, RouterLink } from '@angular/router';
import { ActionButtonComponent } from '../../../../shared/components/action-button/action-button.component';
import { CommandCenterComponent } from '../../../../shared/components/command-center/command-center.component';
import { LoadingSkeletonComponent } from '../../../../shared/components/loading-skeleton/loading-skeleton.component';
import { TabBarComponent, TabDef } from '../../../../shared/components/tab-bar/tab-bar.component';
import { StatusBadgeComponent } from '../../../../shared/components/status-badge/status-badge.component';
import { PersianDatePipe } from '../../../../shared/pipes/persian-date.pipe';
import { SvgIconDirective } from '../../../../shared/icons/svg-icon.directive';
import { WebSocketService, patchDocumentRow } from '../../../../core/http/websocket.service';
import { ActiveCompanyService } from '../../../../core/services/active-company.service';
import { isServerUnreachable } from '../../../../core/services/server-reachability';
import {
  EMPTY_LETTER_FILTERS, LETTER_CONFIDENTIALITY_LABELS, LETTER_DOC_TYPE, LETTER_KIND_LABELS, LETTER_STATUS_LABELS, LETTER_STATUS_COLOR,
  LETTER_TABS, CircularRow, LetterConfidentiality, LetterFilters, LetterKind, LetterProject, LetterRow, LetterStatus, LetterTab,
} from '../../letters.models';
import { LettersApiService } from '../../services/letters-api.service';
import { LettersOfflineService, LocalDraft } from '../../services/letters-offline';

const PAGE_SIZE = 20;

/** فیلترهای آدرس صفحه را با فهرست مقدارهای مجاز می‌خواند (ورودی مرزی). */
export function parseLetterFilters(pm: ParamMap): LetterFilters {
  const pick = <T extends string>(key: string, allowed: readonly string[]): T | '' => {
    const v = pm.get(key) || '';
    return (allowed.includes(v) ? v : '') as T | '';
  };
  const tab = pick<LetterTab>('tab', LETTER_TABS) || 'inbox';
  const project = Number(pm.get('project'));
  const page = Number(pm.get('page'));
  return {
    tab,
    kind: pick<LetterKind>('kind', Object.keys(LETTER_KIND_LABELS)),
    status: pick<LetterStatus>('status', Object.keys(LETTER_STATUS_LABELS)),
    confidentiality: pick<LetterConfidentiality>('confidentiality', Object.keys(LETTER_CONFIDENTIALITY_LABELS)),
    q: (pm.get('q') || '').slice(0, 100),
    project: Number.isInteger(project) && project > 0 ? project : null,
    due: pick<'overdue' | 'today'>('due', ['overdue', 'today']),
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

export function letterFiltersToQuery(f: LetterFilters): Record<string, string | number | null> {
  return {
    tab: f.tab === EMPTY_LETTER_FILTERS.tab ? null : f.tab,
    kind: f.kind || null,
    status: f.status || null,
    confidentiality: f.confidentiality || null,
    q: f.q.trim() || null,
    project: f.project,
    due: f.due || null,
    page: f.page > 1 ? f.page : null,
  };
}

/** فهرست نامه‌ها (`/app/letters`، ن۱۶): زیرزبانه‌ها و فیلترها در آدرس؛ جدول در دسکتاپ و کارت در موبایل. */
@Component({
  selector: 'app-letter-list',
  standalone: true,
  imports: [RouterLink, ActionButtonComponent, CommandCenterComponent, LoadingSkeletonComponent, TabBarComponent, SvgIconDirective, StatusBadgeComponent, PersianDatePipe],
  templateUrl: './letter-list.html',
})
export class LetterListPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(LettersApiService);
  private readonly offline = inject(LettersOfflineService);
  private readonly ws = inject(WebSocketService);
  private readonly companies = inject(ActiveCompanyService);
  private readonly destroyRef = inject(DestroyRef);

  readonly tabs: TabDef[] = [
    { id: 'inbox', label: 'کارتابل', icon: 'clipboard' },
    { id: 'sent', label: 'فرستاده‌ها', icon: 'send' },
    { id: 'drafts', label: 'پیش‌نویس‌ها', icon: 'file' },
    { id: 'all', label: 'همه', icon: 'list' },
    { id: 'projects', label: 'بایگانی پروژه‌ها', shortLabel: 'پروژه‌ها', icon: 'folder' },
    { id: 'circulars', label: 'بخشنامه‌ها', shortLabel: 'بخشنامه', icon: 'file-text' },
  ];
  readonly kindLabels = LETTER_KIND_LABELS;
  readonly statusLabels = LETTER_STATUS_LABELS;
  readonly statusColors = LETTER_STATUS_COLOR;
  readonly confLabels = LETTER_CONFIDENTIALITY_LABELS;
  readonly kinds = Object.keys(LETTER_KIND_LABELS) as LetterKind[];
  readonly statuses = Object.keys(LETTER_STATUS_LABELS) as LetterStatus[];
  readonly confs = Object.keys(LETTER_CONFIDENTIALITY_LABELS) as LetterConfidentiality[];

  readonly online = this.offline.online;
  readonly filters = signal<LetterFilters>(EMPTY_LETTER_FILTERS);
  readonly rows = signal<LetterRow[]>([]);
  readonly count = signal(0);
  readonly projects = signal<LetterProject[]>([]);
  readonly local = signal<LocalDraft[]>([]);
  readonly loading = signal(false);
  readonly error = signal<'offline' | 'error' | null>(null);
  readonly pages = computed(() => Math.max(1, Math.ceil(this.count() / PAGE_SIZE)));
  readonly activeProject = computed(() => this.projects().find(p => p.id === this.filters().project) || null);
  private loadSeq = 0;

  ngOnInit(): void {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(pm => {
      this.filters.set(parseLetterFilters(pm));
      this.reload();
    });
    this.ws.documentChanges$([LETTER_DOC_TYPE]).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(ev => {
      if (patchDocumentRow(this.rows(), ev)) this.rows.set([...this.rows()]);
      else this.reload(true);
    });
    this.ws.liveRefresh$().pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.reload(true));
  }

  setFilter(patch: Partial<LetterFilters>): void {
    const next: LetterFilters = { ...this.filters(), ...patch, page: patch.page ?? 1 };
    void this.router.navigate([], { relativeTo: this.route, queryParams: letterFiltersToQuery(next), replaceUrl: true });
  }

  onTab(tab: string): void {
    this.setFilter({ tab: tab as LetterTab, status: '' });
  }

  reload(silent = false): void {
    const f = this.filters();
    const seq = ++this.loadSeq;
    void this.loadLocal();
    if (!silent) this.loading.set(true);
    this.error.set(null);
    const company = this.companies.activeCompanySignal()?.id ?? null;
    const fail = (err: any) => {
      if (seq !== this.loadSeq) return;
      this.error.set(isServerUnreachable(err?.status ?? 0) ? 'offline' : 'error');
      this.loading.set(false);
    };
    if (f.tab === 'projects' || f.project) {
      this.api.projects(company).subscribe({
        next: rows => { if (seq === this.loadSeq) this.projects.set(rows); if (f.tab === 'projects') this.loading.set(false); },
        error: fail,
      });
      if (f.tab === 'projects') return;
    }
    if (f.tab === 'circulars') {
      this.api.circulars(company).subscribe({
        next: rows => {
          if (seq !== this.loadSeq) return;
          this.rows.set(rows || []);
          this.count.set((rows || []).length);
          this.loading.set(false);
        },
        error: fail,
      });
      return;
    }
    this.api.list(f, company).subscribe({
      next: page => {
        if (seq !== this.loadSeq) return;
        this.rows.set(page.results || []);
        this.count.set(page.count || 0);
        this.loading.set(false);
      },
      error: fail,
    });
  }

  private async loadLocal(): Promise<void> {
    this.local.set(await this.offline.localDrafts());
  }

  /** بخشنامهٔ نخوانده (فقط زیرزبانهٔ «بخشنامه‌ها» `is_read` دارد) */
  unread(r: LetterRow | CircularRow): boolean {
    return 'is_read' in r && r.is_read === false;
  }

  openNew(): void {
    void this.router.navigate(['/app/letters/new']);
  }

  openLocal(d: LocalDraft): void {
    if (d.state === 'failed') void this.router.navigate(['/app/letters/new'], { queryParams: { local: d.id } });
  }

  faNumber(n: number): string {
    return new Intl.NumberFormat('fa-IR').format(n);
  }

  value(ev: Event): string {
    return (ev.target as HTMLInputElement | HTMLSelectElement).value;
  }
}
