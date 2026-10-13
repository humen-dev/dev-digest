import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { CiExportInputBody, CiPreview, CiSecretStatus, CiTargetOption } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/ci.json";
import { ApiError } from "@/lib/api";

const REPO = "acme/payments-api";
const HASH = "b".repeat(64);

function makePreview(over: Partial<CiPreview> = {}): CiPreview {
  return {
    files: [
      { path: ".devdigest/agents/sec.yaml", kind: "manifest", contents: "name: sec", bytes: 9, sha256: "a".repeat(64), editable: false },
      { path: ".github/workflows/devdigest-review.yml", kind: "workflow", contents: "name: DevDigest Review", bytes: 22, sha256: "c".repeat(64), editable: true },
      { path: ".devdigest/runner/index.js", kind: "runner", contents: null, bytes: 2048, sha256: HASH, editable: false },
    ],
    warnings: [],
    workflow_violations: [],
    workflow_warnings: [],
    workflow_version: "0123456789ab",
    generator_version: 1,
    ...over,
  };
}

const GHA: CiTargetOption = { target: "gha", label_key: "exportWizard.targets.gha" };

// Hook fakes — the wizard only talks to the server through src/lib/hooks/ci.
const h = vi.hoisted(() => ({
  targets: { data: undefined as unknown, isLoading: false, isError: false, refetch: vi.fn() },
  preview: { data: undefined as unknown, isError: false, error: null as unknown },
  previewInputs: [] as unknown[],
  secrets: [] as unknown[],
  exportMutate: vi.fn(),
  archiveMutate: vi.fn(),
  exportPending: false,
  repos: [] as { full_name: string }[],
  reposLoading: false,
}));

vi.mock("@/lib/hooks/ci", () => ({
  useCiTargets: () => h.targets,
  useCiPreview: (_id: string, input: unknown) => {
    h.previewInputs.push(input);
    const on = input !== null;
    return {
      data: on && !h.preview.isError ? h.preview.data : undefined,
      isSuccess: on && !h.preview.isError,
      isError: on && h.preview.isError,
      error: on ? h.preview.error : null,
      isFetching: false,
      refetch: vi.fn(),
    };
  },
  useCiSecrets: () => ({ data: h.secrets, isError: false, error: null }),
  useExportCi: () => ({ mutate: h.exportMutate, isPending: h.exportPending, error: null }),
  useCiArchive: () => ({ mutate: h.archiveMutate, isPending: false, error: null }),
}));

vi.mock("@/lib/hooks/core", () => ({
  useRepos: () => ({ data: h.repos, isLoading: h.reposLoading }),
}));

import { ExportWizard } from "./ExportWizard";
import { isRepoValid, repoOptions } from "./helpers";

function renderWizard(props: Partial<React.ComponentProps<typeof ExportWizard>> = {}) {
  const onClose = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ ci: messages }}>
      <ExportWizard agentId="ag1" agentName="Security Reviewer" open onClose={onClose} {...props} />
    </NextIntlClientProvider>,
  );
  return { onClose };
}

const continueBtn = () => screen.getByRole("button", { name: /continue/i });
const lastInput = () => h.previewInputs.at(-1) as CiExportInputBody | null;

/** Open the repo picker, filter it, and click an option. */
function pickRepo(name: string, query = name) {
  fireEvent.click(screen.getByText("Search repositories…"));
  fireEvent.change(screen.getByPlaceholderText("Search repositories…"), { target: { value: query } });
  fireEvent.click(screen.getByRole("button", { name }));
}

