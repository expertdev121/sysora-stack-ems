import type { Metadata } from "next";
import { Wordmark } from "@/components/wordmark";
import { Card, CardContent } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

const NOTICES: Record<string, string> = {
  deactivated: "This account has been deactivated. Talk to the Owner.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  return (
    <div className="grid min-h-dvh place-items-center bg-canvas px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Wordmark />
        </div>

        <Card>
          <CardContent className="pt-6">
            <h1 className="mb-1 text-lg font-semibold text-navy">Sign in</h1>
            <p className="mb-5 text-[13px] text-ink-muted">
              Accounts are created by the Owner. There is no public signup.
            </p>

            <LoginForm
              next={typeof next === "string" ? next : "/dashboard"}
              notice={error ? NOTICES[error] : undefined}
            />
          </CardContent>
        </Card>

        <p className="mt-4 text-center text-xs text-ink-faint">
          Forgotten your password? Ask the Owner to reset it.
        </p>
      </div>
    </div>
  );
}
