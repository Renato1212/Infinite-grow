import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Note for anyone adding classes here: write colours as `[color:var(--x)]`,
 * never `text-[var(--x)]`. tailwind-merge cannot tell whether an arbitrary
 * `text-[…]` is a colour or a font size, guesses font size, and silently drops
 * it when a later `text-13` arrives — which is how every primary button lost its
 * text colour until an accessibility audit caught it.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
