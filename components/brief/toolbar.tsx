"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Button, TextButton } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { reground } from "@/app/actions/day";

export function BriefToolbar({ date, dayId }: { date: string; dayId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [, start] = React.useTransition();

  return (
    <div data-print-hide className="flex flex-wrap items-center gap-2 mb-6">
      <Link href={`/day/${date}`}>
        <Button variant="ghost" size="sm">← Back to the day</Button>
      </Link>
      <span className="flex-1" />
      <TextButton
        onClick={() => start(async () => {
          await reground(dayId, date);
          toast("Regrounded. Timestamp recorded.");
          router.refresh();
        })}
        title="Records that you came back and reread the plan"
      >
        Reground
      </TextButton>
      <Link href={`/day/${date}/brief/companion`}>
        <Button size="sm">Companion</Button>
      </Link>
      <Button size="sm" variant="primary" onClick={() => window.print()}>Print</Button>
    </div>
  );
}
