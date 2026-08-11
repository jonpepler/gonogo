#!/usr/bin/env bash
# Proves the design in four steps:
#   1. the prototype typechecks (positives compile, every expect-error
#      directive is doing real work: an unused one is a tsc error)
#   1b. the sealed contributor compiles with ONLY src/sdk + src/contributor in
#      its program: slot keys and entry types reached it through the sdk alone
#   2. the same tree with the suppressions stripped FAILS, printing the real
#      diagnostics a contributor or widget author would see
#   3. the runtime half: mounting the component is what creates the slot
set -uo pipefail
cd "$(dirname "$0")"
TSC=../../node_modules/.bin/tsc
VITEST=../../node_modules/.bin/vitest

echo "== 1. positive: tsc must pass =="
"$TSC" -p tsconfig.json || { echo "FAIL: prototype does not typecheck"; exit 1; }
echo "ok"

echo
echo "== 1b. seal: the contributor compiles WITHOUT widget or core files in its program =="
"$TSC" -p tsconfig.sealed.json || { echo "FAIL: contributor needs files beyond the sdk"; exit 1; }
echo "ok: one SlotOf line per slot on the sdk mirror carried everything"

echo
echo "== 2. negative: the same tree without the suppressions must fail =="
rm -rf .verify && mkdir -p .verify
cp -R src .verify/src
cp tsconfig.json .verify/tsconfig.json
sed -i '' 's|"extends": "../../tsconfig.base.json"|"extends": "../../../tsconfig.base.json"|' .verify/tsconfig.json
find .verify/src \( -name '*.ts' -o -name '*.tsx' \) | while read -r f; do
  sed -i '' '/@ts-expect-error/d' "$f"
done
NEG=$("$TSC" -p .verify/tsconfig.json 2>&1)
if [ -z "$NEG" ]; then
  echo "FAIL: the negative cases compiled; the type machinery is not holding"
  exit 1
fi
echo "$NEG" | sed 's|^\.verify/||'
echo "ok: $(echo "$NEG" | grep -c 'error TS') errors, as intended"

echo
echo "== 3. runtime: mounting the component creates the slot =="
"$VITEST" run --config vitest.config.ts --reporter dot || exit 1

rm -rf .verify
echo
echo "ALL CHECKS PASSED"
