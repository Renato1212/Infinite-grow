import { cn } from "@/lib/cn";

/** Completion ring for a day phase. Quiet: no confetti, no celebration. */
export function CompletionRing({
  value, size = 18, strokeWidth = 2.5, className, label,
}: {
  value: number; size?: number; strokeWidth?: number; className?: string; label?: string;
}) {
  const clamped = Math.max(0, Math.min(1, value));
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const complete = clamped >= 1;
  return (
    <svg
      width={size} height={size} viewBox={`0 0 ${size} ${size}`}
      className={cn("shrink-0", className)}
      role="img"
      aria-label={label ?? `${Math.round(clamped * 100)}% complete`}
    >
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke="var(--line-strong)" strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={complete ? "var(--pos)" : "var(--accent)"}
        strokeWidth={strokeWidth}
        strokeDasharray={c}
        strokeDashoffset={c * (1 - clamped)}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dashoffset var(--d-slow) var(--ease)" }}
      />
    </svg>
  );
}
