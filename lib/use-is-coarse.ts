"use client";

import { useEffect, useState } from "react";

/** Coarse-pointer touch environment (phone/tablet). SSR/first paint returns false; updates via matchMedia after hydrate. */
export function useIsCoarse(): boolean {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse) and (max-width: 767px)");
    const update = () => setCoarse(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return coarse;
}
