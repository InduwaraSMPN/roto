import { OfflineManager } from "@maplibre/maplibre-react-native";

// ponytail: demo tiles for dev, self-host OSM LK tiles for prod/FOSS
// Set EXPO_PUBLIC_TILE_URL=http://<LAN-IP>:3005/style.json (see tiles/README.md)
export const MAP_STYLE =
  process.env.EXPO_PUBLIC_TILE_URL || "https://demotiles.maplibre.org/style.json";

// [west, south, east, north]
export const LK_REGIONS = {
  colombo: { name: "colombo-metro", bounds: [79.75, 6.85, 80.05, 7.05] as const },
  hillCountry: { name: "kandy-nuwara-eliya", bounds: [80.55, 6.95, 80.95, 7.35] as const },
  ella: { name: "ella", bounds: [81.0, 6.8, 81.2, 6.95] as const },
  galle: { name: "galle-coast", bounds: [80.1, 5.9, 80.3, 6.1] as const },
} as const;

export type LkRegionKey = keyof typeof LK_REGIONS;

export async function downloadLkRegion(key: LkRegionKey) {
  const region = LK_REGIONS[key];
  return OfflineManager.createPack(
    {
      mapStyle: MAP_STYLE,
      minZoom: 10,
      maxZoom: 16,
      bounds: [...region.bounds] as [number, number, number, number],
      metadata: { name: region.name },
    },
    (_pack, status) => console.log(region.name, status),
    (_pack, err) => console.warn(region.name, err),
  );
}

export const listPacks = () => OfflineManager.getPacks();
export const deletePack = (name: string) => OfflineManager.deletePack(name);
