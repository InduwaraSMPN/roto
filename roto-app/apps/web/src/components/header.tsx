"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { buttonVariants } from "@roto-app/ui/components/button";
import { cn } from "@roto-app/ui/lib/utils";

import { ModeToggle } from "./mode-toggle";
import UserMenu from "./user-menu";

const links = [
  { to: "/", label: "Home" },
  { to: "/plan", label: "Plan" },
  { to: "/dashboard", label: "Dashboard" },
] as const;

export default function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-2 sm:gap-6">
          <Link
            href="/"
            aria-label="Roto home"
            className="flex shrink-0 items-center gap-2 rounded-md"
          >
            {/* Wordmark: the signal square is the one yellow mark in the chrome. */}
            <span aria-hidden className="size-3 rounded-[3px] bg-primary" />
            <span className="text-lg font-black tracking-tight">ROTO</span>
          </Link>
          <nav aria-label="Primary" className="flex items-center">
            {links.map(({ to, label }) => {
              const active = to === "/" ? pathname === "/" : pathname?.startsWith(to);
              return (
                <Link
                  key={to}
                  href={to}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    buttonVariants({ variant: "ghost" }),
                    "px-2 font-semibold sm:px-3",
                    // The wordmark already goes home; drop the duplicate link where width is tight.
                    to === "/" && "hidden sm:inline-flex",
                    active ? "bg-muted text-foreground" : "text-muted-foreground",
                  )}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <ModeToggle />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
