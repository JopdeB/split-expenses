import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Guard so the layout can show a friendly warning if the app was deployed
// without the DB config. Session secret is optional in dev (there's a
// fallback), so we only require DATABASE_URL here.
export const hasEnvVars = !!process.env.DATABASE_URL;
