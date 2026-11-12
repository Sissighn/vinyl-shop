const base = require("../package.json").build;
const mac = { ...base.mac };
delete mac.identity;

module.exports = {
  ...base,
  forceCodeSigning: true,
  mac: {
    ...mac,
    hardenedRuntime: true,
    entitlements: "desktop/entitlements.mac.plist",
    entitlementsInherit: "desktop/entitlements.mac.plist",
    notarize: true,
  },
};
