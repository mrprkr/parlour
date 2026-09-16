#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * `pnpm version:set X.Y.Z`. The package and the app share one version, and
 * it is written in five places that three different tools read, so bumping
 * by hand is how they drift apart. This rewrites all of them and prints what
 * changed. It is a no-op when every file already carries the version asked
 * for, which is how the tree is checked before a release.
 *
 * The files are edited as text rather than parsed and re-serialised, so that
 * key order, indentation and the comments in the Cargo files survive.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// npm and Cargo agree on this much of semver: a dotted triple with an
// optional pre-release tag. Build metadata is left out on purpose, because
// Tauri turns the version into a bundle version and rejects the "+".
const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

const CARGO_TOML = "apps/desktop/src-tauri/Cargo.toml";
const CARGO_LOCK = "apps/desktop/src-tauri/Cargo.lock";

/** The crate's name, from `[package]`, so the lock file entry can be found. */
function crateName() {
  const match = /^\[package\]\n(?:(?!\[)[^\n]*\n)*?name = "([^"]*)"/m.exec(
    readFileSync(join(root, CARGO_TOML), "utf8"),
  );
  if (!match) usage(`Could not find the crate name in ${CARGO_TOML}.`);
  return match[1];
}

/**
 * Where the version lives in each file. `find` matches the line to rewrite
 * and only that line: the first top-level "version" key in the JSON files,
 * the `version` under `[package]` in Cargo.toml, and the entry for this
 * crate alone in Cargo.lock. The lock is best effort: Cargo rewrites it on
 * the next build anyway, but doing it here keeps that build from leaving
 * the tree dirty straight after a release. A lock that predates the crate's
 * current name has no entry to rewrite, and says so rather than failing.
 */
const TARGETS = [
  { file: "packages/parlour/package.json", find: /^(\s*"version":\s*")([^"]*)(")/m },
  { file: "apps/desktop/package.json", find: /^(\s*"version":\s*")([^"]*)(")/m },
  { file: "apps/desktop/src-tauri/tauri.conf.json", find: /^(\s*"version":\s*")([^"]*)(")/m },
  { file: CARGO_TOML, find: /(^\[package\]\n(?:(?!\[)[^\n]*\n)*?version = ")([^"]*)(")/m },
  {
    file: CARGO_LOCK,
    find: () => new RegExp(`(^\\[\\[package\\]\\]\\nname = "${crateName()}"\\nversion = ")([^"]*)(")`, "m"),
    optional: "has no entry for this crate yet; cargo check will write one",
  },
];

function usage(message) {
  console.error(message);
  console.error("Usage: pnpm version:set X.Y.Z");
  process.exit(1);
}

const version = process.argv[2];
if (!version) usage("A version is required.");
if (!SEMVER.test(version)) usage(`"${version}" is not a version of the form X.Y.Z.`);

let changed = 0;
for (const target of TARGETS) {
  const path = join(root, target.file);
  const label = relative(process.cwd(), path) || target.file;
  const find = typeof target.find === "function" ? target.find() : target.find;
  const before = readFileSync(path, "utf8");
  const match = find.exec(before);
  if (!match) {
    if (!target.optional) usage(`Could not find the version in ${target.file}.`);
    console.log(`${label}  ${target.optional}`);
    continue;
  }

  const current = match[2];
  if (current === version) {
    console.log(`${label}  already ${version}`);
    continue;
  }

  const after = before.replace(find, `$1${version}$3`);
  // The JSON files are parsed afterwards as a guard against a rewrite that
  // matched the wrong line, since a broken package.json is a broken publish.
  if (target.file.endsWith(".json") && JSON.parse(after).version !== version) {
    usage(`The rewrite of ${target.file} did not take. Nothing has been written.`);
  }
  writeFileSync(path, after);
  console.log(`${label}  ${current} -> ${version}`);
  changed++;
}

if (changed === 0) console.log(`Everything is already at ${version}.`);
