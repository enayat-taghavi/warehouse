import { Component, inject, signal, HostListener, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AppPersonaService, AppModuleType, RolePersona } from '../../../core/services/app-persona.service';
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
