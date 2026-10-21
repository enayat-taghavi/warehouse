import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AccountsHttpService, User, Role } from '../../../../core/http/accounts-http.service';
import { ScopeDirectoryService, ScopeDirectoryEntry } from '../../../../core/http/scope-directory.service';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import {
  IdCardSettings,
  DEFAULT_CARD_TEXTS,
  getBarcodeSvgString,
  getQrCodeSvgString
} from './id-cards.helpers';

@Injectable()
export class IdCardsFacade {
  private accountsService = inject(AccountsHttpService);
  private scopeDirectory = inject(ScopeDirectoryService);
  private sanitizer = inject(DomSanitizer);

  private readonly STORAGE_KEY = 'aalish_id_card_settings_v5';

  loadUsers(): Observable<User[]> {
    return this.accountsService.getUsers();
  }

  loadRoles(): Observable<Role[]> {
    return this.accountsService.getRoles();
  }

  loadWarehouses(): Observable<ScopeDirectoryEntry[]> {
    return this.scopeDirectory.getAll();
  }

  loadSavedSettings(): IdCardSettings | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...parsed,
          customTexts: { ...DEFAULT_CARD_TEXTS, ...(parsed.customTexts || {}) },
          fields: { ...parsed.fields }
        };
      }
    } catch {}
    return null;
  }

  saveSettings(settings: IdCardSettings): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(settings));
    } catch {}
  }

  getBarcodeSvg(code: string): SafeHtml {
    const svg = getBarcodeSvgString(code);
    return this.sanitizer.bypassSecurityTrustHtml(svg);
  }

  getQrCodeSvg(text: string): SafeHtml {
    const svg = getQrCodeSvgString(text);
    return this.sanitizer.bypassSecurityTrustHtml(svg);
  }
}
