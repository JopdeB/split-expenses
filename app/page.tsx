import { redirect } from "next/navigation";
import Link from "next/link";

import { hasEnvVars } from "@/lib/utils";
import { getSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { EnvVarWarning } from "@/components/env-var-warning";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (!hasEnvVars) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-6">
        <h1 className="text-2xl font-bold mb-4">Admin Pap &amp; Sjanet</h1>
        <p className="text-sm text-muted-foreground mb-6 max-w-md text-center">
          <code>DATABASE_URL</code> ontbreekt. Vul <code>.env.local</code> aan of
          zet de env-var in Vercel/Docker.
        </p>
        <EnvVarWarning />
      </main>
    );
  }

  const session = await getSession();
  if (session.userId) redirect("/protected");

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6">
      <h1 className="text-3xl font-bold mb-2">Admin Pap &amp; Sjanet</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Boekhouding en grootboek overzicht
      </p>
      <Button asChild size="lg">
        <Link href="/auth/login">Inloggen</Link>
      </Button>
    </main>
  );
}
