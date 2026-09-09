import Link from "next/link";

import { Button } from "./ui/button";
import { getSession } from "@/lib/session";
import { LogoutButton } from "./logout-button";

export async function AuthButton() {
  const session = await getSession();

  return session.userId ? (
    <div className="flex items-center gap-4 text-sm">
      <span className="text-muted-foreground hidden sm:inline">
        {session.email}
      </span>
      <LogoutButton />
    </div>
  ) : (
    <Button asChild size="sm">
      <Link href="/auth/login">Inloggen</Link>
    </Button>
  );
}
