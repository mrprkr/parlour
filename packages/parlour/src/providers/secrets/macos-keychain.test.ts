import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { createKeychainStore, KEYCHAIN_SERVICE, quoteForSecurity, type Runner } from "./macos-keychain.ts";

/** A `security` that refuses every write the way a locked Keychain does. */
const refusing: Runner = async (_program, args, input) => {
  if (args[0] === "-i" && input?.startsWith("add-generic-password")) {
    const error = new Error(`Command failed: security ${args.join(" ")}`) as Error & {
      code: number;
      stderr: string;
    };
    error.code = 36;
    error.stderr = "security: SecKeychainItemCreateFromContent: User interaction is not allowed.\n";
    throw error;
  }
  return { stdout: "", stderr: "" };
};

test("a refused write names the key, not the value", async () => {
  const store = createKeychainStore(refusing);
  const value = JSON.stringify({ tokens: { refresh_token: "very-secret-token" } });
  await assert.rejects(store.set("cal", value), (error: Error) => {
    assert.match(error.message, /would not store cal/);
    assert.match(error.message, /User interaction is not allowed/);
    assert.doesNotMatch(error.message, /very-secret-token/);
    assert.doesNotMatch(error.message, /add-generic-password/);
    return true;
  });
});

test("a refused write with no stderr still says how security exited", async () => {
  const store = createKeychainStore(async () => {
    const error = new Error("Command failed") as Error & { code: number; stderr: string };
    error.code = 51;
    error.stderr = "";
    throw error;
  });
  await assert.rejects(store.set("cal", "secret"), /security exited 51/);
});

test("get reads the password back and treats a missing item as null", async () => {
  const calls: string[][] = [];
  const store = createKeychainStore(async (_program, args) => {
    calls.push(args);
    if (args.includes("cal")) return { stdout: "token\n", stderr: "" };
    throw Object.assign(new Error("not found"), { code: 44, stderr: "" });
  });
  assert.equal(await store.get("cal"), "token");
  assert.equal(await store.get("mail"), null);
  assert.ok(calls.every((args) => args.includes(KEYCHAIN_SERVICE)));
});

test("set keeps the value off the command line and quotes it for security -i", async () => {
  const calls: { args: string[]; input?: string }[] = [];
  const store = createKeychainStore(async (_program, args, input) => {
    calls.push({ args, input });
    return { stdout: "", stderr: "" };
  });
  const value = JSON.stringify({ tokens: { refresh_token: 'a "quoted" back\\slash' } });
  await store.set("cal", value);
  assert.equal(calls.length, 1);
  const { args, input } = calls[0] ?? { args: [] };
  assert.deepEqual(args, ["-i"]);
  assert.equal(
    input,
    `add-generic-password -U -s ${KEYCHAIN_SERVICE} -a "cal" -w ${quoteForSecurity(value)} -l "Parlour: cal"\n`,
  );
  assert.doesNotMatch(args.join(" "), /refresh_token/);
});

test("quoteForSecurity escapes what security -i unescapes and refuses a line break", () => {
  assert.equal(quoteForSecurity("plain"), '"plain"');
  assert.equal(quoteForSecurity('say "hi" C:\\dir $HOME'), '"say \\"hi\\" C:\\\\dir $HOME"');
  assert.throws(() => quoteForSecurity("two\nlines"), /line break/);
});

// The quoting rules above are only worth anything if the real `security`
// agrees with them, so round-trip an awkward value through a throwaway
// keychain file. That needs macOS, and never touches the login Keychain.
test("the real security -i reads a quoted value back unchanged", {
  skip: process.platform !== "darwin",
}, async () => {
  const run = promisify(execFile);
  const dir = await mkdtemp(join(tmpdir(), "parlour-keychain-"));
  const keychain = join(dir, "probe.keychain-db");
  try {
    await run("security", ["create-keychain", "-p", "probe", keychain]);
    const value = JSON.stringify({ tokens: { refresh_token: 'a "quoted" back\\slash $HOME it\'s' } });
    const store = createKeychainStore(
      (program, args, input) =>
        new Promise((resolve, reject) => {
          // The store has no way to name a keychain, so append it to the line
          // it wrote and to the arguments of everything else.
          const line = input ? `${input.trimEnd()} ${quoteForSecurity(keychain)}\n` : "";
          const child = execFile(program, input ? args : [...args, keychain], (error, stdout, stderr) =>
            error ? reject(Object.assign(error, { stderr })) : resolve({ stdout, stderr }),
          );
          child.stdin?.end(line);
        }),
    );
    await store.set("cal", value);
    assert.equal(await store.get("cal"), value);
    await store.set("cal", "second");
    assert.equal(await store.get("cal"), "second");
  } finally {
    await run("security", ["delete-keychain", keychain]).catch(() => {});
    await rm(dir, { recursive: true, force: true });
  }
});
