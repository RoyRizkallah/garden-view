#!/bin/sh
# Run ONCE on your own computer: exports the 41 units (with the owner directory already imported)
# from the local development database into garden-view-units.sql, to load on the server.
# The file contains owners' personal data: copy it to the server over SSH (scp), load it,
# then delete it from both machines. It is git-ignored.
#
#   sh deploy/export-units.sh            (expects the local dev database container "garden-view-db")
set -e
OUT="garden-view-units.sql"
docker exec garden-view-db pg_dump -U garden_view -d garden_view \
  --data-only --table='"Unit"' --column-inserts --no-owner --no-privileges > "$OUT"
echo "Wrote $OUT ($(grep -c '^INSERT' "$OUT") units). Keep it private; delete it after loading."
