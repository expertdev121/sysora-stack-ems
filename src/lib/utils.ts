import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * "Green Geeks" -> "green-geeks". Used as the stored key for a client or tool
 * that someone typed in freely, so "Green Geeks", "green geeks" and
 * "Green  Geeks" all land in the same group instead of three.
 */
export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** "green-geeks" -> "Green Geeks", for anything with no explicit display name. */
export function titleCase(slug: string): string {
  return slug
    .replace(/[-_]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
