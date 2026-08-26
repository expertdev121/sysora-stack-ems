import { titleCase } from "@/lib/utils";

/**
 * Known clients — display names and hints only.
 *
 * This list is NOT a whitelist. client_key is free text, and the form lets you
 * type a client that isn't here; it will be slugified and grouped correctly,
 * just without a hint line. Adding an entry below only pins a nicer display
 * name ("MyProfitEngine" rather than "Mpe").
 */
export interface Client {
  key: string;
  name: string;
  /** Shown under the heading, to make the grouping self-explanatory. */
  hint?: string;
}

export const CLIENTS: Client[] = [
  { key: "sysora", name: "Sysora Stack", hint: "Our own accounts" },
  { key: "givesuite", name: "GiveSuite", hint: "Brandy" },
  { key: "p2p", name: "P2P", hint: "Process to Profit — incl. CHC, Jamie, NWR" },
  { key: "mpe", name: "MyProfitEngine", hint: "Jodi" },
  { key: "tub", name: "TUB", hint: "The Uncommon Business" },
  { key: "yann", name: "Yann", hint: "Upwork client" },
];

/**
 * CLIENTS only exists to pin display names and hints for the ones we know.
 * A client typed in freely is title-cased from its slug, so winning a new
 * account never requires a code change.
 */
export function clientName(key: string | null): string {
  if (!key) return "Unassigned";
  return CLIENTS.find((c) => c.key === key)?.name ?? titleCase(key);
}

/** Suggestions for the client field. Typing something new is always allowed. */
export function clientOptions(existingKeys: (string | null)[]): { id: string; name: string }[] {
  const keys = new Set<string>([
    ...CLIENTS.map((c) => c.key),
    ...existingKeys.filter((k): k is string => Boolean(k)),
  ]);
  return [...keys]
    .map((key) => ({ id: key, name: clientName(key) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function clientHint(key: string | null): string | undefined {
  if (!key) return "Not yet assigned to a client";
  return CLIENTS.find((c) => c.key === key)?.hint;
}

/** Client order for display, with anything unknown and then unassigned last. */
export function sortClientKeys(keys: (string | null)[]): (string | null)[] {
  const order = new Map(CLIENTS.map((c, i) => [c.key, i]));
  return [...keys].sort((a, b) => {
    if (a === null) return 1;
    if (b === null) return -1;
    const ai = order.get(a) ?? Number.MAX_SAFE_INTEGER;
    const bi = order.get(b) ?? Number.MAX_SAFE_INTEGER;
    if (ai !== bi) return ai - bi;
    return a.localeCompare(b);
  });
}
