"""
API چاپ سند تک‌برگی و صحت‌سنجی عمومی (ص۳ و ص۶ طرح ۲.۷).

- `GET /api/print/<kind>/<id>/pdf/?size=A4|A5`: در هر درخواست `can_view` (فقط True صریح)؛ نبود اجازه، نوع
  بی‌قلاب، خطای قلاب یا قلاب None = ۴۰۴ تا وجود سند لو نرود. سابقهٔ دیدن ثبت می‌شود؛ پاسخ بی‌کش.
- `GET /api/public/verify/<token>/`: بی‌ورود، فقط throttle ناشناس. توکن نامعتبر = `{valid: false}` با ۲۰۰.
  سند محرمانه فقط «معتبر» و شماره. بقیه: دادهٔ توکن + خلاصهٔ زندهٔ قلاب `verify_summary:<kind>` (شماره، تاریخ،
  مبلغ، وضعیت؛ O3 طرح شبانه)؛ بی نام شخص و بی متن. سند حذف‌شده یا شرکتِ ناهمخوان = `exists: false`.
- نشانی QR: `WH_CANONICAL_DOMAIN` اگر تنظیم شده؛ وگرنه میزبان Origin/Referer درخواست چاپ اگر در `ALLOWED_HOSTS`
  باشد و loopback نباشد (پشت پروکسی Express با `changeOrigin` میزبان درخواست 127.0.0.1:8000 است)؛ وگرنه میزبان درخواست.
"""
from dataclasses import replace
from urllib.parse import quote, urlsplit

from django.conf import settings
from django.http.request import validate_host

from django.http import Http404, HttpResponse
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from platform_core.registry import (
    can_view, is_entity_confidential, printable_document, record_entity_view, verify_summary,
)

from .document_pdf import format_doc_date, read_verify_token, render_document_pdf, verify_token

PAGE_SIZES = ('A4', 'A5')
LOOPBACK_HOSTS = ('localhost', '127.0.0.1', '[::1]', '::1')


def public_base_url(request) -> str:
    """پایهٔ نشانی عمومی برای QR (بی `/` پایانی)."""
    canonical = (getattr(settings, 'WH_CANONICAL_DOMAIN', '') or '').strip().strip('/')
    if canonical:
        return canonical if '://' in canonical else f'https://{canonical}'
    for header in ('HTTP_ORIGIN', 'HTTP_REFERER'):
        raw = request.META.get(header) or ''
        try:
            parts = urlsplit(raw)
            host = (parts.hostname or '').lower()
            port = parts.port
        except ValueError:
            continue
        if parts.scheme not in ('http', 'https') or not host or host in LOOPBACK_HOSTS:
            continue
        # فقط میزبان صریح ALLOWED_HOSTS (نه `*`)؛ netloc خام (مثل user@host) هرگز در QR نمی‌آید
        if validate_host(host, [h for h in settings.ALLOWED_HOSTS if h != '*']):
            return f'{parts.scheme}://{host}' + (f':{port}' if port else '')
    return request.build_absolute_uri('/').rstrip('/')


class PrintPdfView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, kind, entity_id):
        if len(kind) > 50 or len(entity_id) > 64:
            raise Http404
        if not can_view(request.user, kind, entity_id):
            raise Http404
        doc = printable_document(request.user, kind, entity_id)
        if doc is None:
            raise Http404
        size = str(request.query_params.get('size') or 'A4').upper()
        doc = replace(doc, size=size if size in PAGE_SIZES else 'A4')
        if not doc.verify_url:
            confidential = is_entity_confidential(kind, entity_id)
            token = verify_token(kind, entity_id, doc.number, company_id=doc.company_id, title=doc.title,
                                 date=format_doc_date(doc.date), confidential=confidential)
            doc = replace(doc, verify_url=f'{public_base_url(request)}/verify/{token}')
        content = render_document_pdf(doc)
        record_entity_view(request.user, kind, entity_id, doc.company_id)

        response = HttpResponse(content, content_type='application/pdf')
        name = f'{doc.number or kind}.pdf'
        response['Content-Disposition'] = (
            f"inline; filename=\"document.pdf\"; filename*=UTF-8''{quote(name.encode('utf-8'))}")
        response['Cache-Control'] = 'no-store'
        return response


class PublicVerifyView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [AnonRateThrottle]

    def get(self, request, token):
        data = read_verify_token(token)
        if data is None:
            body = {'valid': False}
        elif is_entity_confidential(data['k'], data['i']):
            body = {'valid': True, 'number': data.get('n', '')}
        else:
            company_name = ''
            if data.get('c'):
                from companies.models import Company
                company_name = Company.objects.filter(pk=data['c']).values_list('name', flat=True).first() or ''
            body = {'valid': True, 'number': data.get('n', ''), 'title': data.get('t', ''),
                    'date': data.get('d', ''), 'company_name': company_name}
            body.update(_live_summary(data))
        response = Response(body)
        response['Cache-Control'] = 'no-store'
        return response


def _live_summary(data) -> dict:
    """`live: False` اگر ماژول قلاب ندارد؛ وگرنه `exists` و برای سند موجود `current` (فقط چهار فیلد)."""
    summary = verify_summary(data['k'], data['i'])
    if summary is None:
        return {'live': False}
    exists = summary.get('exists') is True
    if exists and (data.get('c') is None or summary.get('company_id') != data.get('c')):
        exists = False
    if not exists:
        return {'live': True, 'exists': False}
    current = {key: str(summary.get(key) or '') for key in ('number', 'date', 'amount', 'status')}
    return {'live': True, 'exists': True, 'current': current}
