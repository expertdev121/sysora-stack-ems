import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/callout";
import { requireSession } from "@/lib/auth";
import { assetHost, assetsForRole } from "@/lib/team-assets";

export const metadata: Metadata = { title: "Team assets" };

export default async function TeamAssetsPage() {
  const { profile } = await requireSession();
  const assets = assetsForRole(profile.role);

  return (
    <>
      <PageHeader
        title="Team assets"
        description="The tools we work in. Everything here opens in a new tab."
      />

      {assets.length === 0 ? (
        <EmptyState title="Nothing shared with your role yet." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {assets.map((asset) => (
            <Card key={asset.id} className="transition-colors hover:border-mint-line">
              <CardContent className="flex h-full flex-col pt-5">
                <h2 className="text-[15px] font-semibold text-navy">{asset.name}</h2>
                <p className="mt-1 flex-1 text-[13px] text-ink-muted">{asset.description}</p>

                <a
                  href={asset.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex w-fit items-center gap-2 rounded-lg bg-mint px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-mint-deep"
                >
                  Open {asset.name}
                  <ExternalLink className="size-3.5" />
                </a>

                <p className="mt-2 truncate text-xs text-ink-faint">{assetHost(asset.href)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
