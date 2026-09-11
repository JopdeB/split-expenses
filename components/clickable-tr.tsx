"use client";

import { useRouter } from "next/navigation";

/**
 * Table row that navigates to `href` on click. Keeps semantic <tr>/<td>
 * markup (so column alignment and horizontal scroll still work) while
 * making the whole row a target. Keyboard-focusable via Enter/Space so
 * the row is reachable without a mouse.
 */
export function ClickableTr({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const go = () => router.push(href);
  return (
    <tr
      role="link"
      tabIndex={0}
      onClick={go}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          go();
        }
      }}
      className={
        "border-t cursor-pointer hover:bg-muted/30 focus:bg-muted/40 focus:outline-none " +
        (className ?? "")
      }
    >
      {children}
    </tr>
  );
}
