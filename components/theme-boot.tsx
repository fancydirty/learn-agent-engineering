"use client";

import { useServerInsertedHTML } from "next/navigation";

/**
 * FOUC-safe theme boot injected outside the client React tree.
 *
 * A raw <script> (or next/script children) inside RootLayout triggers React 19 /
 * Next 16: "Encountered a script tag while rendering React component" on every
 * client render. useServerInsertedHTML puts the IIFE into the SSR stream without
 * React treating it as a client-rendered script node.
 */
const THEME_BOOT = `(function(){try{var s=localStorage.getItem("theme");var t=(s==="light"||s==="dark")?s:(matchMedia("(prefers-color-scheme:dark)").matches?"dark":"light");document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`;

export function ThemeBoot() {
  useServerInsertedHTML(() => (
    <script
      // eslint-disable-next-line react/no-danger -- intentional FOUC boot; inserted via useServerInsertedHTML
      dangerouslySetInnerHTML={{ __html: THEME_BOOT }}
    />
  ));
  return null;
}
