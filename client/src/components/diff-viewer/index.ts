/* diff-viewer — unified-diff viewer with optional inline GitHub comments and
   an optional review-findings overlay. Public surface: the DiffViewer
   component + the DiffCommentApi / DiffFindingOverlay contracts. */
export { DiffViewer } from "./DiffViewer";
export type { DiffCommentApi } from "./comments";
export type { DiffFindingOverlay, DiffFindingMarker } from "./findings";
