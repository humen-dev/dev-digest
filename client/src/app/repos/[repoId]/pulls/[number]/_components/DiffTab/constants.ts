/* DiffTab constants — role display metadata (docs/plans/smart-diff.md
   Decisions 12/13/14) and the order-toggle default. Colours reuse existing
   CSS vars only ("no new palette"). */
import type { SmartDiffRole } from "@devdigest/shared";

export type OrderMode = "smart" | "original";

export const DEFAULT_ORDER: OrderMode = "smart";

/** Display order = SmartDiffRole enum order — mirrors the server's
   SMART_DIFF_ROLE_ORDER (docs/plans/smart-diff.md Decision 5). A literal list,
   not `SmartDiffRole.options`: a value import from `@devdigest/shared` pulls the
   vendored barrel (`.js`-suffixed imports) into the Next/webpack bundle, which
   cannot resolve them. The type check below fails if a role is missing. */
export const SMART_DIFF_ROLE_ORDER = [
  "core",
  "tests",
  "wiring",
  "docs",
  "boilerplate",
] as const satisfies readonly SmartDiffRole[];

type MissingRole = Exclude<SmartDiffRole, (typeof SMART_DIFF_ROLE_ORDER)[number]>;
const ROLE_ORDER_IS_COMPLETE: [MissingRole] extends [never] ? true : never = true;
void ROLE_ORDER_IS_COMPLETE;

export interface RoleMeta {
  labelKey: string;
  descriptionKey: string;
  /** Coloured square in the group header. */
  color: string;
  /** Docs and boilerplate start collapsed; the rest start open (Decision 14). */
  defaultOpen: boolean;
}

export const ROLE_META: Record<SmartDiffRole, RoleMeta> = {
  core: {
    labelKey: "coreLabel",
    descriptionKey: "coreDescription",
    color: "var(--accent)",
    defaultOpen: true,
  },
  tests: {
    labelKey: "testsLabel",
    descriptionKey: "testsDescription",
    color: "var(--ok)",
    defaultOpen: true,
  },
  wiring: {
    labelKey: "wiringLabel",
    descriptionKey: "wiringDescription",
    color: "var(--warn)",
    defaultOpen: true,
  },
  docs: {
    labelKey: "docsLabel",
    descriptionKey: "docsDescription",
    color: "var(--text-secondary)",
    defaultOpen: false,
  },
  boilerplate: {
    labelKey: "boilerplateLabel",
    descriptionKey: "boilerplateDescription",
    color: "var(--info)",
    defaultOpen: false,
  },
};
