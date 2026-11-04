"""
تست‌های ل-ح (ن۱۷، ن۱۲، ن۹): چاپ نامه با سربرگ A4/A5، امضای امضانکرده، صحت‌سنجی عمومی، 404 بی‌دسترسی،
قاعدهٔ پیوست پس از ثبت (مسیر scan) و تصویرهای تنظیم نامه. اجرا با WH_MODULES=warehouse,accounting,letters.
"""
import io
import shutil
import tempfile
from dataclasses import replace

import PIL.Image
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone

from attachments.models import Attachment
from platform_core.registry import can_attach, can_view
from reports.document_pdf import verify_token
from settings_core.models import CompanySetting

from letters.models import LETTER_ENTITY, SECRETARIAT_ENTITY, Letter, LetterRecipient, LetterSigner
from letters.printing import letter_verify_summary, printable_letter
from letters.tests.test_api_lc import ApiBase


def png(color, size=(210, 297)):
    buf = io.BytesIO()
    PIL.Image.new('RGB', size, color).save(buf, format='PNG')
    return buf.getvalue()


class PrintBase(ApiBase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls._media = tempfile.mkdtemp(prefix='letters_lh_')
        cls._media_override = override_settings(MEDIA_ROOT=cls._media)
        cls._media_override.enable()

    @classmethod
    def tearDownClass(cls):
        cls._media_override.disable()
        shutil.rmtree(cls._media, ignore_errors=True)
        super().tearDownClass()

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.settings_admin = cls.member('l_settings', cls.co_a)
        cls.grant(cls.settings_admin, cls.co_a, 'perm_letters_settings')

    def asset(self, data, company=None, name='head.png'):
        company = company or self.co_a
        return Attachment.objects.create(company_id=company.pk, entity_kind=SECRETARIAT_ENTITY,
                                         entity_id=str(company.pk), file=SimpleUploadedFile(name, data))

    def set_setting(self, key, value, company=None):
        CompanySetting.objects.update_or_create(company_id=(company or self.co_a).pk, module='letters', key=key,
                                                defaults={'value': value})

    def printable(self, **kw):
        letter = self.registered(**kw)
        LetterRecipient.objects.create(letter=letter, target_type='user', user=self.reader)
        return letter

    def pdf(self, user, letter, size='A4'):
        return self.api(user).get(f'/api/print/{LETTER_ENTITY}/{letter.pk}/pdf/?size={size}')


class LetterheadTests(PrintBase):
    def test_a4_and_a5_letterheads_follow_requested_size(self):
        a4, a5 = png('red'), png('blue', (148, 210))
        self.set_setting('letterhead_a4', self.asset(a4).pk)
        self.set_setting('letterhead_a5', self.asset(a5).pk)
        letter = self.printable(body=[{'type': 'paragraph', 'runs': [{'text': 'سلام'}]}])
        doc = printable_letter(self.fresh(self.reader), letter.pk)
        self.assertEqual(doc.letterhead_image, a4)
        self.assertEqual(replace(doc, size='A5').letterhead_image, a5)
        self.assertEqual(replace(doc, size='A4').letterhead_image, a4)
        for size in ('A4', 'A5'):
            res = self.pdf(self.reader, letter, size)
            self.assertEqual(res.status_code, 200, size)
            self.assertTrue(res.content.startswith(b'%PDF'), size)

    def test_missing_size_falls_back_and_foreign_attachment_ignored(self):
        a4 = png('red')
        self.set_setting('letterhead_a4', self.asset(a4).pk)
        letter = self.printable()
        doc = printable_letter(self.fresh(self.reader), letter.pk)
        self.assertEqual(replace(doc, size='A5').letterhead_image, a4)
        # شناسهٔ پیوست شرکت دیگر یا پیوست بایگانی‌شده هرگز سربرگ نمی‌شود
        foreign = self.asset(png('green'), company=self.co_b)
        self.set_setting('letterhead_a4', foreign.pk)
        self.assertIsNone(printable_letter(self.fresh(self.reader), letter.pk).letterhead_image)
        own = self.asset(a4)
        Attachment.objects.filter(pk=own.pk).update(archived_at=timezone.now())
        self.set_setting('letterhead_a4', own.pk)
        self.assertIsNone(printable_letter(self.fresh(self.reader), letter.pk).letterhead_image)

    def test_label_fallback_and_pixel_bomb(self):
        a4 = png('red')
        own = self.asset(a4)
        Attachment.objects.filter(pk=own.pk).update(label='letterhead_a4')
        letter = self.printable()
        self.assertEqual(printable_letter(self.fresh(self.reader), letter.pk).letterhead_image, a4)
        huge = self.asset(png('white', (6000, 5000)))
        self.set_setting('letterhead_a4', huge.pk)
        self.assertIsNone(printable_letter(self.fresh(self.reader), letter.pk).letterhead_image)

    def test_stamp_is_composited_on_letterhead(self):
        a4 = png('white', (420, 594))
        self.set_setting('letterhead_a4', self.asset(a4).pk)
        self.set_setting('secretariat_stamp', self.asset(png('blue', (60, 60)), name='stamp.png').pk)
        doc = printable_letter(self.fresh(self.reader), self.printable().pk)
        self.assertNotEqual(doc.letterhead_image, a4)
        img = PIL.Image.open(io.BytesIO(doc.letterhead_image)).convert('RGB')
        self.assertEqual(img.size, (420, 594))
        self.assertEqual(img.getpixel((50, 100)), (0, 0, 255))  # زیر کادر شماره در بالا-چپ
        self.assertEqual(img.getpixel((400, 580)), (255, 255, 255))


class BodyAndSignerTests(PrintBase):
    def test_blocks_become_paragraphs_and_tables(self):
        letter = self.printable(body=[
            {'type': 'paragraph', 'align': 'center', 'runs': [{'text': 'بند '}, {'text': 'یک', 'bold': True}]},
            {'type': 'list', 'style': 'ordered', 'items': [[{'text': 'الف'}], [{'text': 'ب'}]]},
            {'type': 'list', 'style': 'bullet', 'items': [[{'text': 'ج'}]]},
            {'type': 'table', 'header': True, 'rows': [['ستون۱', 'ستون۲'], ['x']]},
        ])
        doc = printable_letter(self.fresh(self.reader), letter.pk)
        self.assertEqual(doc.paragraphs, ['بند یک', '۱. الف', '۲. ب', '• ج'])
        self.assertEqual(doc.extra_tables[0].headers, ['ستون۱', 'ستون۲'])
        self.assertEqual(doc.extra_tables[0].rows, [['x', '']])
        self.assertEqual(doc.title, 'نامهٔ داخلی')  # عنوان نوع نامه است، نه موضوع (توکن QR خواناست)
        self.assertIn(('موضوع', letter.subject), doc.info_pairs)

    def test_only_actual_electronic_signer_is_signed(self):
        letter = self.printable()
        LetterSigner.objects.create(letter=letter, user=self.signer, order=0, status=LetterSigner.STATUS_SIGNED,
                                    signed_at=timezone.now())
        LetterSigner.objects.create(letter=letter, user=self.coauthor, order=1)
        doc = printable_letter(self.fresh(self.reader), letter.pk)
        self.assertEqual([(s.user_id, s.signed) for s in doc.signers],
                         [(self.signer.pk, True), (self.coauthor.pk, False)])
        Letter.objects.filter(pk=letter.pk).update(sign_mode=Letter.SIGN_WET)
        doc = printable_letter(self.fresh(self.reader), letter.pk)
        self.assertEqual([s.signed for s in doc.signers], [False, False])


class PrintAccessTests(PrintBase):
    def test_no_access_other_company_and_draft_are_404(self):
        letter = self.printable()
        self.assertEqual(self.pdf(self.stranger, letter).status_code, 404)
        self.assertEqual(self.pdf(self.outsider, letter).status_code, 404)
        self.assertIsNone(printable_letter(self.fresh(self.stranger), letter.pk))
        draft = self.letter()
        self.assertEqual(self.pdf(self.author, draft).status_code, 404)
        Letter.objects.filter(pk=letter.pk).update(status=Letter.STATUS_VOID)
        self.assertEqual(self.pdf(self.reader, letter).status_code, 404)
        incoming = self.registered(kind=Letter.KIND_INCOMING, number_display='1405/و/1')
        self.assertEqual(self.pdf(self.secretary, incoming).status_code, 404)

    def test_actions(self):
        letter = self.printable()
        LetterSigner.objects.create(letter=letter, user=self.signer)
        actions = self.api(self.signer).get(f'/api/letters/{letter.pk}/').json()['actions']
        self.assertIn('print', actions)
        self.assertIn('upload_scan', actions)
        self.assertNotIn('attach', actions)
        reader = self.api(self.reader).get(f'/api/letters/{letter.pk}/').json()['actions']
        self.assertIn('print', reader)
        self.assertNotIn('upload_scan', reader)
        self.assertEqual(self.api(self.admin).get(f'/api/letters/{letter.pk}/').json()['actions'], ['print'])
        draft = self.api(self.author).get(f'/api/letters/{self.letter().pk}/').json()['actions']
        self.assertIn('attach', draft)
        self.assertNotIn('print', draft)
        self.assertNotIn('upload_scan', draft)


class VerifyTests(PrintBase):
    def verify(self, letter, confidential=False):
        token = verify_token(LETTER_ENTITY, letter.pk, letter.number_display, company_id=letter.company_id,
                             title='نامهٔ داخلی', date='1405/08/14', confidential=confidential)
        res = self.client.get(f'/api/public/verify/{token}/')
        self.assertEqual(res.status_code, 200)
        return res.json()

    def test_normal_letter_live_summary(self):
        letter = self.printable()
        data = self.verify(letter)
        self.assertEqual(data['company_name'], self.co_a.name)
        self.assertEqual(data['current']['number'], letter.number_display)
        self.assertEqual(data['current']['status'], 'ثبت‌شده')
        self.assertNotIn(letter.subject, str(data))
        Letter.objects.filter(pk=letter.pk).update(status=Letter.STATUS_VOID)
        self.assertEqual(self.verify(letter)['current']['status'], 'باطل')

    def test_confidential_shows_only_number(self):
        letter = self.printable(confidentiality=Letter.CONF_SECRET, number_display='1405/س/2')
        self.assertEqual(self.verify(letter, confidential=True), {'valid': True, 'number': '1405/س/2'})
        self.assertEqual(set(letter_verify_summary(letter.pk)), {'exists', 'company_id', 'number'})

    def test_missing_letter(self):
        self.assertEqual(letter_verify_summary(987654), {'exists': False})
        self.assertEqual(letter_verify_summary('x'), {'exists': False})


class ScanRuleTests(PrintBase):
    def upload(self, user, letter, label='signed_scan', via='scan'):
        f = SimpleUploadedFile('scan.pdf', b'%PDF-1.4 test', content_type='application/pdf')
        client = self.api(user)
        if via == 'scan':
            return client.post(f'/api/letters/{letter.pk}/scan/', {'file': f, 'label': label}, format='multipart')
        return client.post('/api/attachments/', {'kind': LETTER_ENTITY, 'id': letter.pk, 'file': f, 'label': label},
                           format='multipart')

    def test_generic_api_closed_after_registration(self):
        draft = self.letter()
        self.assertEqual(self.upload(self.author, draft, label='', via='generic').status_code, 201)
        letter = self.printable()
        LetterSigner.objects.create(letter=letter, user=self.signer)
        for user in (self.author, self.signer, self.secretary):
            self.assertEqual(self.upload(user, letter, via='generic').status_code, 403, user.username)

    def test_scan_endpoint_labels_and_permissions(self):
        letter = self.printable()
        LetterSigner.objects.create(letter=letter, user=self.signer)
        res = self.upload(self.signer, letter)
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(Attachment.objects.get(pk=res.json()['id']).label, 'signed_scan')
        self.assertEqual(self.upload(self.secretary, letter, label='after_register').status_code, 201)
        self.assertEqual(self.upload(self.signer, letter, label='other').status_code, 400)
        self.assertEqual(self.upload(self.reader, letter).status_code, 403)  # می‌بیند ولی امضاکننده نیست
        self.assertEqual(self.upload(self.stranger, letter).status_code, 404)
        self.assertEqual(self.upload(self.outsider, letter).status_code, 404)
        self.assertEqual(self.upload(self.admin, letter).status_code, 403)
        self.assertEqual(self.upload(self.author, self.letter()).status_code, 403)  # پیش از ثبت: API عمومی
        Letter.objects.filter(pk=letter.pk).update(status=Letter.STATUS_VOID)
        self.assertEqual(self.upload(self.secretary, letter).status_code, 403)
        self.assertEqual(Attachment.objects.filter(entity_kind=LETTER_ENTITY, entity_id=str(letter.pk)).count(), 2)


class SettingsAssetTests(PrintBase):
    def test_asset_hooks(self):
        cid = self.co_a.pk
        self.assertTrue(can_attach(self.fresh(self.settings_admin), SECRETARIAT_ENTITY, cid))
        self.assertFalse(can_attach(self.fresh(self.secretary), SECRETARIAT_ENTITY, cid))
        self.assertFalse(can_attach(self.fresh(self.author), SECRETARIAT_ENTITY, cid))
        self.assertFalse(can_attach(self.fresh(self.settings_admin), SECRETARIAT_ENTITY, self.co_b.pk))
        self.assertTrue(can_view(self.fresh(self.settings_admin), SECRETARIAT_ENTITY, cid))
        self.assertTrue(can_view(self.fresh(self.secretary), SECRETARIAT_ENTITY, cid))
        self.assertFalse(can_view(self.fresh(self.author), SECRETARIAT_ENTITY, cid))
        self.assertFalse(can_view(self.fresh(self.outsider), SECRETARIAT_ENTITY, cid))
        self.assertFalse(can_attach(self.fresh(self.admin), SECRETARIAT_ENTITY, cid))

    def test_upload_and_setting_write(self):
        f = SimpleUploadedFile('head.png', png('red'), content_type='image/png')
        res = self.api(self.settings_admin).post('/api/attachments/', {'kind': SECRETARIAT_ENTITY, 'id': self.co_a.pk,
                                                                      'file': f}, format='multipart')
        self.assertEqual(res.status_code, 201, res.content)
        att = Attachment.objects.get(pk=res.json()['id'])
        self.assertEqual((att.company_id, att.storage), (self.co_a.pk, Attachment.STORAGE_SERVER))
        url = f'/api/settings/company/{self.co_a.pk}/'
        body = {'module': 'letters', 'key': 'letterhead_a4', 'value': att.pk}
        self.assertEqual(self.api(self.settings_admin).patch(url, body, format='json').status_code, 200)
        self.assertEqual(self.api(self.secretary).patch(url, body, format='json').status_code, 403)
