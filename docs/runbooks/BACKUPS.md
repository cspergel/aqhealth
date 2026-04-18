# Backups — Postgres

AQSoft Health stores PHI. HIPAA §164.308(a)(7) requires a contingency plan
covering data backup, disaster recovery, and tested restore. This runbook
documents what to run, when, and how to verify.

## Frequency

| Artifact | Cadence | RPO | RTO |
|---|---|---|---|
| Postgres logical dump | nightly 02:00 UTC | 24 h | ≤ 1 h |
| Postgres WAL (PITR) | continuous | 5 min | ≤ 1 h |
| Uploads directory | weekly | 7 d | ≤ 4 h |

Nightly dumps cover the common restore case. WAL archiving covers
point-in-time recovery for ransomware / accidental-delete scenarios.

## Script

`scripts/backup_postgres.sh` does logical dumps. Minimal wiring:

```bash
# On the backup host (/etc/cron.d/aqsoft-backup)
0 2 * * * backup-user \
    PG_HOST=postgres.internal PG_USER=aqsoft PG_DATABASE=aqsoft_health \
    PGPASSWORD_FILE=/etc/aqsoft/pgpass \
    BACKUP_S3_BUCKET=s3://aqsoft-backups-prod/pg \
    BACKUP_ENCRYPTION_KEYFILE=/etc/aqsoft/backup.age.key \
    BACKUP_RETENTION_DAYS=14 \
    /opt/aqsoft/scripts/backup_postgres.sh >> /var/log/aqsoft-backup.log 2>&1
```

## At-rest encryption

All dumps leaving the Postgres host must be encrypted. The script supports
two modes:
- `age` (recommended) — modern, small key, composable with S3 SSE
- `gpg` — older, ubiquitous, fine if age isn't available

Generate the age key once on a secure host:
```bash
age-keygen -o /etc/aqsoft/backup.age.key
chmod 400 /etc/aqsoft/backup.age.key
```

The public key can live in the script env (`AGE_RECIPIENT`) so dumps are
encrypted with a public key operators can distribute widely; only the
private key (in a secret vault) can decrypt. For restore drills, the
on-call team pulls the private key from the vault.

## WAL archiving (PITR)

Out of scope for this script — it's a Postgres config change. In
`postgresql.conf`:
```
archive_mode = on
archive_command = 'aws s3 cp %p s3://aqsoft-backups-prod/wal/%f --sse AES256'
wal_level = replica
```

## Restore drill

Run monthly. Document the result in the ops journal.

```bash
# 1. Pull the latest dump
aws s3 ls s3://aqsoft-backups-prod/pg/ | tail -3
aws s3 cp s3://aqsoft-backups-prod/pg/aqsoft_<stamp>.sql.gz.age /tmp/
age -d -i /etc/aqsoft/backup.age.key -o /tmp/restore.sql.gz /tmp/aqsoft_<stamp>.sql.gz.age

# 2. Restore into a disposable Postgres
docker run --name pg-restore -e POSTGRES_PASSWORD=restore -p 5450:5432 -d postgres:16-alpine
zcat /tmp/restore.sql.gz | psql "postgresql://postgres:restore@localhost:5450/postgres"

# 3. Spot-check
psql "postgresql://postgres:restore@localhost:5450/aqsoft_health" -c "
    SELECT schema_name FROM platform.tenants ORDER BY 1;
"

# 4. Tear down
docker rm -f pg-restore
rm /tmp/restore.sql.gz /tmp/aqsoft_*.sql.gz.age
```

## Alarms

The backup cron line should pipe to a monitor that pages on non-zero exit
AND on absence (no dump uploaded in the last 26 hours). Minimal
implementation: a Lambda / Cloud Function that lists the bucket each hour
and alerts if the newest object is older than 26 h.

## Per-tenant restore

The logical dump restores the whole cluster — every tenant schema. For a
single-tenant restore (e.g., recovering from a tenant-scoped mistake),
dump and restore by schema:

```bash
# Dump one tenant
pg_dump --schema="pinellas_mso" ... > /tmp/pinellas.sql

# Restore: drop + recreate the schema, then load
psql ... -c "DROP SCHEMA pinellas_mso CASCADE;"
psql ... < /tmp/pinellas.sql
```

Confirm with the tenant before running a partial restore — some tables
(e.g., `audit_log` in `platform`) are shared.

## Out of scope

- Redis persistence is already configured in `docker-compose.yml`
  (`--save 60 1` + `redisdata` volume). If Redis state matters beyond
  work-queue durability, add an explicit RDB backup.
- DuckDB per-tenant Tuva files live on the worker host filesystem; back
  them up alongside the uploads directory.
