// Privacy zone editor on a map (plan §4.17): add / update / remove named zones with a
// radius slider, `setHome` shortcut, plus GDPR export + delete-account entry points.
// Zones only ever affect what leaves this phone (trimEnds at record time); this screen edits
// the server list when signed in, and explains when the parallel-built GDPR calls are missing.
import { Camera, GeoJSONSource, Layer, Map } from "@maplibre/maplibre-react-native";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button, Input, Label, ListGroup, Separator, Slider, TextField } from "heroui-native";
import { Fragment, useMemo, useState } from "react";
import { Text, View } from "react-native";

import { Container } from "@/components/container";
import { authClient } from "@/lib/auth-client";
import { useMoreLang } from "@/lib/i18n-more";
import { MAP_STYLE } from "@/lib/maps";
import { ROTO } from "@/lib/roto-theme";
import { queryClient, trpc } from "@/utils/trpc";

type ZoneRow = { id: string; name: string; lat: number; lon: number; radiusM?: number | null };

const COLOMBO: [number, number] = [79.86, 6.93];

export default function PrivacyEditor() {
  const { m } = useMoreLang();
  const { data: session } = authClient.useSession();
  const signedIn = !!session?.user;

  const [pin, setPin] = useState<[number, number]>(COLOMBO);
  const [name, setName] = useState("");
  const [radius, setRadius] = useState(200);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [deleteArm, setDeleteArm] = useState(false);

  const zonesQuery = useQuery({ ...trpc.privacy.list.queryOptions(), enabled: signedIn });
  const addMut = useMutation(trpc.privacy.add.mutationOptions());
  const updateMut = useMutation(trpc.privacy.update.mutationOptions());
  const removeMut = useMutation(trpc.privacy.remove.mutationOptions());
  const homeMut = useMutation(trpc.privacy.setHome.mutationOptions());

  const zones = useMemo<ZoneRow[]>(() => {
    try {
      return ((zonesQuery.data ?? []) as ZoneRow[]).map((z) => ({ ...z, radiusM: z.radiusM ?? 200 }));
    } catch {
      return [];
    }
  }, [zonesQuery.data]);

  const pinGeo = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: [
        { type: "Feature" as const, geometry: { type: "Point" as const, coordinates: pin }, properties: {} },
      ],
    }),
    [pin],
  );

  const zonesGeo = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: zones.map((z) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [z.lon, z.lat] as [number, number] },
        properties: { name: `${z.name} · ${z.radiusM ?? 200}m` },
      })),
    }),
    [zones],
  );

  const refresh = () => {
    setEditingId(null);
    setName("");
    void zonesQuery.refetch().catch(() => undefined);
    void queryClient.refetchQueries().catch(() => undefined);
  };

  const save = async () => {
    if (!signedIn) {
      setNote(m.signInForSync);
      return;
    }
    const label = name.trim() || m.homeZone;
    try {
      if (editingId) {
        await updateMut.mutateAsync({ id: editingId, name: label, lat: pin[1], lon: pin[0], radiusM: Math.round(radius) });
      } else {
        await addMut.mutateAsync({ name: label, lat: pin[1], lon: pin[0], radiusM: Math.round(radius) });
      }
      setNote(m.zoneSaved);
      refresh();
    } catch {
      setNote(m.offlineNote);
    }
  };

  const startEdit = (z: ZoneRow) => {
    setEditingId(z.id);
    setName(z.name);
    setPin([z.lon, z.lat]);
    setRadius(z.radiusM ?? 200);
  };

  const remove = async (id: string) => {
    try {
      await removeMut.mutateAsync({ id });
      setNote(m.zoneRemoved);
      refresh();
    } catch {
      setNote(m.offlineNote);
    }
  };

  const setHome = async () => {
    if (!signedIn) {
      setNote(m.signInForSync);
      return;
    }
    try {
      await homeMut.mutateAsync({ lat: pin[1], lon: pin[0], radiusM: Math.round(radius) });
      setNote(m.zoneSaved);
      refresh();
    } catch {
      setNote(m.offlineNote);
    }
  };

  const exportMine = async () => {
    try {
      const api = (trpc as unknown as { privacy?: { exportMine?: () => Promise<unknown> } }).privacy;
      if (!api?.exportMine) {
        setNote(m.exportUnavailable);
        return;
      }
      await api.exportMine();
      setNote(m.exportDone);
    } catch {
      setNote(m.exportUnavailable);
    }
  };

  const deleteAccount = async () => {
    if (!deleteArm) {
      setDeleteArm(true);
      setNote(m.deleteConfirm2);
      return;
    }
    try {
      const api = (trpc as unknown as { privacy?: { deleteAccount?: () => Promise<unknown> } }).privacy;
      if (!api?.deleteAccount) {
        setNote(m.deleteUnavailable);
        return;
      }
      await api.deleteAccount();
      setNote(m.deleteUnavailable);
    } catch {
      setNote(m.deleteUnavailable);
    } finally {
      setDeleteArm(false);
    }
  };

  return (
    <Container className="p-6">
      <View className="gap-4">
      <View>
        <Text className="text-2xl font-extrabold tracking-tight text-foreground">{m.privacyTitle}</Text>
        <Text className="mt-1 leading-relaxed text-muted">{m.privacyEditorSub}</Text>
      </View>

      <View style={{ height: 280, borderRadius: ROTO.radius, overflow: "hidden" }}>
        <Map
          style={{ flex: 1 }}
          mapStyle={MAP_STYLE}
          onPress={(e: unknown) => {
            try {
              const coords = (e as { geometry?: { coordinates?: [number, number] } }).geometry?.coordinates;
              if (coords && Number.isFinite(coords[0]) && Number.isFinite(coords[1])) setPin([coords[0], coords[1]]);
            } catch {
              // Ignore malformed press events.
            }
          }}
        >
          <Camera center={pin} zoom={13} />
          <GeoJSONSource id="zones" data={zonesGeo}>
            <Layer id="zone-dots" source="zones" type="circle" paint={{ "circle-radius": 8, "circle-color": ROTO.danger }} />
            <Layer id="zone-labels" source="zones" type="symbol" layout={{ "text-field": ["get", "name"], "text-size": 11, "text-offset": [0, 1.2] }} />
          </GeoJSONSource>
          <GeoJSONSource id="pin" data={pinGeo}>
            <Layer id="pin-dot" source="pin" type="circle" paint={{ "circle-radius": 10, "circle-color": ROTO.signal, "circle-stroke-color": ROTO.signalInk, "circle-stroke-width": 2 }} />
          </GeoJSONSource>
        </Map>
      </View>
      <Text className="text-xs text-muted">© OpenMapTiles © OpenStreetMap contributors · {m.tapMapHint}</Text>

      {signedIn ? (
        <View className="gap-3">
          <TextField>
            <Label>{m.zoneName}</Label>
            <Input value={name} onChangeText={setName} placeholder={m.homeZone} accessibilityLabel={m.zoneName} />
          </TextField>
          <View>
            <Text className="mb-1 text-sm font-bold text-foreground tabular-nums">
              {m.radius}: {Math.round(radius)} m
            </Text>
            <Slider
              value={radius}
              minValue={50}
              maxValue={2000}
              step={50}
              onChange={(v) => setRadius(typeof v === "number" ? v : (v[0] ?? 200))}
              accessibilityLabel={m.radius}
            >
              <Slider.Track>
                <Slider.Fill />
                <Slider.Thumb />
              </Slider.Track>
            </Slider>
          </View>
          <View className="flex-row gap-2">
            <Button className="flex-1" onPress={() => void save()} accessibilityLabel={editingId ? m.updateZone : m.addZone}>
              <Button.Label>{editingId ? m.updateZone : m.addZone}</Button.Label>
            </Button>
            <Button variant="secondary" onPress={() => void setHome()} accessibilityLabel={m.setHomeShort}>
              <Button.Label>{m.setHomeShort}</Button.Label>
            </Button>
          </View>

          {zones.length > 0 && (
            <ListGroup>
              {zones.map((z, i) => (
                <Fragment key={z.id}>
                  <ListGroup.Item>
                    <ListGroup.ItemContent>
                      <ListGroup.ItemTitle numberOfLines={1}>
                        {z.name} · {z.radiusM ?? 200}m
                      </ListGroup.ItemTitle>
                    </ListGroup.ItemContent>
                    <ListGroup.ItemSuffix>
                      <View className="flex-row gap-1">
                        <Button size="sm" variant="secondary" onPress={() => startEdit(z)} accessibilityLabel={m.updateZone}>
                          <Button.Label>{m.updateZone}</Button.Label>
                        </Button>
                        <Button size="sm" variant="danger-soft" onPress={() => void remove(z.id)} accessibilityLabel={m.deleteZone}>
                          <Button.Label>{m.delete}</Button.Label>
                        </Button>
                      </View>
                    </ListGroup.ItemSuffix>
                  </ListGroup.Item>
                  {i < zones.length - 1 && <Separator className="mx-4" />}
                </Fragment>
              ))}
            </ListGroup>
          )}
        </View>
      ) : (
        <Text className="leading-relaxed text-muted">{m.signInForSync}</Text>
      )}

      <View className="gap-2">
        <Button variant="secondary" onPress={() => void exportMine()} accessibilityLabel={m.exportData}>
          <Button.Label>{m.exportData}</Button.Label>
        </Button>
        <Button variant="danger-soft" onPress={() => void deleteAccount()} accessibilityLabel={m.deleteAccount}>
          <Button.Label>{deleteArm ? m.deleteYes : m.deleteAccount}</Button.Label>
        </Button>
        {!deleteArm && <Text className="text-xs text-muted">{m.deleteConfirm1}</Text>}
      </View>

      {note != null && <Text className="text-sm text-muted">{note}</Text>}
      </View>
    </Container>
  );
}
