import { Map } from "@maplibre/maplibre-react-native";
import { MAP_STYLE } from "@/lib/maps";

export function MotoMap() {
  return <Map style={{ flex: 1 }} mapStyle={MAP_STYLE} />;
}
