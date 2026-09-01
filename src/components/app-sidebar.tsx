"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  CalendarCheck2,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  NotebookPen,
  Plane,
  Target,
  Users,
} from "lucide-react";
import { Wordmark } from "@/components/wordmark";
import { localTime, zoneLabel } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { AppRole } from "@/lib/types";

const EOD_NAV = { href: "/eod", label: "EOD Report", icon: NotebookPen } as const;
const BID_NAV = { href: "/bids", label: "My bids", icon: Target } as const;

/** Every role sees these. */
const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/attendance", label: "Attendance", icon: CalendarCheck2 },
  { href: "/leave", label: "Leave", icon: Plane },
] as const;

const TAIL = [{ href: "/assets", label: "Team assets", icon: LayoutGrid }] as const;

/**
 * A BDE reports the day by logging bids, so My bids replaces EOD Report
 * rather than sitting beside it — two places to describe one day is how they
 * end up disagreeing. The bids page files the end-of-day itself, so a bidder
 * still shows up in the team's coverage and can still raise a blocker.
 *
 * Everyone else keeps the EOD form. Staff see both: they file their own day
 * and read everyone's bidding.
 */
function navFor(role: AppRole) {
  const staff = role === "owner" || role === "manager";
  if (role === "bde") return [...NAV, BID_NAV, ...TAIL];
  if (staff) return [...NAV, EOD_NAV, BID_NAV, ...TAIL];
  return [...NAV, EOD_NAV, ...TAIL];
}

const ROLE_LABEL: Record<AppRole, string> = {
  owner: "Owner",
  manager: "Manager",
  employee: "Employee",
  bde: "BDE",
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
    <span className="tabular text-ink-muted">
      {localTime(timeZone, now)} · {zoneLabel(timeZone, now)}
    </span>
  );
}

function initials(fullName: string) {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function NavLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[14px] transition-colors duration-150",
        active
          ? "bg-mint-50 font-semibold text-mint-deep"
          : "font-medium text-ink-muted hover:bg-mint-50/60 hover:text-navy",
      )}
    >
      {/* Active rail — reads at a glance without shouting. */}
      <span
        aria-hidden
        className={cn(
          "absolute top-1/2 left-0 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-mint transition-opacity duration-150",
          active ? "opacity-100" : "opacity-0",
        )}
      />
      <Icon
        className={cn(
          "size-[18px] shrink-0 transition-colors",
          active ? "text-mint-deep" : "text-ink-faint group-hover:text-ink-muted",
        )}
      />
      {label}
    </Link>
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
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      {/* Desktop rail. sticky + h-dvh so it stays put while the page scrolls;
          the nav scrolls inside itself if it ever outgrows the viewport. */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line-soft bg-surface-alt md:flex">
        <div className="px-5 py-5">
          <Wordmark />
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3">
          <p className="eyebrow px-3 pt-2 pb-2">Workspace</p>
          {navFor(role).map(({ href, label, icon }) => (
            <NavLink key={href} href={href} label={label} icon={icon} active={isActive(href)} />
          ))}

          {staff ? (
            <>
              <p className="eyebrow px-3 pt-5 pb-2">Manage</p>
              <NavLink href="/team" label="Team" icon={Users} active={pathname === "/team"} />
            </>
          ) : null}
        </nav>

        {/* Signed-in block */}
        <div className="border-t border-line-soft p-3">
          <div className="flex items-center gap-3 rounded-lg bg-surface px-3 py-2.5 shadow-xs ring-1 ring-line-soft">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-mint-50 text-[13px] font-bold text-mint-deep ring-1 ring-mint-line">
              {initials(fullName)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold text-navy">{fullName}</span>
              <span className="block text-[11px] text-ink-muted">{ROLE_LABEL[role]}</span>
            </span>
          </div>

          <p className="px-3 pt-2.5 text-[11px]">
            <LocalClock timeZone={timeZone} />
          </p>

          <form action="/auth/sign-out" method="post" className="mt-1">
            <button
              type="submit"
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium text-ink-muted transition-colors hover:bg-danger-wash hover:text-danger"
            >
              <LogOut className="size-[18px] shrink-0" />
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* Mobile bar */}
      <div className="sticky top-0 z-20 border-b border-line-soft bg-surface-alt/95 backdrop-blur md:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <Wordmark />
          <div className="flex items-center gap-3">
            <span className="grid size-8 place-items-center rounded-full bg-mint-50 text-[11px] font-bold text-mint-deep ring-1 ring-mint-line">
              {initials(fullName)}
            </span>
            <form action="/auth/sign-out" method="post">
              <button type="submit" aria-label="Sign out" className="text-ink-muted">
                <LogOut className="size-[18px]" />
              </button>
            </form>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2">
          {[
            ...navFor(role),
            ...(staff ? [{ href: "/team", label: "Team", icon: Users } as const] : []),
          ].map(
            ({ href, label, icon: Icon }) => {
              const active = isActive(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] transition-colors",
                    active
                      ? "bg-mint-50 font-semibold text-mint-deep"
                      : "font-medium text-ink-muted",
                  )}
                >
                  <Icon className="size-4" />
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
