"use client";

import * as React from "react";
import { Keyboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent } from "@/components/ui/overlays";
import { Kbd } from "@/components/ui/display";

const GROUPS: Array<{ title: string; items: Array<[string, string]> }> = [
  {
    title: "Anywhere",
    items: [
      ["⌘ K", "Command palette — search leads or jump"],
      ["g then t", "Go to Today"],
      ["g then c", "Go to Call Mode"],
      ["g then l", "Go to Leads"],
      ["g then d", "Go to Demo Weeks"],
      ["?", "This help"],
    ],
  },
  {
    title: "Leads table",
    items: [
      ["j / k", "Move down / up"],
      ["Enter", "Open the lead"],
      ["x", "Select the row"],
      ["/", "Focus search"],
    ],
  },
  {
    title: "Call Mode",
    items: [
      ["1 – 6", "Log the outcome"],
      ["n", "Jump to the note box"],
      ["f", "Set a follow-up"],
      ["s", "Skip this lead"],
      ["u", "Undo the last log"],
    ],
  },
];

export function ShortcutHelp() {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.key === "?") {
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <Button variant="ghost" size="icon-sm" onClick={() => setOpen(true)} aria-label="Keyboard shortcuts">
        <Keyboard />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Keyboard shortcuts" description="CallDesk is built to be driven from the keyboard.">
          <DialogBody className="pb-5">
            <div className="space-y-5">
              {GROUPS.map((group) => (
                <div key={group.title}>
                  <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-subtle">
                    {group.title}
                  </p>
                  <dl className="space-y-1.5">
                    {group.items.map(([key, description]) => (
                      <div key={key} className="flex items-center justify-between gap-4">
                        <dt className="text-[13px] text-body">{description}</dt>
                        <dd className="flex shrink-0 gap-1">
                          {key.split(" ").map((part, i) =>
                            part === "then" || part === "/" || part === "–" ? (
                              <span key={i} className="text-[11px] text-subtle">
                                {part}
                              </span>
                            ) : (
                              <Kbd key={i}>{part}</Kbd>
                            ),
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}
