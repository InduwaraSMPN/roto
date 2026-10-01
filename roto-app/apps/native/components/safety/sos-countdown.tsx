// Full-screen SOS countdown overlay (plan §4.12). Renders from the safety.ts singleton store,
// so any screen can trigger `sosFlow()` while this overlay is mounted. Mount it on every screen
// that can start an SOS flow (map + safety) — the `announcedSeq` guard below keeps voice,
// haptics and the notification to one shot even with two copies mounted (tabs stay mounted).
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Button } from "heroui-native";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { withUniwind } from "uniwind";

import { useLang } from "@/lib/i18n";
import { ROTO, numerals } from "@/lib/roto-theme";
import {
  cancelSosCountdown,
  confirmSosCountdown,
  getSosCountdown,
  notifySosCountdown,
  SOS_COUNTDOWN_S,
  subscribeSosCountdown,
} from "@/lib/safety";
import { say } from "@/lib/voice";

const StyledIonicons = withUniwind(Ionicons);

const SLIDE_THRESHOLD = 150;

let announcedSeq = -1;

export function SosCountdownOverlay() {
  const { lang, t } = useLang();
  const state = useSyncExternalStore(subscribeSosCountdown, getSosCountdown);
  const [secondsLeft, setSecondsLeft] = useState(SOS_COUNTDOWN_S);
  const fired = useRef(false);
  const translateX = useSharedValue(0);

  useEffect(() => {
    fired.current = false;
    translateX.value = 0;
    setSecondsLeft(SOS_COUNTDOWN_S);
    if (!state) return;
    // One voice + haptics + notification per countdown, however many overlays are mounted.
    if (announcedSeq !== state.seq) {
      announcedSeq = state.seq;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
      say(t.sosCountdownVoice, lang);
      const title = state.reason === "manual" ? t.sosCountdownManualTitle : t.sosCountdownTitle;
      void notifySosCountdown(title, t.sosCountdownBody);
    }
    const id = setInterval(() => {
      const left = Math.max(0, Math.ceil((state.endsAt - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0 && !fired.current) {
        fired.current = true;
        // Timeout sends in live mode; a preview just closes (nothing is ever sent in preview).
        if (state.mode === "preview") cancelSosCountdown();
        else confirmSosCountdown();
      }
    }, 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.seq]);

  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }));

  if (!state) return null;

  const doCancel = () => cancelSosCountdown();
  const doSend = () => {
    if (state.mode === "preview") cancelSosCountdown();
    else confirmSosCountdown();
  };

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      translateX.value = Math.max(0, Math.min(e.translationX, 230));
    })
    .onEnd((e) => {
      if (e.translationX > SLIDE_THRESHOLD) runOnJS(doCancel)();
      else translateX.value = withSpring(0);
    });

  const title = state.reason === "manual" ? t.sosCountdownManualTitle : t.sosCountdownTitle;

  return (
    <View
      accessibilityRole="alert"
      accessibilityLabel={title}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 50,
        elevation: 50,
        backgroundColor: "rgba(0,0,0,0.96)",
        justifyContent: "center",
        alignItems: "center",
        gap: 20,
        padding: 28,
      }}
    >
      <StyledIonicons name="warning" size={56} className="text-accent" />
      <Text style={{ color: ROTO.white, fontSize: 26, fontWeight: "800", textAlign: "center" }}>{title}</Text>
      <Text style={{ color: ROTO.fog, fontSize: 15, textAlign: "center" }}>
        {state.mode === "preview" ? t.sosCountdownPreviewBody : t.sosCountdownBody}
      </Text>
      <Text style={{ color: ROTO.signal, ...numerals, fontSize: 64 }}>{secondsLeft}</Text>
      <View style={{ height: 8, width: "100%", maxWidth: 320, borderRadius: 4, backgroundColor: ROTO.tar, overflow: "hidden" }}>
        <View style={{ height: 8, borderRadius: 4, backgroundColor: ROTO.signal, width: `${(secondsLeft / SOS_COUNTDOWN_S) * 100}%` }} />
      </View>

      <View style={{ width: "100%", maxWidth: 320, borderRadius: 999, backgroundColor: ROTO.tar, padding: 6 }}>
        <GestureDetector gesture={pan}>
          <Animated.View
            style={[
              {
                width: 72,
                height: 56,
                borderRadius: 999,
                backgroundColor: ROTO.signal,
                justifyContent: "center",
                alignItems: "center",
              },
              thumbStyle,
            ]}
          >
            <Ionicons name="chevron-forward" size={28} color={ROTO.signalInk} />
          </Animated.View>
        </GestureDetector>
        <Text style={{ color: ROTO.fog, fontSize: 12, textAlign: "center", paddingBottom: 6 }}>{t.sosSlideToCancel}</Text>
      </View>

      <View style={{ flexDirection: "row", gap: 12 }}>
        <Button size="lg" variant="secondary" onPress={doCancel} accessibilityLabel={t.sosImOk}>
          <Button.Label>{t.sosImOk}</Button.Label>
        </Button>
        {state.mode === "live" && (
          <Button size="lg" variant="danger" onPress={doSend} accessibilityLabel={t.sosSendNow}>
            <Button.Label>{t.sosSendNow}</Button.Label>
          </Button>
        )}
      </View>
    </View>
  );
}
