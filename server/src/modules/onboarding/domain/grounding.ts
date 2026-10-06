/**
 * Grounds a model's tour draft into the document the API stores (SPEC-03
 * §3.5, Decisions D4-D5). Pure: file reading, token counting and secret
 * detection are done by the caller; this module only redacts, truncates,
 * checks every cited path/command against the grounding context, dedupes,
 * caps each section to its limit and counts proposed/dropped items.
 *
 * Per-item order (unit Steps #5): redact → truncate → ground → dedupe →
 * limit. Redaction and length limits apply to model-written TEXT fields
 * only (overview, diagram, note, reason, title, command) — path/target
 * identifiers are checked for grounding unmodified, since they have no
 * length limit and redacting them would break the match.
 */
import type {
  TourArchitecture,
  TourComplexity,
  TourPathItem,
  TourReadingItem,
  TourStep,
  TourTask,
} from '@devdigest/shared';
import { redactSecretValues } from '../../_shared/secrets.js';
import type { TourDocument, TourDraft } from '../types.js';
import { groundCommand } from './commands.js';
import { groundPath } from './paths.js';
import { markOverviewPaths, truncate } from './text.js';

/** The grounding inputs for one generation (SPEC-03 §3.5). */
export interface GroundingContext {
  /** Tracked paths at the tour commit. */
  tracked: ReadonlySet<string>;
  /** AC-44 candidate files. */
  candidates: ReadonlySet<string>;
  /** Command source path → text. */
  commandSources: ReadonlyMap<string, string>;
}

/** `importer_count` is filled in later (U3/U4), always `null` out of grounding. */
export type GroundedTour = Omit<TourDocument, 'tracked_file_count' | 'indexed_file_count'>;

const LIMITS = {
  critical_paths: 8,
  guided_reading: 10,
  how_to_run: 10,
  first_tasks: 6,
} as const;

/** AC-53 length limits. */
const OVERVIEW_LIMIT = 1500;
const SHORT_TEXT_LIMIT = 140; // note, reason, task title
const COMMAND_LIMIT = 200;

interface GroundedSection<T> {
  items: T[];
  dropped: number;
}

function groundArchitecture(draft: TourDraft, tracked: ReadonlySet<string>): TourArchitecture {
  const overview = truncate(redactSecretValues(draft.overview), OVERVIEW_LIMIT);
  const diagramRedacted = redactSecretValues(draft.diagram);
  return {
    overview,
    overview_paths: markOverviewPaths(overview, tracked),
    diagram: diagramRedacted === '' ? null : diagramRedacted,
  };
}

/** Critical paths and guided reading entries ground against `candidates` (AC-44), not `tracked`. */
function groundCitedItems<D, T>(
  drafted: readonly D[],
  candidates: ReadonlySet<string>,
  pathOf: (d: D) => string,
  build: (d: D, path: string) => T,
  limit: number,
): GroundedSection<T> {
  let dropped = 0;
  const seen = new Set<string>();
  const kept: T[] = [];
  for (const d of drafted) {
    const path = pathOf(d);
    if (!candidates.has(path)) {
      dropped += 1;
      continue;
    }
    if (seen.has(path)) continue; // dedupe (AC-52) — not counted as dropped
    seen.add(path);
    kept.push(build(d, path));
  }
  return { items: kept.slice(0, limit), dropped };
}

function groundCriticalPaths(
  drafted: TourDraft['critical_paths'],
  candidates: ReadonlySet<string>,
): GroundedSection<TourPathItem> {
  return groundCitedItems(
    drafted,
    candidates,
    (d) => d.path,
    (d, path) => ({
      path,
      note: truncate(redactSecretValues(d.note), SHORT_TEXT_LIMIT),
      importer_count: null,
    }),
    LIMITS.critical_paths,
  );
}

function groundGuidedReading(
  drafted: TourDraft['guided_reading'],
  candidates: ReadonlySet<string>,
): GroundedSection<TourReadingItem> {
  return groundCitedItems(
    drafted,
    candidates,
    (d) => d.path,
    (d, path) => ({
      path,
      reason: truncate(redactSecretValues(d.reason), SHORT_TEXT_LIMIT),
      importer_count: null,
    }),
    LIMITS.guided_reading,
  );
}

function groundHowToRun(
  drafted: TourDraft['how_to_run'],
  sources: ReadonlyMap<string, string>,
): GroundedSection<TourStep> {
  let dropped = 0;
  const seen = new Set<string>();
  const kept: TourStep[] = [];
  for (const d of drafted) {
    const command = truncate(redactSecretValues(d.command), COMMAND_LIMIT);
    const source = groundCommand(command, sources);
    if (source === null) {
      dropped += 1;
      continue;
    }
    if (seen.has(command)) continue; // dedupe (AC-52)
    seen.add(command);
    const note = truncate(redactSecretValues(d.note), SHORT_TEXT_LIMIT);
    kept.push({ command, note: note === '' ? null : note, source });
  }
  return { items: kept.slice(0, LIMITS.how_to_run), dropped };
}

function groundFirstTasks(
  drafted: readonly { title: string; target: string; complexity: TourComplexity }[],
  tracked: ReadonlySet<string>,
): GroundedSection<TourTask> {
  let dropped = 0;
  const seen = new Set<string>();
  const kept: TourTask[] = [];
  for (const d of drafted) {
    const result = groundPath(d.target, tracked, true);
    if (!result.grounded) {
      dropped += 1;
      continue;
    }
    if (seen.has(d.target)) continue; // dedupe (AC-52)
    seen.add(d.target);
    kept.push({
      title: truncate(redactSecretValues(d.title), SHORT_TEXT_LIMIT),
      target: d.target,
      complexity: d.complexity,
      new_file: result.newFile,
    });
  }
  return { items: kept.slice(0, LIMITS.first_tasks), dropped };
}

/** Grounds a model draft into the document the API stores. Deterministic (NFR-5). */
export function groundTour(draft: TourDraft, ctx: GroundingContext): GroundedTour {
  const criticalPaths = groundCriticalPaths(draft.critical_paths, ctx.candidates);
  const guidedReading = groundGuidedReading(draft.guided_reading, ctx.candidates);
  const howToRun = groundHowToRun(draft.how_to_run, ctx.commandSources);
  const firstTasks = groundFirstTasks(draft.first_tasks, ctx.tracked);

  return {
    architecture: groundArchitecture(draft, ctx.tracked),
    critical_paths: criticalPaths.items,
    guided_reading: guidedReading.items,
    how_to_run: howToRun.items,
    first_tasks: firstTasks.items,
    counters: {
      critical_paths: { proposed: draft.critical_paths.length, dropped: criticalPaths.dropped },
      guided_reading: { proposed: draft.guided_reading.length, dropped: guidedReading.dropped },
      how_to_run: { proposed: draft.how_to_run.length, dropped: howToRun.dropped },
      first_tasks: { proposed: draft.first_tasks.length, dropped: firstTasks.dropped },
    },
  };
}

/** EC-14: all 5 sections empty — the architecture section counts as empty when it has no overview text. */
export function isEmptyTour(t: GroundedTour): boolean {
  return (
    t.architecture.overview === '' &&
    t.critical_paths.length === 0 &&
    t.how_to_run.length === 0 &&
    t.guided_reading.length === 0 &&
    t.first_tasks.length === 0
  );
}
