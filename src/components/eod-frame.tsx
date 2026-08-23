"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";

/**
 * Embeds the n8n form.
 *
 * A page that refuses to be framed (Content-Security-Policy: frame-ancestors,
 * or X-Frame-Options) fails silently — the browser gives the parent no error
 * event. So we time the load: if nothing has loaded after a few seconds, we
 * surface the launcher instead of leaving a blank rectangle. The launcher
 * carries the identical prefilled URL, so attribution works either way.
 */
export function EodFrame({
  src,
  formHost,
  prefilled,
}: {
  src: string;
  formHost: string;
  prefilled: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [nonce, setNonce] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLoaded(false);
    setTimedOut(false);
    timer.current = setTimeout(() => setTimedOut(true), 6000);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [nonce]);

  function onLoad() {
    setLoaded(true);
    setTimedOut(false);
    if (timer.current) clearTimeout(timer.current);
  }

  return (
    <div className="flex flex-col gap-3">
      {timedOut && !loaded ? (
        <Callout tone="warn" title="The form didn’t load in the frame.">
          <p className="mb-3">
            {formHost} is most likely refusing to be embedded. Allow this app in its
            <code className="mx-1 rounded bg-surface px-1 py-0.5 text-[12px]">frame-ancestors</code>
            header, or just open the form in a tab — it&rsquo;s the same prefilled link.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => setNonce((n) => n + 1)}>
              <RefreshCw className="size-4" />
              Try again
            </Button>
            <a
              href={src}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center gap-2 rounded-lg bg-mint px-3 text-[13px] font-medium text-white hover:bg-mint-deep"
            >
              <ExternalLink className="size-4" />
              Open the EOD form
            </a>
          </div>
        </Callout>
      ) : null}

      <div className="relative overflow-hidden rounded-lg border border-line bg-surface">
        {!loaded ? (
          <div className="absolute inset-x-0 top-0 grid h-full place-items-center">
            <p className="text-[13px] text-ink-muted">Loading your EOD form…</p>
          </div>
        ) : null}
        <iframe
          key={nonce}
          src={src}
          title="EOD report form"
          onLoad={onLoad}
          className="relative h-[70vh] min-h-[520px] w-full"
          sandbox="allow-forms allow-scripts allow-same-origin allow-popups"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>

      <p className="text-xs text-ink-muted">
        {prefilled
          ? "Your name, email and user id are passed into the form automatically — nothing to retype."
          : "This form doesn’t accept prefilled details, so put your own name in it — that’s what ties the submission back to you."}
      </p>
    </div>
  );
}
