from django.contrib.auth.backends import ModelBackend
from django.contrib.auth.models import Permission
from .models import CustomRole

class RoleInheritanceBackend(ModelBackend):
    """
    Custom authentication backend that extends ModelBackend.
    Overrides _get_group_permissions to include permissions from all descendant CustomRoles.
    """

    def _get_group_permissions(self, user_obj):
        if not user_obj.is_active or user_obj.is_anonymous:
            return Permission.objects.none()

        all_ids = CustomRole.get_all_role_ids_for_user(user_obj)
        if not all_ids:
            return Permission.objects.none()
        # Return queryset of permissions linked to any of these roles
        return Permission.objects.filter(group__id__in=all_ids)
