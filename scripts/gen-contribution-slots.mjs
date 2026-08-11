/**
 * Generates `mod/sitrep-sdk/src/__generated__/contribution-slots.ts`: the
 * sdk-leaf mirror of every first-party (packages/components-owned)
 * `ContributionRegistry` slot declaration.
 *
 * Why a mirror exists at all: a facade-sealed Uplink's TS program only
 * contains files reachable from `@ksp-gonogo/sitrep-sdk`, and the sdk leaf
 * cannot import `@ksp-gonogo/components` (turbo `^build` cycle), so a
 * first-party slot's registry line must be PRESENT on the leaf or no sealed
 * contributor can ever see it. That is a package-graph fact; see
 * `mod/sitrep-sdk/src/api/slots.ts`'s header for the long form.
 *
 * Why generated: the hand-kept version needed a conformance test-d that
 * re-listed every slot to keep the two copies honest. Generating the mirror
 * from the widgets' own `declare module "@ksp-gonogo/core"` blocks makes the
 * widget's declaration the single source of truth: drift is impossible, so
 * the per-slot conformance checks are gone (`codegen-check.sh` hashes the
 * output instead).
 *
 * Syntax-level: parses with the TypeScript AST and resolves names by walking
 * files, no type checker and no build needed. A type referenced by a slot
 * declaration is either already importable on the sdk leaf (exported by
 * `api/types.ts` or `__generated__/contract.ts`, named directly or through
 * core's re-export of the sdk) and becomes an import, or its declaration is
 * inlined verbatim, recursively, from wherever in the workspace it lives.
 *
 * Scope: `packages/components/src` only, the same components-owned-only
 * split as the augment mirror (`api/slots.ts`). A slot owned by an Uplink's
 * own client package declares its `declare module "@ksp-gonogo/sitrep-sdk"`
 * block in its own file, which needs no mirror and no codegen.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const COMPONENTS_SRC = join(root, "packages/components/src");
const SDK_TYPES = join(root, "mod/sitrep-sdk/src/api/types.ts");
const SDK_CONTRACT = join(root, "mod/sitrep-sdk/src/__generated__/contract.ts");
const CORE_INDEX = join(root, "packages/core/src/index.ts");
const OUT = join(
  root,
  "mod/sitrep-sdk/src/__generated__/contribution-slots.ts",
);

/** Workspace packages a widget's slot types may reach into, name -> src dir. */
const PKG_SRC = new Map([
  ["@ksp-gonogo/ui-kit", join(root, "packages/ui-kit/src")],
  ["@ksp-gonogo/core", join(root, "packages/core/src")],
]);

/** Global utility types that resolve nowhere and inline nothing. */
const BUILTIN_TYPES = new Set([
  "Array",
  "Date",
  "Exclude",
  "Extract",
  "Map",
  "NonNullable",
  "Omit",
  "Parameters",
  "Partial",
  "Pick",
  "Promise",
  "Readonly",
  "ReadonlyArray",
  "Record",
  "Required",
  "ReturnType",
  "Set",
]);

const sourceCache = new Map();
function parse(file) {
  let sf = sourceCache.get(file);
  if (!sf) {
    sf = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    sourceCache.set(file, sf);
  }
  return sf;
}

function fail(message) {
  console.error(`gen-contribution-slots: ${message}`);
  process.exit(1);
}

// --- what the sdk leaf already exports --------------------------------------

function topLevelExportedTypeNames(file) {
  const names = new Set();
  for (const stmt of parse(file).statements) {
    const isType =
      ts.isInterfaceDeclaration(stmt) ||
      ts.isTypeAliasDeclaration(stmt) ||
      ts.isEnumDeclaration(stmt);
    if (
      isType &&
      stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      names.add(stmt.name.text);
    }
  }
  return names;
}

const sdkTypesExports = topLevelExportedTypeNames(SDK_TYPES);
const sdkContractExports = topLevelExportedTypeNames(SDK_CONTRACT);

/** Names core's barrel re-exports from the sdk: importable on the leaf too. */
function coreSdkReexports() {
  const names = new Set();
  for (const stmt of parse(CORE_INDEX).statements) {
    if (
      ts.isExportDeclaration(stmt) &&
      stmt.moduleSpecifier &&
      ts.isStringLiteral(stmt.moduleSpecifier) &&
      stmt.moduleSpecifier.text === "@ksp-gonogo/sitrep-sdk" &&
      stmt.exportClause &&
      ts.isNamedExports(stmt.exportClause)
    ) {
      for (const el of stmt.exportClause.elements) names.add(el.name.text);
    }
  }
  return names;
}
const coreReexports = coreSdkReexports();

function sdkImportSourceFor(name) {
  if (sdkTypesExports.has(name)) return "../api/types";
  if (sdkContractExports.has(name)) return "./contract";
  return null;
}

// --- file walking ------------------------------------------------------------

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (/\.tsx?$/.test(entry.name) && !/\.test(-d)?\./.test(entry.name)) {
      yield full;
    }
  }
}

