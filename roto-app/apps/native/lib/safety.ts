import { Accelerometer } from "expo-sensors";
import * as SMS from "expo-sms";
import { Linking } from "react-native";

// ponytail: phone-sensor heuristic now; Cardo-style helmet fusion only if false-positives hurt
export const EMERGENCY = { police: "119", ambulance: "1990" } as const;

export function startCrashWatch(onCrash: () => void, gThreshold = 4) {
  Accelerometer.setUpdateInterval(100);
  const sub = Accelerometer.addListener(({ x, y, z }) => {
    const g = Math.sqrt(x * x + y * y + z * z);
    if (g >= gThreshold) onCrash();
  });
  return () => sub.remove();
}

export async function sosAlert(phones: string[], text: string) {
  if (await SMS.isAvailableAsync().catch(() => false)) {
    await SMS.sendSMSAsync(phones, text).catch(() => Linking.openURL(`tel:${EMERGENCY.police}`));
  } else {
    await Linking.openURL(`tel:${EMERGENCY.police}`);
  }
}

export const callAmbulance = () => Linking.openURL(`tel:${EMERGENCY.ambulance}`);
