from django.contrib import admin
from django.db.models import Q
from common.warehouse_scope import user_warehouse_ids
from .models import (
    Conversation, ConversationParticipant, Message,
    MessageAttachment, GenericComment
)
from .access import visible_conversations


@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    list_display = ['id', 'title', 'conv_type', 'warehouse_id', 'is_active', 'created_by', 'created_at', 'updated_at']
    list_filter = ['conv_type', 'is_active', 'warehouse_id', 'created_at']
    search_fields = ['title', 'id', 'created_by__username']
    readonly_fields = ['created_at', 'updated_at', 'sync_id']

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if request.user.is_superuser:
            return qs
        return qs.filter(id__in=visible_conversations(request.user).values('id'))

    def get_readonly_fields(self, request, obj=None):
        ro = list(self.readonly_fields)
        if not request.user.is_superuser and obj:
            ro.extend(['conv_type', 'warehouse_id', 'created_by'])
        return ro

    def has_add_permission(self, request):
        # ساخت گفتگو باید منحصراً از طریق اپلیکیشن یا توسط سوپریوزر انجام شود
        return bool(request.user and request.user.is_superuser)

    def has_change_permission(self, request, obj=None):
        return bool(request.user and request.user.is_superuser)

    def has_delete_permission(self, request, obj=None):
        # ممانعت از حذف ناقص گفتگوها توسط پرسنل از پنل ادمین
        return bool(request.user and request.user.is_superuser)


@admin.register(ConversationParticipant)
class ConversationParticipantAdmin(admin.ModelAdmin):
    list_display = ['id', 'conversation', 'user', 'last_read_message', 'last_read_at', 'is_muted', 'created_at']
    list_filter = ['is_muted', 'conversation__warehouse_id', 'created_at']
    search_fields = ['user__username', 'user__first_name', 'user__last_name', 'conversation__title']
    readonly_fields = ['created_at', 'updated_at', 'sync_id']

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if request.user.is_superuser:
            return qs
        return qs.filter(conversation__in=visible_conversations(request.user))

    def has_add_permission(self, request):
        return bool(request.user and request.user.is_superuser)

    def has_change_permission(self, request, obj=None):
        return bool(request.user and request.user.is_superuser)

    def has_delete_permission(self, request, obj=None):
        return bool(request.user and request.user.is_superuser)


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ['id', 'conversation', 'sender', 'short_text', 'is_system', 'created_at']
    list_filter = ['is_system', 'conversation__warehouse_id', 'created_at']
    search_fields = ['text', 'sender__username', 'client_temp_id']
    readonly_fields = ['created_at', 'updated_at', 'sync_id', 'client_temp_id']

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if request.user.is_superuser:
            return qs
        return qs.filter(conversation__in=visible_conversations(request.user))

    def get_readonly_fields(self, request, obj=None):
        ro = list(self.readonly_fields)
        if obj:
            ro.extend(['sender', 'conversation', 'is_system', 'text'])
        return ro

    def has_add_permission(self, request):
        # پیام‌ها فقط از طریق چت و وب‌سوکت ثبت می‌شوند
        return False

    def has_change_permission(self, request, obj=None):
        # پیام‌ها اسناد ممیزی غیرقابل ویرایش از پنل ادمین هستند
        return False

    def has_delete_permission(self, request, obj=None):
        # حذف پیام فقط توسط سوپریوزر مجاز است
        return bool(request.user and request.user.is_superuser)

    def short_text(self, obj):
        return (obj.text[:50] + '...') if obj.text and len(obj.text) > 50 else obj.text
    short_text.short_description = "متن پیام"


@admin.register(MessageAttachment)
class MessageAttachmentAdmin(admin.ModelAdmin):
    list_display = ['id', 'message', 'file_name', 'file_size', 'content_type', 'created_at']
    list_filter = ['content_type', 'message__conversation__warehouse_id', 'created_at']
    search_fields = ['file_name', 'message__id']
    readonly_fields = ['created_at', 'updated_at', 'sync_id', 'file_size', 'content_type']

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if request.user.is_superuser:
            return qs
        return qs.filter(message__conversation__in=visible_conversations(request.user))

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        # جلوگیری از پاک‌سازی پیوست‌ها از پنل ادمین توسط پرسنل (جلوگیری از دور زدن Tombstone آفلاین)
        return bool(request.user and request.user.is_superuser)


@admin.register(GenericComment)
class GenericCommentAdmin(admin.ModelAdmin):
    list_display = ['id', 'content_type', 'object_id', 'author', 'warehouse_id', 'short_text', 'created_at']
    list_filter = ['content_type', 'warehouse_id', 'created_at']
    search_fields = ['text', 'author__username', 'object_id', 'client_temp_id']
    readonly_fields = ['created_at', 'updated_at', 'sync_id', 'client_temp_id']

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if request.user.is_superuser:
            return qs
        allowed_whs = user_warehouse_ids(request.user)
        if allowed_whs is None:
            return qs
        return qs.filter(Q(warehouse_id__in=allowed_whs) | Q(warehouse_id__isnull=True))

    def get_readonly_fields(self, request, obj=None):
        ro = list(self.readonly_fields)
        if obj:
            ro.extend(['author', 'content_type', 'object_id', 'warehouse_id', 'text'])
        return ro

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return bool(request.user and request.user.is_superuser)

    def short_text(self, obj):
        return (obj.text[:50] + '...') if obj.text and len(obj.text) > 50 else obj.text
    short_text.short_description = "متن نظر"
