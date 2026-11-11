#!/usr/bin/env bash
set -euo pipefail
bin="${NEAR_SANDBOX_REAL_BIN:?set NEAR_SANDBOX_REAL_BIN to the near-sandbox binary}"
exec docker run --rm -i --init --network host \
  --label brinewar-sandbox=1 \
  -u "$(id -u):$(id -g)" \
  -v /tmp:/tmp -v "$HOME:$HOME" -v "$(dirname "$bin"):/opt/near-sandbox:ro" \
  -e HOME="$HOME" \
  ubuntu:24.04 "/opt/near-sandbox/$(basename "$bin")" "$@"
