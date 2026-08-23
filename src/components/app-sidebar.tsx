"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { CalendarCheck2, LayoutDashboard, LogOut, NotebookPen, Plane, Users } from "lucide-react";
import { Wordmark } from "@/components/wordmark";
import { localTime, zoneLabel } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { AppRole } from "@/lib/types";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/attendance", label: "Attendance", icon: CalendarCheck2 },
  { href: "/leave", label: "Leave", icon: Plane },
  { href: "/eod", label: "EOD Report", icon: NotebookPen },
] as const;

const ROLE_LABEL: Record<AppRole, string> = {
  owner: "Owner",
  manager: "Manager",
  employee: "Employee",
};

/** Renders only after mount so the server HTML and the client agree. */
function LocalClock({ timeZone }: { timeZone: string }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (!now) return <span className="text-ink-faint">{timeZone}</span>;

  return (
    <span className="text-ink-muted">
      {localTime(timeZone, now)} · {zoneLabel(timeZone, now)}
    </span>
  );
}

export function AppSidebar({
  fullName,
  role,
  timeZone,
}: {
  fullName: string;
  role: AppRole;
  timeZone: string;
}) {
  const pathname = usePathname();
  const staff = role === "owner" || role === "manager";

  return (
    <>
      {/* Desktop rail */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-surface md:flex">
        <div className="px-5 py-5">
          <Wordmark />
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 px-3">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-mint-soft font-medium text-mint-deep"
                    : "text-ink-muted hover:bg-canvas hover:text-navy",
                )}
              >
                <Icon className="size-4" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-line p-3">
          <div className="rounded-lg px-2 py-2">
            <p className="truncate text-[13px] font-medium text-navy">{fullName}</p>
            <p className="text-xs text-ink-muted">{ROLE_LABEL[role]}</p>
            <p className="mt-1 text-xs">
              <LocalClock timeZone={timeZone} />
            </p>
          </div>

          <div className="mt-1 flex flex-col gap-0.5">
            {staff ? (
              <Link
                href="/team"
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-colors",
                  pathname.startsWith("/team")
                    ? "bg-mint-soft font-medium text-mint-deep"
                    : "text-ink-muted hover:bg-canvas hover:text-navy",
                )}
              >
                <Users className="size-4" />
                Team
              </Link>
            ) : null}

            <form action="/auth/sign-out" method="post">
              <button
                type="submit"
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-ink-muted transition-colors hover:bg-canvas hover:text-navy"
              >
                <LogOut className="size-4" />
                Sign out
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* Mobile bar */}
      <div className="sticky top-0 z-20 border-b border-line bg-surface md:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <Wordmark />
          <div className="flex items-center gap-3">
            <span className="text-xs">
              <LocalClock timeZone={timeZone} />
            </span>
            <form action="/auth/sign-out" method="post">
              <button type="submit" aria-label="Sign out" className="text-ink-muted">
                <LogOut className="size-4" />
              </button>
            </form>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2">
          {[...NAV, ...(staff ? [{ href: "/team", label: "Team", icon: Users } as const] : [])].map(
            ({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px]",
                    active ? "bg-mint-soft font-medium text-mint-deep" : "text-ink-muted",
                  )}
                >
                  <Icon className="size-3.5" />
                  {label}
                </Link>
              );
            },
          )}
        </nav>
      </div>
    </>
  );
}
