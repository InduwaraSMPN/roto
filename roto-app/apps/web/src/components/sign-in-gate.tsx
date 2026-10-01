
// Small signed-in guard used by every protected page: shows a sign-in CTA instead of
// firing authed queries anonymously.
"use client";

import Link from "next/link";
import { LogIn } from "lucide-react";

import { buttonVariants } from "@roto-app/ui/components/button";
import { Card, CardContent } from "@roto-app/ui/components/card";
import { cn } from "@roto-app/ui/lib/utils";

import { authClient } from "@/lib/auth-client";

export default function SignInGate({ children, note }: { children: React.ReactNode; note: string }) {
  const { data: session, isPending } = authClient.useSession();
  if (isPending) return <p className="text-sm text-muted-foreground">Checking your session…</p>;
  if (!session?.user) {
    return (
      <Card>
        <CardContent className="flex flex-col items-start gap-4 py-6">
          <p className="text-sm leading-relaxed text-muted-foreground">{note}</p>
          <Link href="/login" className={cn(buttonVariants(), "h-10 font-bold")}>
            <LogIn />
            Sign in
          </Link>
        </CardContent>
      </Card>
    );
  }
  return <>{children}</>;
}
