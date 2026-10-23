from rest_framework.decorators import action
from rest_framework.exceptions import APIException
from rest_framework.response import Response
from django.db.models.deletion import Collector
from django.db import router
from django.db import IntegrityError, transaction
from django.db.models import ProtectedError, RestrictedError
import logging

logger = logging.getLogger(__name__)


def _model_label(model):
    return str(model._meta.verbose_name or model.__name__)


class DeleteImpactChanged(APIException):
    status_code = 409
    default_detail = 'سوابق وابسته پس از محاسبهٔ اثر حذف تغییر کرده است. اثر حذف را دوباره ببینید.'
    default_code = 'delete_impact_changed'


class DeleteImpactMixin:
    """
    Mixin to calculate and return the cascade delete impact of an object.
    Also provides a robust destroy method that catches ProtectedError.

    Hooks for subclasses:
      - check_delete_impact_permission(request, instance): raise PermissionDenied to hide the impact.
      - get_delete_blockers(instance): business-rule messages that block the delete.
    """

    def check_delete_impact_permission(self, request, instance):
        return None

    def get_delete_blockers(self, instance):
        return []

    def build_delete_impact(self, instance):
        """
        Every row the cascade would remove, grouped by model. Includes the rows Django
        deletes in bulk without loading (collector.fast_deletes), which collector.data
        does not list. PROTECT/RESTRICT relations and business blockers mark the delete as blocked.
        """
        using = router.db_for_write(instance.__class__, instance=instance)
        collector = Collector(using=using)

        counts = {}
        protected = {}
        try:
            collector.collect([instance])
        except (ProtectedError, RestrictedError) as e:
            objs = getattr(e, 'protected_objects', None) or getattr(e, 'restricted_objects', None) or []
            for obj in objs:
                protected[obj.__class__] = protected.get(obj.__class__, 0) + 1
        else:
            for model, objs in collector.data.items():
                n = sum(
                    1 for obj in objs
                    if not (obj.__class__ is instance.__class__ and obj.pk == instance.pk)
                )
                if n:
                    counts[model] = counts.get(model, 0) + n
            for qs in collector.fast_deletes:
                model = getattr(qs, 'model', None)
                if model is None:
                    continue
                n = qs.count() if hasattr(qs, 'count') else len(qs)
                if n:
                    counts[model] = counts.get(model, 0) + n

        impact_summary = [
            {'model_name': _model_label(model), 'count': n} for model, n in counts.items()
        ]
        impact_summary.sort(key=lambda x: x['count'], reverse=True)
        protected_summary = [
            {'model_name': _model_label(model), 'count': n} for model, n in protected.items()
        ]
        protected_summary.sort(key=lambda x: x['count'], reverse=True)
        blockers = [str(message) for message in self.get_delete_blockers(instance)]

        return {
            'impact': impact_summary,
            'total_affected': sum(item['count'] for item in impact_summary),
            'blocked': bool(blockers or protected_summary),
            'blockers': blockers,
            'protected': protected_summary,
        }

    def check_expected_impact(self, request, instance):
        """
        If the client sends ?expected_total=N (the impact it showed the user), the delete
        runs only when the cascade is still exactly that size and not blocked; otherwise 409.
        Without the parameter nothing changes for existing callers.
        """
        expected = request.query_params.get('expected_total')
        if expected is None:
            return
        self.check_delete_impact_permission(request, instance)
        try:
            expected_total = int(expected)
        except (TypeError, ValueError):
            raise DeleteImpactChanged()
        current = self.build_delete_impact(instance)
        if current['blocked']:
            # perform_destroy (blocker message) or ProtectedError reports the precise reason
            return
        if current['total_affected'] != expected_total:
            raise DeleteImpactChanged()

    @action(detail=True, methods=['get'])
    def delete_impact(self, request, pk=None):
        instance = self.get_object()
        self.check_delete_impact_permission(request, instance)
        try:
            data = self.build_delete_impact(instance)
        except Exception as e:
            logger.error(f"Error computing delete impact for {instance}: {str(e)}")
            return Response({'error': 'محاسبهٔ اثر حذف ممکن نشد.'}, status=400)
        return Response(data)

    def destroy(self, request, *args, **kwargs):
        """
        Override destroy to catch database protection errors (Phase 2).
        DRF errors raised by perform_destroy (permission, business-rule validation) pass through unchanged.
        """
        instance = self.get_object()
        try:
            with transaction.atomic():
                self.check_expected_impact(request, instance)
                self.perform_destroy(instance)
            return Response(status=204)
        except APIException:
            raise
        except ProtectedError as e:
            return Response({
                'error': 'حذف این مورد امکان‌پذیر نیست زیرا رکوردهای دیگری به آن وابسته‌اند که قابلیت حذف آبشاری ندارند.',
                'code': 'protected_error'
            }, status=400)
        except IntegrityError as e:
            return Response({
                'error': 'خطای جامعیت پایگاه داده در حین حذف.',
                'code': 'integrity_error'
            }, status=400)
        except Exception as e:
            logger.error(f"Error deleting {instance}: {str(e)}")
            return Response({
                'error': 'خطای ناشناخته در حین حذف.',
                'code': 'unknown_error'
            }, status=400)
