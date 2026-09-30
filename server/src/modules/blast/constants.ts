/** Blast-module limits for the import-graph (indirect) walk — docs/plans/blast-radius-p3.md §3.3. */
export const MAX_INDIRECT_FILES_PER_SYMBOL = 25;
/** Total files the level loop may reach (hops 2..bfsDepth) before it stops expanding. */
export const MAX_INDIRECT_FRONTIER = 500;