beforeEach(() => {
  h.targets = { data: [GHA], isLoading: false, isError: false, refetch: vi.fn() };
  h.preview = { data: makePreview(), isError: false, error: null };
  h.previewInputs = [];
  h.secrets = [];
  h.exportPending = false;
  h.repos = [{ full_name: REPO }, { full_name: "burnjohn/dev-digest" }];
  h.reposLoading = false;
  h.exportMutate.mockReset();
  h.archiveMutate.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ExportWizard — Target step", () => {
  it("shows 4 steps with Target current, one card per target, and a searchable repo picker", () => {
    h.targets.data = [GHA, { target: "circle", label_key: "exportWizard.targets.gha" }];
    renderWizard();

    expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
    const steps = screen.getAllByRole("listitem");
    expect(steps.map((li) => li.textContent)).toEqual(["1Target", "2Preview", "3Configure", "4Install"]);
    expect(steps[0]).toHaveAttribute("aria-current", "step");
    expect(steps.filter((li) => li.hasAttribute("aria-current"))).toHaveLength(1);
    expect(screen.getAllByRole("radio")).toHaveLength(2);

    expect(continueBtn()).toBeDisabled(); // no repo picked yet
    fireEvent.click(screen.getByText("Search repositories…"));
    const search = screen.getByPlaceholderText("Search repositories…");
    expect(screen.getByRole("button", { name: REPO })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "burnjohn/dev-digest" })).toBeInTheDocument();
    fireEvent.change(search, { target: { value: "burn" } });
    expect(screen.queryByRole("button", { name: REPO })).not.toBeInTheDocument(); // filtered out
    fireEvent.change(search, { target: { value: "payments" } });
    fireEvent.click(screen.getByRole("button", { name: REPO }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(continueBtn()).toBeEnabled();
    expect(lastInput()).toBeNull(); // nothing is requested until Continue

    fireEvent.click(continueBtn());
    expect(lastInput()).toMatchObject({ repo: REPO, target: "gha" });
    expect(screen.getByText("FILES TO CREATE")).toBeInTheDocument(); // advanced to Preview
  });

  it("validates the owner/name shape (AC-4) and flags an invalid pre-filled repo", () => {
    for (const bad of ["acme", "acme/", "/x", "a b/c", "a/b/c", `${"a".repeat(101)}/x`]) {
      expect(isRepoValid(bad)).toBe(false);
    }
    expect(isRepoValid(REPO)).toBe(true);

    renderWizard({ initial: { step: "target", repo: "a b/c" } });
    expect(screen.getByRole("alert")).toHaveTextContent("owner/name");
    expect(continueBtn()).toBeDisabled();
  });

  it("lists imported repos sorted and keeps a pre-filled repo that is not imported", () => {
    expect(repoOptions([{ full_name: "z/b" }, { full_name: "a/c" }], "")).toEqual(["a/c", "z/b"]);
    expect(repoOptions([{ full_name: "a/c" }], "old/repo")).toEqual(["a/c", "old/repo"]);
  });

  it("shows an add-repository hint when no repos are imported", () => {
    h.repos = [];
    renderWizard();
    expect(screen.getByText("No repositories imported yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add a repository" })).toHaveAttribute("href", "/onboarding");
    expect(continueBtn()).toBeDisabled();
  });

  it("shows an error with Retry when targets fail to load", () => {
    h.targets = { data: undefined, isLoading: false, isError: true, refetch: vi.fn() };
    renderWizard();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(h.targets.refetch).toHaveBeenCalled();
  });

  it("shows the provider message with a Config link and keeps Continue disabled on 422", () => {
    h.preview = {
      data: undefined,
      isError: true,
      error: new ApiError("provider", 422, "VALIDATION", { reason: "provider_not_supported", provider: "anthropic" }),
    };
    renderWizard();
    pickRepo(REPO, "payments");
    fireEvent.click(continueBtn());

    expect(screen.getByText(/Agent provider "anthropic" is not supported in CI/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Config tab" })).toHaveAttribute("href", "?tab=config");
    expect(continueBtn()).toBeDisabled();
    expect(screen.queryByText("FILES TO CREATE")).not.toBeInTheDocument();
  });
});

describe("ExportWizard — Preview step", () => {
  it("lists files, edits only the workflow, debounces the edit, and gates Continue on violations", () => {
    vi.useFakeTimers();
    renderWizard({ initial: { step: "preview", repo: REPO } });

    // Two panes: every file in the list, the workflow selected and editable first.
    const files = screen.getAllByRole("option");
    expect(files.map((o) => o.textContent)).toEqual([
      ".devdigest/agents/sec.yaml",
      ".github/workflows/devdigest-review.yml",
      ".devdigest/runner/index.js",
    ]);
    expect(screen.getByRole("option", { name: ".github/workflows/devdigest-review.yml" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("editable")).toBeInTheDocument();
    const workflow = screen.getByRole("textbox", { name: ".github/workflows/devdigest-review.yml" }) as HTMLTextAreaElement;
    expect(workflow.value).toBe("name: DevDigest Review");

    // The manifest is read-only (AC-12); the runner shows size + hash only (AC-13).
    fireEvent.click(screen.getByRole("option", { name: ".devdigest/agents/sec.yaml" }));
    expect(screen.getByText("name: sec").tagName).toBe("PRE");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByText("read-only")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: ".devdigest/runner/index.js" }));
    expect(screen.getByText(`2.0 KB · sha256 ${HASH}`)).toBeInTheDocument();
    expect(screen.queryByText("name: sec")).not.toBeInTheDocument();

    // Back to the workflow to edit it.
    fireEvent.click(screen.getByRole("option", { name: ".github/workflows/devdigest-review.yml" }));

    const editor = screen.getByRole("textbox", { name: ".github/workflows/devdigest-review.yml" }) as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: "name: edited" } });
    expect(editor.value).toBe("name: edited");
    expect(lastInput()).not.toHaveProperty("workflow");
    expect(continueBtn()).toBeDisabled(); // still settling
    act(() => void vi.advanceTimersByTime(499));
    expect(lastInput()).not.toHaveProperty("workflow");
    act(() => void vi.advanceTimersByTime(1));
    expect(lastInput()).toMatchObject({ workflow: "name: edited" });
    expect(continueBtn()).toBeEnabled();
  });

  it("lists violations (Continue disabled) and warnings (Continue enabled)", () => {
    h.preview.data = makePreview({
      workflow_violations: [
        { code: "pull_request_target", message: "x" },
        { code: "missing_runner_step", message: "y" },
      ],
    });
    renderWizard({ initial: { step: "preview", repo: REPO } });
    const alert = screen.getByRole("alert");
    expect(within(alert).getAllByRole("listitem")).toHaveLength(2);
    expect(alert).toHaveTextContent("pull_request_target is not allowed");
    expect(continueBtn()).toBeDisabled();
    cleanup();

    h.preview.data = makePreview({
      workflow_warnings: [{ code: "unpinned_action", ref: "actions/foo@v1" }],
      warnings: ["skill big-skill skipped: too long"],
    });
    renderWizard({ initial: { step: "preview", repo: REPO } });
    expect(screen.getByText("Action actions/foo@v1 is not pinned to a commit SHA")).toBeInTheDocument();
    expect(screen.getByText("skill big-skill skipped: too long")).toBeInTheDocument();
    expect(continueBtn()).toBeEnabled();
  });
});

