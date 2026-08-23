"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cancelLeave, decideLeave } from "@/app/actions/leave";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

export function DecisionButtons({ requestId }: { requestId: string }) {
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState("");

  function decide(decision: "approved" | "rejected") {
    startTransition(async () => {
      const data = new FormData();
      data.set("id", requestId);
      data.set("decision", decision);
      if (note.trim()) data.set("decision_note", note.trim());

      const result = await decideLeave(data);
      if (result.ok) toast.success(result.message ?? "Done.");
      else toast.error(result.error);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note (optional)"
        className="h-8 w-44 text-[13px]"
        aria-label="Decision note"
      />
      <Button size="sm" disabled={pending} onClick={() => decide("approved")}>
        Approve
      </Button>
      <Button size="sm" variant="quiet" disabled={pending} onClick={() => decide("rejected")}>
        Reject
      </Button>
    </div>
  );
}

export function WithdrawButton({ requestId }: { requestId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      size="sm"
      variant="quiet"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const data = new FormData();
          data.set("id", requestId);
          const result = await cancelLeave(data);
          if (result.ok) toast.success(result.message ?? "Withdrawn.");
          else toast.error(result.error);
        })
      }
    >
      {pending ? "Withdrawing…" : "Withdraw"}
    </Button>
  );
}
