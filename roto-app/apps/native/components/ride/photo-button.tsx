// Ride photo capture (plan §4.10). Offline-first: every photo is queued in the local
// `photo_queue` table immediately; upload to `POST /upload` happens on sync.
// `expo-image-picker` is NOT installed in apps/native, so capture renders a stub button with
// a note (no installs allowed in this stream) — when the dep lands, the `launchCameraAsync`
// branch below activates with zero other changes. Privacy: a photo taken inside a privacy
// zone is queued with nulled coords so zone interiors never leave the phone.
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Text, View } from "react-native";
import { Button } from "heroui-native";

import { useMoreLang } from "@/lib/i18n-more";
import { insideAny, type Zone } from "@/lib/privacy";
import { enqueuePhoto } from "@/lib/ride-queue";

export function PhotoButton({
  rideId,
  zones,
  onQueued,
}: {
  rideId: string;
  zones: Zone[];
  onQueued: () => void;
}) {
  const { m } = useMoreLang();
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const capture = async () => {
    setBusy(true);
    setNote(null);
    try {
      const picker = await import("expo-image-picker").catch(() => null);
      const launch = (picker as unknown as {
        launchCameraAsync?: (opts: object) => Promise<{ canceled: boolean; assets?: { uri: string; exif?: Record<string, unknown> }[] }>;
      } | null)?.launchCameraAsync;
      if (!launch) {
        setNote(m.photoNoCamera);
        return;
      }
      const res = await launch({ exif: true, quality: 0.8 });
      const asset = res.canceled ? undefined : res.assets?.[0];
      if (!asset) return;
      const exif = asset.exif ?? {};
      const lat = typeof exif.GPSLatitude === "number" ? exif.GPSLatitude : null;
      const lon = typeof exif.GPSLongitude === "number" ? exif.GPSLongitude : null;
      const inZone = lat != null && lon != null && zones.length > 0 && insideAny(lon, lat, zones);
      await enqueuePhoto({
        id: `${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
        rideId,
        localUri: asset.uri,
        lat: inZone ? null : lat,
        lon: inZone ? null : lon,
      });
      setNote(m.photoQueued);
      onQueued();
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      <Button variant="secondary" onPress={() => void capture()} isDisabled={busy} accessibilityLabel={m.addPhoto}>
        <Ionicons name="camera-outline" size={18} />
        <Button.Label>{m.addPhoto}</Button.Label>
      </Button>
      {note != null && <Text className="mt-2 text-sm leading-relaxed text-muted">{note}</Text>}
    </View>
  );
}
