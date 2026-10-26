from django.conf import settings
from django.db import models
from django.db.models import Q


class ExternalParty(models.Model):
    """
    طرف بیرونی یک شرکت (ص۱ طرح ۳.۱): شخص حقیقی یا حقوقی بیرون از سازمان با هویت و تماسش.
    نقش کاری (طرف حساب مالی، طرف نامه …) مال ماژول‌هاست و با کلید به همین ردیف وصل می‌شود.
    """
    KIND_PERSON = 'person'
    KIND_LEGAL = 'legal'
    KIND_CHOICES = (
        (KIND_PERSON, 'حقیقی'),
        (KIND_LEGAL, 'حقوقی'),
    )

    company = models.ForeignKey('companies.Company', on_delete=models.PROTECT, related_name='external_parties',
                                verbose_name='شرکت')
    kind = models.CharField(max_length=10, choices=KIND_CHOICES, default=KIND_PERSON, verbose_name='حقیقی / حقوقی')
    name = models.CharField(max_length=200, verbose_name='نام شخص یا شرکت')
    national_id = models.CharField(max_length=11, null=True, blank=True,
                                   verbose_name='کد ملی (حقیقی) / شناسهٔ ملی (حقوقی)')
    economic_code = models.CharField(max_length=20, blank=True, default='', verbose_name='کد اقتصادی')
    registration_number = models.CharField(max_length=20, blank=True, default='', verbose_name='شمارهٔ ثبت')
    phone = models.CharField(max_length=20, blank=True, default='', verbose_name='تلفن')
    mobile = models.CharField(max_length=20, blank=True, default='', verbose_name='موبایل')
    email = models.EmailField(blank=True, default='', verbose_name='ایمیل')
    address = models.TextField(blank=True, default='', verbose_name='نشانی')
    postal_code = models.CharField(max_length=10, blank=True, default='', verbose_name='کد پستی')
    notes = models.TextField(blank=True, default='', verbose_name='یادداشت')
    is_active = models.BooleanField(default=True, verbose_name='فعال')
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name='+', verbose_name='ثبت‌کننده')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'طرف بیرونی'
        verbose_name_plural = 'طرف‌های بیرونی'
        ordering = ['name']
        constraints = [
            models.UniqueConstraint(fields=['company', 'national_id'], condition=Q(national_id__isnull=False),
                                    name='contacts_party_unique_company_national_id'),
        ]
        indexes = [
            models.Index(fields=['company', 'name'], name='contacts_party_company_name'),
        ]

    def __str__(self):
        return self.name
