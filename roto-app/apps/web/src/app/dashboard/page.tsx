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
    <div className="mx-auto w-full max-w-6xl px-4 pt-10 pb-16 sm:px-6">
      <div className="mb-8">
        <h1 className="text-3xl font-black tracking-tight">Your riding</h1>
        <p className="mt-2 text-muted-foreground">Signed in as {session.user.name}.</p>
      </div>
      <Dashboard session={session} />
    </div>
  );
}
