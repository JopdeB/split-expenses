#!/usr/bin/env bash
# Opens an SSH tunnel from local port 5433 to the droplet's Postgres.
# Leave this running in a separate terminal while you do dev work; then
# .env.local uses DATABASE_URL=postgresql://.../@localhost:5433/... .
#
# The droplet's postgres is bound to the internal Docker network only
# (not published to the host), so we forward via the docker gateway.

set -euo pipefail

DROPLET=root@159.223.216.59
KEY=~/.ssh/admin_pap_droplet

echo "Opening SSH tunnel: localhost:5433 -> droplet Postgres (Ctrl+C to close)"
exec ssh -N -T \
  -i "$KEY" \
  -o ExitOnForwardFailure=yes \
  -o ServerAliveInterval=30 \
  -L 5433:127.0.0.1:5432 \
  "$DROPLET"
