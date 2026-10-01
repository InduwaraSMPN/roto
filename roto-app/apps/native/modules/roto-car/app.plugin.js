// Expo's config-plugin resolver looks for `app.plugin.js` at the root of whatever is referenced
// in app.json's `plugins` array (see @expo/config-plugins' plugin-resolver `pluginFileName`
// constant). This file is intentionally separate from `index.ts` (the JS API's `main` entry) so
// the two responsibilities - runtime API vs. build-time manifest changes - don't collide on one
// module export.
module.exports = require('./plugin/with-roto-car');
