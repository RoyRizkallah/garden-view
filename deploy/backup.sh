#!/bin/sh
# Backs up the database and the owners' listing photos into ./backups/<date>/, keeping 14 days.
# Run from the project folder on the server; schedule it daily with cron, e.g.
#   15 3 * * *  cd /opt/garden-view && sh deploy/backup.sh >> backups/backup.log 2>&1
# Copy ./backups off the server regularly: a backup on the same disk does not survive the disk.
set -e
cd "$(dirname "$0")/.."
STAMP=$(date +%Y-%m-%d_%H%M)
DIR="backups/$STAMP"
mkdir -p "$DIR"

docker compose exec -T db pg_dump -U garden_view -d garden_view --format=custom > "$DIR/database.dump"
docker compose exec -T app tar -C /app -czf - uploads > "$DIR/uploads.tar.gz"

find backups -mindepth 1 -maxdepth 1 -type d -mtime +14 -exec rm -rf {} +
echo "$(date -Is) backup written to $DIR ($(du -sh "$DIR" | cut -f1))"

# Restore (into a running stack):
#   docker compose exec -T db pg_restore -U garden_view -d garden_view --clean --if-exists < backups/<date>/database.dump
#   docker compose exec -T app tar -C /app -xzf - < backups/<date>/uploads.tar.gz
