// Dealers & service directory + garage (plan §5.3, §4.14). Dealers come from the server
// POI index when reachable (`rides.pois` alias accepts a kind filter); brand chips filter
// client-side. Bikes and reminders below are device-only (lib/garage.ts) — reg numbers never
// leave the phone; server backup is attempted only when signed in and built.
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Button, Card, Chip, Input, Label, TextField } from "heroui-native";
import { useEffect, useState } from "react";
import { Linking, ScrollView, Text, View } from "react-native";

import { BRANDS, riyasewanaUrl } from "@roto-app/core/brands";
import { Container } from "@/components/container";
import { authClient } from "@/lib/auth-client";
import {
  backupToServer,
  ensureOilReminders,
  listBikes,
  listReminders,
  markReminderDone,
  removeBike,
  removeReminder,
  scheduleReminderNotifications,
  upsertBike,
  upsertReminder,
  type Bike,
  type Reminder,
  type ReminderKind,
} from "@/lib/garage";
import { useLang } from "@/lib/i18n";
import { useMoreLang } from "@/lib/i18n-more";
import { trpc } from "@/utils/trpc";

type PoiRow = {
  id: string;
  nameEn?: string | null;
  name?: string | null;
  kind?: string | null;
  brand?: string | null;
  phone?: string | null;
  lat?: number | null;
  lon?: number | null;
};

const KINDS = ["dealer", "service", "spares"] as const;
const REM_KINDS: ReminderKind[] = ["revenue-licence", "insurance", "emission", "oil-change"];

