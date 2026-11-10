#!/usr/bin/env bash
# Everything short of the full check: the gates, then the imported characters on both content sets, the source,
# sweep and SRD tiers, and the unit tests once more. Needs the test cache (~/.soulforge-test, or SOULFORGE_RULES).
cd "$(dirname "$0")/.." || exit 1
export SOULFORGE_RULES="${SOULFORGE_RULES:-$HOME/.soulforge-test}" RULES_NOPDF=1
bash scripts/gates.sh
for s in 5etools aurora; do
  echo "== import $s"
  RULES_CONTENT=$s npx vitest run src/aurora/rules.suite.test.ts -t "imported characters" 2>&1 | grep -E "×|AssertionError|Tests " | head -20
done
for t in sources sweep srd-bundle srd-api; do
  echo "== $t"
  RULES_TIER=$t npx vitest run src/aurora/rules.suite.test.ts src/engine 2>&1 | grep -E "×|AssertionError|Tests |^\s+\+ " | head -12
done
echo "== unit"; npx vitest run 2>&1 | grep -E "×|FAIL|Tests " | head -20
