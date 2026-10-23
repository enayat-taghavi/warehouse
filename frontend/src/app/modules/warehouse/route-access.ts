import { ModuleRouteAccess } from '../../core/modules/module-contract';
import { permissionAlias } from '../../core/modules/permission-alias-token';

export const WAREHOUSE_ROUTE_ACCESS: ModuleRouteAccess = {
  deniedPageFallback: 'roleHome',
  guardAccessPermissions: [
    'view_sys_dashboard', 'view_wh_dashboard', 'view_sys_counter',
    'view_sys_supervisor', 'can_act_as_wh_supervisor', 'view_sys_manager_review',
    'can_act_as_wh_manager', 'view_wh_docs',
    'view_wh_dispatch', 'view_wh_customs', 'view_wh_doc_approvals',
    'view_wh_feeding', 'view_wh_feed_approvals', 'view_wh_labels',
    'view_wh_label_designer', 'view_wh_audit', 'view_wh_settings',
    'view_sys_settings', 'perm_sys_settings',
    'view_sys_recounts', 'view_sys_export', 'view_sys_reports',
    'perm_doc_approve_action', 'perm_feed_approve_action', 'perm_inventory_finalize',
    'perm_rec_import', 'perm_rec_recount', 'perm_rec_dispatch',
    'perm_wh_create', 'perm_wh_edit', 'perm_wh_freeze'
  ],
  pagePermissions: {
    'dashboard': ['view_sys_dashboard', 'view_wh_dashboard'],
    'projects': ['view_sys_projects'],
    'id-cards': ['view_sys_id_cards'],
    'counter': ['view_sys_counter'],
    'supervisor': ['view_sys_supervisor'],
    'manager-review': ['view_sys_manager_review', 'can_act_as_manager'],
    'recounts': ['view_sys_recounts'],
    'settings': ['view_sys_settings', 'perm_sys_settings', 'view_wh_settings', 'admin_all'],
    'reports': ['view_sys_reports', 'view_sys_dashboard'],
    'docs': ['view_wh_docs'],
    'dispatch': ['view_wh_dispatch'],
    'customs': ['view_wh_customs'],
    'doc_approvals': ['view_wh_doc_approvals'],
    'feeding': ['view_wh_feeding'],
    'feed_approvals': ['view_wh_feed_approvals'],
    'labels': ['view_wh_labels'],
    'label-designer': ['view_wh_label_designer'],
    'audit': ['view_wh_audit', 'perm_sys_logs', permissionAlias('audit_viewer'), 'admin_all'],
    'count-tracking': ['view_sys_manager_review', 'view_sys_supervisor', 'view_sys_dashboard', 'perm_inventory_finalize', 'view_wh_stocktaking', 'can_act_as_manager', 'can_act_as_supervisor']
  },
  loginPermissions: [
    'view_sys_dashboard', 'view_wh_dashboard', 'view_sys_counter',
    'view_sys_supervisor', 'view_sys_manager_review', 'view_wh_docs',
    'view_wh_dispatch', 'view_wh_customs', 'view_wh_doc_approvals',
    'view_wh_feeding', 'view_wh_audit', 'view_wh_settings'
  ],
  loginActiveAppModule: 'warehouse',
  resolveLoginRoute: (perms: string[]): string => {
    if (perms.includes('view_sys_dashboard') || perms.includes('view_wh_dashboard')) {
      return '/app/warehouse/dashboard';
    } else if (perms.includes('view_sys_counter')) {
      return '/app/warehouse/counter';
    } else if (perms.includes('view_sys_supervisor')) {
      return '/app/warehouse/supervisor';
    } else if (perms.includes('view_sys_manager_review')) {
      return '/app/warehouse/manager-review';
    } else if (perms.includes('view_wh_docs')) {
      return '/app/warehouse/docs';
    } else if (perms.includes('view_wh_dispatch')) {
      return '/app/warehouse/dispatch';
    } else {
      return '/app/warehouse/dashboard';
    }
  }
};
