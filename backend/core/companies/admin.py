from django.contrib import admin

from .models import Project, ProjectSection, SectionAssignment


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ('code', 'name', 'company', 'is_active', 'created_at')
    search_fields = ('code', 'name', 'description')
    list_filter = ('is_active',)


@admin.register(ProjectSection)
class ProjectSectionAdmin(admin.ModelAdmin):
    list_display = ('project', 'code', 'name', 'is_active')
    search_fields = ('code', 'name', 'project__name', 'project__code')
    list_filter = ('project', 'is_active')


@admin.register(SectionAssignment)
class SectionAssignmentAdmin(admin.ModelAdmin):
    list_display = ('user', 'company', 'project', 'section', 'role', 'is_active', 'created_at')
    search_fields = ('user__username', 'user__first_name', 'user__last_name', 'section__name', 'project__name', 'company__name')
    list_filter = ('role', 'is_active', 'company')
    list_select_related = ('user', 'company', 'project', 'section__project')
