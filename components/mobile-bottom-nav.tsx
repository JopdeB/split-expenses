"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus, ReceiptText, BookOpen, Percent, History } from "lucide-react";

import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: typeof Plus;
  matchPrefix: boolean;
  emphasis?: boolean;
};

const items: NavItem[] = [
  { href: "/protected/transacties", label: "Transacties", icon: ReceiptText, matchPrefix: true },
  { href: "/protected/grootboek", label: "Grootboek", icon: BookOpen, matchPrefix: true },
  { href: "/protected/transacties/nieuw", label: "Nieuw", icon: Plus, matchPrefix: false, emphasis: true },
  { href: "/protected/btw", label: "BTW", icon: Percent, matchPrefix: true },
  { href: "/protected/audit", label: "Audit", icon: History, matchPrefix: true },
];

export function MobileBottomNav() {
  const pathname = usePathname();
  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
      // iOS safe area
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Mobiele navigatie"
    >
      <ul className="grid grid-cols-5 h-14">
        {items.map((item) => {
          // Transacties tab matches the list view and edit pages, but the
          // /nieuw page should activate the dedicated "Nieuw" tab instead.
          const isActive = item.matchPrefix
            ? item.href === "/protected/transacties"
              ? pathname === "/protected/transacties" ||
                (pathname.startsWith("/protected/transacties/") &&
                  pathname !== "/protected/transacties/nieuw")
              : pathname.startsWith(item.href)
            : pathname === item.href;
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  "flex flex-col items-center justify-center h-full gap-0.5 text-[10px] leading-tight transition-colors",
                  isActive
                    ? "text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {item.emphasis ? (
                  <span
                    className={cn(
                      "flex items-center justify-center -mt-5 h-11 w-11 rounded-full shadow-md border",
                      isActive
                        ? "bg-foreground text-background"
                        : "bg-foreground text-background",
                    )}
                  >
                    <Icon className="h-5 w-5" strokeWidth={2.5} />
                  </span>
                ) : (
                  <Icon className="h-5 w-5" strokeWidth={isActive ? 2.25 : 1.75} />
                )}
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
