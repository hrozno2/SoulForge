#!/usr/bin/env bash
# The gates run before every commit that touches the engine or the interface (docs/CODE-GUIDE.md, section 7):
# the edition gate, Soul Forge against Aurora, the timeline and determinism checks, FastCharacter, parity, the unit
# tests, the type check and the end-to-end tests. Needs the test cache (~/.soulforge-test, or SOULFORGE_RULES).
# Prints "GATES fail=0" when everything passed; the exit code says the same.
cd "$(dirname "$0")/.." || exit 1
export SOULFORGE_RULES="${SOULFORGE_RULES:-$HOME/.soulforge-test}"
fail=0
t() {
  local name=$1 tier=$2; shift 2
  echo "== $name"
  RULES_TIER=$tier npx vitest run "$@" 2>&1 | grep -E "Tests |FAIL|AssertionError|^\s+[-+] " | cut -c1-220 | head -30
  [ "${PIPESTATUS[0]}" -eq 0 ] || fail=1
}
t editions editions src/engine/editions.test.ts
t aurora aurora src/engine/aurora.test.ts
t diff diff src/engine/timeline.diff.test.ts src/engine/determinism.test.ts
t fastchar fastchar src/aurora/fastchar.test.ts
t parity parity src/engine/parity.test.ts
t effect parity-effect src/engine/parityEffect.test.ts
sed -n 3p "$SOULFORGE_RULES/engine/parity.md" 2>/dev/null
sed -n 3p "$SOULFORGE_RULES/engine/parity-effect.md" 2>/dev/null
# The plain unit run, as CI has it: without the test cache, so the content suites skip (the tiers above ran them).
echo "== unit"; env -u SOULFORGE_RULES npx vitest run 2>&1 | grep -E "Tests |FAIL" | head -5; [ "${PIPESTATUS[0]}" -eq 0 ] || fail=1
echo "== tsc"; npx tsc --noEmit -p . 2>&1 | grep error | head -5; [ "${PIPESTATUS[0]}" -eq 0 ] || fail=1
if [ -z "$GATES_NO_E2E" ]; then echo "== e2e"; npx playwright test 2>&1 | tail -3; [ "${PIPESTATUS[0]}" -eq 0 ] || fail=1; fi
echo "GATES fail=$fail"
exit $fail
