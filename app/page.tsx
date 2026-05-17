import { redirect } from "next/navigation";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { hasEnvVars } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EnvVarWarning } from "@/components/env-var-warning";

export default async function Home() {
  if (!hasEnvVars) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-6">
        <h1 className="text-2xl font-bold mb-4">Admin Pap &amp; Sjanet</h1>
        <p className="text-sm text-muted-foreground mb-6 max-w-md text-center">
          Supabase environment variables ontbreken nog. Vul <code>.env.local</code> aan met
          <code> NEXT_PUBLIC_SUPABASE_URL</code> en
          <code> NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code>.
        </p>
        <EnvVarWarning />
      </main>
    );
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims) {
    redirect("/protected");
  }

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
