"""
ساخت کلید VAPID (EC P-256) برای وب‌پوش — د۹ طرح ۵.
روی فایل موجود نمی‌نویسد و فقط کلید عمومی را چاپ می‌کند؛ کلید خصوصی هرگز چاپ نمی‌شود.
"""
import base64
import os

from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Create a VAPID private key file (PEM, EC P-256) for web push; prints only the public key."

    def add_arguments(self, parser):
        parser.add_argument('--out', required=True, type=str, help="Path of the new PEM file (must not exist)")

    def handle(self, *args, **options):
        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.primitives.asymmetric import ec

        out = (options.get('out') or '').strip()
        if not out:
            raise CommandError("--out is required.")
        if os.path.exists(out):
            raise CommandError("Output file already exists; refusing to overwrite.")
        parent = os.path.dirname(os.path.abspath(out))
        if not os.path.isdir(parent):
            raise CommandError("Output folder does not exist.")

        private_key = ec.generate_private_key(ec.SECP256R1())
        pem = private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )
        # 'x' = فقط ساخت؛ اگر هم‌زمان فایلی ساخته شده باشد، رونویسی نمی‌شود
        try:
            with open(out, 'xb') as f:
                f.write(pem)
        except FileExistsError:
            raise CommandError("Output file already exists; refusing to overwrite.")

        raw = private_key.public_key().public_bytes(
            encoding=serialization.Encoding.X962,
            format=serialization.PublicFormat.UncompressedPoint,
        )
        public_key = base64.urlsafe_b64encode(raw).rstrip(b'=').decode('ascii')
        self.stdout.write("VAPID key file created.")
        self.stdout.write(f"Public key: {public_key}")
