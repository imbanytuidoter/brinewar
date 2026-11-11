#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
(cd "$root/contracts/game" && cargo near build non-reproducible-wasm)
cd "$root/contracts/sandbox"
cargo test --no-run --test gas
real="$(ls -d target/debug/build/near-sandbox-*/out/.near/near-sandbox-*/near-sandbox | head -1)"
if ldd "$real" 2>&1 | grep -q "not found"; then
  export NEAR_SANDBOX_REAL_BIN="$(cd "$(dirname "$real")" && pwd)/near-sandbox"
  export NEAR_SANDBOX_BIN_PATH="$root/scripts/near-sandbox-docker.sh"
fi
trap 'docker ps -q --filter label=brinewar-sandbox=1 | xargs -r docker rm -f >/dev/null' EXIT
cargo test --test gas -- --ignored --nocapture
