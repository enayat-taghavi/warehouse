import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AccountsHttpService, User, Role, Permission } from '../../../../core/http/accounts-http.service';
import { ToastService } from '../../../../shared/components/toast/toast.component';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';

@Injectable()
export class UsersFacade {
  private accountsService = inject(AccountsHttpService);
  private toast = inject(ToastService);
  private confirmDialog = inject(ConfirmDialogService, { optional: true });

  // ═════════════════════════════════════════════════════════════════════
  // ۱. مدیریت نقش‌ها و ماتریس مجوزها (Roles & Permissions)
  // ═════════════════════════════════════════════════════════════════════
  getRoles(): Observable<Role[]> {
    return this.accountsService.getRoles();
  }

  createRole(roleData: Partial<Role>): Observable<Role> {
    return this.accountsService.createRole(roleData);
  }

  updateRole(id: number, roleData: Partial<Role>): Observable<Role> {
    return this.accountsService.updateRole(id, roleData);
  }

  deleteRole(id: number): Observable<any> {
    return this.accountsService.deleteRole(id);
  }

  getPermissions(): Observable<Permission[]> {
    return this.accountsService.getPermissions();
  }

  // ═════════════════════════════════════════════════════════════════════
  // ۲. اکسل کاربران و نقش‌ها (Excel Import / Export)
  // ═════════════════════════════════════════════════════════════════════
  exportUsersExcel(ids?: number[]): Observable<Blob> {
    return this.accountsService.exportUsersExcel(ids);
  }

  importUsersExcel(file: File, updateExisting: boolean, dryRun?: boolean): Observable<any> {
    return this.accountsService.importUsersExcel(file, updateExisting, dryRun || false);
  }

  downloadUsersTemplate(): Observable<Blob> {
    return this.accountsService.downloadUsersTemplate();
  }

  exportRolesExcel(ids?: number[]): Observable<Blob> {
    return this.accountsService.exportRolesExcel(ids);
  }

  importRolesExcel(file: File, updateExisting: boolean, dryRun?: boolean): Observable<any> {
    return this.accountsService.importRolesExcel(file, updateExisting, dryRun || false);
  }

  downloadRolesTemplate(): Observable<Blob> {
    return this.accountsService.downloadRolesTemplate();
  }

  // ═════════════════════════════════════════════════════════════════════
  // ۳. عملیات پایه کاربران (User Operations)
  // ═════════════════════════════════════════════════════════════════════
  getUsers(): Observable<User[]> {
    return this.accountsService.getUsers();
  }

  createUser(userData: any): Observable<User> {
    return this.accountsService.createUser(userData);
  }

  updateUser(id: number, userData: any): Observable<User> {
    return this.accountsService.updateUser(id, userData);
  }

  deleteUser(id: number): Observable<any> {
    return this.accountsService.deleteUser(id);
  }

  resetPassword(id: number): Observable<any> {
    return this.accountsService.adminResetPassword(id);
  }

  toggleUserStatus(id: number, isActive?: boolean): Observable<any> {
    return this.accountsService.toggleUserStatus(id, isActive);
  }
}
