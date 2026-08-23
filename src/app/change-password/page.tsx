import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/wordmark";
import { Card, CardContent } from "@/components/ui/card";
import { Callout } from "@/components/ui/callout";
import { requireUser } from "@/lib/auth";
import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: "Set your password" };

/**
 * The gate that makes Owner-created credentials safe: the Owner generates a
 * temporary password, and the account cannot reach anything else until the
 * person replaces it. After this, the Owner no longer holds a working password.
 */
export default async function ChangePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ voluntary?: string }>;
}) {
  const { profile } = await requireUser();
  const { voluntary } = await searchParams;
  const isForced = profile.must_change_password;

  if (!isForced && voluntary !== "1") redirect("/dashboard");

  return (
    <div className="grid min-h-dvh place-items-center bg-canvas px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Wordmark />
        </div>

        <Card>
          <CardContent className="pt-6">
            <h1 className="mb-1 text-lg font-semibold text-navy">
              {isForced ? "Choose your own password" : "Change your password"}
            </h1>
            <p className="mb-5 text-[13px] text-ink-muted">
              Signed in as {profile.email}
            </p>

            {isForced ? (
              <Callout tone="accent" className="mb-4">
                Your account was created with a temporary password. Set your own now — after this,
                nobody else knows it.
              </Callout>
            ) : null}

            <ChangePasswordForm />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
