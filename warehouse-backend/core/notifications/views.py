from rest_framework import viewsets, permissions, status, views
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Notification, DeviceToken
from .serializers import NotificationSerializer, DeviceTokenSerializer


class NotificationViewSet(viewsets.ModelViewSet):
    serializer_class = NotificationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Notification.objects.filter(recipient=self.request.user).order_by('-created_at')

    @action(detail=True, methods=['post'], url_path='mark-read')
    def mark_read(self, request, pk=None):
        notification = self.get_object()
        notification.is_read = True
        notification.save(update_fields=['is_read'])
        return Response({'status': 'marked_read', 'id': notification.id})

    @action(detail=False, methods=['post'], url_path='mark-all-read')
    def mark_all_read(self, request):
        updated_count = Notification.objects.filter(recipient=request.user, is_read=False).update(is_read=True)
        return Response({'status': 'all_marked_read', 'updated_count': updated_count})

    @action(detail=False, methods=['get'], url_path='unread-count')
    def unread_count(self, request):
        count = Notification.objects.filter(recipient=request.user, is_read=False).count()
        return Response({'unread_count': count})


class DeviceTokenView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, token=None):
        if token:
            try:
                device_token = DeviceToken.objects.get(token=token, user=request.user)
                return Response(DeviceTokenSerializer(device_token).data)
            except DeviceToken.DoesNotExist:
                return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        tokens = DeviceToken.objects.filter(user=request.user)
        serializer = DeviceTokenSerializer(tokens, many=True)
        return Response(serializer.data)

    def post(self, request):
        token = request.data.get('token')
        if not token or not str(token).strip():
            return Response({'error': 'token is required'}, status=status.HTTP_400_BAD_REQUEST)

        token = str(token).strip()
        platform = request.data.get('platform', 'android')
        if platform not in ('android', 'ios'):
            platform = 'android'
        app_version = request.data.get('app_version', '')

        # Upsert: if token exists, move to current user and update details
        device_token, created = DeviceToken.objects.update_or_create(
            token=token,
            defaults={
                'user': request.user,
                'platform': platform,
                'app_version': app_version,
            }
        )
        serializer = DeviceTokenSerializer(device_token)
        return Response(
            serializer.data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK
        )

    def delete(self, request, token=None):
        token_str = token
        if not token_str and isinstance(request.data, dict):
            token_str = request.data.get('token')
        if not token_str:
            token_str = request.query_params.get('token')

        if not token_str or not str(token_str).strip():
            return Response({'error': 'token is required'}, status=status.HTTP_400_BAD_REQUEST)

        token_str = str(token_str).strip()
        try:
            device_token = DeviceToken.objects.get(token=token_str)
        except DeviceToken.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        if device_token.user_id != request.user.id:
            return Response(
                {'detail': 'Cannot delete another user\'s token.'},
                status=status.HTTP_403_FORBIDDEN
            )

        device_token.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
