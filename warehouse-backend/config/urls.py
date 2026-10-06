from django.contrib import admin
from django.urls import path, include
from settings_core.views import SettingsViewSet, PublicConfigViewSet
from config.views_backup import (
    BackupCreateView,
    BackupRestoreView,
    SnapshotListView,
    SnapshotCreateView,
    SnapshotRollbackView,
    SnapshotSummaryView
)

from django.urls import re_path
from common.media_urls import serve_media
urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/', include('accounts.urls')),
    path('api/accounts/', include('accounts.urls')),
    path('api/communications/', include('communications.urls')),
    path('api/notifications/', include('notifications.urls')),
    path('api/reports/', include('reports.urls')),
    path('api/settings/global/', SettingsViewSet.as_view({'get': 'global_settings', 'post': 'global_settings'})),
    path('api/public/config/', PublicConfigViewSet.as_view({'get': 'list'})),
    path('api/backup/create/', BackupCreateView.as_view()),
    path('api/backup/restore/', BackupRestoreView.as_view()),
    path('api/backup/snapshots/', SnapshotListView.as_view(), name='snapshot_list'),
    path('api/backup/snapshots/create/', SnapshotCreateView.as_view(), name='snapshot_create'),
    path('api/backup/snapshots/rollback/', SnapshotRollbackView.as_view(), name='snapshot_rollback'),
    path('api/backup/snapshots/summary/', SnapshotSummaryView.as_view(), name='snapshot_summary'),
    # عکس کالا امضای معتبر می‌خواهد؛ بقیه رسانه‌ها مثل قبل. مسیر `static()`
    # پیشین حذف شد چون در حالت DEBUG یک مسیر سروِ بی‌امضا اضافه می‌کرد.
    re_path(r'^media/(?P<path>.*)$', serve_media),
]

# فاز ۳ §۳.۷ — مسیرهای ماژول‌ها از رجیستری قابلیت‌ها ساخته می‌شوند: در نصبِ بدون
# یک ماژول، پیشوند URL آن روت نمی‌شود (تا وجود اندپوینت‌هایش لو نرود و ۴۰۴ بدهد).
from platform_core.registry import installed_modules, get_module

for _code in installed_modules():
    _spec = get_module(_code)
    if _spec:
        for _prefix, _urlconf in _spec.url_includes:
            urlpatterns.append(path(_prefix, include(_urlconf)))

# فاز ۲: ثبت بی‌شرط مسیر کال‌بک گوگل‌درایو در هسته و مسیرهای درایو سراسری سامانه
from settings_core.google_drive_views import (
    GoogleDriveOAuthCallbackView,
    SystemGoogleDriveConfigView,
    SystemGoogleDriveAuthUrlView,
    SystemGoogleDriveDisconnectView,
    SystemGoogleDriveTasksView,
)
urlpatterns.append(path('api/accounts/gdrive/callback/', GoogleDriveOAuthCallbackView.as_view(), name='root-gdrive-oauth-callback'))
urlpatterns.append(path('api/settings/gdrive/system/', SystemGoogleDriveConfigView.as_view(), name='system-gdrive-config'))
urlpatterns.append(path('api/settings/gdrive/system/auth-url/', SystemGoogleDriveAuthUrlView.as_view(), name='system-gdrive-auth-url'))
urlpatterns.append(path('api/settings/gdrive/system/disconnect/', SystemGoogleDriveDisconnectView.as_view(), name='system-gdrive-disconnect'))
urlpatterns.append(path('api/settings/gdrive/system/tasks/', SystemGoogleDriveTasksView.as_view(), name='system-gdrive-tasks'))


