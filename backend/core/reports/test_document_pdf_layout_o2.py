from django.test import SimpleTestCase

from reports.document_pdf import DocTable, PrintableDocument, _doc_table, render_document_pdf


class DocumentPdfLayoutO2Tests(SimpleTestCase):
    def test_old_style_document_still_renders(self):
        doc_a4 = PrintableDocument(
            company_id=None,
            title='سند قدیمی',
            paragraphs=['بند اول متن آزمایشی'],
            table_headers=['ردیف', 'عنوان'],
            table_rows=[['۱', 'آیتم اول']],
            size='A4',
        )
        doc_a5 = PrintableDocument(
            company_id=None,
            title='سند قدیمی A5',
            paragraphs=['بند اول متن آزمایشی'],
            table_headers=['ردیف', 'عنوان'],
            table_rows=[['۱', 'آیتم اول']],
            size='A5',
        )
        a4_bytes = render_document_pdf(doc_a4)
        a5_bytes = render_document_pdf(doc_a5)
        self.assertTrue(a4_bytes.startswith(b'%PDF'))
        self.assertTrue(a5_bytes.startswith(b'%PDF'))

    def test_structured_document_renders(self):
        extra = DocTable(
            title='جدول اضافه',
            headers=['ردیف', 'توضیحات'],
            rows=[['۱', 'دادهٔ تستی']],
            col_widths=[1, 2],
            center_cols=[0],
        )
        doc_a4 = PrintableDocument(
            company_id=None,
            title='سند ساختاریافته',
            paragraphs=['توضیحات کلی'],
            table_headers=['ردیف', 'شرح', 'مبلغ'],
            table_rows=[['۱', 'خرید کالا', '۱۰۰ ریال']],
            table_col_widths=[1, 3, 2],
            table_center_cols=[0],
            info_pairs=[('شماره', '۱۲۳'), ('تاریخ', '۱۴۰۴/۰۸/۱۰'), ('وضعیت', 'تایید شده')],
            totals=[('جمع کل', '۱۰۰ ریال', False), ('مبلغ قابل پرداخت', '۱۰۰ ریال', True)],
            extra_tables=[extra],
            size='A4',
        )
        doc_a5 = PrintableDocument(
            company_id=None,
            title='سند ساختاریافته A5',
            paragraphs=['توضیحات کلی'],
            table_headers=['ردیف', 'شرح', 'مبلغ'],
            table_rows=[['۱', 'خرید کالا', '۱۰۰ ریال']],
            table_col_widths=[1, 3, 2],
            table_center_cols=[0],
            info_pairs=[('شماره', '۱۲۳'), ('تاریخ', '۱۴۰۴/۰۸/۱۰'), ('وضعیت', 'تایید شده')],
            totals=[('جمع کل', '۱۰۰ ریال', False), ('مبلغ قابل پرداخت', '۱۰۰ ریال', True)],
            extra_tables=[extra],
            size='A5',
        )
        a4_bytes = render_document_pdf(doc_a4)
        a5_bytes = render_document_pdf(doc_a5)
        self.assertTrue(a4_bytes.startswith(b'%PDF'))
        self.assertTrue(a5_bytes.startswith(b'%PDF'))

    def test_doc_table_widths(self):
        # helper with weights [1, 3] and content_w=400 gives column widths summing to 400
        # with the wider column on the LEFT (index 0 after RTL reversal is the last logical column)
        table = _doc_table(['H1', 'H2'], [['R1', 'R2']], 400, [1, 3], [])
        self.assertEqual(len(table._colWidths), 2)
        self.assertAlmostEqual(sum(table._colWidths), 400.0)
        self.assertAlmostEqual(table._colWidths[0], 300.0)
        self.assertAlmostEqual(table._colWidths[1], 100.0)
        self.assertGreater(table._colWidths[0], table._colWidths[1])

        # weights list of the wrong length gives equal widths
        table_wrong = _doc_table(['H1', 'H2'], [['R1', 'R2']], 400, [1, 2, 3], [])
        self.assertEqual(len(table_wrong._colWidths), 2)
        self.assertAlmostEqual(sum(table_wrong._colWidths), 400.0)
        self.assertAlmostEqual(table_wrong._colWidths[0], 200.0)
        self.assertAlmostEqual(table_wrong._colWidths[1], 200.0)

        # empty weights list gives equal widths
        table_empty = _doc_table(['H1', 'H2'], [['R1', 'R2']], 400, [], [])
        self.assertEqual(len(table_empty._colWidths), 2)
        self.assertAlmostEqual(sum(table_empty._colWidths), 400.0)
        self.assertAlmostEqual(table_empty._colWidths[0], 200.0)
        self.assertAlmostEqual(table_empty._colWidths[1], 200.0)
