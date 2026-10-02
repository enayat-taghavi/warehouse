/**
 * Barrel export — تمام کامپوننت‌ها، pipe‌ها و directive‌های مشترک
 *
 * Usage:
 *   import { ModalComponent, StatusBadgeComponent, PersianDatePipe } from '@app/shared';
 */

// Components
export { ToastContainerComponent, ToastService } from './components/toast/toast.component';
export { ModalComponent } from './components/modal/modal.component';
export { ConfirmDialogComponent, ConfirmDialogService } from './components/confirm-dialog/confirm-dialog.component';
export { StatusBadgeComponent } from './components/status-badge/status-badge.component';
export { DataTableComponent, TableColumnDirective } from './components/data-table/data-table.component';
export type { SortState, PageEvent } from './components/data-table/data-table.component';
export { FileUploadComponent } from './components/file-upload/file-upload.component';
export { WarehouseSelectorComponent } from './components/warehouse-selector/warehouse-selector.component';
export { LoadingSkeletonComponent } from './components/loading-skeleton/loading-skeleton.component';
export { BarcodeScannerComponent } from './components/barcode-scanner/barcode-scanner.component';
export { CartableHeaderComponent } from './components/cartable-header/cartable-header.component';
export { CartableCardBaseComponent } from './components/cartable-card-base/cartable-card-base.component';
export { ItemPhotoGalleryComponent } from './components/item-photo-gallery/item-photo-gallery.component';
export { ItemPhotoThumbComponent } from './components/item-photo-gallery/item-photo-thumb.component';
export type { PhotoThumbSize, PhotoThumbAccent } from './components/item-photo-gallery/item-photo-thumb.component';
export { PhotoGalleryHost, summarizePhotos, rowItemId } from './components/item-photo-gallery/photo-gallery-host';
export type { PhotoSummary } from './components/item-photo-gallery/photo-gallery-host';
export { NotificationCenterComponent } from './components/notification-center/notification-center.component';
export type { NotificationItem } from './components/notification-center/notification-center.component';

// Pipes
export { PersianDatePipe } from './pipes/persian-date.pipe';
export { StatusLabelPipe } from './pipes/status-label.pipe';

// Directives
export { ClickOutsideDirective } from './directives/click-outside.directive';
export { HasPermissionDirective, HasDepartmentDirective } from './directives/permission.directive';
