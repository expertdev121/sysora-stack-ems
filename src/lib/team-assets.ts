import { titleCase } from "@/lib/utils";
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
    id: "onboarding-sop",
    name: "Onboarding SOP",
    description:
      "Step by step for bringing a new team member on — accounts, access, and their first week.",
    href: "https://possible-waxflower-2ae.notion.site/SOP-Sysora-Stack-Team-Member-Onboarding-3c53ff5ad2058184a4a2dec2d950f596",
    // Everyone: the person being onboarded needs this at least as much as the
    // person doing the onboarding.
  },
  {
    id: "english-vocab",
    name: "English vocabulary",
    description:
      "Shared word list for the team. Opens in Google Drive — no login of its own.",
    href: "https://drive.google.com/file/d/1EY36Ea1q_KOm5G0sxGwnZkLKtrqqTja4/view?usp=sharing",
    // Everyone: it is a reference, and the people most likely to want it are
    // the ones least likely to be told it exists.
  },
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
  {
    id: "ghl",
    name: "Sysora GHL account",
    description:
      "GoHighLevel sub-account dashboard — CRM, pipelines, funnels and client automations.",
    href: "https://app.givesuite.com/v2/location/5VD5QnpROyZi3omw1BP1/dashboard",
  },
  {
    id: "superhuman-prompt-builder",
    name: "Superhuman prompt builder",
    description:
      "Custom GPT for building prompts on the fly. No login of its own — uses your ChatGPT account.",
    href: "https://chatgpt.com/g/g-686648dd496081918f2df808437bd55f-superhuman-on-the-fly-prompt-builder",
  },
  {
    id: "justpaste",
    name: "JustPaste.it",
    description: "Quick copy-and-paste scratch pad for sharing snippets. No login needed.",
    href: "https://justpaste.it/",
  },
];

export function assetsForRole(role: AppRole): TeamAsset[] {
  return TEAM_ASSETS.filter((asset) => !asset.roles || asset.roles.includes(role));
}

/** The onboarding runbook, surfaced on the dashboard for new joiners. */
export const ONBOARDING_ASSET_ID = "onboarding-sop";

export function onboardingAsset(): TeamAsset | undefined {
  return TEAM_ASSETS.find((asset) => asset.id === ONBOARDING_ASSET_ID);
}

/**
 * Display names for the tools a credential can belong to.
 *
 * Deliberately NOT the TEAM_ASSETS name: that is the name of *our* link (e.g.
 * "Sysora GHL account"), which would mislabel a client's login for the same
 * platform. This names the platform, not our account on it.
 */
const TOOL_NAMES: Record<string, string> = {
  "a2a-course": "A2A course",
  addevent: "AddEvent",
  chc: "GoHighLevel",
  claude: "Claude",
  clickup: "ClickUp",
  email: "Email",
  "email-delivery": "Email delivery",
  ghl: "GoHighLevel",
  gmail: "Gmail",
  gohighlevel: "GoHighLevel",
  greengeeks: "GreenGeeks",
  groupkit: "GroupKit",
  microsoft: "Microsoft",
  miro: "Miro",
  "my-profit-engine": "My Profit Engine",
  n8n: "n8n",
  openai: "OpenAI",
  "p2p-email": "Email",
  "power-bi": "Power BI",
  scoreapp: "ScoreApp",
  "sola-payments": "Sola Payments",
  thinkific: "Thinkific",
  zapier: "Zapier",
  zoom: "Zoom",
};

/**
 * TOOL_NAMES only exists to get brand casing right ("GoHighLevel", not
 * "Gohighlevel"). Anything not listed is title-cased from its slug, so a tool
 * nobody predicted still displays sensibly the moment it's typed in.
 */
export function toolLabel(assetId: string): string {
  return TOOL_NAMES[assetId] ?? titleCase(assetId);
}

/** Suggestions for the tool field. Typing something new is always allowed. */
export function toolOptions(existingAssetIds: string[]): { id: string; name: string }[] {
  const ids = new Set([
    ...TEAM_ASSETS.map((a) => a.id),
    ...Object.keys(TOOL_NAMES),
    ...existingAssetIds,
  ]);
  return [...ids]
    .map((id) => ({ id, name: toolLabel(id) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** "sysorastack.atlassian.net" — shown so people can see where a link goes. */
export function assetHost(href: string): string {
  try {
    return new URL(href).host;
  } catch {
    return href;
  }
}
