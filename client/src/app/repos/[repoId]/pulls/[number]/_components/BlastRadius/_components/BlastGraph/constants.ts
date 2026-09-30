/** SVG geometry, in viewBox units. Three columns: symbols, callers, endpoints/crons. */
export const VIEW_W = 720;
export const NODE_W = 200;
export const NODE_H = 26;
export const ROW_H = 36;
export const PAD = 12;
export const COL_X = [PAD, (VIEW_W - NODE_W) / 2, VIEW_W - NODE_W - PAD] as const;
/** Nodes per column before the rest collapse into one "+N more" node. */
export const MAX_NODES_PER_COLUMN = 12;
/** Longest label (chars) before it is ellipsised; the full text stays in the tooltip. */
export const MAX_LABEL_CHARS = 26;
