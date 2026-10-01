module.exports = {
  presets: ["babel-preset-expo"],
  plugins: [
    require("@varlock/expo-integration/babel-plugin"),
    // Drizzle expo-sqlite migrations: inlines each generated ./drizzle/*.sql file as a string
    // import (plan §3.6) — paired with the `sourceExts.push("sql")` in metro.config.js.
    ["inline-import", { extensions: [".sql"] }],
  ],
};
