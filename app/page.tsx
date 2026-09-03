import { redirect } from "next/navigation";
import { todayISO } from "@/lib/time";

export default function Home() {
  redirect(`/day/${todayISO()}`);
}
