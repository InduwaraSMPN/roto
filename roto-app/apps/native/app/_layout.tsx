import "@/lib/location-task";
import "@/global.css";
import { QueryClientProvider } from "@tanstack/react-query";
import { useMigrations } from "drizzle-orm/expo-sqlite/migrator";
import { Stack } from "expo-router";
import { HeroUINativeProvider, Spinner } from "heroui-native";
import { useEffect, useRef, type ReactNode } from "react";
import { Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";

import { AppThemeProvider } from "@/contexts/app-theme-context";
import { LangProvider, useLang } from "@/contexts/lang-context";
import { db } from "@/db";
import migrations from "@/drizzle/migrations";
import { migrateLegacyQueue } from "@/lib/ride-queue";
import { ROTO } from "@/lib/roto-theme";
import { syncInBackground } from "@/lib/sync";
import { queryClient } from "@/utils/trpc";

export const unstable_settings = {
  initialRouteName: "(drawer)",
};

function StackLayout() {
  return (
    <Stack screenOptions={{}}>
      <Stack.Screen name="(drawer)" options={{ headerShown: false }} />
    </Stack>
  );
}

/**
 * Gates the app behind the local Drizzle-on-expo-sqlite migrations (plan §3.6). `useMigrations`
 * runs every bundled `drizzle/*.sql` file against `roto.db` on first launch after an update;
 * until it reports success there is no local DB to read (ride queue, SOS contacts mirror, kv),
 * so the whole app waits here instead of screens racing an empty/mid-migration database.
 */
function MigrationGate({ children }: { children: ReactNode }) {
  const { t } = useLang();
  const { success, error } = useMigrations(db, migrations);
  const migratedLegacyQueue = useRef(false);
  const syncedOnStart = useRef(false);

  useEffect(() => {
    if (!success || migratedLegacyQueue.current) return;
    migratedLegacyQueue.current = true;
    void migrateLegacyQueue();
  }, [success]);

  // Offline delta sync (plan §4.4): one poll on app start, after the migration gate passes so
  // every write below lands in a migrated database. Debounced and wrapped — a signed-out,
  // offline or un-registered-server start just does nothing.
  useEffect(() => {
    if (!success || syncedOnStart.current) return;
    syncedOnStart.current = true;
    syncInBackground("app-start");
  }, [success]);

  if (error) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 8, padding: 24, backgroundColor: ROTO.asphalt }}>
        <Text style={{ color: ROTO.danger, fontWeight: "700", textAlign: "center" }}>{t.dbMigrationError}</Text>
        <Text style={{ color: ROTO.fog, fontSize: 12, textAlign: "center" }}>{error.message}</Text>
      </View>
    );
  }

  if (!success) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12, backgroundColor: ROTO.asphalt }}>
        <Spinner size="lg" color="default" />
        <Text style={{ color: ROTO.parchment }}>{t.dbMigrating}</Text>
      </View>
    );
  }

  return <>{children}</>;
}

export default function Layout() {
  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardProvider>
          <LangProvider>
            <AppThemeProvider>
              <HeroUINativeProvider>
                <MigrationGate>
                  <StackLayout />
                </MigrationGate>
              </HeroUINativeProvider>
            </AppThemeProvider>
          </LangProvider>
        </KeyboardProvider>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}
