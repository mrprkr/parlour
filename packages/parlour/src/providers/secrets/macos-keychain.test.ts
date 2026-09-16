import assert from "node:assert/strict";
import { test } from "node:test";
import { createKeychainStore, KEYCHAIN_SERVICE, type Runner } from "./macos-keychain.ts";

/** A `security` that refuses every write the way a locked Keychain does. */
const refusing: Runner = async (_program, args) => {
  if (args[0] === "add-generic-password") {
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
