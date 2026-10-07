/** Where a PR Brief link lands in the Files changed tab (SPEC-04). */
export interface DiffTarget {
  file: string;
  line: number | null;
}
