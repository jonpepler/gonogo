#!/usr/bin/env bash
# Proves the pattern in three steps:
#   1. the prototype typechecks, so every positive case compiles AND every
#      `@ts-expect-error` is doing real work (an unused one is a tsc error)
#   2. the same tree with the suppressions stripped FAILS, printing the real
#      diagnostics a contributor or widget author would see
#   3. the runtime half registers slots passively, with no widget-side list
set -uo pipefail
cd "$(dirname "$0")"
TSC=../../node_modules/.bin/tsc
VITEST=../../node_modules/.bin/vitest

echo "== 1. positive: tsc must pass =="
"$TSC" -p tsconfig.json || { echo "FAIL: prototype does not typecheck"; exit 1; }
echo "ok"

echo
echo "== 1b. seal: the contributor compiles WITHOUT the widget package in its program =="
"$TSC" -p tsconfig.sealed.json || { echo "FAIL: contributor needs the widget's own files"; exit 1; }
echo "ok: slot keys reached it through the sdk mirror alone"

echo
echo "== 2. negative: the same tree without @ts-expect-error must fail =="
rm -rf .verify && mkdir -p .verify
cp -R src .verify/src
cp tsconfig.json .verify/tsconfig.json
sed -i '' 's|"extends": "../../tsconfig.base.json"|"extends": "../../../tsconfig.base.json"|' .verify/tsconfig.json
find .verify/src -name '*.ts' -o -name '*.tsx' | while read -r f; do
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
echo "== 3. runtime: slots register at module load =="
"$VITEST" run --config vitest.config.ts --reporter dot || exit 1

rm -rf .verify
echo
echo "ALL CHECKS PASSED"
