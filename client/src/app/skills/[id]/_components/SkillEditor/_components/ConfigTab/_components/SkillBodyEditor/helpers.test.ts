import { describe, it, expect } from "vitest";
import { tokenizeMarkdown, type MdToken } from "./helpers";

const kinds = (tokens: MdToken[]) => tokens.map((t) => t.kind);
const text = (tokens: MdToken[]) => tokens.map((t) => t.text).join("");

const BODY = [
  "# PR Quality Rubric",
  "",
  "Evaluate the diff. Return a finding only when it is **worth the time**.",
  "",
  "## Correctness",
  "- Does the change do what the PR claims?",
  "- Are the boundary values checked (`>=` vs `>`)?",
  "  1. nested ordered item",
  "> A quoted aside with `code`.",
  "",
  "```ts",
  "const x = **not bold** in here;",
  "```",
  "See the [style guide](https://example.com/guide) and _italics_.",
].join("\n");

describe("tokenizeMarkdown", () => {
  it("is lossless — each line's tokens rebuild the line exactly", () => {
    const lines = BODY.split("\n");
    const tokenized = tokenizeMarkdown(BODY);
    expect(tokenized).toHaveLength(lines.length);
    tokenized.forEach((tokens, i) => expect(text(tokens)).toBe(lines[i]));
  });

  it("is lossless for punctuation-heavy lines that match no markdown rule", () => {
    const odd = ["*", "**", "a * b * c", "---", "#nospace", "   ", "[broken](", "`unclosed"].join("\n");
    tokenizeMarkdown(odd).forEach((tokens, i) => expect(text(tokens)).toBe(odd.split("\n")[i]));
  });

  it("splits a heading into its marker and its text", () => {
    const [line] = tokenizeMarkdown("## Correctness");
    expect(kinds(line!)).toEqual(["headingMarker", "heading"]);
    expect(line![0]!.text).toBe("##");
    expect(line![1]!.text).toBe(" Correctness");
  });

  it("marks a list bullet without swallowing the item's text", () => {
    const [line] = tokenizeMarkdown("- Does the change do what the PR claims?");
    expect(kinds(line!)).toEqual(["listMarker", "text", "text"]);
    expect(line![0]!.text).toBe("-");
  });

  it("keeps a nested ordered marker and its indent separate", () => {
    const [line] = tokenizeMarkdown("  1. nested ordered item");
    expect(kinds(line!)).toEqual(["text", "listMarker", "text", "text"]);
    expect(line![1]!.text).toBe("1.");
  });

  it("prefers bold over italic and tags inline code", () => {
    const [line] = tokenizeMarkdown("a **b** and `c` and _d_");
    expect(kinds(line!)).toEqual(["text", "bold", "text", "code", "text", "italic"]);
  });

  it("treats everything between fences as code, ignoring markdown inside", () => {
    const [open, inside, close] = tokenizeMarkdown("```ts\nconst x = **not bold**;\n```");
    expect(kinds(open!)).toEqual(["fence"]);
    expect(kinds(inside!)).toEqual(["code"]);
    expect(kinds(close!)).toEqual(["fence"]);
  });

  it("resumes normal highlighting after a fence closes", () => {
    const [, , , after] = tokenizeMarkdown("```\nraw\n```\n## Heading");
    expect(kinds(after!)).toEqual(["headingMarker", "heading"]);
  });

  it("tags a link as a single span", () => {
    const [line] = tokenizeMarkdown("See the [style guide](https://example.com/guide).");
    expect(line!.find((t) => t.kind === "link")?.text).toBe("[style guide](https://example.com/guide)");
  });

  it("returns one line for an empty body so the gutter still shows line 1", () => {
    expect(tokenizeMarkdown("")).toHaveLength(1);
  });
});
