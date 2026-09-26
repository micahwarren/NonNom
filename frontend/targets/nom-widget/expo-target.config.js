/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
// iOS WidgetKit extension for Nom. Reads only the App Group snapshot written by src/widget-sync.tsx (image + numbers);
// no API keys or auth tokens are ever placed in the extension.
module.exports = config => ({
  type: "widget",
  name: "NomWidget",
  displayName: "Nom",
  deploymentTarget: "17.0",
  colors: { $accent: "#FF7369", $widgetBackground: "#FFF9F5" },
  entitlements: { "com.apple.security.application-groups": config.ios.entitlements["com.apple.security.application-groups"] },
});
