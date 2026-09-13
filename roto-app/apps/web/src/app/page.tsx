"use client";
import { useQuery } from "@tanstack/react-query";

import { trpc } from "@/utils/trpc";

export default function Home() {
  const healthCheck = useQuery(trpc.healthCheck.queryOptions());

  return (
    <div className="container mx-auto max-w-3xl px-4 py-2">
      <div className="py-10 text-center">
        <h1 className="text-5xl font-extrabold tracking-tight">ROTO</h1>
        <p className="mt-3 text-lg text-muted-foreground">
          Free offline-first motorcycle routes for Sri Lanka — curvy roads, GPX in/out, no subscription.
        </p>
        <div className="mt-6 flex gap-3 justify-center">
          <a href="/plan" className="bg-green-700 text-white px-6 py-3 rounded-xl font-semibold">
            Plan a ride
          </a>
          <a href="/login" className="border px-6 py-3 rounded-xl font-semibold">
            Sign in
          </a>
        </div>
      </div>
      <div className="grid gap-6">
        <section className="rounded-lg border p-4">
          <h2 className="mb-2 font-medium">API Status</h2>
          <div className="flex items-center gap-2">
            <div
              className={`h-2 w-2 rounded-full ${healthCheck.data ? "bg-green-500" : "bg-red-500"}`}
            />
            <span className="text-sm text-muted-foreground">
              {healthCheck.isLoading
                ? "Checking..."
                : healthCheck.data
                  ? "Connected"
                  : "Disconnected"}
            </span>
          </div>
        </section>
      </div>
    </div>
  );
}
