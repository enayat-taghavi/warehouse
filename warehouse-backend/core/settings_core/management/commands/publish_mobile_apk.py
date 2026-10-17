from pathlib import Path
import shutil

from django.core.management.base import BaseCommand, CommandError

from settings_core.mobile_release import (
    is_valid_version,
    get_apk_dir,
)


CHANNELS = ('direct', 'bazaar', 'myket')
ENVIRONMENTS = ('prod', 'staging')


class Command(BaseCommand):
    help = "Publish a mobile APK file to the media apk folder and output its public URL path."
    suppressed_base_arguments = {'--version'}

    def add_base_argument(self, parser, *args, **kwargs):
        if '--version' in args:
            return
        super().add_base_argument(parser, *args, **kwargs)

    def add_arguments(self, parser):
        parser.add_argument(
            '--apk',
            required=True,
            type=str,
            help="Path to the APK file",
        )
        parser.add_argument(
            '--version',
            dest='version',
            required=True,
            type=str,
            help="APK version in X.Y.Z format",
        )
        parser.add_argument(
            '--channel',
            dest='channel',
            required=True,
            type=str,
            choices=CHANNELS,
            help="Distribution channel (direct, bazaar, myket)",
        )
        parser.add_argument(
            '--env',
            dest='env',
            required=True,
            type=str,
            choices=ENVIRONMENTS,
            help="Target environment (prod, staging)",
        )

    def handle(self, *args, **options):
        apk_arg = (options.get('apk') or options.get('apk_path') or '').strip()
        version = (options.get('version') or '').strip()
        channel = (options.get('channel') or '').strip()
        env = (options.get('env') or '').strip()

        if not is_valid_version(version):
            raise CommandError(f"Invalid APK version: '{version}'. Must match X.Y.Z format.")

        if channel not in CHANNELS:
            raise CommandError(f"Invalid channel: '{channel}'. Supported: {', '.join(CHANNELS)}.")

        if env not in ENVIRONMENTS:
            raise CommandError(f"Invalid environment: '{env}'. Supported: {', '.join(ENVIRONMENTS)}.")

        src_apk = Path(apk_arg)
        if not src_apk.is_file():
            raise CommandError(f"APK file not found: '{apk_arg}'.")

        if not src_apk.name.lower().endswith('.apk'):
            raise CommandError(f"APK file must have .apk extension, got: '{src_apk.name}'.")

        if env == 'prod':
            target_filename = f"CoManage-{version}-{channel}.apk"
        else:
            target_filename = f"CoManage-{version}-{channel}-test.apk"

        apk_dir = get_apk_dir()
        apk_dir.mkdir(parents=True, exist_ok=True)

        target_path = apk_dir / target_filename
        shutil.copy2(src_apk, target_path)

        public_url_path = f"/api/public/mobile-files/apk/{target_filename}"
        self.stdout.write(public_url_path)
