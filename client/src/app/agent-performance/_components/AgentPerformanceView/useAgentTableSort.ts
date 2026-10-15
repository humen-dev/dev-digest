"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { SortKey, SortState } from "./constants";
import { nextSort, parseSort } from "./helpers";

/** URL-bound table sort (`sort`, `dir`); every other query parameter (the period) is kept. */
export function useAgentTableSort(): { sort: SortState; toggle(key: SortKey): void } {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams?.toString() ?? "";
  const sort = useMemo(() => parseSort(new URLSearchParams(query)), [query]);

  const toggle = useCallback(
    (key: SortKey) => {
      const next = nextSort(sort, key);
      const sp = new URLSearchParams(query);
      sp.set("sort", next.key);
      sp.set("dir", next.dir);
      router.replace(`${pathname}?${sp.toString()}`);
    },
    [sort, query, pathname, router],
  );

  return { sort, toggle };
}
