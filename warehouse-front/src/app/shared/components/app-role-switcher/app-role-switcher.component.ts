import { Component, inject, signal, HostListener, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AppPersonaService, AppModuleType, RolePersona } from '../../../core/services/app-persona.service';
import { ModuleAccent } from '../../../core/modules/module-contract';

/** کلاس‌های کامل هر رنگ پایه (رشتهٔ کامل تا Tailwind تولیدشان کند) */
const SWITCHER_ACCENT_CLASSES: Record<ModuleAccent, { active: string; iconBox: string; labelHover: string; check: string }> = {
  indigo: {
    active: 'bg-indigo-50 dark:bg-indigo-950/60',
    iconBox: 'bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300',
    labelHover: 'group-hover:text-indigo-600 dark:group-hover:text-indigo-300',
    check: 'bg-indigo-600',
  },
  emerald: {
    active: 'bg-emerald-50 dark:bg-emerald-950/60',
    iconBox: 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300',
    labelHover: 'group-hover:text-emerald-600 dark:group-hover:text-emerald-300',
    check: 'bg-emerald-600',
  },
};
import { SvgIconDirective } from '../../icons/svg-icon.directive';

@Component({
  selector: 'app-role-switcher',
  standalone: true,
  imports: [CommonModule, SvgIconDirective],
  templateUrl: './app-role-switcher.component.html',
  styleUrl: './app-role-switcher.component.css'
})
export class AppRoleSwitcherComponent {
  public persona = inject(AppPersonaService);
  private elementRef = inject(ElementRef);
  private router = inject(Router);

  public isDropdownOpen = signal<boolean>(false);
  public isAppDropdownOpen = signal<boolean>(false);

  public accentClasses(accent: ModuleAccent) {
    return SWITCHER_ACCENT_CLASSES[accent] ?? SWITCHER_ACCENT_CLASSES.indigo;
  }

  public toggleDropdown(event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    this.closeAppDropdown();
    if (this.persona.isMultiRole()) {
      this.isDropdownOpen.update(v => !v);
    }
  }

  public closeDropdown(): void {
    this.isDropdownOpen.set(false);
  }

  public toggleAppDropdown(event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    this.closeDropdown();
    if (this.persona.canSwitchApps()) {
      this.isAppDropdownOpen.update(v => !v);
    }
  }

  public closeAppDropdown(): void {
    this.isAppDropdownOpen.set(false);
  }

  public closeAllDropdowns(): void {
    this.closeDropdown();
    this.closeAppDropdown();
  }

  public selectRole(role: RolePersona, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    this.persona.switchRole(role.code);
    this.closeAllDropdowns();
  }

  public selectApp(app: AppModuleType, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    if (this.persona.activeApp() !== app) {
      this.persona.switchApp(app);
    }
    this.closeAllDropdowns();
  }

  public toggleApp(): void {
    this.persona.toggleApp();
    this.closeAllDropdowns();
  }

  public goToLauncher(): void {
    this.closeAllDropdowns();
    this.router.navigate(['/app/launcher']);
  }

  @HostListener('document:click', ['$event'])
  public onDocumentClick(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.closeAllDropdowns();
    }
  }

  @HostListener('document:keydown.escape')
  public onEscape(): void {
    this.closeAllDropdowns();
  }
}
