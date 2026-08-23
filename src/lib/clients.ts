/**
 * The clients whose logins this team holds.
 *
 * Kept in code alongside src/lib/team-assets.ts for the same reason: this list
 * changes when you win or lose an account, not weekly, and a table would need
 * CRUD screens and RLS to earn its place. A credential's client_key is a plain
 * text column, so a client removed from this list surfaces as unassigned rather
 * than taking its credentials down with it.
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

export function clientName(key: string | null): string {
  if (!key) return "Unassigned";
  return CLIENTS.find((c) => c.key === key)?.name ?? key;
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
