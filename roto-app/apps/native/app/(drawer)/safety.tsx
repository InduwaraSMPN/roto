// SOS contacts screen (plan §4.12 contacts UI, task list item 6). Signed in: reads/writes
// through `trpc.safety.contacts.*` and mirrors every result into the local `sosContactsLocal`
// table (lib/sos-contacts.ts) so manual SOS still has a contact list when the rider is later
// offline or signed out. Signed out: reads/writes the local table directly — contacts added here
// are not lost, they just haven't synced to a Roto account yet.
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import * as Location from "expo-location";
import * as SecureStore from "expo-secure-store";
import * as SMS from "expo-sms";
import { Button, Input, Label, ListGroup, Separator, Slider, Surface, Tabs, TextField, useToast } from "heroui-native";
import { Fragment, useEffect, useState } from "react";
import { Text, View } from "react-native";
import { withUniwind } from "uniwind";

import { Container } from "@/components/container";
import { SosCountdownOverlay } from "@/components/safety/sos-countdown";
import { authClient } from "@/lib/auth-client";
import { interpolate, LANGS, useLang, type Lang } from "@/lib/i18n";
import {
  listLocalContacts,
  mirrorServerContacts,
  removeLocalContact,
  upsertLocalContact,
  type LocalSosContact,
} from "@/lib/sos-contacts";
import { CRASH_G_KEY, previewSosCountdown } from "@/lib/safety";
import { trpc } from "@/utils/trpc";

const StyledIonicons = withUniwind(Ionicons);

type FormState = {
  localId: string | null;
  serverId: string | null;
  name: string;
  phone: string;
  relation: string;
  lang: Lang;
  email: string;
};

const EMPTY_FORM: FormState = { localId: null, serverId: null, name: "", phone: "", relation: "", lang: "en", email: "" };

