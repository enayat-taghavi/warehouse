from django.contrib import admin

from .models import ExternalParty


@admin.register(ExternalParty)
class ExternalPartyAdmin(admin.ModelAdmin):
    list_display = ('name', 'kind', 'company', 'phone', 'mobile', 'is_active')
    search_fields = ('name', 'national_id', 'phone', 'mobile', 'economic_code')
    list_filter = ('kind', 'is_active')
    list_select_related = ('company',)
    raw_id_fields = ('company', 'created_by')
