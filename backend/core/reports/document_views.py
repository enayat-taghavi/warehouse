"""
API چاپ سند تک‌برگی و صحت‌سنجی عمومی (ص۳ و ص۶ طرح ۲.۷).

- `GET /api/print/<kind>/<id>/pdf/?size=A4|A5`: در هر درخواست `can_view` (فقط True صریح)؛ نبود اجازه، نوع
  بی‌قلاب، خطای قلاب یا قلاب None = ۴۰۴ تا وجود سند لو نرود. سابقهٔ دیدن ثبت می‌شود؛ پاسخ بی‌کش.
- `GET /api/public/verify/<token>/`: بی‌ورود، فقط throttle ناشناس. توکن نامعتبر = `{valid: false}` با ۲۰۰.
  پاسخ بی‌مبلغ، بی‌نام شخص و بی‌متن است؛ سند محرمانه فقط «معتبر» و شماره.
"""
from dataclasses import replace
from urllib.parse import quote

from django.http import Http404, HttpResponse
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from platform_core.registry import can_view, is_entity_confidential, printable_document, record_entity_view

from .document_pdf import format_doc_date, read_verify_token, render_document_pdf, verify_token

PAGE_SIZES = ('A4', 'A5')


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
            doc = replace(doc, verify_url=request.build_absolute_uri(f'/verify/{token}'))
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
        response = Response(body)
        response['Cache-Control'] = 'no-store'
        return response
