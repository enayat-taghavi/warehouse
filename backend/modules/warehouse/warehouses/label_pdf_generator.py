"""
Label PDF Generator
Generates printable PDF labels with QR codes using reportlab.
"""
import io
import os
import qrcode
from datetime import datetime
import arabic_reshaper
from bidi.algorithm import get_display

from reportlab.lib.pagesizes import A4, A3
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT

# Try to register a Persian-compatible font
_FONT_REGISTERED = False
_FONT_NAME = 'Helvetica'  # fallback

def _register_font():
    global _FONT_REGISTERED, _FONT_NAME
    if _FONT_REGISTERED:
        return

    # Try common Persian font paths
    font_candidates = [
        # Bundled with project
        os.path.join(os.path.dirname(__file__), 'fonts', 'Vazirmatn-Regular.ttf'),
        # Windows system fonts
        r'C:\Windows\Fonts\tahoma.ttf',
        r'C:\Windows\Fonts\BNazanin.ttf',
        r'C:\Windows\Fonts\arial.ttf',
    ]

    for path in font_candidates:
        if os.path.exists(path):
            try:
                font_name = os.path.splitext(os.path.basename(path))[0]
                pdfmetrics.registerFont(TTFont(font_name, path))
                _FONT_NAME = font_name
                _FONT_REGISTERED = True
                return
            except Exception:
                continue

    _FONT_REGISTERED = True  # mark as attempted


