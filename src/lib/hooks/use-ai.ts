"use client";

import * as React from "react";
import { isAiEnabled } from "@/lib/actions/ai";

/**
 * Whether to render the AI affordances at all. Resolved once per page load and
 * shared, so a drawer and a Call Mode panel opening in the same session do not
 * each ask the server.
 *
 * Starts false, so nothing flashes in and then out on a deployment with no key.
 */
let cached: Promise<boolean> | null = null;

export function useAiEnabled(): boolean {
  const [enabled, setEnabled] = React.useState(false);

  React.useEffect(() => {
    let live = true;
    cached ??= isAiEnabled().catch(() => false);
    void cached.then((value) => {
      if (live) setEnabled(value);
    });
    return () => {
      live = false;
    };
  }, []);

  return enabled;
}
