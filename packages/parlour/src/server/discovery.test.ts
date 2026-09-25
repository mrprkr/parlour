import assert from "node:assert/strict";
import { test } from "node:test";
import { describeDiscoveryError, localNetworkCheck, mdnsQuery, refusedLocalNetwork } from "./discovery.ts";

const failure = (code: string) => Object.assign(new Error(`send ${code} 224.0.0.251:5353`), { code });

test("no route to host and permission errors are the local network being refused", () => {
  assert.ok(refusedLocalNetwork(failure("EHOSTUNREACH")));
  assert.ok(refusedLocalNetwork(failure("EPERM")));
  assert.ok(refusedLocalNetwork(failure("EACCES")));
  assert.ok(!refusedLocalNetwork(failure("EADDRINUSE")));
  assert.ok(!refusedLocalNetwork(new Error("no code")));
  assert.ok(!refusedLocalNetwork(undefined));
});

test("only a Mac is told where the Local Network switch is", () => {
  assert.match(
    describeDiscoveryError(failure("EHOSTUNREACH"), "darwin"),
    /Privacy & Security, Local Network/,
  );
  assert.equal(
    describeDiscoveryError(failure("EHOSTUNREACH"), "linux"),
    "send EHOSTUNREACH 224.0.0.251:5353",
  );
  assert.equal(describeDiscoveryError(failure("EADDRINUSE"), "darwin"), "send EADDRINUSE 224.0.0.251:5353");
});

test("the probe asks for _parlour._tcp.local the way a phone does", () => {
  const packet = mdnsQuery();
  // One question, no answers.
  assert.equal(packet.readUInt16BE(4), 1);
  assert.equal(packet.readUInt16BE(6), 0);
  const name = packet.subarray(12, packet.length - 4);
  assert.deepEqual(name, Buffer.from("\x08_parlour\x04_tcp\x05local\x00", "ascii"));
  // PTR, class IN.
  assert.equal(packet.readUInt16BE(packet.length - 4), 12);
  assert.equal(packet.readUInt16BE(packet.length - 2), 1);
});

test("the doctor fails a refusal on a Mac and only warns about anything else", async () => {
  const ok = await localNetworkCheck("darwin", async () => {});
  assert.equal(ok.status, "ok");

  const refused = await localNetworkCheck("darwin", async () => {
    throw failure("EHOSTUNREACH");
  });
  assert.equal(refused.status, "fail");
  assert.match(refused.detail, /Local Network/);

  const unrouted = await localNetworkCheck("linux", async () => {
    throw failure("ENETUNREACH");
  });
  assert.equal(unrouted.status, "warn");
  assert.match(unrouted.detail, /ENETUNREACH/);
});
