// Horizontal strip of a ride's photos: local queued shots (file URIs) plus already-synced
// remote URLs. A "queued" badge marks rows still waiting for `POST /upload`.
import { useEffect, useState } from "react";
import { Image, ScrollView, Text, View } from "react-native";

import { ROTO } from "@/lib/roto-theme";
import { listPhotosForRide, type QueuedPhoto } from "@/lib/ride-queue";

export function PhotoStrip({
  rideId,
  remoteUrls = [],
  refreshKey = 0,
  queuedLabel,
}: {
  rideId: string;
  remoteUrls?: string[];
  refreshKey?: number;
  queuedLabel: string;
}) {
  const [photos, setPhotos] = useState<QueuedPhoto[]>([]);

  useEffect(() => {
    let live = true;
    void listPhotosForRide(rideId).then((rows) => {
      if (live) setPhotos(rows);
    });
    return () => {
      live = false;
    };
  }, [rideId, refreshKey]);

  const uris: { uri: string; queued: boolean }[] = [
    ...photos.map((p) => ({ uri: p.url ?? p.localUri, queued: p.uploadedAt == null })),
    ...remoteUrls.filter((u) => !photos.some((p) => p.url === u)).map((u) => ({ uri: u, queued: false })),
  ];
  if (uris.length === 0) return null;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row gap-2">
      {uris.map((p, i) => (
        <View key={`${p.uri}-${i}`} className="mr-2">
          <Image source={{ uri: p.uri }} style={{ width: 120, height: 90, borderRadius: ROTO.radius }} />
          {p.queued && (
            <View
              style={{ backgroundColor: ROTO.signal }}
              className="absolute left-1 top-1 rounded-full px-2 py-0.5"
            >
              <Text style={{ color: ROTO.signalInk }} className="text-[11px] font-bold">
                {queuedLabel}
              </Text>
            </View>
          )}
        </View>
      ))}
    </ScrollView>
  );
}
