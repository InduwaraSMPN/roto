import { Map } from "@maplibre/maplibre-react-native";
import type { ReactNode } from "react";

import { MAP_STYLE } from "@/lib/maps";

export function MotoMap({ children }: { children?: ReactNode }) {
  return (
    <Map style={{ flex: 1 }} mapStyle={MAP_STYLE}>
      {children}
    </Map>
  );
}
