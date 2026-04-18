#!/usr/bin/env bash
# backup_postgres.sh — nightly pg_dump with retention and optional S3 upload.
#
# Run via cron (or systemd timer) on the Postgres host or a trusted backup
# host with network access + pg_dump installed. The script fails loud on
# any missing env var; pair it with a monitor that pages on non-zero exit.
#
# Env:
#   BACKUP_DIR                Local directory for dumps (default /var/backups/aqsoft)
#   PG_HOST, PG_PORT, PG_USER, PG_DATABASE   Postgres connection
#   PGPASSWORD                Set via env or .pgpass (not CLI)
#   BACKUP_RETENTION_DAYS     Delete local dumps older than this (default 14)
#   BACKUP_S3_BUCKET          Optional — s3://bucket/prefix to sync dumps to
#   BACKUP_ENCRYPTION_KEYFILE Optional — AES-256 age/gpg keyfile for at-rest
#                              encryption. If set, dump is encrypted before S3.
#
# Usage:
#   bash scripts/backup_postgres.sh
#
# Exit codes:
#   0 — success
#   1 — env var missing
#   2 — pg_dump failure
#   3 — upload failure

set -euo pipefail

: "${PG_HOST:?PG_HOST not set}"
: "${PG_USER:?PG_USER not set}"
: "${PG_DATABASE:?PG_DATABASE not set}"
: "${PGPASSWORD:?PGPASSWORD not set (or configure ~/.pgpass)}"

PG_PORT="${PG_PORT:-5432}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/aqsoft}"
RETENTION="${BACKUP_RETENTION_DAYS:-14}"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
OUTFILE="${BACKUP_DIR}/aqsoft_${PG_DATABASE}_${TS}.sql.gz"

mkdir -p "${BACKUP_DIR}"

echo "[$(date -u)] pg_dump -> ${OUTFILE}"

# --format=custom would be faster but .sql.gz is grep-able + portable.
# --no-owner / --no-privileges let the dump restore into a freshly-created DB
# with different role names (useful for PITR drills).
if ! pg_dump \
        --host="${PG_HOST}" --port="${PG_PORT}" \
        --username="${PG_USER}" --dbname="${PG_DATABASE}" \
        --format=plain --clean --if-exists --no-owner --no-privileges \
        | gzip --rsyncable > "${OUTFILE}.partial"; then
    echo "pg_dump failed" >&2
    rm -f "${OUTFILE}.partial"
    exit 2
fi

mv "${OUTFILE}.partial" "${OUTFILE}"
echo "[$(date -u)] dump ok, size=$(du -h "${OUTFILE}" | awk '{print $1}')"

# -- Optional at-rest encryption -----------------------------------------
if [[ -n "${BACKUP_ENCRYPTION_KEYFILE:-}" ]]; then
    if command -v age >/dev/null 2>&1; then
        echo "[$(date -u)] encrypting with age"
        age -R "${BACKUP_ENCRYPTION_KEYFILE}" -o "${OUTFILE}.age" "${OUTFILE}"
        rm "${OUTFILE}"
        OUTFILE="${OUTFILE}.age"
    elif command -v gpg >/dev/null 2>&1; then
        echo "[$(date -u)] encrypting with gpg"
        gpg --batch --yes --cipher-algo AES256 \
            --symmetric --passphrase-file "${BACKUP_ENCRYPTION_KEYFILE}" \
            -o "${OUTFILE}.gpg" "${OUTFILE}"
        rm "${OUTFILE}"
        OUTFILE="${OUTFILE}.gpg"
    else
        echo "BACKUP_ENCRYPTION_KEYFILE is set but neither 'age' nor 'gpg' is installed" >&2
        exit 1
    fi
fi

# -- Optional S3 upload --------------------------------------------------
if [[ -n "${BACKUP_S3_BUCKET:-}" ]]; then
    if ! command -v aws >/dev/null 2>&1; then
        echo "BACKUP_S3_BUCKET is set but 'aws' CLI is not installed" >&2
        exit 3
    fi
    echo "[$(date -u)] uploading to ${BACKUP_S3_BUCKET}/"
    if ! aws s3 cp "${OUTFILE}" "${BACKUP_S3_BUCKET}/$(basename "${OUTFILE}")" \
            --storage-class STANDARD_IA \
            --server-side-encryption AES256; then
        echo "S3 upload failed" >&2
        exit 3
    fi
fi

# -- Local retention ------------------------------------------------------
echo "[$(date -u)] pruning backups older than ${RETENTION} days"
find "${BACKUP_DIR}" -type f \( -name "aqsoft_*.sql.gz" -o -name "aqsoft_*.sql.gz.age" -o -name "aqsoft_*.sql.gz.gpg" \) \
    -mtime +"${RETENTION}" -print -delete

echo "[$(date -u)] done"
