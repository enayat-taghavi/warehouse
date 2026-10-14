from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models.deletion import Collector
from django.db import router
from django.db import IntegrityError, transaction
from django.db.models import ProtectedError
import logging

logger = logging.getLogger(__name__)

class DeleteImpactMixin:
    """
    Mixin to calculate and return the cascade delete impact of an object.
    Also provides a robust destroy method that catches ProtectedError.
    """
    
    @action(detail=True, methods=['get'])
    def delete_impact(self, request, pk=None):
        instance = self.get_object()
        
        using = router.db_for_write(instance.__class__, instance=instance)
        collector = Collector(using=using)
        
        try:
            collector.collect([instance])
        except Exception as e:
            return Response({'error': str(e)}, status=400)
            
        impact_summary = []
        
        for model, instances in collector.data.items():
            if model == instance.__class__:
                continue # Skip the main object itself
            
            impact_summary.append({
                'model_name': model._meta.verbose_name or model.__name__,
                'count': len(instances)
            })
            
        # Sort by count descending
        impact_summary.sort(key=lambda x: x['count'], reverse=True)
        
        return Response({
            'impact': impact_summary,
            'total_affected': sum(item['count'] for item in impact_summary)
        })

    def destroy(self, request, *args, **kwargs):
        """
        Override destroy to catch database protection errors (Phase 2).
        """
        instance = self.get_object()
        try:
            with transaction.atomic():
                self.perform_destroy(instance)
            return Response(status=204)
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
