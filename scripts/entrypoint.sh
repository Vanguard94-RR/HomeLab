#!/bin/sh

# Copy host config (read-only mount) into the container volume and set ownership to root:root
set -e
cp -a /host-config/. /app/config || true
chown -R root:root /app/config || true

# Execute the original image entrypoint with any args
exec /usr/local/bin/docker-entrypoint.sh "$@"