class LabelPdfGenerator:
    def __init__(self, template, items, custom_remark='', print_settings=None):
        """
        template: LabelTemplate model instance
        items: list of Item model instances
        custom_remark: string for __custom_remark__ field
        print_settings: dict containing temporary layout/paper overrides
        """
        self.template = template
        self.items = items
        self.custom_remark = custom_remark
        self.print_settings = print_settings or {}

    def generate(self):
        """Generate PDF and return BytesIO buffer."""
        _register_font()

        buffer = io.BytesIO()

        paper_type = self.print_settings.get('paper_type', self.template.paper_type)
        margin_mm_val = float(self.print_settings.get('margin_mm', self.template.margin_mm))
        landscape_mode = bool(self.print_settings.get('landscape', False))
        scale_pct = float(self.print_settings.get('scale', 100))
        scale_factor = max(0.5, min(1.5, scale_pct / 100.0))

        # Label dimensions from template, adjusted by scale
        width_mm = float(self.template.width_mm) * scale_factor
        height_mm = float(self.template.height_mm) * scale_factor

        if paper_type == 'roll':
            page_size = (width_mm * mm, height_mm * mm)
            margin_mm_val = 0
        elif paper_type == 'A3':
            page_size = A3
        else:
            page_size = A4

        if landscape_mode and paper_type != 'roll':
            from reportlab.lib.pagesizes import landscape as rl_landscape
            page_size = rl_landscape(page_size)

        c = canvas.Canvas(buffer, pagesize=page_size)
        page_w, page_h = page_size

        if paper_type == 'roll':
            # One label per page for roll printers
            for item in self.items:
                self._draw_label(c, item, 0, 0, width_mm * mm, height_mm * mm, scale_factor)
                c.showPage()
        else:
            # Auto-calculate grid from page size and label dimensions
            label_w = width_mm * mm
            label_h = height_mm * mm
            margin = margin_mm_val * mm

            # We want a gap equal to `margin` between labels. 
            # Number of cols: (cols * label_w) + (cols-1)*margin <= page_w - 2*margin
            # => cols * (label_w + margin) - margin <= page_w - 2*margin
            # => cols * (label_w + margin) <= page_w - margin
            # cols = int((page_w - margin) / (label_w + margin))
            
            usable_w = page_w - margin
            usable_h = page_h - margin

            cols = max(1, int(usable_w / (label_w + margin)))
            rows = max(1, int(usable_h / (label_h + margin)))

            # Center the grid on the page
            total_w = cols * label_w + (cols - 1) * margin
            total_h = rows * label_h + (rows - 1) * margin
            
            offset_x = (page_w - total_w) / 2
            offset_y = page_h - (page_h - total_h) / 2 - label_h

            item_index = 0
            while item_index < len(self.items):
                for row in range(rows):
                    for col in range(cols):
                        if item_index >= len(self.items):
                            break
                        x = offset_x + col * (label_w + margin)
                        y = offset_y - row * (label_h + margin)
                        self._draw_label(c, self.items[item_index], x, y, label_w, label_h, scale_factor)
                        item_index += 1
                    if item_index >= len(self.items):
                        break
                c.showPage()

        c.save()
        buffer.seek(0)
        return buffer

    def _draw_label(self, c, item, x, y, w, h, scale_factor):
        """Draw a single label at position (x, y) with dimensions (w, h)."""
        # Draw border
        c.setStrokeColorRGB(0.7, 0.7, 0.7)
        c.setLineWidth(0.5)
        c.rect(x, y, w, h)

        # Elements coordinates in DB are in mm, we convert to points (mm = 2.8346 pts)
        # Also apply the user scale_factor.
        scale_x = scale_factor * mm
        scale_y = scale_factor * mm

        for element in self.template.elements:
            el_type = element.get('type', 'text')
            el_x = x + element.get('x', 0) * scale_x
            el_y = y + h - element.get('y', 0) * scale_y - element.get('height', 10) * scale_y
            el_w = element.get('width', 30) * scale_x
            el_h = element.get('height', 10) * scale_y

            if el_type == 'qrcode':
                self._draw_qr(c, item, el_x, el_y, min(el_w, el_h))
            else:
                value = self._resolve_field(item, element.get('field', ''))
                font_size = element.get('fontSize', 9) * scale_factor
                font_weight = element.get('fontWeight', 'normal')

                font_name = _FONT_NAME
                if font_weight == 'bold' and _FONT_NAME == 'Helvetica':
                    font_name = 'Helvetica-Bold'

                c.setFont(font_name, font_size)
                c.setFillColorRGB(0, 0, 0)

                # Simple text drawing (single line, clipped to element width)
                text = str(value) if value else ''
                prefix = element.get('prefix', '')
                suffix = element.get('suffix', '')
                
                # Combine them
                full_text = f"{prefix}{text}{suffix}"
                
                if full_text:
                    # Apply Persian text shaping and RTL directionality
                    try:
                        reshaped_text = arabic_reshaper.reshape(full_text)
                        full_text = get_display(reshaped_text)
                    except Exception as e:
                        pass # Fallback to original text if bidi fails

                    text_align = element.get('textAlign', 'right')
                    wrap_text = element.get('wrapText', False)

                    if wrap_text:
                        ta_map = {'center': TA_CENTER, 'left': TA_LEFT, 'right': TA_RIGHT}
                        alignment = ta_map.get(text_align, TA_RIGHT)
                        
                        style = ParagraphStyle(
                            name='LabelStyle',
                            fontName=font_name,
                            fontSize=font_size,
                            leading=font_size * 1.2,
                            alignment=alignment,
                            wordWrap='RTL'
                        )
                        p = Paragraph(full_text, style)
                        w, h_para = p.wrap(el_w, el_h)
                        
                        # Vertically center the paragraph within the element height
                        y_pos = el_y + (el_h - h_para) / 2
                        p.drawOn(c, el_x, y_pos)
                    else:
                        if text_align == 'center':
                            c.drawCentredString(el_x + el_w / 2, el_y + el_h / 2 - font_size / 3, full_text)
                        elif text_align == 'left':
                            c.drawString(el_x + 1 * mm, el_y + el_h / 2 - font_size / 3, full_text)
                        else:
                            # Right-aligned (for RTL)
                            c.drawRightString(el_x + el_w - 1 * mm, el_y + el_h / 2 - font_size / 3, full_text)

    def _draw_qr(self, c, item, x, y, size):
        """Draw QR code for the item."""
        qr_field = self.template.qr_source_field or 'fa_unic_code'
        
        # Resolve the field using the same logic as text elements to support dynamic fields
        qr_data = str(self._resolve_field(item, qr_field) or item.fa_unic_code)

        qr = qrcode.QRCode(version=1, box_size=10, border=1)
        qr.add_data(qr_data)
        qr.make(fit=True)
        qr_img = qr.make_image(fill_color="black", back_color="white")

        # Convert to ImageReader
        img_buffer = io.BytesIO()
        qr_img.save(img_buffer)
        img_buffer.seek(0)
        img = ImageReader(img_buffer)

        # Allocate 15% of the height for the text at the bottom
        text_height = size * 0.15
        img_size = size - text_height
        img_x = x + (size - img_size) / 2

        # Draw the image
        c.drawImage(img, img_x, y + text_height, width=img_size, height=img_size)

        # Draw the text centered below the QR code
        # Usually QR codes are English/digits, so Helvetica is safe.
        font_size = text_height * 0.8
        c.setFont(_FONT_NAME, font_size)
        c.setFillColorRGB(0, 0, 0)
        
        # Reshape text if it has Persian characters just in case
        try:
            reshaped_text = arabic_reshaper.reshape(qr_data)
            display_text = get_display(reshaped_text)
        except:
            display_text = qr_data
            
        c.drawCentredString(x + size / 2, y + text_height * 0.2, display_text)

    def _resolve_field(self, item, field_key):
        """Resolve a field key to its value from the Item."""
        if not field_key:
            return ''

        # Special fields
        if field_key == '__print_date__':
            try:
                import jdatetime
                return jdatetime.datetime.now().strftime('%Y/%m/%d %H:%M')
            except ImportError:
                return datetime.now().strftime('%Y/%m/%d %H:%M')

        if field_key == '__warehouse_name__':
            return item.warehouse.name if item.warehouse else ''

        if field_key == '__project_name__':
            return item.warehouse.project_name if item.warehouse else ''

        if field_key == '__custom_remark__':
            return self.custom_remark

        # Dynamic fields
        if field_key.startswith('dynamic__'):
            real_key = field_key[len('dynamic__'):]
            return (item.dynamic_data or {}).get(real_key, '')

        # Static Item fields
        return getattr(item, field_key, '')
