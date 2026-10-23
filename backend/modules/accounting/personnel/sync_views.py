from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone


class PersonnelSyncPullView(APIView):
    """
    اندپوینت همگام‌سازی داده‌های قلمرو پرسنلی/مالی برای کلاینت Local-First (تسک ۵).
    در صورت فراخوانی کلاینت، پاسخ معتبر استاندارد همگام‌سازی با server_time را بازمی‌گرداند.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        server_time = timezone.now()

        return Response({
            'server_time': server_time.isoformat(),
            'results': {},
            'next_cursor': None,
            'has_more': False,
            'total_records': 0,
        })
