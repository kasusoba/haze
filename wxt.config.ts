import preact from "@preact/preset-vite";
import { defineConfig } from "wxt";
import { GOOGLE_SEARCH_MATCHES } from "./lib/defaults";

// See docs/DESIGN.md for the full architecture.
export default defineConfig({
  srcDir: ".",
  // Don't auto-launch a browser on `dev`; load .output/chrome-mv3 manually.
  webExt: { disabled: true },
  // Preact powers the UI surfaces (popup, options, picker); the engine and
  // lib/* stay vanilla. See docs/DESIGN.md.
  vite: () => ({ plugins: [preact()] }),
  manifest: ({ browser }) => ({
    name: "Haze",
    description:
      "Blur, scratchcard, or hide anything on any website. Peek on hover or click, and toggle it all off in one click.",
    // Google Search is granted at install for the one built-in rule (modest
    // prompt). Everything else is requested per-site at pick time via optional
    // perms.
    permissions: ["storage", "scripting", "activeTab"],
    host_permissions: GOOGLE_SEARCH_MATCHES,
    optional_host_permissions: ["*://*/*"],
    action: {},
    // Firefox (AMO) requires an explicit data-collection declaration. Haze
    // collects nothing, so declare "none". Chrome ignores gecko settings.
    ...(browser === "firefox"
      ? {
          browser_specific_settings: {
            gecko: {
              data_collection_permissions: { required: ["none"] },
            },
          },
        }
      : {}),
  }),
});
