import { AppSidebar } from "@/components/app-sidebar";
import { requireSession } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // requireSession() also bounces anyone who still has must_change_password set,
  // so no signed-in page below this layout can be reached with a temp password.
  const { profile } = await requireSession();

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <AppSidebar
        fullName={profile.full_name}
        role={profile.role}
        timeZone={profile.timezone}
      />
      <main className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-10">{children}</div>
      </main>
    </div>
  );
}
