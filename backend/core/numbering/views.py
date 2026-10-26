"""
API شماره‌گذاری اسناد (ص۷ طرح ۲.۸): فقط خواندن و تنظیم؛ هیچ مسیری شماره نمی‌سازد یا از کلاینت نمی‌پذیرد.
  GET   /api/numbering/<company_id>/series/                  سری‌هایی که کاربر اجازهٔ تنظیمشان را دارد
  PATCH /api/numbering/<company_id>/series/<series_key>/     template، prefix، seq_padding، start_number
  GET   /api/numbering/<company_id>/issued/?series=&status=&period=   دفتر شماره‌ها (صفحه‌بندی‌شده)
"""
import re

from django.db import transaction
from django.db.models import Max
from django.http import Http404
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView

from settings_core.company_settings import _company_or_error

from .models import IssuedNumber, NumberCounter, NumberSeriesConfig
from .registry import can_manage_series, series_specs
from .services import MAX_PADDING, next_preview, series_settings

MAX_TEMPLATE = 100
MAX_PREFIX = 20
MAX_START = 2_000_000_000
TOKEN_RE = re.compile(r'\{[^{}]*\}')
ALLOWED_TOKENS = {'{period}', '{prefix}', '{seq}'}


def _managed_specs(user, company_id):
    return [s for s in sorted(series_specs().values(), key=lambda s: s.key) if can_manage_series(user, s, company_id)]


def _serialize_series(spec, company_id):
    conf = series_settings(company_id, spec)
    period = spec.period_for(company_id, timezone.now())
    last = (NumberCounter.objects.filter(company_id=company_id, series_key=spec.key, period_key=period)
            .values_list('last_seq', flat=True).first()) or 0
    return {
        'key': spec.key, 'title_fa': spec.title_fa, 'template': conf.template, 'prefix': conf.prefix,
        'seq_padding': conf.seq_padding, 'start_number': conf.start_number, 'default_template': spec.default_template,
        'period_key': period, 'next_preview': next_preview(company_id, spec.key), 'last_seq': last, 'can_edit': True,
    }


def _template_error(template):
    if not isinstance(template, str) or not template.strip():
        return 'قالب شماره الزامی است.'
    if len(template) > MAX_TEMPLATE:
        return 'قالب شماره حداکثر ۱۰۰ نویسه است.'
    if any(t not in ALLOWED_TOKENS for t in TOKEN_RE.findall(template)) or TOKEN_RE.sub('', template).count('{') \
            or TOKEN_RE.sub('', template).count('}'):
        return 'قالب فقط نشانه‌های {period}، {prefix} و {seq} را می‌پذیرد.'
    if '{seq}' not in template or '{period}' not in template:
        return 'قالب باید هر دو نشانهٔ {seq} و {period} را داشته باشد.'
    return None


def _int_field(data, name, low, high):
    value = data.get(name)
    if isinstance(value, bool) or not isinstance(value, int) or not (low <= value <= high):
        raise ValueError(name)
    return value


class SeriesListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, company_id):
        company = _company_or_error(request, company_id)
        return Response({'company_id': company.pk,
                         'results': [_serialize_series(s, company.pk) for s in _managed_specs(request.user, company.pk)]})


class SeriesDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, company_id, series_key):
        company = _company_or_error(request, company_id)
        spec = series_specs().get(series_key)
        if spec is None:
            raise Http404
        if not can_manage_series(request.user, spec, company.pk):
            return Response({'detail': 'اجازهٔ تنظیم این سری شماره را ندارید.'}, status=status.HTTP_403_FORBIDDEN)
        data = request.data if isinstance(request.data, dict) else {}
        current = series_settings(company.pk, spec)
        template = data.get('template', current.template)
        error = _template_error(template)
        if error:
            return Response({'detail': error}, status=status.HTTP_400_BAD_REQUEST)
        prefix = data.get('prefix', current.prefix)
        if not isinstance(prefix, str) or len(prefix.strip()) > MAX_PREFIX or '{' in prefix or '}' in prefix:
            return Response({'detail': 'پیشوند حداکثر ۲۰ نویسه و بی‌آکولاد است.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            padding = _int_field({**{'seq_padding': current.seq_padding}, **data}, 'seq_padding', 0, MAX_PADDING)
        except ValueError:
            return Response({'detail': 'طول کمینهٔ شماره باید بین ۰ تا ۱۲ باشد.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            start = _int_field({**{'start_number': current.start_number}, **data}, 'start_number', 1, MAX_START)
        except ValueError:
            return Response({'detail': 'شمارهٔ شروع باید عددی مثبت باشد.'}, status=status.HTTP_400_BAD_REQUEST)
        period = spec.period_for(company.pk, timezone.now())
        with transaction.atomic():
            # قفل شمارندهٔ دورهٔ جاری تا صدور هم‌زمان بین سنجش و ذخیره شماره نگیرد
            counter_last = (NumberCounter.objects.select_for_update()
                            .filter(company=company, series_key=spec.key, period_key=period)
                            .values_list('last_seq', flat=True).first()) or 0
            issued_max = max(counter_last, (IssuedNumber.objects.filter(company=company, series_key=spec.key,
                                                                        period_key=period)
                                            .aggregate(m=Max('seq'))['m']) or 0)
            if 'start_number' in data and start <= issued_max:
                return Response({'detail': f'شمارهٔ شروع باید بیشتر از آخرین شمارهٔ صادرشدهٔ این دوره ({issued_max}) باشد.'},
                                status=status.HTTP_400_BAD_REQUEST)
            NumberSeriesConfig.objects.update_or_create(
                company=company, series_key=spec.key,
                defaults={'template': template.strip(), 'prefix': prefix.strip(), 'seq_padding': padding,
                          'start_number': start, 'updated_by': request.user},
            )
        return Response(_serialize_series(spec, company.pk))


class IssuedPagination(PageNumberPagination):
    page_size = 50


class IssuedListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, company_id):
        company = _company_or_error(request, company_id)
        keys = [s.key for s in _managed_specs(request.user, company.pk)]
        qs = (IssuedNumber.objects.filter(company=company, series_key__in=keys)
              .select_related('issued_by', 'voided_by').order_by('-issued_at', '-id'))
        params = request.query_params
        if params.get('series'):
            qs = qs.filter(series_key=params['series'])
        if params.get('status') in (IssuedNumber.STATUS_ACTIVE, IssuedNumber.STATUS_VOID):
            qs = qs.filter(status=params['status'])
        if params.get('period'):
            qs = qs.filter(period_key=params['period'])
        paginator = IssuedPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        return paginator.get_paginated_response([_serialize_issued(row) for row in page])


def _user_name(user):
    if user is None:
        return ''
    return (user.get_full_name() or '').strip() or user.get_username()


def _serialize_issued(row):
    return {
        'id': row.pk, 'series_key': row.series_key, 'display': row.display, 'period_key': row.period_key, 'seq': row.seq,
        'entity_kind': row.entity_kind, 'entity_id': row.entity_id, 'status': row.status,
        'issued_at': row.issued_at, 'issued_by': _user_name(row.issued_by), 'void_reason': row.void_reason,
        'voided_at': row.voided_at, 'voided_by': _user_name(row.voided_by),
    }
