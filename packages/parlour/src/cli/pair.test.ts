import assert from "node:assert/strict";
import { test } from "node:test";
import { pairingLink, qrModules, reachableHost, svgCode, terminalCode } from "./pair.ts";

test("the link carries the address, the token and the name, each escaped", () => {
  const link = pairingLink({ url: "http://den.local:8765", token: "a b&c", name: "Parlour on den" });
  assert.match(link, /^parlour:\/\/pair\?/);
  const query = new URL(link).searchParams;
  assert.equal(query.get("url"), "http://den.local:8765");
  assert.equal(query.get("token"), "a b&c");
  assert.equal(query.get("name"), "Parlour on den");
  // The phone decodes with URLComponents, which leaves a "+" as a plus.
  assert.ok(!link.includes("+"), link);
  assert.equal(
    pairingLink({ url: "http://den.local:8765", token: "abc", name: "Parlour on den" }),
    "parlour://pair?url=http%3A%2F%2Fden.local%3A8765&token=abc&name=Parlour%20on%20den",
  );
});

test("a bare Mac name gets the .local a phone reaches it by, and a full one is left alone", () => {
  assert.equal(reachableHost("den"), "den.local");
  assert.equal(reachableHost("den.local"), "den.local");
  assert.equal(reachableHost("den.local."), "den.local");
  assert.equal(reachableHost("den.example.org"), "den.example.org");
});

test("the code is square, framed in a quiet zone, and drawn two rows to a line", () => {
  const grid = qrModules(
    pairingLink({ url: "http://den.local:8765", token: "f".repeat(48), name: "Parlour" }),
  );
  assert.ok(
    grid.every((row) => row.length === grid.length),
    "square",
  );
  // Four light modules all round: a scanner needs the margin to find the edge.
  for (const edge of [grid[0], grid[3], grid.at(-1), grid.at(-4)]) assert.ok(edge?.every((dark) => !dark));
  assert.ok(grid.every((row) => !row[0] && !row[3] && !row.at(-1) && !row.at(-4)));
  // The finder pattern's top left corner, just inside the quiet zone.
  assert.equal(grid[4]?.[4], true);

  const lines = terminalCode(grid).split("\n");
  assert.equal(lines.length, Math.ceil(grid.length / 2));
  assert.match(svgCode(grid), /^<svg [^>]*viewBox="0 0 (\d+) \1"/);
});
