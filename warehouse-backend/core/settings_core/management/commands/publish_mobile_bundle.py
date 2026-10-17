from datetime import datetime, timezone
from pathlib import Path
import shutil

from django.core.management.base import BaseCommand, CommandError

from settings_core.mobile_release import (
    is_valid_version,
    compute_sha256,
    write_manifest_atomically,
    get_updates_dir,
)


class Command(BaseCommand):
    help = "Publish a live-update zip bundle and update manifest.json atomically."
    suppressed_base_arguments = {'--version'}

    def add_base_argument(self, parser, *args, **kwargs):
        if '--version' in args:
            return
        super().add_base_argument(parser, *args, **kwargs)

    def add_arguments(self, parser):
        parser.add_argument(
            '--zip',
            required=True,
            type=str,
            help="Path to the bundle zip file",
        )
        parser.add_argument(
            '--version',
            dest='version',
            required=True,
            type=str,
            help="Bundle version in X.Y.Z format",
        )
        parser.add_argument(
            '--min-native',
            dest='min_native',
            required=True,
            type=str,
            help="Minimum compatible native app version in X.Y.Z format",
        )

    def handle(self, *args, **options):
        version = (options.get('version') or '').strip()
        min_native = (options.get('min_native') or '').strip()
        zip_arg = (options.get('zip') or options.get('zip_path') or '').strip()

        if not is_valid_version(version):
            raise CommandError(f"Invalid bundle version: '{version}'. Must match X.Y.Z format.")

        if not is_valid_version(min_native):
            raise CommandError(f"Invalid min-native version: '{min_native}'. Must match X.Y.Z format.")

        src_zip = Path(zip_arg)
        if not src_zip.is_file():
            raise CommandError(f"Bundle zip file not found: '{zip_arg}'.")

        if not src_zip.name.lower().endswith('.zip'):
            raise CommandError(f"Bundle file must have .zip extension, got: '{src_zip.name}'.")

        updates_dir = get_updates_dir()
        updates_dir.mkdir(parents=True, exist_ok=True)

        target_name = f"{version}.zip"
        target_path = updates_dir / target_name

        # Copy bundle zip to updates directory (never deletes older bundles)
        shutil.copy2(src_zip, target_path)

        sha256_hex = compute_sha256(target_path)
        published_at = datetime.now(timezone.utc).isoformat()

        manifest = {
            "version": version,
            "file": target_name,
            "sha256": sha256_hex,
            "min_native_version": min_native,
            "published_at": published_at,
        }

        write_manifest_atomically(manifest)

        self.stdout.write(
            self.style.SUCCESS(
                f"Successfully published bundle {version} (file: {target_name}, sha256: {sha256_hex})"
            )
        )
