#!/usr/bin/env python3
"""
Warehouse Deployment Runner
High-reliability deployment orchestrator using Paramiko and SFTP.
Strictly ASCII / English to prevent encoding corruption.
"""

import sys
import os
import json
import zipfile
import subprocess
from pathlib import Path
import paramiko

if sys.platform == "win32":
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass
    if hasattr(sys.stderr, "reconfigure"):
        try:
            sys.stderr.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
CONFIG_FILE = PROJECT_ROOT / "deploy_config.json"
BUNDLE_FILE = PROJECT_ROOT / "deploy_bundle.zip"

def log_step(msg: str):
    print(f"\n[STEP] {msg}")

def log_info(msg: str):
    print(f"[INFO] {msg}")

def log_success(msg: str):
    print(f"[SUCCESS] {msg}")

def log_warn(msg: str):
    print(f"[WARNING] {msg}")

def log_err(msg: str):
    print(f"[ERROR] {msg}")

def load_config() -> dict:
    if not CONFIG_FILE.exists():
        raise FileNotFoundError(f"Configuration file {CONFIG_FILE} not found.")
    with open(CONFIG_FILE, "r", encoding="utf-8-sig") as f:
        return json.load(f)

def build_frontend_if_needed(skip_build: bool = False):
    front_dir = PROJECT_ROOT / "warehouse-front"
    dist_index = front_dir / "dist" / "warehouse-app" / "browser" / "index.html"
    
    if skip_build and dist_index.exists():
        log_info(f"Skipping Angular compilation (-SkipBuild). Verified existing {dist_index}.")
        return

    log_step("Building Angular frontend in production mode...")
    cmd = ["cmd", "/c", "npm", "run", "build"]
    res = subprocess.run(cmd, cwd=str(front_dir), capture_output=True, text=True)
    if res.returncode != 0:
        log_err("Frontend build failed:\n" + res.stderr)
        sys.exit(1)
    
    if not dist_index.exists():
        log_err(f"Index.html not found after build at: {dist_index}")
        sys.exit(1)
    
    log_success("Frontend built successfully.")

def create_bundle() -> Path:
    log_step("Packaging application bundle into deploy_bundle.zip...")
    if BUNDLE_FILE.exists():
        BUNDLE_FILE.unlink()

    backend_dir = PROJECT_ROOT / "warehouse-backend"
    front_dist = PROJECT_ROOT / "warehouse-front" / "dist"
    scripts_dir = PROJECT_ROOT / "scripts"

    exclude_dirs = {"venv", "__pycache__", "backups", "logs", "media", "staticfiles", "scratch", "report_exports", ".git", ".pytest_cache"}
    
    with zipfile.ZipFile(BUNDLE_FILE, "w", zipfile.ZIP_DEFLATED) as zf:
        # 1. Backend files
        log_info("Adding backend files...")
        for root, dirs, files in os.walk(backend_dir):
            dirs[:] = [d for d in dirs if d not in exclude_dirs]
            rel_root = Path(root).relative_to(PROJECT_ROOT)
            for file in files:
                if file == ".env" or file.endswith(".pyc"):
                    continue
                file_path = Path(root) / file
                arc_name = rel_root / file
                zf.write(file_path, str(arc_name))

        # 2. Frontend dist
        log_info("Adding compiled frontend dist...")
        for root, dirs, files in os.walk(front_dist):
            rel_root = Path(root).relative_to(PROJECT_ROOT)
            for file in files:
                file_path = Path(root) / file
                arc_name = rel_root / file
                zf.write(file_path, str(arc_name))

        # 3. Scripts
        log_info("Adding provisioning scripts...")
        for root, dirs, files in os.walk(scripts_dir):
            if "__pycache__" in root:
                continue
            rel_root = Path(root).relative_to(PROJECT_ROOT)
            for file in files:
                file_path = Path(root) / file
                arc_name = rel_root / file
                zf.write(file_path, str(arc_name))

    size_mb = BUNDLE_FILE.stat().st_size / (1024 * 1024)
    log_success(f"Bundle created successfully ({size_mb:.2f} MB).")
    return BUNDLE_FILE

def get_ssh_client(config: dict) -> paramiko.SSHClient:
    key_path = Path(os.environ["USERPROFILE"]) / ".ssh" / "id_ed25519"
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    
    client.connect(
        hostname=config["ServerHost"],
        port=int(config.get("SshPort", 22)),
        username=config["SshUser"],
        key_filename=str(key_path) if key_path.exists() else None,
        timeout=15
    )
    if client.get_transport():
        client.get_transport().set_keepalive(15)
    return client

def upload_with_progress(sftp: paramiko.SFTPClient, local_path: Path, remote_path: str):
    total_size = local_path.stat().st_size
    filename = local_path.name
    
    def callback(transferred, total):
        pct = (transferred / total) * 100
        mb_transferred = transferred / (1024 * 1024)
        mb_total = total / (1024 * 1024)
        sys.stdout.write(f"\r[UPLOAD] {filename}: {mb_transferred:.1f}/{mb_total:.1f} MB ({pct:.1f}%)")
        sys.stdout.flush()

    sftp.put(str(local_path), remote_path, callback=callback)
    print()
    log_success(f"Uploaded {filename} -> {remote_path}")

