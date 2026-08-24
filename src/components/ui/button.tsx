import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Buttons follow sysorastack.com: 12px radius, 700 weight, slightly tight
 * tracking, and a mint glow under the primary CTA rather than a grey drop
 * shadow. Hover darkens to mint-600 and lifts 1px, matching the site's
 * --accent-hover and --lift-1.
 *
 * `danger` exists because the brand book defines proper status colours. It is
 * for destructive actions only — never decoration — which keeps the
 * one-saturated-colour-per-view rule intact.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-bold tracking-[-0.1px] transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 active:translate-y-0",
  {
    variants: {
      variant: {
        primary:
          "bg-mint text-white shadow-glow hover:bg-mint-hover hover:-translate-y-px hover:shadow-glow-strong",
        secondary:
          "border border-line bg-surface text-navy shadow-xs hover:border-line-strong hover:bg-mint-50 hover:-translate-y-px hover:shadow-card",
        ghost: "text-ink-muted hover:bg-mint-50 hover:text-mint-deep",
        quiet:
          "border border-line-neutral bg-surface text-ink-muted hover:border-line-strong hover:bg-mint-50 hover:text-mint-deep",
        danger:
          "border border-danger-line bg-danger-wash text-danger hover:bg-danger-soft hover:border-danger",
        link: "text-mint-deep underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-9 px-3 text-[13px]",
        md: "h-10.5 px-5 text-[15px]",
        lg: "h-13 px-8 text-base",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };
