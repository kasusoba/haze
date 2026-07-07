import { defineConfig } from "wxt";
import { GOOGLE_SEARCH_MATCHES } from "./lib/defaults";

// See docs/DESIGN.md for the full architecture.
export default defineConfig({
  srcDir: ".",
  // Don't auto-launch a browser on `dev`; load .output/chrome-mv3 manually.
  webExt: { disabled: true },
  manifest: {
    name: "Haze",
    description:
      "Blur, hide, or scratchcard anything on any website. Toggle it all off in one click, reveal on hover.",
    // Google Search is granted at install for the one built-in rule (modest
    // prompt). Everything else is requested per-site at pick time via optional
    // perms.
    permissions: ["storage", "scripting", "activeTab"],
    host_permissions: GOOGLE_SEARCH_MATCHES,
    optional_host_permissions: ["*://*/*"],
    action: {},
  },
});
