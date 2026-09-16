import assert from "node:assert/strict";
import { test } from "node:test";
import type { SearchProvider, SearchResult } from "./ports.ts";
import { searchTool } from "./search.ts";

const provider = (results: SearchResult[]): SearchProvider & { asked: [string, number][] } => ({
  asked: [],
  async search(query, max) {
    this.asked.push([query, max]);
    return results.slice(0, max);
  },
});

test("searchTool is called web_search and passes the limit through", async () => {
  const fake = provider([
    { title: "A", url: "http://a", snippet: "first" },
    { title: "B", url: "http://b", snippet: "second" },
  ]);
  const tool = searchTool(fake, 1);
  assert.equal(tool.name, "web_search");
  assert.deepEqual(tool.inputSchema.required, ["query"]);
  assert.equal(await tool.run({ query: "hours" }), "1. A (http://a)\nfirst");
  assert.deepEqual(fake.asked, [["hours", 1]]);
});

test("searchTool numbers every result", async () => {
  const tool = searchTool(
    provider([
      { title: "A", url: "http://a", snippet: "first" },
      { title: "B", url: "http://b", snippet: "second" },
    ]),
    5,
  );
  assert.equal(await tool.run({ query: "x" }), "1. A (http://a)\nfirst\n\n2. B (http://b)\nsecond");
});

test("searchTool says when there is nothing", async () => {
  assert.equal(
    await searchTool(provider([]), 5).run({ query: "nothing here" }),
    'No results for "nothing here".',
  );
});
