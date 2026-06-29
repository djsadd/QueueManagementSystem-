#!/bin/sh
set -e

max_attempts="${MIGRATION_MAX_ATTEMPTS:-30}"
retry_delay="${MIGRATION_RETRY_DELAY_SECONDS:-2}"
attempt=1

while [ "$attempt" -le "$max_attempts" ]; do
    if alembic upgrade head; then
        exec "$@"
    fi

    echo "Alembic migration attempt $attempt/$max_attempts failed; retrying in ${retry_delay}s"
    attempt=$((attempt + 1))
    sleep "$retry_delay"
done

echo "Alembic migrations failed after $max_attempts attempts"
exit 1