function resolveModuleFile(fromDir, spec) {
  const base = join(fromDir, spec);
  for (const candidate of [
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ]) {
    try {
      readFileSync(candidate);
      return candidate;
    } catch {
      // keep trying
    }
  }
  return null;
}

// --- name resolution -----------------------------------------------------------

function localTypeDecl(file, name) {
  for (const stmt of parse(file).statements) {
    if (
      (ts.isInterfaceDeclaration(stmt) ||
        ts.isTypeAliasDeclaration(stmt) ||
        ts.isEnumDeclaration(stmt)) &&
      stmt.name.text === name
    ) {
      return stmt;
    }
  }
  return null;
}

/** Find the declaration a module EXPORTS under `name`, following re-exports. */
function findExportedDecl(file, name, visited = new Set()) {
  if (visited.has(file)) return null;
  visited.add(file);
  const direct = localTypeDecl(file, name);
  if (direct?.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
    return { decl: direct, file };
  }
  for (const stmt of parse(file).statements) {
    if (!ts.isExportDeclaration(stmt) || !stmt.moduleSpecifier) continue;
    if (!ts.isStringLiteral(stmt.moduleSpecifier)) continue;
    const target = resolveModuleFile(dirname(file), stmt.moduleSpecifier.text);
    if (!target) continue;
    if (stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
      for (const el of stmt.exportClause.elements) {
        if (el.name.text !== name) continue;
        return findExportedDecl(target, el.propertyName?.text ?? name, visited);
      }
    } else if (!stmt.exportClause) {
      const found = findExportedDecl(target, name, visited);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Resolve one referenced type name from `fromFile` to either
 * `{ sdk: "<import source>", name }` or `{ decl, file }` (to inline).
 */
function resolveName(name, fromFile) {
  const local = localTypeDecl(fromFile, name);
  if (local) return { decl: local, file: fromFile };

  for (const stmt of parse(fromFile).statements) {
    if (!ts.isImportDeclaration(stmt)) continue;
    const bindings = stmt.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    const el = bindings.elements.find((e) => e.name.text === name);
    if (!el) continue;
    const original = el.propertyName?.text ?? name;
    const spec = stmt.moduleSpecifier.text;

    if (spec === "@ksp-gonogo/sitrep-sdk") {
      const source = sdkImportSourceFor(original);
      if (!source) {
        fail(
          `"${name}" is imported from the sdk in ${fromFile} but the sdk does not export it`,
        );
      }
      return { sdk: source, name: original };
    }
    if (spec === "@ksp-gonogo/core" && coreReexports.has(original)) {
      const source = sdkImportSourceFor(original);
      if (source) return { sdk: source, name: original };
    }
    if (spec.startsWith(".")) {
      const target = resolveModuleFile(dirname(fromFile), spec);
      if (!target) fail(`cannot resolve "${spec}" from ${fromFile}`);
      const found = findExportedDecl(target, original);
      if (!found) {
        fail(`"${original}" is not exported by ${target} (via ${fromFile})`);
      }
      return found;
    }
    const pkgSrc = PKG_SRC.get(spec);
    if (pkgSrc) {
      const found = findExportedDecl(join(pkgSrc, "index.ts"), original);
      if (!found) fail(`"${original}" is not exported by ${spec}'s barrel`);
      return found;
    }
    fail(
      `"${name}" reaches the mirror from "${spec}" (via ${fromFile}); teach ` +
        `gen-contribution-slots.mjs about that package or declare the slot ` +
        `with sdk-importable / widget-local types`,
    );
  }
  fail(`cannot resolve type "${name}" referenced in ${fromFile}`);
}

/** Every type name a type node references, excluding builtin utilities. */
function typeRefsIn(node) {
  const names = new Set();
  (function visit(n) {
    if (ts.isTypeReferenceNode(n)) {
      if (ts.isQualifiedName(n.typeName)) {
        fail(
          `qualified type name "${n.typeName.getText()}" in a slot ` +
            `declaration is not supported by the mirror generator`,
        );
      }
      const name = n.typeName.text;
      if (!BUILTIN_TYPES.has(name)) names.add(name);
    }
    if (ts.isTypeQueryNode(n) || ts.isImportTypeNode(n)) {
      fail(
        `"typeof"/import() types in a slot declaration are not supported ` +
          `by the mirror generator`,
      );
    }
    ts.forEachChild(n, visit);
  })(node);
  return names;
}

// --- collect the slot declarations -------------------------------------------

/** slot key -> { typeText, file } */
const slots = new Map();
/** inlined declaration name -> { decl, file, text } */
const inlined = new Map();
/** sdk import source -> Set of names */
const sdkImports = new Map();

function recordSdkImport(source, name) {
  let names = sdkImports.get(source);
  if (!names) {
    names = new Set();
    sdkImports.set(source, names);
  }
  names.add(name);
}

function declText(decl, file) {
  const sf = parse(file);
  // getStart() skips leading trivia INCLUDING the jsdoc block: the mirror
  // carries a one-line provenance pointer instead of the original essay.
  let text = sf.text.slice(decl.getStart(sf), decl.end);
  if (!decl.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
    text = `export ${text}`;
  }
  return text;
}

function inline(name, resolved) {
  const existing = inlined.get(name);
  if (existing) {
    if (existing.file !== resolved.file) {
      fail(
        `two different declarations of "${name}" reach the mirror ` +
          `(${existing.file} and ${resolved.file}); rename one`,
      );
    }
    return;
  }
  inlined.set(name, {
    ...resolved,
    text: declText(resolved.decl, resolved.file),
  });
  resolveRefs(resolved.decl, resolved.file);
}

function resolveRefs(node, file) {
  for (const name of typeRefsIn(node)) {
    // A type parameter of the declaration itself (e.g. the T of a generic
    // alias) is not an outside reference.
    if (
      (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) &&
      node.typeParameters?.some((p) => p.name.text === name)
    ) {
      continue;
    }
    const resolved = resolveName(name, file);
    if (resolved.sdk) recordSdkImport(resolved.sdk, resolved.name);
    else inline(name, resolved);
  }
}

for (const file of walk(COMPONENTS_SRC)) {
  const raw = readFileSync(file, "utf8");
  if (!raw.includes("ContributionRegistry")) continue;
  const sf = parse(file);
  for (const stmt of sf.statements) {
    if (!ts.isModuleDeclaration(stmt)) continue;
    if (!ts.isStringLiteral(stmt.name) || stmt.name.text !== "@ksp-gonogo/core")
      continue;
    if (!stmt.body || !ts.isModuleBlock(stmt.body)) continue;
    for (const inner of stmt.body.statements) {
      if (
        !ts.isInterfaceDeclaration(inner) ||
        inner.name.text !== "ContributionRegistry"
      ) {
        continue;
      }
      for (const member of inner.members) {
        if (!ts.isPropertySignature(member) || !member.type) continue;
        if (!ts.isStringLiteral(member.name)) {
          fail(`non-string slot key in ${file}`);
        }
        const key = member.name.text;
        if (slots.has(key)) {
          fail(
            `slot "${key}" is declared twice (${slots.get(key).file}, ${file})`,
          );
        }
        slots.set(key, {
          file,
          typeText: member.type.getText(sf),
        });
        resolveRefs(member.type, file);
      }
    }
  }
}

if (slots.size === 0) {
  fail("found no ContributionRegistry declarations under packages/components");
}

// --- emit ---------------------------------------------------------------------

/** Re-indent a sliced multi-line type literal to the declare-block depth. */
function reindent(text, indent) {
  const lines = text.split("\n");
  if (lines.length === 1) return text;
  const last = lines[lines.length - 1];
  const originalIndent = last.match(/^\s*/)[0];
  return lines
    .map((line, i) => {
      if (i === 0) return line;
      const stripped = line.startsWith(originalIndent)
        ? line.slice(originalIndent.length)
        : line.trimStart();
      return stripped === "" ? "" : indent + stripped;
    })
    .join("\n");
}

const lines = [];
lines.push(
  "// GENERATED by `scripts/gen-contribution-slots.mjs`, do not edit.",
);
lines.push("//");
lines.push(
  "// The sdk-leaf mirror of every first-party (packages/components-owned)",
);
lines.push(
  "// `ContributionRegistry` slot declaration, generated from the widgets' own",
);
lines.push(
  '// `declare module "@ksp-gonogo/core"` blocks so a facade-sealed Uplink',
);
lines.push(
  "// (whose program can only see files reachable from this package) types its",
);
lines.push(
  "// `registerContribution` calls against the exact same contract. See the",
);
lines.push("// generator's header for the package-graph reasoning, and");
lines.push("// `../api/slots.ts` for the augment-side precedent it mirrors.");
lines.push("");

const importSources = [...sdkImports.keys()].sort();
for (const source of importSources) {
  const names = [...sdkImports.get(source)].sort();
  lines.push(`import type { ${names.join(", ")} } from "${source}";`);
}
if (importSources.length > 0) lines.push("");

for (const name of [...inlined.keys()].sort()) {
  const entry = inlined.get(name);
  const from = relative(root, entry.file);
  lines.push(`/** Mirrors \`${name}\` (\`${from}\`). */`);
  lines.push(entry.text);
  lines.push("");
}

// Relative specifier, not the package name: TS module augmentation merges by
// resolved file identity, and self-referencing your own package by name from
// inside it resolves inconsistently (see `../api/slots.ts`'s footer comment).
lines.push('declare module "../api/types" {');
lines.push("  interface ContributionRegistry {");
for (const key of [...slots.keys()].sort()) {
  const entry = slots.get(key);
  lines.push(`    "${key}": ${reindent(entry.typeText, "    ")};`);
}
lines.push("  }");
lines.push("}");
lines.push("");

writeFileSync(OUT, lines.join("\n"));
console.log(
  `gen-contribution-slots -> ${relative(root, OUT)} (${slots.size} slots)`,
);
