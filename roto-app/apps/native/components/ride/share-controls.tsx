// Share + visibility controls for ride detail (plan §4.10, §4.17: private by default,
// sharing asks explicitly). `rides.setVisibility` is parallel-built — when it is missing the
// control explains and stays local-only. System share sheet always works offline.
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Share, Text, View } from "react-native";
import { Button } from "heroui-native";

import { useMoreLang } from "@/lib/i18n-more";
import { trpc } from "@/utils/trpc";

export type Visibility = "private" | "unlisted" | "public";

const OPTIONS: Visibility[] = ["private", "unlisted", "public"];

export function ShareControls({
  rideId,
  rideName,
  initial,
}: {
  rideId: string;
  rideName: string;
  initial: Visibility;
}) {
  const { m } = useMoreLang();
  const [vis, setVis] = useState<Visibility>(initial);
  const [note, setNote] = useState<string | null>(null);

  const visLabel = (v: Visibility) => (v === "private" ? m.visPrivate : v === "unlisted" ? m.visUnlisted : m.visPublic);

  const set = async (v: Visibility) => {
    setVis(v);
    setNote(null);
    try {
      const api = (trpc as unknown as { rides?: { setVisibility?: (input: { id: string; visibility: Visibility }) => Promise<unknown> } }).rides;
      if (!api?.setVisibility) {
        setNote(m.visibilityUnavailable);
        return;
      }
      await api.setVisibility({ id: rideId, visibility: v });
      setNote(m.visibilitySaved);
    } catch {
      setNote(m.visibilityUnavailable);
    }
  };

  const share = async () => {
    try {
      await Share.share({ message: `${rideName} — Roto ride ${rideId}`, title: rideName });
    } catch {
      // Dismissed — nothing to do.
    }
  };

  return (
    <View>
      <Text className="mb-2 text-sm font-bold text-foreground">{m.visibility}</Text>
      <View className="flex-row gap-2">
        {OPTIONS.map((v) => (
          <Button
            key={v}
            size="sm"
            variant={vis === v ? "primary" : "secondary"}
            onPress={() => void set(v)}
            accessibilityLabel={visLabel(v)}
          >
            <Button.Label>{visLabel(v)}</Button.Label>
          </Button>
        ))}
        <Button size="sm" variant="secondary" onPress={() => void share()} accessibilityLabel={m.share}>
          <Ionicons name="share-outline" size={16} />
          <Button.Label>{m.share}</Button.Label>
        </Button>
      </View>
      {note != null && <Text className="mt-2 text-sm text-muted">{note}</Text>}
    </View>
  );
}
