# GEFO database backup

Daily Postgres dumps with optional offsite upload. Designed to run as a
systemd timer on the production server.

## What this does

1. `pg_dump` of the `gefo_db` database, piped through `gzip -9`.
2. Optional `rclone copy` to a remote S3-compatible bucket.
3. Prunes local dumps older than `BACKUP_RETENTION_DAYS` (default 30).

A single `flock` lock prevents concurrent runs.

## One-time install

```bash
# 1. Dedicated unprivileged user
sudo useradd --system --no-create-home --shell /usr/sbin/nologin gefo-backup

# 2. Backup destination
sudo install -d -o gefo-backup -g gefo-backup /var/backups/gefo

# 3. Drop the script in place
sudo install -m 755 backup-db.sh /usr/local/bin/backup-db.sh

# 4. systemd units
sudo install -m 644 backup-db.service /etc/systemd/system/backup-db.service
sudo install -m 644 backup-db.timer   /etc/systemd/system/backup-db.timer

# 5. Env file (edit DATABASE_URL etc. first)
sudo install -d -m 750 -o root -g gefo-backup /etc/gefo
sudo install -m 640 -o root -g gefo-backup backup.env.example /etc/gefo/backup.env
sudoedit /etc/gefo/backup.env

# 6. Enable + start
sudo systemctl daemon-reload
sudo systemctl enable --now backup-db.timer
```

## Setting up the offsite copy (Hetzner / B2 / Wasabi / S3)

[rclone](https://rclone.org) is the recommended way. Run once:

```bash
sudo -u gefo-backup rclone config
```

…answer the prompts for your provider. Example for **Hetzner Object Storage**:

- Name: `hetzner`
- Storage: `s3` → "Other"
- Endpoint: `https://<region>.your-objectstorage.com`
- Access key / secret: from the Hetzner console
- Region: leave blank

Then in `/etc/gefo/backup.env`:

```
BACKUP_REMOTE=hetzner:gefo-backups
```

## Verifying it works

```bash
# Run on-demand
sudo systemctl start backup-db.service
sudo journalctl -u backup-db.service -n 100

# Check the timer is scheduled
systemctl list-timers backup-db.timer

# List local dumps
sudo ls -lh /var/backups/gefo/

# Verify a restore (on a scratch DB!)
gunzip -c /var/backups/gefo/gefo-<timestamp>.sql.gz | psql -d gefo_db_scratch
```

## Restoring

```bash
# 1. Drop and recreate the target DB on a recovery host
psql -U postgres -c "DROP DATABASE IF EXISTS gefo_db;"
psql -U postgres -c "CREATE DATABASE gefo_db OWNER gefo_user;"
psql -U postgres -d gefo_db -c "CREATE EXTENSION IF NOT EXISTS postgis;"

# 2. Restore from the dump
gunzip -c gefo-<timestamp>.sql.gz | psql -U gefo_user -d gefo_db
```

**Run a real restore drill at least once a quarter.** A backup that has
never been restored is not a backup — it's a hopeful prediction.

## What to do if the timer fails

```bash
# Most recent run details
systemctl status backup-db.service
journalctl -u backup-db.service -e

# Common causes:
# - DATABASE_URL wrong → pg_dump auth error
# - rclone remote misconfigured → upload fails (local dump still kept)
# - /var/backups/gefo full → write error
```

The script's lock file (`/var/lock/gefo-backup.lock`) is owned by the
`gefo-backup` user. If a stale lock blocks legitimate runs, delete it:

```bash
sudo rm /var/lock/gefo-backup.lock
```
