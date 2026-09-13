// ponytail: Open-Meteo needs no key — direct from device, no server hop
export type Wx = { temp: number; rain: number; wind: number };

export async function fetchWx(lat: number, lon: number): Promise<Wx | null> {
  try {
    const r = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,precipitation,wind_speed_10m`,
    );
    if (!r.ok) return null;
    const j = await r.json();
    return { temp: j.current?.temperature_2m ?? 0, rain: j.current?.precipitation ?? 0, wind: j.current?.wind_speed_10m ?? 0 };
  } catch {
    return null;
  }
}
