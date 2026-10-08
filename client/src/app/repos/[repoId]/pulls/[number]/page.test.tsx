import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { BriefPage } from "@devdigest/shared";
import briefMessages from "../../../../../../messages/en/brief.json";
import prReviewMessages from "../../../../../../messages/en/prReview.json";

const BRIEF_PAGE: BriefPage = {
  status: "generated",
  reason: null,
  brief: {
    summary: "Adds the brief card.",
    risks: [],
    review_focus: [
      { file: "src/config.ts", line: 12, reason: "new parser" },
      { file: "src/other.ts", line: null, reason: "wiring" },
    ],
  },
  provenance: null,
  current_head_sha: "abc",
};

const push = vi.fn();
const replace = vi.fn();
let search = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: "r", number: "482" }),
  useRouter: () => ({ push, replace }),
  useSearchParams: () => search,
}));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock("@/lib/hooks", () => ({
  usePulls: () => ({ data: [{ id: "pr1", number: 482 }], isLoading: false }),
  usePullDetail: () => ({
    data: { number: 482, body: null, head_sha: "abc", files: [{ path: "src/config.ts" }, { path: "src/other.ts" }], commits: [] },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/lib/hooks/reviews", () => ({
  usePrReviews: () => ({ data: [], refetch: vi.fn() }),
  useCancelRun: () => ({}),
  usePrActiveRuns: () => ({ data: [] }),
  usePrRuns: () => ({ data: [] }),
  useDeleteRun: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/lib/hooks/intent", () => ({
  intentKey: (id: string) => ["intent", id],
  usePrIntent: () => ({ data: { intent: null }, isLoading: false, isError: false, refetch: vi.fn() }),
  useDetectIntent: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
}));
vi.mock("@/lib/hooks/brief", () => ({
  usePrBrief: () => ({ data: BRIEF_PAGE, isLoading: false, isError: false, refetch: vi.fn() }),
  useGenerateBrief: () => ({ isPending: false, isError: false, mutate: vi.fn() }),
  useBriefContextCandidates: () => ({ data: { cloned: true, candidates: [] }, isError: false, refetch: vi.fn() }),
}));
vi.mock("@/lib/hooks/core", () => ({
  useSettings: () => ({ data: { feature_models: {} } }),
  useSecretsStatus: () => ({ data: { openai: true } }),
}));
vi.mock("@/lib/hooks/project-context", () => ({ useProjectDocs: () => ({ data: { cloned: true, documents: [] } }) }));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { full_name: "o/r" } }),
  useRepoNotFound: () => false,
}));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/repo-not-found", () => ({ RepoNotFound: () => null }));
vi.mock("./_components/PrDetailHeader", () => ({ PrDetailHeader: () => null }));
vi.mock("./_components/FindingsTab", () => ({ FindingsTab: () => null }));
vi.mock("./_components/RunTraceDrawer", () => ({ default: () => null }));
vi.mock("./_components/BlastRadius", () => ({ BlastRadius: () => null }));
vi.mock("./_components/DiffTab", () => ({
  DiffTab: ({ targetFile, targetLine }: { targetFile?: string | null; targetLine?: string | null }) => (
    <div data-testid="diff">{`${targetFile ?? "-"}|${targetLine ?? "-"}`}</div>
  ),
}));

import PRDetailPage from "./page";

function renderPage() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ brief: briefMessages, prReview: prReviewMessages }}>
      <PRDetailPage />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  search = new URLSearchParams();
});
afterEach(() => {
  cleanup();
  push.mockClear();
  replace.mockClear();
});

describe("PRDetailPage brief navigation", () => {
  it("focus click pushes ?tab=diff&file=&line= (null line omitted), never replace — AC-74, AC-75", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /src\/config\.ts:12.*new parser/ }));
    expect(push).toHaveBeenCalledWith("/repos/r/pulls/482?tab=diff&file=src%2Fconfig.ts&line=12");

    fireEvent.click(screen.getByRole("button", { name: /src\/other\.ts.*wiring/ }));
    expect(push).toHaveBeenLastCalledWith("/repos/r/pulls/482?tab=diff&file=src%2Fother.ts");
    expect(replace).not.toHaveBeenCalled();
  });

  it("passes ?file / ?line to DiffTab", () => {
    search = new URLSearchParams("tab=diff&file=src%2Fconfig.ts&line=12");
    renderPage();
    expect(screen.getByTestId("diff")).toHaveTextContent("src/config.ts|12");
  });
});
