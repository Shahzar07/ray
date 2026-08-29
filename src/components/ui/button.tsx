"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "relative inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium transition-[background-color,color,box-shadow,border-color,transform] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--canvas)] disabled:pointer-events-none disabled:opacity-45 active:translate-y-px [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-accent text-accent-fg shadow-xs hover:bg-accent-hover edge-light",
        secondary:
          "bg-surface text-strong border border-line shadow-xs hover:bg-sunken hover:border-line-strong",
        ghost: "text-muted hover:bg-inset hover:text-strong",
        subtle: "bg-inset text-body hover:bg-sunken hover:text-strong",
        danger: "bg-danger text-white shadow-xs hover:brightness-110 edge-light",
        success: "bg-success text-white shadow-xs hover:brightness-110 edge-light",
        outline:
          "border border-line-strong bg-transparent text-body hover:bg-inset hover:text-strong",
        link: "text-accent-text underline-offset-4 hover:underline",
      },
      size: {
        xs: "h-7 px-2 text-[12px] [&_svg]:size-3.5 rounded-md",
        sm: "h-8 px-2.5 text-[13px] [&_svg]:size-4",
        md: "h-9 px-3.5 text-[13.5px] [&_svg]:size-4",
        lg: "h-11 px-5 text-[15px] [&_svg]:size-[18px] rounded-xl",
        xl: "h-14 px-6 text-base [&_svg]:size-5 rounded-xl",
        icon: "size-9 [&_svg]:size-4",
        "icon-sm": "size-8 [&_svg]:size-4 rounded-md",
        "icon-lg": "size-11 [&_svg]:size-5 rounded-xl",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <>
            <Loader2 className="animate-spin" aria-hidden />
            <span className="sr-only">Working…</span>
            <span aria-hidden className="contents">{children}</span>
          </>
        ) : (
          children
        )}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };
