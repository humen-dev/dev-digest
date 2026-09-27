import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import shellMessages from "../../../../messages/en/shell.json";
import type { PrFile } from "@/lib/types";
import type { DiffFindingOverlay } from "../findings";
import { DiffViewer } from "../DiffViewer";

afterEach(cleanup);

const PATCH = "@@ -1,2 +1,3 @@\n const a = 1;\n-const b = 2;\n+const b = 3;\n+const c = 4;";
// Same shape, offset so no gutter line number is "1" — avoids colliding with
// the comment-count digit in the "counter renders independently" test below.
const PATCH_FROM_10 = "@@ -10,2 +10,3 @@\n const a = 1;\n-const b = 2;\n+const b = 3;\n+const c = 4;";

function renderFiles(files: PrFile[], findings?: DiffFindingOverlay) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ shell: shellMessages }}>
      <div data-theme="dark">
        <DiffViewer files={files} findings={findings} />
      </div>
    </NextIntlClientProvider>
  );
}

describe("FileCard findings overlay", () => {
  it("shows a dot, the blocker label and the card slot for a marker anchored to a rendered line", () => {
    const files: PrFile[] = [{ path: "src/config.ts", additions: 2, deletions: 1, patch: PATCH }];
    const findings: DiffFindingOverlay = {
      markers: [
        {
          id: "f1",
          path: "src/config.ts",
          line: 2, // new-side line of "const b = 3;"
          severity: "CRITICAL",
          card: <div>card-f1</div>,
        },
      ],
    };
    renderFiles(files, findings);

    expect(screen.getByLabelText("Has review findings")).toBeInTheDocument();
    expect(screen.getByText("blocker")).toBeInTheDocument();
    const line = screen.getByText("const b = 3;");
    const card = screen.getByText("card-f1");
    // The card slot renders after the flagged line in document order.
    expect(line.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders a finding whose line isn't in the patch under 'Findings outside the changed lines'", () => {
    const files: PrFile[] = [{ path: "src/config.ts", additions: 2, deletions: 1, patch: PATCH }];
    const findings: DiffFindingOverlay = {
      markers: [
        {
          id: "f2",
          path: "src/config.ts",
          line: 999,
          severity: "WARNING",
          card: <div>card-f2</div>,
        },
      ],
    };
    renderFiles(files, findings);

    expect(screen.getByText("Findings outside the changed lines")).toBeInTheDocument();
    expect(screen.getByText("card-f2")).toBeInTheDocument();
  });

  it("shows no dot for a file without markers, while the comment counter still renders independently", () => {
    const files: PrFile[] = [{ path: "src/config.ts", additions: 2, deletions: 1, patch: PATCH_FROM_10 }];
    render(
      <NextIntlClientProvider locale="en" messages={{ shell: shellMessages }}>
        <div data-theme="dark">
          <DiffViewer
            files={files}
            findings={{ markers: [] }}
            commenting={{
              comments: [
                {
                  id: 1,
                  path: "src/config.ts",
                  line: 11,
                  original_line: 11,
                  side: "RIGHT",
                  body: "looks good",
                  user: "octocat",
                  created_at: new Date().toISOString(),
                  html_url: "https://github.com/x",
                  in_reply_to_id: null,
                  is_outdated: false,
                },
              ],
              canComment: true,
              showComments: true,
              posting: false,
              onSubmit: async () => undefined,
            }}
          />
        </div>
      </NextIntlClientProvider>
    );
    expect(screen.queryByLabelText("Has review findings")).not.toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });
});
