import Link from "next/link";
import { Suspense } from "react";

import { AuthButton } from "@/components/auth-button";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { EnvVarWarning } from "@/components/env-var-warning";
import { hasEnvVars } from "@/lib/utils";
import { MainNav } from "@/components/main-nav";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen flex flex-col items-center">
      <div className="flex-1 w-full flex flex-col items-center">
        <nav className="w-full border-b border-b-foreground/10">
          <div className="w-full max-w-6xl mx-auto flex justify-between items-center p-3 px-5 text-sm">
            <div className="flex gap-6 items-center">
              <Link href={"/protected"} className="font-semibold">
                Admin Pap &amp; Sjanet
              </Link>
              <MainNav />
            </div>
            {!hasEnvVars ? (
              <EnvVarWarning />
            ) : (
              <Suspense>
                <AuthButton />
              </Suspense>
            )}
          </div>
        </nav>

        <div className="flex-1 w-full max-w-6xl p-5 pb-24 md:pb-5 flex flex-col gap-8">
          {children}
        </div>

        <footer className="w-full flex items-center justify-center border-t mx-auto text-center text-xs gap-8 py-6 mt-12 mb-16 md:mb-0">
          <span className="text-muted-foreground">Admin Pap &amp; Sjanet</span>
          <ThemeSwitcher />
        </footer>
      </div>
      <MobileBottomNav />
    </main>
  );
}
