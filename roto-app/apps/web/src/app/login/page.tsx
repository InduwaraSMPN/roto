"use client";

import { Card, CardContent } from "@roto-app/ui/components/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@roto-app/ui/components/tabs";
import { useState } from "react";

import Loader from "@/components/loader";
import SignInForm from "@/components/sign-in-form";
import SignUpForm from "@/components/sign-up-form";
import { authClient } from "@/lib/auth-client";

export default function LoginPage() {
  const [tab, setTab] = useState<"sign-in" | "sign-up">("sign-in");
  const { isPending } = authClient.useSession();

  if (isPending) {
    return <Loader />;
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 pt-12 pb-16">
      <h1 className="text-3xl font-black tracking-tight">
        {tab === "sign-in" ? "Sign in" : "Create an account"}
      </h1>
      <p className="mt-2 text-muted-foreground">
        Sync rides, back up SOS contacts, and share live group positions. Free, always.
      </p>
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="mt-8 gap-4">
        <TabsList className="w-full">
          <TabsTrigger value="sign-in">Sign in</TabsTrigger>
          <TabsTrigger value="sign-up">Create account</TabsTrigger>
        </TabsList>
        <Card>
          <CardContent>
            <TabsContent value="sign-in">
              <SignInForm />
            </TabsContent>
            <TabsContent value="sign-up">
              <SignUpForm />
            </TabsContent>
          </CardContent>
        </Card>
      </Tabs>
    </div>
  );
}
