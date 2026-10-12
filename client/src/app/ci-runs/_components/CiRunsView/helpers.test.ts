import { describe, it, expect } from "vitest";
import { buildRunsQuery, filtersToSearch, parseFilters, safeGithubUrl } from "./helpers";

describe("ci-runs helpers", () => {
  it("round-trips non-default filters through the URL and ignores junk values", () => {
    const f = parseFilters(new URLSearchParams("range=30d&status=failed&repo=acme/api&agent=nope&source=x"));
    expect(f).toEqual({ range: "30d", agent: "", repo: "acme/api", status: "failed", source: "" });
    expect(filtersToSearch(f)).toBe("range=30d&repo=acme%2Fapi&status=failed");
    expect(filtersToSearch(parseFilters(new URLSearchParams("")))).toBe("");
  });

  it("builds the server query from the range", () => {
    const now = new Date("2026-10-12T00:00:00.000Z");
    const f = parseFilters(new URLSearchParams("status=failed"));
    expect(buildRunsQuery(f, now)).toEqual({ from: "2026-10-05T00:00:00.000Z", status: "failed" });
    expect(buildRunsQuery({ ...f, range: "all" }, now).from).toBe("1970-01-01T00:00:00.000Z");
  });

  it("links only https://github.com/ URLs", () => {
    expect(safeGithubUrl("https://github.com/a/b/pull/1")).toBe("https://github.com/a/b/pull/1");
    expect(safeGithubUrl("javascript:alert(1)")).toBeNull();
    expect(safeGithubUrl("http://github.com/a")).toBeNull();
    expect(safeGithubUrl("https://github.com.evil.io/a")).toBeNull();
    expect(safeGithubUrl(null)).toBeNull();
  });
});
