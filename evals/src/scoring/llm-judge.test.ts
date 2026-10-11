import { describe, expect, test } from "vitest";
import { alignVerdict, parseVerdict } from "./llm-judge.js";

describe("parseVerdict", () => {
  const json = '{"results":[{"practice":"a","evidence":"q","reason":"r","passed":true}]}';

  test("reads plain JSON", () => {
    expect(parseVerdict(json)).toEqual([{ practice: "a", evidence: "q", reason: "r", passed: true }]);
  });

  test("tolerates markdown fences and prose around the JSON", () => {
    expect(parseVerdict(`Here you go:\n\`\`\`json\n${json}\n\`\`\`\nDone.`)).toHaveLength(1);
  });

  test("returns null instead of throwing on broken or wrongly shaped JSON", () => {
    expect(parseVerdict("no json here")).toBeNull();
    expect(parseVerdict('{"results":[{"practice":"a",')).toBeNull();
    expect(parseVerdict('{"verdict":"PASS"}')).toBeNull();
  });
});

describe("alignVerdict", () => {
  const practices = ["one", "two", "three"];

  test("scores over the practices asked, not the results returned", () => {
    const v = alignVerdict(practices, [
      { practice: "one", passed: true, evidence: "q1" },
      { practice: "two", passed: true, evidence: "q2" },
    ]);
    expect(v).toMatchObject({ passed: 2, total: 3 });
    expect(v.score).toBeCloseTo(2 / 3);
    expect(v.results[2]).toMatchObject({ practice: "three", passed: false, reason: "judge returned no result for this practice" });
  });

  test("matches by practice text when the judge reorders", () => {
    const v = alignVerdict(practices, [
      { practice: "three", passed: false, evidence: "", reason: "missing" },
      { practice: "One ", passed: true, evidence: "q1" },
      { practice: "two", passed: true, evidence: "q2" },
    ]);
    expect(v.results.map((r) => r.passed)).toEqual([true, true, false]);
    expect(v.results[2].reason).toBe("missing");
  });

  test("falls back to position when the judge paraphrases the practice text", () => {
    const v = alignVerdict(["says X", "says Y"], [
      { practice: "X is said", passed: true, evidence: "X" },
      { practice: "Y is said", passed: false, evidence: "" },
    ]);
    expect(v.results.map((r) => [r.practice, r.passed])).toEqual([["says X", true], ["says Y", false]]);
  });

  test("only a literal true passes", () => {
    const v = alignVerdict(["a", "b"], [
      { practice: "a", passed: "true" as unknown as boolean, evidence: "q" },
      { practice: "b", evidence: "q" },
    ]);
    expect(v.passed).toBe(0);
  });

  test("no practices scores 1", () => {
    expect(alignVerdict([], []).score).toBe(1);
  });
});