def run_remote_command(client: paramiko.SSHClient, command: str) -> int:
    log_info(f"Executing: {command}")
    transport = client.get_transport()
    channel = transport.open_session()
    channel.set_combine_stderr(True)
    channel.exec_command(command)
    
    stdout = channel.makefile("r", -1)
    for line in stdout:
        try:
            sys.stdout.write(line)
            sys.stdout.flush()
        except Exception:
            clean = line.encode("ascii", errors="replace").decode("ascii")
            sys.stdout.write(clean)
            sys.stdout.flush()
        
    return channel.recv_exit_status()

def execute_setup(skip_build: bool = False):
    config = load_config()
    log_step(f"Starting Remote Server Provisioning on {config['ServerHost']}...")
    
    build_frontend_if_needed(skip_build)
    bundle_path = create_bundle()
    
    log_step("Connecting to remote server via SSH...")
    client = get_ssh_client(config)
    log_success(f"Connected to {config['SshUser']}@{config['ServerHost']}")
    
    try:
        sftp = client.open_sftp()
        log_step("Uploading deployment bundle and setup script...")
        upload_with_progress(sftp, bundle_path, "/tmp/deploy_bundle.zip")
        
        setup_script = PROJECT_ROOT / "scripts" / "remote-setup.sh"
        upload_with_progress(sftp, setup_script, "/tmp/remote-setup.sh")
        sftp.close()
        
        setup_args = f"'{config.get('Domain', '')}' '{config.get('AdminEmail', '')}' '{config.get('DbName', '')}' '{config.get('DbUser', '')}' '{config.get('DbPassword', '')}' '{config.get('DjangoSecretKey', '')}' '{config.get('AllowedHosts', '*')}' '{config.get('SshPort', 22)}'"
        remote_cmd = f"sudo chmod +x /tmp/remote-setup.sh && sudo /tmp/remote-setup.sh {setup_args}"
        
        log_step("Executing remote provisioning script...")
        exit_code = run_remote_command(client, remote_cmd)
        
        if exit_code == 0:
            log_success("Remote server provisioning completed successfully!")
            target_url = f"https://{config['Domain']}/" if config.get("Domain") else f"http://{config['ServerHost']}/"
            log_info(f"Application live at: {target_url}")
        else:
            log_err(f"Remote provisioning failed with exit code {exit_code}")
            sys.exit(exit_code)
            
    finally:
        client.close()
        if bundle_path.exists():
            bundle_path.unlink()

def execute_update(skip_build: bool = False):
    config = load_config()
    log_step(f"Starting Continuous Application Update on {config['ServerHost']}...")
    
    build_frontend_if_needed(skip_build)
    bundle_path = create_bundle()
    
    log_step("Connecting to remote server via SSH...")
    client = get_ssh_client(config)
    log_success(f"Connected to {config['SshUser']}@{config['ServerHost']}")
    
    try:
        sftp = client.open_sftp()
        log_step("Uploading update bundle and update script...")
        upload_with_progress(sftp, bundle_path, "/tmp/deploy_bundle.zip")
        
        update_script = PROJECT_ROOT / "scripts" / "remote-update.sh"
        upload_with_progress(sftp, update_script, "/tmp/remote-update.sh")
        sftp.close()
        
        remote_cmd = "sudo chmod +x /tmp/remote-update.sh && sudo /tmp/remote-update.sh"
        
        log_step("Executing remote update script...")
        exit_code = run_remote_command(client, remote_cmd)
        
        if exit_code == 0:
            log_success("Application update completed successfully!")
            target_url = f"https://{config['Domain']}/" if config.get("Domain") else f"http://{config['ServerHost']}/"
            log_info(f"Live system operational at: {target_url}")
        else:
            log_err(f"Application update failed with exit code {exit_code}")
            sys.exit(exit_code)
            
    finally:
        client.close()
        if bundle_path.exists():
            bundle_path.unlink()

def execute_status():
    config = load_config()
    client = get_ssh_client(config)
    try:
        cmd = "sudo systemctl status warehouse-backend nginx postgresql redis-server --no-pager && echo '--- Disk Usage ---' && df -h / && echo '--- Memory Usage ---' && free -h"
        run_remote_command(client, cmd)
    finally:
        client.close()

def execute_restart():
    config = load_config()
    client = get_ssh_client(config)
    try:
        cmd = "sudo systemctl restart warehouse-backend && sudo nginx -t && sudo systemctl reload nginx && sudo systemctl status warehouse-backend --no-pager"
        run_remote_command(client, cmd)
    finally:
        client.close()

def execute_logs():
    config = load_config()
    client = get_ssh_client(config)
    try:
        cmd = "sudo journalctl -u warehouse-backend -n 50 --no-pager"
        run_remote_command(client, cmd)
    finally:
        client.close()

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Warehouse Deployment Runner")
    parser.add_argument("--setup", action="store_true", help="Run full initial server setup")
    parser.add_argument("--update", action="store_true", help="Run fast application update")
    parser.add_argument("--status", action="store_true", help="View remote service status")
    parser.add_argument("--restart", action="store_true", help="Restart remote backend and nginx")
    parser.add_argument("--logs", action="store_true", help="View recent backend journal logs")
    parser.add_argument("--skip-build", action="store_true", help="Skip Angular build if dist already exists")
    
    args = parser.parse_args()
    
    if args.setup:
        execute_setup(skip_build=args.skip_build)
    elif args.update:
        execute_update(skip_build=args.skip_build)
    elif args.status:
        execute_status()
    elif args.restart:
        execute_restart()
    elif args.logs:
        execute_logs()
    else:
        parser.print_help()
