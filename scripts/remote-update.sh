#!/usr/bin/env bash
# ==============================================================================
# Warehouse Management System - Remote Continuous Update Entrypoint
# Target OS: Ubuntu 22.04 / 24.04 LTS
# Note: Strictly ASCII / English to prevent encoding corruption.
# ==============================================================================
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
    echo "ERROR: This script must be executed as root (or with sudo)." >&2
    exit 1
fi

BUNDLE_PATH="${1:-/tmp/deploy_bundle.tar.gz}"
DOMAIN="${2:-soft.farsalish.ir}"
MAINTENANCE="${3:-0}"
DEPLOY_BIN="/usr/local/sbin/warehouse-deploy"

# If deploy_bundle.zip was uploaded by legacy caller, warn and abort
if [[ ! -f "$BUNDLE_PATH" && -f "/tmp/deploy_bundle.zip" ]]; then
    echo "ERROR: Legacy deploy_bundle.zip found. Modern deployment requires POSIX tar.gz." >&2
    exit 1
fi

if [[ -f "$DEPLOY_BIN" ]]; then
    echo "--> Executing atomic deployment orchestrator ($DEPLOY_BIN)..."
    exec "$DEPLOY_BIN" "$BUNDLE_PATH" "$DOMAIN" "$MAINTENANCE"
else
    echo "ERROR: Deployment orchestrator $DEPLOY_BIN not found. Please run initial setup first." >&2
    exit 1
fi
