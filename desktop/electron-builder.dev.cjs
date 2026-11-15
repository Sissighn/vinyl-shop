module.exports = {
  appId: "com.vinylroom.localdev",
  productName: "Vinyl Room",
  directories: {
    app: ".desktop/dev-launcher",
    output: ".desktop/dev-release",
    buildResources: "desktop/assets",
  },
  files: ["main.cjs", "package.json", "!node_modules/**"],
  extraResources: [{ from: ".desktop/dev-launcher/project-root.txt", to: "project-root.txt" }],
  mac: {
    icon: "desktop/assets/icon.icns",
    identity: null,
    category: "public.app-category.music",
  },
};
