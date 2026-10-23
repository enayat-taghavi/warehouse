from pathlib import Path
from django.http import FileResponse, Http404
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny

from settings_core.mobile_release import (
    read_manifest,
    is_safe_filename,
    get_mobile_dir,
)


class MobileUpdateManifestView(APIView):
    """
    نمایش عمومی مانیفست به‌روزرسانی زنده اپلیکیشن موبایل همراه با آدرس کامل دانلود فایل زیپ.
    در صورت نبود مانیفست، شیء خالی {} برمی‌گرداند.
    """
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        manifest = read_manifest()
        if not manifest:
            return Response({})

        data = dict(manifest)
        filename = data.get('file', '')
        rel_url = f"/api/public/mobile-files/updates/{filename}"
        data['url'] = request.build_absolute_uri(rel_url)
        return Response(data)


class MobileFileDownloadView(APIView):
    """
    دانلود عمومی فایل‌های بسته به‌روزرسانی (updates) و نصبی (apk).
    فقط فایل‌های درون MEDIA_ROOT/mobile/ با نام‌های معتبر را سرو می‌کند.
    """
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, kind, name):
        if kind not in ('updates', 'apk'):
            raise Http404("Invalid file kind.")

        if not is_safe_filename(name):
            raise Http404("Invalid file name.")

        if kind == 'updates' and not name.endswith('.zip'):
            raise Http404("Updates must be .zip files.")

        if kind == 'apk' and not name.endswith('.apk'):
            raise Http404("APK files must be .apk files.")

        base_dir = (get_mobile_dir() / kind).resolve()
        file_path = (base_dir / name).resolve()

        try:
            file_path.relative_to(base_dir)
        except ValueError:
            raise Http404("Path traversal prohibited.")

        if not file_path.is_file():
            raise Http404("File not found.")

        if kind == 'apk':
            return FileResponse(
                open(file_path, 'rb'),
                as_attachment=True,
                filename=name,
                content_type='application/vnd.android.package-archive',
            )
        else:
            return FileResponse(
                open(file_path, 'rb'),
                as_attachment=True,
                filename=name,
                content_type='application/zip',
            )
