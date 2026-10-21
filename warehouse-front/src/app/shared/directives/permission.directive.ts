import {
  Directive,
  Input,
  TemplateRef,
  ViewContainerRef,
  OnInit,
  OnDestroy,
  effect,
} from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';

/**
 * Structural directive — نمایش/مخفی‌سازی بر اساس دسترسی کاربر
 *
 * استفاده:
 *   <button *appHasPermission="'perm_usr_add'">کاربر جدید</button>
 *   <div *appHasDepartment="'admin'">فقط ادمین</div>
 */
@Directive({
  selector: '[appHasPermission]',
  standalone: true,
})
export class HasPermissionDirective implements OnInit {
  @Input('appHasPermission') permission = '';

  private hasView = false;

  constructor(
    private templateRef: TemplateRef<unknown>,
    private viewContainer: ViewContainerRef,
    private auth: AuthService,
  ) {}

  ngOnInit(): void {
    this.updateView();
  }

  private updateView(): void {
    const hasPerm = this.auth.hasPermission(this.permission);
    if (hasPerm && !this.hasView) {
      this.viewContainer.createEmbeddedView(this.templateRef);
      this.hasView = true;
    } else if (!hasPerm && this.hasView) {
      this.viewContainer.clear();
      this.hasView = false;
    }
  }
}

@Directive({
  selector: '[appHasDepartment]',
  standalone: true,
})
export class HasDepartmentDirective implements OnInit {
  @Input('appHasDepartment') department = '';

  private hasView = false;

  constructor(
    private templateRef: TemplateRef<unknown>,
    private viewContainer: ViewContainerRef,
    private auth: AuthService,
  ) {}

  ngOnInit(): void {
    this.updateView();
  }

  private updateView(): void {
    const departments = this.department.split(',').map(d => d.trim());
    const hasDept = departments.includes(this.auth.userDepartment());
    if (hasDept && !this.hasView) {
      this.viewContainer.createEmbeddedView(this.templateRef);
      this.hasView = true;
    } else if (!hasDept && this.hasView) {
      this.viewContainer.clear();
      this.hasView = false;
    }
  }
}
