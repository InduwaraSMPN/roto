// ponytail: hand-written JS config plugin (no build step) since it only needs to
// run once during `expo prebuild`, not through Metro. Keep it dependency-free
// beyond `expo/config-plugins`.
const { AndroidConfig, withAndroidManifest, createRunOncePlugin } = require("expo/config-plugins");

const pkg = require("../package.json");

const SERVICE_NAME = "lk.roto.safety.CrashDetectorService";
const ACTIVITY_NAME = "lk.roto.safety.CrashAlertActivity";

// D15/D17 (context/feature-parity-plan.md §10, §4.12): background crash watch +
// full-screen SOS alert, Android-only.
const PERMISSIONS = [
  "android.permission.FOREGROUND_SERVICE",
  "android.permission.FOREGROUND_SERVICE_LOCATION",
  "android.permission.USE_FULL_SCREEN_INTENT",
  "android.permission.POST_NOTIFICATIONS",
  "android.permission.WAKE_LOCK",
  "android.permission.HIGH_SAMPLING_RATE_SENSORS",
];

function withRotoSafetyManifest(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);

    if (!Array.isArray(app.service)) {
      app.service = [];
    }
    if (!app.service.some((entry) => entry.$?.["android:name"] === SERVICE_NAME)) {
      app.service.push({
        $: {
          "android:name": SERVICE_NAME,
          "android:exported": "false",
          // Required on Android 10+ to keep receiving location fixes while the
          // app is backgrounded/screen off (context/feature-parity-plan.md §4.12).
          "android:foregroundServiceType": "location",
        },
      });
    }

    if (!Array.isArray(app.activity)) {
      app.activity = [];
    }
    if (!app.activity.some((entry) => entry.$?.["android:name"] === ACTIVITY_NAME)) {
      app.activity.push({
        $: {
          "android:name": ACTIVITY_NAME,
          "android:exported": "false",
          "android:excludeFromRecents": "true",
          // singleTask: repeated crash alerts (should never happen inside the
          // 5-minute cooldown, but defensive) reuse one instance instead of
          // stacking full-screen activities.
          "android:launchMode": "singleTask",
        },
      });
    }

    return config;
  });
}

const withRotoSafety = (config) => {
  config = AndroidConfig.Permissions.withPermissions(config, PERMISSIONS);
  config = withRotoSafetyManifest(config);
  return config;
};

module.exports = createRunOncePlugin(withRotoSafety, pkg.name, pkg.version);
