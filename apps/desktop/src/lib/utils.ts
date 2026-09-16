import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** shadcn's class joiner: conditional classes in, deduplicated Tailwind out. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
