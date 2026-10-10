import { describe, it, expect } from "vitest";
import {
  EMPTY_DRAFT,
  applyMasked,
  caseErrorKey,
  contentKey,
  draftToInput,
  draftToRunInput,
  isDraftValid,
} from "./helpers";
import type { CaseDraft } from "./types";

const D: CaseDraft = {
  ...EMPTY_DRAFT,
  name: "n",
  diff: "+x",
  prTitle: "t",
  file: "a.ts",
  startLine: "3",
  endLine: "4",
};

describe("CaseModal helpers", () => {
  it("contentKey ignores name / notes but tracks diff, PR meta, type and range — AC-101, AC-109", () => {
    const k = contentKey(D);
    expect(contentKey({ ...D, name: "other", notes: "x" })).toBe(k);
    for (const patch of [{ diff: "+y" }, { prTitle: "u" }, { prBody: "b" }, { type: "must_not_flag" as const }, { file: "b.ts" }, { startLine: "5" }, { endLine: "9" }]) {
      expect(contentKey({ ...D, ...patch })).not.toBe(k);
    }
  });

  it("builds the run body without name / notes and the save body with them", () => {
    expect(draftToRunInput(D)).toEqual({
      input_diff: "+x",
      pr_title: "t",
      pr_body: null,
      expectation: { type: "must_find", file: "a.ts", start_line: 3, end_line: 4 },
    });
    expect(draftToRunInput({ ...D, startLine: "9" })).toBeNull();
    expect(draftToInput(D)?.name).toBe("n");
    expect(isDraftValid({ ...D, name: " " })).toBe(false);
  });

  it("applies the masked text the server sent to the model — EC-32", () => {
    const next = applyMasked({ ...D, prBody: "secret" }, { input_diff: "+[MASKED]", pr_title: "t2", pr_body: null });
    expect(next).toMatchObject({ diff: "+[MASKED]", prTitle: "t2", prBody: "" });
  });

  it("maps unknown error codes to generic", () => {
    expect(caseErrorKey("decision_changed")).toBe("decision_changed");
    expect(caseErrorKey("case_run_in_flight")).toBe("case_run_in_flight");
    expect(caseErrorKey("nope")).toBe("generic");
  });
});
