import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { TONE_CLASS, TONE_DOT, type Tone } from "@/lib/domain/constants";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-md font-medium ring-1 ring-inset whitespace-nowrap",
  {
    variants: {
      size: {
        xs: "h-5 px-1.5 text-[11px]",
        sm: "h-[22px] px-2 text-[11.5px]",
        md: "h-6 px-2.5 text-xs",
        lg: "h-7 px-3 text-[13px]",
      },
    },
    defaultVariants: { size: "sm" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  tone?: Tone;
  dot?: boolean;
}

export function Badge({ className, tone = "neutral", size, dot = false, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ size }), TONE_CLASS[tone], className)} {...props}>
      {dot && <span className={cn("size-1.5 rounded-full", TONE_DOT[tone])} aria-hidden />}
      {children}
    </span>
  );
}
