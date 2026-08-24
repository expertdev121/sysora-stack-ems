import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { AddPersonForm } from "@/components/add-person-form";
import {
  ActiveToggle,
  CompensationField,
  ResetPasswordButton,
  RoleSelect,
} from "@/components/person-admin";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Callout } from "@/components/ui/callout";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { serviceRoleConfigured } from "@/lib/supabase/admin";
import { assetsForRole } from "@/lib/team-assets";
import { humanDate, localDateISO } from "@/lib/dates";
import type { Compensation, Profile } from "@/lib/types";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage() {
  const session = await requireStaff();
  const supabase = await createClient();
  const owner = session.profile.role === "owner";

  const todayISO = localDateISO(session.profile.timezone);

  // Same entry as on Team assets, so the URL lives in exactly one place.
  const onboardingSop = assetsForRole(session.profile.role).find(
    (asset) => asset.id === "onboarding-sop",
  );

  // compensation is Owner-only at the database. A Manager reaching this page
  // gets an empty array from RLS, not an error — so there is nothing to hide
  // in the UI, the data simply isn't there.
  const [{ data: peopleRows }, { data: compRows }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email, role, timezone, joined_on, is_active, must_change_password")
      .order("is_active", { ascending: false })
      .order("full_name"),
    supabase.from("compensation").select("profile_id, monthly_amount, currency"),
  ]);

  const people = (peopleRows ?? []) as Pick<
    Profile,
    | "id"
    | "full_name"
    | "email"
    | "role"
    | "timezone"
    | "joined_on"
    | "is_active"
    | "must_change_password"
  >[];
  const comp = (compRows ?? []) as Pick<
    Compensation,
    "profile_id" | "monthly_amount" | "currency"
  >[];
  const compFor = new Map(comp.map((c) => [c.profile_id, c]));

  return (
    <>
      <PageHeader
        title="Team"
        description={`${people.filter((p) => p.is_active).length} active · ${session.org.name}`}
      />

      {owner && !serviceRoleConfigured() ? (
        <Callout tone="warn" title="Adding people is switched off." className="mb-6">
          Creating an account writes an <code>auth.users</code> row, which needs admin rights.
          Set <code className="rounded bg-surface px-1 py-0.5 text-[12px]">
            SUPABASE_SERVICE_ROLE_KEY
          </code>{" "}
          from Supabase → Project Settings → API → <code>service_role</code>, then restart the
          server. Reset Password needs it too. Everything else on this page works without it.
        </Callout>
      ) : null}

      {onboardingSop ? (
        <Callout tone="accent" className="mb-6">
          <span className="flex flex-wrap items-center justify-between gap-3">
            <span>
              <strong>Bringing someone on?</strong> Follow the onboarding SOP so nothing gets
              missed — accounts, access, and their first week.
            </span>
            <a
              href={onboardingSop.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-1.5 font-medium underline underline-offset-2"
            >
              Open the SOP
              <ExternalLink className="size-3.5" />
            </a>
          </span>
        </Callout>
      ) : null}

      {owner ? (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Add someone</CardTitle>
            <CardDescription>
              Creates their account with a temporary password. There is no public signup and no
              invite email — you hand the password over yourself.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AddPersonForm today={todayISO} />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Everyone</CardTitle>
          {owner ? (
            <CardDescription>
              Monthly pay is visible to you only — it lives in its own table behind an Owner-only
              policy, so a Manager account cannot read it even through the API.
            </CardDescription>
          ) : (
            <CardDescription>
              Pay is Owner-only and is not returned to your account.
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  {["Person", "Role", "Timezone", "Joined", owner ? "Monthly pay" : null, ""]
                    .filter(Boolean)
                    .map((label, i) => (
                      <th
                        key={i}
                        className="py-2 pr-3 text-xs font-medium whitespace-nowrap text-ink-muted"
                      >
                        {label}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {people.map((person) => {
                  const isSelf = person.id === session.userId;
                  return (
                    <tr
                      key={person.id}
                      className={person.is_active ? "border-b border-line" : "border-b border-line opacity-55"}
                    >
                      <td className="py-3 pr-3">
                        <p className="text-[13px] font-medium text-navy">
                          {person.full_name}
                          {isSelf ? (
                            <span className="ml-1 text-[11px] font-normal text-ink-faint">
                              (you)
                            </span>
                          ) : null}
                        </p>
                        <p className="text-xs text-ink-muted">{person.email}</p>
                        {person.must_change_password ? (
                          <p className="mt-0.5 text-xs text-ink-faint">
                            Hasn&rsquo;t set their own password yet
                          </p>
                        ) : null}
                      </td>

                      <td className="py-3 pr-3">
                        {owner && !isSelf ? (
                          <RoleSelect profileId={person.id} role={person.role} />
                        ) : (
                          <span className="text-[13px] text-navy capitalize">{person.role}</span>
                        )}
                      </td>

                      <td className="py-3 pr-3 text-[13px] whitespace-nowrap text-ink-muted">
                        {person.timezone}
                      </td>

                      <td className="py-3 pr-3 text-[13px] whitespace-nowrap text-ink-muted">
                        {humanDate(person.joined_on)}
                      </td>

                      {owner ? (
                        <td className="py-3 pr-3">
                          <CompensationField
                            profileId={person.id}
                            amount={compFor.get(person.id)?.monthly_amount ?? null}
                          />
                        </td>
                      ) : null}

                      <td className="py-3">
                        {owner ? (
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <ResetPasswordButton profileId={person.id} />
                            {!isSelf ? (
                              <ActiveToggle profileId={person.id} active={person.is_active} />
                            ) : null}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {owner ? (
            <Callout className="mt-4">
              Pay is stored in <code>public.compensation</code>, never on the profile row. Postgres
              RLS filters rows, not columns — so a salary column on <code>profiles</code> would be
              readable by anyone who can read the row at all.
            </Callout>
          ) : null}
        </CardContent>
      </Card>
    </>
  );
}
