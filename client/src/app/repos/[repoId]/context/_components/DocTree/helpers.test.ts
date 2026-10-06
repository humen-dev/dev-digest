import { describe, it, expect } from "vitest";
import type { ProjectDocument } from "@devdigest/shared";
import { groupDocsByFolder, fileLabel } from "./helpers";

const doc = (path: string, bucket: string): ProjectDocument => ({
  path,
  bucket,
  estimated_tokens: 10,
  used_by_agents: 0,
});

describe("groupDocsByFolder", () => {
  it("groups by bucket, non-root alphabetical first and root last, preserving path order within a bucket", () => {
    const docs = [
      doc("README.md", "root"),
      doc("specs/b.md", "specs"),
      doc("specs/a.md", "specs"),
      doc("docs/x.md", "docs"),
    ];
    expect(groupDocsByFolder(docs)).toEqual([
      { bucket: "docs", docs: [docs[3]] },
      { bucket: "specs", docs: [docs[1], docs[2]] },
      { bucket: "root", docs: [docs[0]] },
    ]);
  });
});

describe("fileLabel", () => {
  it("returns the last path segment, or the whole path when there is no folder", () => {
    expect(fileLabel("docs/agent-prompts/x.md")).toBe("x.md");
    expect(fileLabel("README.md")).toBe("README.md");
  });
});
