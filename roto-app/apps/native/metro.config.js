const { withVarlockMetroConfig } = require("@varlock/expo-integration/metro-config");
const { getDefaultConfig } = require("expo/metro-config");
const { withUniwindConfig } = require("uniwind/metro");
const { wrapWithReanimatedMetroConfig } = require("react-native-reanimated/metro-config");

const path = require("node:path");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Monorepo: `@roto-app/core` and friends are npm workspace junctions in the repo-root
// node_modules, i.e. OUTSIDE this app's projectRoot. Metro refuses to follow a symlink that
// leaves the watched tree, so the bundle failed with
// "Unable to resolve module @roto-app/core/learn" while `tsc` passed happily (it follows
// the same package.json exports map). Watch the repo root and allow symlinks.
const repoRoot = path.resolve(__dirname, "../..");
config.watchFolders = [...(config.watchFolders ?? []), repoRoot];
config.resolver.unstable_enableSymlinks = true;
config.resolver.unstable_allowAllExtensions = config.resolver.unstable_allowAllExtensions ?? false;

// Drizzle's expo-sqlite migrator bundles each migration's raw .sql as a string import
// (plan A?3.6) — needs both this and the babel-plugin-inline-import entry in babel.config.js.
config.resolver.sourceExts.push("sql");

const uniwindConfig = withUniwindConfig(wrapWithReanimatedMetroConfig(config), {
  cssEntryFile: "./global.css",
  dtsFile: "./uniwind-types.d.ts",
});

module.exports = withVarlockMetroConfig(uniwindConfig);