describe("ExportWizard — Configure step", () => {
  const toConfigure = () => {
    renderWizard({ initial: { step: "preview", repo: REPO } });
    fireEvent.click(continueBtn());
  };

  it("shows default triggers, three post-as radios, secrets, GITHUB_TOKEN and the note", () => {
    h.secrets = [
      { name: "OPENROUTER_API_KEY", status: "set" },
      { name: "A_SECRET", status: "not_set" },
      { name: "B_SECRET", status: "unknown" },
    ] satisfies CiSecretStatus[];
    toConfigure();

    expect(screen.getByRole("button", { name: /:opened$/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /synchronize/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /reopened/ })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    expect(screen.getByRole("radio", { name: /GitHub review/ })).toBeChecked();
    expect(screen.getByText("recommended")).toBeInTheDocument();
    for (const label of ["set", "not set", "unknown", "ready"]) expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByText("GITHUB_TOKEN")).toBeInTheDocument();
    expect(screen.getByText(/A required status check plus Fail CI on blocks merges/)).toBeInTheDocument();
  });

  it("requires at least one trigger", () => {
    toConfigure();
    fireEvent.click(screen.getByRole("button", { name: /:opened$/ }));
    fireEvent.click(screen.getByRole("button", { name: /synchronize/ }));
    expect(screen.getByText("Select at least one trigger")).toBeInTheDocument();
    expect(continueBtn()).toBeDisabled();
  });

  it("confirms before dropping a workflow edit — cancel restores, confirm regenerates", () => {
    vi.useFakeTimers();
    renderWizard({ initial: { step: "preview", repo: REPO } });
    fireEvent.change(screen.getByRole("textbox", { name: /devdigest-review/ }), { target: { value: "name: edited" } });
    act(() => void vi.advanceTimersByTime(500)); // settle the debounce — Continue is gated on it
    fireEvent.click(continueBtn());

    fireEvent.click(screen.getByRole("radio", { name: /PR comment/ }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Regenerate the workflow?");

    fireEvent.click(screen.getByRole("button", { name: "Keep my edits" }));
    expect(screen.getByRole("radio", { name: /GitHub review/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /PR comment/ })).not.toBeChecked();

    fireEvent.click(screen.getByRole("radio", { name: /PR comment/ }));
    fireEvent.click(screen.getByRole("button", { name: "Regenerate" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /PR comment/ })).toBeChecked();
    expect(lastInput()).toMatchObject({ post_as: "pr_comment" });
    expect(lastInput()).not.toHaveProperty("workflow"); // the edit is dropped

    // no edit now → the next change applies without a prompt
    fireEvent.click(screen.getByRole("radio", { name: /None/ }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});

describe("ExportWizard — Install step", () => {
  const toInstall = () => {
    renderWizard({ initial: { step: "preview", repo: REPO } });
    fireEvent.click(continueBtn());
    fireEvent.click(continueBtn());
  };

  it("defaults to the PR option and shows the PR link on success", () => {
    h.exportMutate.mockImplementation((_input: unknown, o: { onSuccess: (r: unknown) => void }) =>
      o.onSuccess({ status: 201, data: { installation: null, pr_url: "https://github.com/acme/x/pull/9", reused_pr: false, warnings: [], refused_reason: null } }),
    );
    toInstall();

    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect(screen.getByRole("radio", { name: /Open a PR with these files/ })).toBeChecked();
    expect(screen.getByText("recommended")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Install" }));
    expect(h.exportMutate.mock.calls[0]![0]).toMatchObject({ repo: REPO, post_as: "github_review" });
    expect(screen.getByRole("link", { name: "View pull request" })).toHaveAttribute("href", "https://github.com/acme/x/pull/9");
  });

  it("disables Install and reads Installing… while pending", () => {
    h.exportPending = true;
    toInstall();
    const btn = screen.getByRole("button", { name: "Installing…" });
    expect(btn).toBeDisabled();
  });

  it("downloads devdigest-ci.zip through a Blob URL for the zip option", () => {
    const create = vi.fn(() => "blob:x");
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    h.archiveMutate.mockImplementation((_i: unknown, o: { onSuccess: (b: Blob) => void }) => o.onSuccess(new Blob(["zip"])));
    toInstall();

    fireEvent.click(screen.getByRole("radio", { name: /Copy files as a zip/ }));
    fireEvent.click(screen.getByRole("button", { name: "Download zip" }));
    expect(create).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    expect(revoke).toHaveBeenCalledWith("blob:x");
    click.mockRestore();
  });
});

describe("ExportWizard — dialog behaviour", () => {
  it("cycles focus inside the dialog with Tab and Shift+Tab", () => {
    renderWizard();
    const dialog = screen.getByRole("dialog");
    const focusables = Array.from(dialog.querySelectorAll<HTMLElement>("button:not([disabled]), input, a[href]"));
    const first = focusables[0]!;
    const last = focusables.at(-1)!;

    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
  });

  it("closes on Escape and on the close button", () => {
    const { onClose } = renderWizard();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("renders nothing while closed", () => {
    renderWizard({ open: false });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
