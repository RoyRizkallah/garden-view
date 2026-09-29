#!/bin/sh
# Applies any pending database migrations, then starts the server. Migrations are additive and
# recorded in the database, so running this on every start is safe.
set -e

if [ -z "$JWT_SECRET" ] || [ ${#JWT_SECRET} -lt 32 ]; then
  echo "JWT_SECRET must be set to a random value of at least 32 characters (see .env.example)." >&2
  exit 1
fi

echo "Applying database migrations..."
npx prisma migrate deploy

# first admin from ADMIN_EMAIL / ADMIN_PASSWORD, only if the database has none yet
node dist/bootstrap-admin.js

exec "$@"
