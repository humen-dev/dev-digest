"use client";

import React from "react";
import { PR_HEADER_HEIGHT_VAR } from "./constants";

/** Publishes the element's height as PR_HEADER_HEIGHT_VAR on its parent and
    keeps it current as the header wraps or resizes. */
export function useStickyHeightVar<T extends HTMLElement>(): React.RefObject<T | null> {
  const ref = React.useRef<T | null>(null);
  React.useLayoutEffect(() => {
    const el = ref.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;
    const publish = () => parent.style.setProperty(PR_HEADER_HEIGHT_VAR, `${el.offsetHeight}px`);
    publish();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => {
      ro.disconnect();
      parent.style.removeProperty(PR_HEADER_HEIGHT_VAR);
    };
  }, []);
  return ref;
}
