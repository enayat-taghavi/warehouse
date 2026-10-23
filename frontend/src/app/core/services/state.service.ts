import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class StateService {
  appState: any = {
    user: null,
    unit: 'admin',
    tab: 'dashboard',
    activeWarehouseId: (typeof localStorage !== 'undefined' && localStorage.getItem('wh_active_id') === 'ALL' ? 'ALL' : (typeof localStorage !== 'undefined' && localStorage.getItem('wh_active_id') ? Number(localStorage.getItem('wh_active_id')) : 'ALL')) as any,
    projects: [],
    rolesMap: {} as any,  // Deprecated: titles & colors now come from API (role.title, role.color)
    users: [],
    items: [],
    dispatchSettings: {
      visibleCols: ['fa_unic_code', 'description', 'inventory', 'old_location', 'labelStatus', 'fieldAssignee', 'fieldStatus', 'docAssignee', 'docStatus', 'my_tag', 'created_at', 'updated_at', 'created_by_name', 'modified_by_name', 'actions'],
      filters: {},
      search: '',
      recentTags: ['اولویت الف', 'محموله مهر', 'سیستمی', 'تعمیری', 'اولویت ب'],
      sort: { key: null, dir: 'asc' },
      sessionTags: {}
    },
    labelSettings: { printMesc: true, printKey: true, printDesc: true, printLoc: true, printQty: true, printCond: true, printTag: true, printProject: true, printQr: true },
    drafts: [],
    tasks: [],
    changeLogs: [],
    importLogs: []
  };

  getDeptLabel(d: string): string {
    const labels: any = { admin: 'مدیریت کل سیستم', management: 'مدیر پروژه', execution: 'واحد اجرایی', documents: 'واحد مدارک', feeding: 'واحد تغذیه MT' };
    return labels[d] || d;
  }

  selectedWarehouseId(): number | null {
    const id = this.appState?.activeWarehouseId;
    return (id && id !== 'ALL') ? Number(id) : null;
  }

  constructor() {}
}
