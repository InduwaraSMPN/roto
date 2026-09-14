import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { authClient } from "@/lib/auth-client";

import Dashboard from "./dashboard";

export default async function DashboardPage() {
  const session = await authClient.getSession({
    fetchOptions: {
      headers: await headers(),
      throw: true,
    },
  });

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-6 pb-12">
      <div className="mb-4">
        <h1 className="text-2xl font-extrabold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Welcome back, {session.user.name} — here&apos;s your riding picture.
        </p>
      </div>
      <Dashboard session={session} />
    </div>
  );
}
