"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** `exact`: só marca como ativo no caminho exato (para links-pai, como /moderacao). */
export function NavLinks({ links }: { links: { href: string; label: string; exact?: boolean }[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Área logada" className="flex items-center gap-1 overflow-x-auto text-sm">
      {links.map((link) => {
        const active = pathname === link.href || (!link.exact && pathname.startsWith(`${link.href}/`));
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "whitespace-nowrap rounded-md px-2 py-1.5 hover:bg-muted sm:px-3",
              active && "bg-muted font-medium text-primary",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
