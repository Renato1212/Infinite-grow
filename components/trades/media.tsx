"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, EmptyState } from "@/components/ui/surface";
import { TextButton } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { attachMedia, detachMedia } from "@/app/actions/trades";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { localTime } from "@/lib/time";
import { cn } from "@/lib/cn";
import type { TradeDetail } from "@/lib/queries/trade";

const BUCKET = "media";

const KINDS = [
  { value: "screen_recording", label: "Screen recording" },
  { value: "chart_screenshot", label: "Chart screenshot" },
  { value: "news_terminal", label: "News terminal" },
  { value: "ladder_capture", label: "Ladder capture" },
  { value: "other", label: "Other" },
];

/**
 * Drag-and-drop into Supabase Storage. Video is lazy-loaded and seeks to the
 * trade's entry when you open it, so a recording of a whole session still lands
 * on the moment that matters.
 */
export function MediaPanel({
  tradeId, media, entryAt,
}: { tradeId: string; media: TradeDetail["media"]; entryAt: string }) {
  const router = useRouter();
  const toast = useToast();
  const [, start] = React.useTransition();
  const [kind, setKind] = React.useState("screen_recording");
  const [busy, setBusy] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const [urls, setUrls] = React.useState<Record<string, string>>({});

  // Signed URLs, fetched on demand so the page does not pay for media it never shows.
  React.useEffect(() => {
    if (!media.length) return;
    let cancelled = false;
    void (async () => {
      const client = supabaseBrowser();
      const next: Record<string, string> = {};
      for (const m of media) {
        const { data } = await client.storage.from(BUCKET).createSignedUrl(m.storagePath, 3600);
        if (data?.signedUrl) next[m.id] = data.signedUrl;
      }
      if (!cancelled) setUrls(next);
    })().catch(() => { /* storage not configured */ });
    return () => { cancelled = true; };
  }, [media]);

  const upload = async (files: FileList | File[]) => {
    setBusy(true);
    try {
      const client = supabaseBrowser();
      for (const file of Array.from(files)) {
        const path = `${tradeId}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
        const { error } = await client.storage.from(BUCKET).upload(path, file, { upsert: false });
        if (error) { toast(`Upload failed: ${error.message}`); continue; }
        const res = await attachMedia({
          ownerType: "trade", ownerId: tradeId, kind,
          storagePath: path, mime: file.type, sizeBytes: file.size,
        });
        if (!res.ok) toast(res.error);
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-4">
      <header className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
        <h2 className="label">Media</h2>
        <Select
          value={kind} className="h-7 py-0 w-[170px] text-12"
          aria-label="Kind of the next upload"
          onChange={(e) => setKind(e.target.value)}
        >
          {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
        </Select>
      </header>

      <label
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files?.length) void upload(e.dataTransfer.files);
        }}
        className={cn(
          "block border border-dashed rounded-[var(--r-std)] p-4 text-center cursor-pointer",
          "transition-colors duration-[var(--d-fast)]",
          dragging ? "border-[var(--accent)] bg-[var(--accent-quiet)]" : "border-[var(--line-strong)] hover:bg-[var(--bg-hover)]",
        )}
      >
        <span className="text-12 text-[var(--text-secondary)]">
          {busy ? "Uploading…" : "Drop a recording or screenshot here"}
        </span>
        <input
          type="file" multiple className="sr-only"
          accept="video/*,image/*"
          onChange={(e) => { if (e.target.files?.length) void upload(e.target.files); }}
        />
      </label>

      {media.length === 0 ? (
        <EmptyState
          title="Nothing attached yet."
          body="Drop the OBS capture of this trade here. It plays inline, scrubbed to the entry."
        />
      ) : (
        <ul className="mt-3 space-y-3">
          {media.map((m) => {
            const url = urls[m.id];
            const isVideo = m.mime?.startsWith("video");
            return (
              <li key={m.id}>
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <span className="text-12">{m.caption ?? m.kind.replace(/_/g, " ")}</span>
                  <TextButton
                    onClick={() => start(async () => {
                      await detachMedia(m.id);
                      toast("Removed from the trade. The file is still in storage.");
                      router.refresh();
                    })}
                  >
                    Remove
                  </TextButton>
                </div>
                {!url ? (
                  <div className="h-24 rounded-[var(--r-std)] bg-[var(--bg-sunken)]" aria-hidden />
                ) : isVideo ? (
                  <video
                    controls preload="none"
                    src={url}
                    className="w-full rounded-[var(--r-std)] bg-black"
                    onLoadedMetadata={(e) => {
                      // Seek to the trade's entry if the capture starts earlier.
                      const el = e.currentTarget;
                      const captured = m.capturedAt ? new Date(m.capturedAt).getTime() : null;
                      if (!captured) return;
                      const offset = (new Date(entryAt).getTime() - captured) / 1000;
                      if (offset > 0 && offset < el.duration) el.currentTime = offset;
                    }}
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={url} alt={m.caption ?? "Attachment"} loading="lazy"
                    className="w-full rounded-[var(--r-std)] border border-[var(--line)]"
                  />
                )}
                <p className="text-11 text-[var(--text-tertiary)] mt-1 num">
                  {m.capturedAt ? localTime(m.capturedAt) : ""}
                  {m.sizeBytes ? ` · ${Math.round(m.sizeBytes / 1024 / 1024 * 10) / 10} MB` : ""}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
