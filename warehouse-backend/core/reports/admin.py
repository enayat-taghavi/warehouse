from django.contrib import admin

from .models import ReportExportJob, ReportTemplate


@admin.register(ReportTemplate)
class ReportTemplateAdmin(admin.ModelAdmin):
    list_display = ('name', 'entity', 'owner', 'is_public', 'updated_at')
    list_filter = ('entity', 'is_public')
    search_fields = ('name', 'owner__username')


@admin.register(ReportExportJob)
class ReportExportJobAdmin(admin.ModelAdmin):
    list_display = ('id', 'report_name', 'owner', 'status', 'progress', 'total_rows', 'created_at')
    list_filter = ('status',)
    search_fields = ('report_name', 'owner__username')
