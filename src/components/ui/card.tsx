import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({
  className,
  interactive = false,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-card border border-line bg-surface shadow-card",
        interactive && "card-interactive",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1 px-5 pt-5 pb-3", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn("font-display text-[15px] font-extrabold tracking-[-0.3px] text-navy", className)}
      {...props}
    />
  );
}

export function CardDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-[13px] leading-relaxed text-ink-muted", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 pb-5", className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex items-center gap-2 border-t border-line-soft px-5 py-3", className)}
      {...props}
    />
  );
}

/**
 * The stat tile used across the dashboard: eyebrow label, one large figure,
 * a line of context, and an optional action. Pulled out so every tile is the
 * same shape — the fastest way to make a dashboard look considered.
 */
export function StatCard({
  label,
  icon,
  children,
  footer,
  className,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card interactive className={cn("flex flex-col", className)}>
      <div className="flex flex-1 flex-col px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <span className="eyebrow">{label}</span>
          {icon ? (
            <span className="grid size-7 shrink-0 place-items-center rounded-md bg-mint-50 text-mint-deep [&_svg]:size-3.5">
              {icon}
            </span>
          ) : null}
        </div>

        <div className="mt-2.5 flex-1">{children}</div>

        {footer ? <div className="mt-3 text-xs text-ink-muted">{footer}</div> : null}
      </div>
    </Card>
  );
}