export default function SafetyContacts() {
  const { t } = useLang();
  const { toast } = useToast();
  const { data: session } = authClient.useSession();
  const signedIn = !!session?.user;

  const serverList = useQuery({ ...trpc.safety.contacts.list.queryOptions(), enabled: signedIn });
  const addMut = useMutation(trpc.safety.contacts.add.mutationOptions());
  const updateMut = useMutation(trpc.safety.contacts.update.mutationOptions());
  const removeMut = useMutation(trpc.safety.contacts.remove.mutationOptions());
  const reorderMut = useMutation(trpc.safety.contacts.reorder.mutationOptions());

  const [contacts, setContacts] = useState<LocalSosContact[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  // Crash sensitivity in g (3–6, plan §4.12). Read by ride-recorder at record start —
  // changing it mid-ride applies to the next ride, not the running one.
  const [threshold, setThreshold] = useState(4);

  useEffect(() => {
    SecureStore.getItemAsync(CRASH_G_KEY)
      .then((v) => {
        const n = Number(v);
        if (n >= 3 && n <= 6) setThreshold(n);
      })
      .catch(() => undefined);
  }, []);

  const persistThreshold = async (v: number) => {
    const clamped = Math.min(6, Math.max(3, Math.round(v * 2) / 2));
    setThreshold(clamped);
    await SecureStore.setItemAsync(CRASH_G_KEY, String(clamped)).catch(() => undefined);
  };

  const refreshLocal = async () => setContacts(await listLocalContacts());

  useEffect(() => {
    void refreshLocal();
  }, []);

  // Signed in: the server is the source of truth — mirror every fetch into the local table.
  useEffect(() => {
    if (!signedIn || !serverList.data) return;
    void mirrorServerContacts(serverList.data).then(refreshLocal);
  }, [signedIn, serverList.data]);

  const resetForm = () => setForm(EMPTY_FORM);

  const edit = (c: LocalSosContact) =>
    setForm({
      localId: c.id,
      serverId: c.serverId,
      name: c.name,
      phone: c.phone,
      relation: c.relation ?? "",
      lang: c.lang,
      email: c.email ?? "",
    });

  const save = async () => {
    const name = form.name.trim();
    const phone = form.phone.trim();
    if (!name || !phone) return;
    setBusy(true);
    try {
      if (signedIn) {
        if (form.serverId) {
          await updateMut.mutateAsync({
            id: form.serverId,
            name,
            phone,
            relation: form.relation.trim() || null,
            lang: form.lang,
            email: form.email.trim() || null,
          });
        } else {
          await addMut.mutateAsync({
            name,
            phone,
            relation: form.relation.trim() || undefined,
            lang: form.lang,
            email: form.email.trim() || undefined,
          });
          // Editing a contact that was only local (added while signed out) and is now syncing
          // for the first time — drop the old local-only row so it isn't duplicated.
          if (form.localId) await removeLocalContact(form.localId);
        }
        await serverList.refetch();
      } else {
        const existing = contacts.find((c) => c.id === form.localId);
        await upsertLocalContact({
          id: form.localId ?? `local-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
          serverId: form.serverId,
          name,
          phone,
          relation: form.relation.trim() || null,
          lang: form.lang,
          email: form.email.trim() || null,
          sortOrder: existing?.sortOrder ?? contacts.length,
        });
      }
      await refreshLocal();
      toast.show({ variant: "success", label: t.contactSaved });
      resetForm();
    } catch {
      toast.show({ variant: "danger", label: t.contactFailed });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (c: LocalSosContact) => {
    setBusy(true);
    try {
      if (signedIn && c.serverId) {
        await removeMut.mutateAsync({ id: c.serverId });
      }
      await removeLocalContact(c.id);
      await refreshLocal();
      if (signedIn) await serverList.refetch();
      if (form.localId === c.id) resetForm();
      toast.show({ variant: "success", label: t.contactRemoved });
    } catch {
      toast.show({ variant: "danger", label: t.contactFailed });
    } finally {
      setBusy(false);
    }
  };

  const move = async (index: number, dir: -1 | 1) => {    const other = index + dir;
    if (other < 0 || other >= contacts.length) return;
    const next = [...contacts];
    const a = next[index];
    const b = next[other];
    if (!a || !b) return;
    next[index] = b;
    next[other] = a;
    setContacts(next);
    for (const [i, c] of next.entries()) {
      await upsertLocalContact({
        id: c.id,
        serverId: c.serverId,
        name: c.name,
        phone: c.phone,
        relation: c.relation,
        lang: c.lang,
        email: c.email,
        sortOrder: i,
      });
    }
    if (signedIn) {
      const ids = next.map((c) => c.serverId).filter((id): id is string => !!id);
      if (ids.length > 1) await reorderMut.mutateAsync({ ids }).catch(() => undefined);
    }
  };

  return (
    <Container className="p-6">
      <Text className="text-2xl font-extrabold tracking-tight text-foreground">{t.sosContacts}</Text>
      <Text className="mt-1 text-muted">{t.sosContactsSub}</Text>
      {!signedIn && <Text className="mt-2 text-sm text-accent">{t.signInToSyncContacts}</Text>}
      {signedIn && serverList.isError && <Text className="mt-2 text-sm text-muted">{t.offlineContactsNote}</Text>}

      {contacts.length > 0 ? (
        <ListGroup className="mt-4">
          {contacts.map((c, i) => (
            <Fragment key={c.id}>
              <ListGroup.Item>
                <ListGroup.ItemContent>
                  <ListGroup.ItemTitle numberOfLines={1}>{c.name}</ListGroup.ItemTitle>
                  <ListGroup.ItemDescription numberOfLines={1}>
                    {[c.phone, c.relation, LANGS.find((l) => l.code === c.lang)?.label].filter(Boolean).join(" · ")}
                  </ListGroup.ItemDescription>
                </ListGroup.ItemContent>
                <ListGroup.ItemSuffix>
                  <View className="flex-row items-center gap-1">
                    <Button size="sm" variant="ghost" isDisabled={busy || i === 0} onPress={() => void move(i, -1)} accessibilityLabel="up">
                      <StyledIonicons name="chevron-up" size={16} className="text-foreground" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      isDisabled={busy || i === contacts.length - 1}
                      onPress={() => void move(i, 1)}
                      accessibilityLabel="down"
                    >
                      <StyledIonicons name="chevron-down" size={16} className="text-foreground" />
                    </Button>
                    <Button size="sm" variant="secondary" isDisabled={busy} onPress={() => edit(c)} accessibilityLabel={t.editContact}>
                      <StyledIonicons name="pencil" size={16} className="text-foreground" />
                    </Button>
                    <Button size="sm" variant="danger-soft" isDisabled={busy} onPress={() => void remove(c)} accessibilityLabel={t.delete}>
                      <StyledIonicons name="trash" size={16} className="text-danger" />
                    </Button>
                  </View>
                </ListGroup.ItemSuffix>
              </ListGroup.Item>
              {i < contacts.length - 1 && <Separator className="mx-4" />}
            </Fragment>
          ))}
        </ListGroup>
      ) : (
        <Text className="mt-4 leading-relaxed text-muted">{t.noContactsYet}</Text>
      )}

      <Surface variant="secondary" className="mt-6 gap-3 p-4">
        <Text className="font-semibold text-foreground">{form.localId || form.serverId ? t.editContact : t.addContact}</Text>
        <TextField>
          <Label>{t.nameField}</Label>
          <Input value={form.name} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} placeholder={t.nameField} />
        </TextField>
        <TextField>
          <Label>{t.phoneField}</Label>
          <Input
            value={form.phone}
            onChangeText={(v) => setForm((f) => ({ ...f, phone: v }))}
            placeholder={t.phoneHint}
            keyboardType="phone-pad"
          />
        </TextField>
        <TextField>
          <Label>{t.relationField}</Label>
          <Input value={form.relation} onChangeText={(v) => setForm((f) => ({ ...f, relation: v }))} placeholder={t.relationHint} />
        </TextField>
        <TextField>
          <Label>{t.emailFieldOptional}</Label>
          <Input
            value={form.email}
            onChangeText={(v) => setForm((f) => ({ ...f, email: v }))}
            placeholder="email@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </TextField>
        <View className="gap-1.5">
          <Label>{t.languageField}</Label>
          <Tabs value={form.lang} onValueChange={(v) => setForm((f) => ({ ...f, lang: v as Lang }))}>
            <Tabs.List accessibilityLabel={t.languageField}>
              <Tabs.Indicator />
              {LANGS.map((l) => (
                <Tabs.Trigger key={l.code} value={l.code}>
                  <Tabs.Label>{l.label}</Tabs.Label>
                </Tabs.Trigger>
              ))}
            </Tabs.List>
          </Tabs>
        </View>
        <View className="flex-row gap-2">
          <Button className="flex-1" onPress={() => void save()} isDisabled={busy || !form.name.trim() || !form.phone.trim()}>
            <Button.Label>{t.save}</Button.Label>
          </Button>
          {(form.localId || form.serverId) && (
            <Button variant="secondary" onPress={resetForm} isDisabled={busy}>
              <Button.Label>{t.cancel}</Button.Label>
            </Button>
          )}
        </View>
      </Surface>
    </Container>
  );
}
