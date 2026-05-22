#!/usr/bin/env bash
# GEFO Postgres backup script.
#
# Dumps the database, gzip-compresses it, optionally uploads to a remote
# S3-compatible bucket via rclone, then prunes old backups.
#
# Designed to be run by systemd (see backup-db.service / backup-db.timer)
# or by cron. Idempotent and safe to re-run.
#
# Required environment variables (typically loaded from /etc/gefo/backup.env):
#
#   DATABASE_URL          Postgres connection string (matches backend/.env)
#   BACKUP_LOCAL_DIR      Where dumps live on the server (e.g., /var/backups/gefo)
#
# Optional environment variables:
#
#   BACKUP_REMOTE         rclone remote+path (e.g., "hetzner:gefo-backups").
#                         If empty, backups stay local only.
#   BACKUP_RETENTION_DAYS How many days of local dumps to keep (default: 30).
#                         Older dumps are deleted from BACKUP_LOCAL_DIR.
#   BACKUP_LOCK_FILE      Flock file to prevent concurrent runs.
#                         (Default: /var/lock/gefo-backup.lock)

set -euo pipefail

# ── Required env ────────────────────────────────────────────────
: "${DATABASE_URL:?DATABASE_URL must be set}"
: "${BACKUP_LOCAL_DIR:?BACKUP_LOCAL_DIR must be set}"

BACKUP_REMOTE="${BACKUP_REMOTE:-}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
BACKUP_LOCK_FILE="${BACKUP_LOCK_FILE:-/var/lock/gefo-backup.lock}"

# ── Lock (refuse to run twice in parallel) ──────────────────────
exec 9>"${BACKUP_LOCK_FILE}"
if ! flock -n 9; then
    echo "[backup] Another backup is in progress (lock: ${BACKUP_LOCK_FILE}). Exiting." >&2
    exit 0
fi

# ── Set up paths ────────────────────────────────────────────────
mkdir -p "${BACKUP_LOCAL_DIR}"

TIMESTAMP="$(date -u +%Y%m%d-%H%M%S)"
DUMP_NAME="gefo-${TIMESTAMP}.sql.gz"
DUMP_PATH="${BACKUP_LOCAL_DIR}/${DUMP_NAME}"

echo "[backup] $(date -Iseconds) starting"
echo "[backup] target: ${DUMP_PATH}"

# ── Dump + compress ─────────────────────────────────────────────
# --no-owner / --no-privileges: portable across hosts (no role-name baggage).
# --format=plain --compress=0: rely on gzip pipe so we can stream.
# stdout pipe avoids needing tmp space for the uncompressed dump.
pg_dump \
    --dbname="${DATABASE_URL}" \
    --no-owner \
    --no-privileges \
    --format=plain \
    | gzip -9 > "${DUMP_PATH}.tmp"

# Atomic rename only after the dump fully succeeds (`set -e` + the pipe
# tail catches gzip failure too).
mv "${DUMP_PATH}.tmp" "${DUMP_PATH}"

DUMP_SIZE="$(du -h "${DUMP_PATH}" | cut -f1)"
echo "[backup] dump complete: ${DUMP_SIZE}"

# ── Upload to remote (optional) ─────────────────────────────────
if [ -n "${BACKUP_REMOTE}" ]; then
    if ! command -v rclone >/dev/null 2>&1; then
        echo "[backup] rclone not installed — skipping remote upload" >&2
    else
        echo "[backup] uploading to ${BACKUP_REMOTE}/${DUMP_NAME}"
        rclone copy "${DUMP_PATH}" "${BACKUP_REMOTE}" --progress
        echo "[backup] upload complete"
    fi
fi

# ── Prune old local dumps ───────────────────────────────────────
# -mtime works in days; +N means strictly older than N days.
echo "[backup] pruning local dumps older than ${BACKUP_RETENTION_DAYS} days"
find "${BACKUP_LOCAL_DIR}" -maxdepth 1 -type f -name 'gefo-*.sql.gz' \
    -mtime "+${BACKUP_RETENTION_DAYS}" -print -delete

echo "[backup] $(date -Iseconds) done"
