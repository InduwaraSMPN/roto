// Dashboard safety: SOS contacts mirror of the native safety screen.
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@roto-app/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@roto-app/ui/components/card";
import { Field, FieldLabel } from "@roto-app/ui/components/field";
import { Input } from "@roto-app/ui/components/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@roto-app/ui/components/select";
import { Skeleton } from "@roto-app/ui/components/skeleton";

import SignInGate from "@/components/sign-in-gate";
import { tx, useLang } from "@/lib/lang";
import { trpc } from "@/utils/trpc";

import { dict } from "../_components/i18n";

type Contact = {
  id: string;
  name: string;
  phone: string;
  relation?: string | null;
  lang?: string | null;
};

export default function SafetyPage() {
  const { lang } = useLang();
  const t = (k: string) => tx(lang, { en: dict.en[k] ?? k, si: dict.si[k] ?? k, ta: dict.ta[k] ?? k });
  const queryClient = useQueryClient();
  const contacts = useQuery(trpc.safety.contacts.list.queryOptions());
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [relation, setRelation] = useState("");
  const [contactLang, setContactLang] = useState<"en" | "si" | "ta">("en");

  const refresh = () => void queryClient.invalidateQueries({ queryKey: trpc.safety.contacts.list.queryKey() });
  const add = useMutation(trpc.safety.contacts.add.mutationOptions({ onSuccess: refresh }));
  const remove = useMutation(trpc.safety.contacts.remove.mutationOptions({ onSuccess: refresh }));

  const submit = () => {
    if (!name.trim() || !phone.trim()) return;
    add.mutate({
      name: name.trim(),
      phone: phone.trim(),
      relation: relation.trim() || undefined,
      lang: contactLang,
    });
    setName("");
    setPhone("");
    setRelation("");
  };

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6 px-4 pt-10 pb-16 sm:px-6">
      <Link href="/dashboard" className="text-sm font-semibold text-muted-foreground underline">
        ← {t("back")}
      </Link>
      <div>
        <h1 className="text-3xl font-black tracking-tight">{t("safetyTitle")}</h1>
        <p className="mt-2 max-w-[65ch] leading-relaxed text-muted-foreground">{t("safetySub")}</p>
      </div>
      <SignInGate note={t("safetySub")}>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-bold">{t("addContact")}</CardTitle>
            <CardDescription>{t("testSms")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="c-name">{t("contactName")}</FieldLabel>
              <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </Field>
            <Field>
              <FieldLabel htmlFor="c-phone">{t("contactPhone")}</FieldLabel>
              <Input id="c-phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="07XXXXXXXX" />
            </Field>
            <Field>
              <FieldLabel htmlFor="c-relation">{t("contactRelation")}</FieldLabel>
              <Input id="c-relation" value={relation} onChange={(e) => setRelation(e.target.value)} placeholder="Family" />
            </Field>
            <Field>
              <FieldLabel>{t("contactLang")}</FieldLabel>
              <Select value={contactLang} onValueChange={(v) => v != null && setContactLang(v as typeof contactLang)}>
                <SelectTrigger className="h-10 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="si">සිංහල</SelectItem>
                  <SelectItem value="ta">தமிழ்</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <Button onClick={submit} disabled={add.isPending || !name.trim() || !phone.trim()} className="h-10 font-bold">
                <Plus />
                {t("addContact")}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            {contacts.isLoading ? (
              <div className="grid gap-3">
                <Skeleton className="h-12" />
              </div>
            ) : (
              <ol className="grid gap-2">
                {((contacts.data ?? []) as Contact[]).map((c, i) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 rounded-xl border px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-bold">
                        <span className="numerals mr-2 text-muted-foreground">{i + 1}</span>
                        {c.name}
                      </p>
                      <p className="numerals text-sm text-muted-foreground">
                        {c.phone}
                        {c.relation ? ` · ${c.relation}` : ""} · {(c.lang ?? "en").toUpperCase()}
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => remove.mutate({ id: c.id })} aria-label={`Remove ${c.name}`}>
                      <Trash2 />
                    </Button>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </SignInGate>
    </div>
  );
}
