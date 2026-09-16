import assert from "node:assert/strict";
import { test } from "node:test";
import { systemPrompt } from "./prompt.ts";

/** The date line, formatted the way the prompt does it. */
const dateLine = (locale: string) =>
  `It is ${new Date().toLocaleString(locale, { dateStyle: "full", timeStyle: "short" })}.`;

test("systemPrompt speaks British English on a British clock by default", () => {
  const prompt = systemPrompt("Test");
  assert.match(prompt, /At most two short sentences\. British English\./);
  assert.ok(prompt.includes(dateLine("en-GB")), "the date is formatted for en-GB");
});

test("systemPrompt follows the locale for both the date and the language", () => {
  const before = dateLine("en-US");
  const prompt = systemPrompt("Test", [], "en-US");
  const after = dateLine("en-US");
  assert.match(prompt, /American English\./);
  // The minute can tick over between the two calls, so either reading is right.
  assert.ok(prompt.includes(before) || prompt.includes(after), "the date is formatted for en-US");
  assert.doesNotMatch(prompt, /British English/);
});

test("systemPrompt names the language, or repeats the tag when ICU has no name for it", () => {
  assert.match(systemPrompt("Test", [], "de"), /Deutsch\./);
  assert.match(systemPrompt("Test", [], "zz"), /sentences\. zz\./);
});
