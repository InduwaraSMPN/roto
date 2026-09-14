"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@roto-app/ui/lib/utils";

import { ModeToggle } from "./mode-toggle";
import UserMenu from "./user-menu";

export default function Header() {
  const pathname = usePathname();
  const links = [
    { to: "/", label: "Home" },
    { to: "/plan", label: "Plan" },
    { to: "/dashboard", label: "Dashboard" },
  ] as const;

  return (
    <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-4xl flex-row items-center justify-between gap-3 px-4">
        <div className="flex min-w-0 items-center gap-6">
          <Link
            href="/"
            aria-label="Roto home"
            className="flex shrink-0 items-baseline gap-1.5 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <span className="text-lg font-extrabold tracking-tight">
              ROTO
            </span>
            <span
              aria-hidden
              className="hidden text-xs font-bold text-muted-foreground sm:inline"
            >
              රොටෝ · ரோட்டோ
            </span>
            <span
              aria-hidden
              className="mb-0.5 inline-block size-2 self-center rounded-full bg-primary"
            />
          </Link>
          <nav aria-label="Primary" className="flex items-center gap-1">
            {links.map(({ to, label }) => {
              const active =
                to === "/" ? pathname === "/" : pathname?.startsWith(to);
              return (
                <Link
                  key={to}
                  href={to}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-lg px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                    active
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ModeToggle />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
