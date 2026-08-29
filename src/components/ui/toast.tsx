"use client";

import * as React from "react";
import * as ToastPrimitive from "@radix-ui/react-toast";
import { AlertTriangle, CheckCircle2, Info, Undo2, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastTone = "success" | "danger" | "warning" | "info";

export type ToastOptions = {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** Optimistic-UI rollback affordance. Toast stays open a little longer. */
  action?: { label: string; onClick: () => void | Promise<void> };
  duration?: number;
};

type ToastRecord = ToastOptions & { id: number };

const ToastContext = React.createContext<{ toast: (o: ToastOptions) => void } | null>(null);

const ICONS: Record<ToastTone, React.ElementType> = {
  success: CheckCircle2,
  danger: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const TONE_ICON_CLASS: Record<ToastTone, string> = {
  success: "text-success",
  danger: "text-danger",
  warning: "text-warning",
  info: "text-info",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastRecord[]>([]);
  const nextId = React.useRef(0);

  const toast = React.useCallback((options: ToastOptions) => {
    const id = ++nextId.current;
    setItems((prev) => [...prev.slice(-3), { ...options, id }]);
  }, []);

  const value = React.useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      <ToastPrimitive.Provider swipeDirection="right" duration={4500}>
        {children}
        {items.map((item) => {
          const Icon = ICONS[item.tone ?? "info"];
          return (
            <ToastPrimitive.Root
              key={item.id}
              duration={item.duration ?? (item.action ? 8000 : 4500)}
              onOpenChange={(open) => {
                if (!open) setItems((prev) => prev.filter((t) => t.id !== item.id));
              }}
              className={cn(
                "pointer-events-auto flex w-full items-start gap-3 rounded-xl border border-line bg-surface p-3.5 shadow-lg",
                "data-[state=open]:animate-[toast-in_0.22s_cubic-bezier(0.22,1,0.36,1)]",
                "data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=cancel]:translate-x-0 data-[swipe=cancel]:transition-transform",
                "data-[state=closed]:opacity-0 data-[state=closed]:transition-opacity",
              )}
            >
              <Icon className={cn("mt-px size-[18px] shrink-0", TONE_ICON_CLASS[item.tone ?? "info"])} aria-hidden />
              <div className="min-w-0 flex-1">
                <ToastPrimitive.Title className="text-[13px] font-semibold text-strong">
                  {item.title}
                </ToastPrimitive.Title>
                {item.description && (
                  <ToastPrimitive.Description className="mt-0.5 text-[12.5px] leading-snug text-muted">
                    {item.description}
                  </ToastPrimitive.Description>
                )}
              </div>
              {item.action && (
                <ToastPrimitive.Action
                  altText={item.action.label}
                  onClick={() => void item.action!.onClick()}
                  className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-[12px] font-medium text-strong transition-colors hover:bg-inset"
                >
                  <Undo2 className="size-3.5" />
                  {item.action.label}
                </ToastPrimitive.Action>
              )}
              <ToastPrimitive.Close
                aria-label="Dismiss"
                className="-mr-1 -mt-1 grid size-6 shrink-0 place-items-center rounded-md text-subtle transition-colors hover:bg-inset hover:text-strong"
              >
                <X className="size-3.5" />
              </ToastPrimitive.Close>
            </ToastPrimitive.Root>
          );
        })}
        <ToastPrimitive.Viewport
          aria-live="polite"
          className="pointer-events-none fixed bottom-0 right-0 z-[100] flex w-full max-w-[380px] flex-col gap-2 p-4 outline-none max-sm:bottom-[env(safe-area-inset-bottom)]"
        />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
