import type { AppRole } from "@/lib/types";

/**
 * Links to the tools the team works in day to day.
 *
 * This is a plain list rather than a database table on purpose: at 3-10 people
 * these change a couple of times a year, and a table would need CRUD screens,
 * RLS policies and an audit trail to earn its place. Adding a link is one entry
 * here plus a deploy. If it ever becomes something you edit weekly, that's the
 * point to move it into Postgres.
 */
export interface TeamAsset {
  id: string;
  name: string;
  description: string;
  href: string;
  /** Omit to show to everyone. Set to restrict, e.g. ["owner"] for finance. */
  roles?: AppRole[];
}

export const TEAM_ASSETS: TeamAsset[] = [
  {
    id: "jira",
    name: "Jira board",
    description:
      "Sprint board for the SS project — tickets, statuses and what you're picking up next.",
    href: "https://sysorastack.atlassian.net/jira/software/projects/SS/boards/2?filter=&groupBy=none",
  },
  {
    id: "n8n",
    name: "Sysora n8n",
    description:
      "Automation workflows, including the EOD form and the webhook that feeds reports back into this app.",
    href: "https://n8n-production-db72.up.railway.app/home/workflows",
  },
];

export function assetsForRole(role: AppRole): TeamAsset[] {
  return TEAM_ASSETS.filter((asset) => !asset.roles || asset.roles.includes(role));
}

/** "sysorastack.atlassian.net" — shown so people can see where a link goes. */
export function assetHost(href: string): string {
  try {
    return new URL(href).host;
  } catch {
    return href;
  }
}
