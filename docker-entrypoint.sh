#!/bin/sh
set -e

# Clean browser session and cookies on every container start (clean deploy).
# The named volumes cookies:/cookies and browser-profile:/profile otherwise
# survive container recreation and carry stale state into a new deploy.
for dir in /cookies /profile; do
  if [ -d "$dir" ]; then
    find "$dir" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
  fi
done

exec "$@"
