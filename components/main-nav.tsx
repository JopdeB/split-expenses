"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const items = [
  { href: "/protected", label: "Dashboard" },
  { href: "/protected/transacties", label: "Transacties" },
  { href: "/protected/grootboek", label: "Grootboek" },
  { href: "/protected/btw", label: "BTW" },
  { href: "/protected/audit", label: "Audit" },
];

export function MainNav() {
  const pathname = usePathname();
  return (
    <div className="hidden md:flex gap-1 items-center">
      {items.map((item) => {
        const isActive =
          item.href === "/protected"
            ? pathname === "/protected"
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "px-3 py-1.5 rounded-md text-sm transition-colors",
              isActive
                ? "bg-accent text-accent-foreground font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
