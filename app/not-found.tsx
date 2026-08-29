import Link from "next/link";
import { todayISO } from "@/lib/time";

export default function NotFound() {
  return (
    <div className="py-16 text-center">
      <h1 className="text-20 font-[590]">That page isn't here.</h1>
      <p className="text-13 [color:var(--text-secondary)] mt-1.5 max-w-[46ch] mx-auto">
        The link may point at a day, a trade or a saved view that has since been deleted.
      </p>
      <Link
        href={`/day/${todayISO()}`}
        className="inline-block mt-4 text-13 [color:var(--accent)] hover:underline underline-offset-2"
      >
        Go to today
      </Link>
    </div>
  );
}