export default function Dealers() {
  const { lang } = useLang();
  const { m } = useMoreLang();
  void lang;
  const { data: session } = authClient.useSession();
  const [brand, setBrand] = useState<string | null>(null);
  const [pois, setPois] = useState<PoiRow[]>([]);
  const [poisFailed, setPoisFailed] = useState(false);

  const [bikes, setBikes] = useState<Bike[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [bikeForm, setBikeForm] = useState({ brand: "honda", model: "", year: "", regNo: "", odometer: "" });
  const [remKind, setRemKind] = useState<ReminderKind>("revenue-licence");
  const [remDueKm, setRemDueKm] = useState("");
  const [note, setNote] = useState<string | null>(null);

  const poisQuery = useQuery({
    ...trpc.rides.pois.queryOptions({}),
    enabled: true,
    retry: false,
  });

  useEffect(() => {
    if (poisQuery.data) {
      try {
        const rows = poisQuery.data as PoiRow[];
        setPois(rows.filter((r) => r.kind == null || (KINDS as readonly string[]).includes(r.kind)));
        setPoisFailed(false);
      } catch {
        setPoisFailed(true);
      }
    }
    if (poisQuery.isError) setPoisFailed(true);
  }, [poisQuery.data, poisQuery.isError]);

  const refreshGarage = async () => {
    const [b, r] = await Promise.all([
      listBikes().catch(() => [] as Bike[]),
      (async () => {
        await ensureOilReminders().catch(() => undefined);
        return listReminders().catch(() => [] as Reminder[]);
      })(),
    ]);
    setBikes(b);
    setReminders(r);
    const sched = await scheduleReminderNotifications().catch(() => ({ scheduled: false, reason: "error" }));
    if (!sched.scheduled) setNote(m.notifFallback);
  };

  useEffect(() => {
    void refreshGarage();
  }, []);

  const shown = brand ? pois.filter((p) => (p.brand ?? "").toLowerCase() === brand) : pois;
  const remLabel = (k: ReminderKind) =>
    k === "revenue-licence" ? m.remRevenue : k === "insurance" ? m.remInsurance : k === "emission" ? m.remEmission : m.remOil;

  const openUrl = (url: string) => {
    void Linking.openURL(url).catch(() => undefined);
  };

  const saveBike = async () => {
    if (!bikeForm.brand.trim()) return;
    await upsertBike({
      id: `${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      brand: bikeForm.brand.trim(),
      model: bikeForm.model.trim() || null,
      year: bikeForm.year.trim() ? Number(bikeForm.year.trim()) || null : null,
      regNo: bikeForm.regNo.trim() || null,
      odometerKm: bikeForm.odometer.trim() ? Number(bikeForm.odometer.trim()) || null : null,
    }).catch(() => undefined);
    setBikeForm({ brand: bikeForm.brand, model: "", year: "", regNo: "", odometer: "" });
    setNote(m.bikeSaved);
    void refreshGarage();
  };

  const saveReminder = async () => {
    await upsertReminder({
      id: `${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      kind: remKind,
      dueAt: remKind === "oil-change" ? null : Date.now() + 30 * 864e5,
      dueKm: remDueKm.trim() ? Number(remDueKm.trim()) || null : null,
    }).catch(() => undefined);
    setRemDueKm("");
    void refreshGarage();
  };

  const backup = async () => {
    const ok = await backupToServer().catch(() => false);
    setNote(ok ? m.backupDone : session?.user ? m.backupUnavailable : m.signInForSync);
  };

  return (
    <Container className="p-6">
      <View className="gap-4">
      <View>
        <Text className="text-2xl font-extrabold tracking-tight text-foreground">{m.dealersTitle}</Text>
        <Text className="mt-1 leading-relaxed text-muted">{m.dealersSub}</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
        <Chip key="all" variant={brand == null ? "primary" : "secondary"} onPress={() => setBrand(null)} className="mr-2">
          <Chip.Label>{m.allBrands}</Chip.Label>
        </Chip>
        {BRANDS.map((b) => (
          <Chip key={b.slug} variant={brand === b.slug ? "primary" : "secondary"} onPress={() => setBrand(brand === b.slug ? null : b.slug)} className="mr-2">
            <Chip.Label>{b.name}</Chip.Label>
          </Chip>
        ))}
      </ScrollView>

      {poisFailed && <Text className="text-sm text-muted">{m.dealersUnavailable}</Text>}
      {!poisFailed && shown.length === 0 && <Text className="text-sm text-muted">{m.dealersEmpty}</Text>}
      {shown.map((p) => {
        const name = p.nameEn ?? p.name ?? p.id;
        const pBrand = (p.brand ?? brand ?? "").toLowerCase();
        return (
          <Card key={p.id} variant="secondary" className="p-4">
            <Text className="font-bold text-foreground" numberOfLines={1}>
              {name}
            </Text>
            <Text className="mt-0.5 text-sm text-muted">
              {p.kind === "service" ? m.kindService : p.kind === "spares" ? m.kindSpares : m.kindDealer}
              {p.brand ? ` · ${p.brand}` : ""}
            </Text>
            <View className="mt-3 flex-row flex-wrap gap-2">
              {p.phone ? (
                <Button size="sm" variant="secondary" onPress={() => openUrl(`tel:${p.phone}`)} accessibilityLabel={m.call}>
                  <Ionicons name="call-outline" size={16} />
                  <Button.Label>{m.call}</Button.Label>
                </Button>
              ) : null}
              {p.lat != null && p.lon != null ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onPress={() => openUrl(`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}`)}
                  accessibilityLabel={m.navigate}
                >
                  <Ionicons name="navigate-outline" size={16} />
                  <Button.Label>{m.navigate}</Button.Label>
                </Button>
              ) : null}
              {pBrand ? (
                <Button size="sm" variant="secondary" onPress={() => openUrl(riyasewanaUrl(pBrand))} accessibilityLabel={m.partsOnRiyasewana}>
                  <Ionicons name="open-outline" size={16} />
                  <Button.Label>{m.partsOnRiyasewana}</Button.Label>
                </Button>
              ) : null}
            </View>
          </Card>
        );
      })}

      <View>
        <Text className="mb-2 text-lg font-extrabold text-foreground">{m.myBikes}</Text>
        {bikes.length === 0 && <Text className="mb-2 text-sm text-muted">{m.noBikes}</Text>}
        {bikes.map((b) => (
          <Card key={b.id} variant="secondary" className="mb-2 p-4">
            <View className="flex-row items-center justify-between">
              <View className="flex-1">
                <Text className="font-bold text-foreground" numberOfLines={1}>
                  {b.brand} {b.model ?? ""} {b.year ?? ""}
                </Text>
                <Text className="text-sm text-muted tabular-nums">
                  {[b.regNo, b.odometerKm != null ? `${b.odometerKm} km` : null].filter(Boolean).join(" · ")}
                </Text>
              </View>
              <Button size="sm" variant="danger-soft" onPress={() => void removeBike(b.id).then(refreshGarage)} accessibilityLabel={m.remove}>
                <Button.Label>{m.remove}</Button.Label>
              </Button>
            </View>
            <Button
              size="sm"
              variant="secondary"
              className="mt-2 self-start"
              onPress={() => openUrl(riyasewanaUrl(b.brand.toLowerCase(), b.model ?? undefined))}
              accessibilityLabel={m.partsOnRiyasewana}
            >
              <Button.Label>{m.partsOnRiyasewana}</Button.Label>
            </Button>
          </Card>
        ))}
        <Card variant="secondary" className="gap-3 p-4">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
            {BRANDS.map((b) => (
              <Chip key={b.slug} variant={bikeForm.brand === b.slug ? "primary" : "secondary"} onPress={() => setBikeForm((f) => ({ ...f, brand: b.slug }))} className="mr-2">
                <Chip.Label>{b.name}</Chip.Label>
              </Chip>
            ))}
          </ScrollView>
          <TextField>
            <Label>{m.model}</Label>
            <Input value={bikeForm.model} onChangeText={(v) => setBikeForm((f) => ({ ...f, model: v }))} accessibilityLabel={m.model} />
          </TextField>
          <View className="flex-row gap-2">
            <TextField className="flex-1">
              <Label>{m.year}</Label>
              <Input value={bikeForm.year} onChangeText={(v) => setBikeForm((f) => ({ ...f, year: v }))} keyboardType="numeric" accessibilityLabel={m.year} />
            </TextField>
            <TextField className="flex-1">
              <Label>{m.regNo}</Label>
              <Input value={bikeForm.regNo} onChangeText={(v) => setBikeForm((f) => ({ ...f, regNo: v }))} accessibilityLabel={m.regNo} />
            </TextField>
          </View>
          <TextField>
            <Label>{m.odometer}</Label>
            <Input value={bikeForm.odometer} onChangeText={(v) => setBikeForm((f) => ({ ...f, odometer: v }))} keyboardType="numeric" accessibilityLabel={m.odometer} />
          </TextField>
          <Button onPress={() => void saveBike()} accessibilityLabel={m.addBike}>
            <Button.Label>{m.addBike}</Button.Label>
          </Button>
        </Card>
      </View>

      <View>
        <Text className="mb-2 text-lg font-extrabold text-foreground">{m.remindersTitle}</Text>
        {reminders.length === 0 && <Text className="mb-2 text-sm text-muted">{m.noReminders}</Text>}
        {reminders.map((r) => {
          const due = (r.dueAt != null && r.dueAt <= Date.now()) || r.dueKm != null;
          return (
            <Card key={r.id} variant="secondary" className="mb-2 p-3">
              <View className="flex-row items-center justify-between">
                <View className="flex-1">
                  <Text className="font-bold text-foreground">
                    {remLabel(r.kind)}
                    {due && !r.done ? ` · ${m.due}` : ""}
                  </Text>
                  <Text className="text-sm text-muted tabular-nums">
                    {[r.dueAt != null ? new Date(r.dueAt).toLocaleDateString() : null, r.dueKm != null ? `${r.dueKm} km` : null, r.note].filter(Boolean).join(" · ")}
                  </Text>
                </View>
                <View className="flex-row gap-1">
                  {!r.done && (
                    <Button size="sm" variant="secondary" onPress={() => void markReminderDone(r.id, true).then(refreshGarage)} accessibilityLabel={m.done}>
                      <Button.Label>{m.done}</Button.Label>
                    </Button>
                  )}
                  <Button size="sm" variant="danger-soft" onPress={() => void removeReminder(r.id).then(refreshGarage)} accessibilityLabel={m.delete}>
                    <Button.Label>{m.delete}</Button.Label>
                  </Button>
                </View>
              </View>
            </Card>
          );
        })}
        <Card variant="secondary" className="gap-3 p-4">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
            {REM_KINDS.map((k) => (
              <Chip key={k} variant={remKind === k ? "primary" : "secondary"} onPress={() => setRemKind(k)} className="mr-2">
                <Chip.Label>{remLabel(k)}</Chip.Label>
              </Chip>
            ))}
          </ScrollView>
          <TextField>
            <Label>{m.dueKm}</Label>
            <Input value={remDueKm} onChangeText={setRemDueKm} keyboardType="numeric" placeholder="3000" accessibilityLabel={m.dueKm} />
          </TextField>
          <Button variant="secondary" onPress={() => void saveReminder()} accessibilityLabel={m.addReminder}>
            <Button.Label>{m.addReminder}</Button.Label>
          </Button>
          <Button variant="ghost" onPress={() => void backup()} accessibilityLabel={m.backupDone}>
            <Button.Label>{m.backupDone}</Button.Label>
          </Button>
        </Card>
      </View>

      {note != null && <Text className="text-sm text-muted">{note}</Text>}
      </View>
    </Container>
  );
}
