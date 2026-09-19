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
    // Both stores only check that an upload belongs to a listing when the
    // manifest names its identity. Without one, a Haze zip was accepted as a
    // new version of TMSync on AMO. The gecko id is the one AMO generated for
    // the Haze listing, and the key is the public key the Chrome Web Store
    // derived djfdaikneamfdgjpdhclphkanmccndep from, so a zip uploaded to any
    // other listing is now rejected.
    // Firefox (AMO) also requires an explicit data-collection declaration.
    // Haze collects nothing, so declare "none".
    ...(browser === "firefox"
      ? {
          browser_specific_settings: {
            gecko: {
              id: "{368c6f74-ca73-440d-b13d-6afc5c4e16a5}",
              data_collection_permissions: { required: ["none"] },
            },
          },
        }
      : {
          key: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAiF179a+f6c47wm1T0nkDl4lJ8DA/ZJTT9d/xZf5MImhNvEcdk66x9r1gPw7nmf45JERIADhzo2SD/44oQfZhi+tfsLrHJDNCzde8df7UlERJO4SLlwbRJuL3XjuSFqWTUijojDIUdF9bXOaMbQ0eyNHJwTBSholYKKft+iMQmwTeVIzkyLVNADaeWDrdvxt3vm0IY1czx3exu2OROaRMUYRuBZU2guhULgO4QrLr4u/FYvqv65SZkjovFh3/sqV1+lfkytQ3WFGNE5KWu+kyoYyj0jpKcApYHswRp9HhlotMIGZw/ZaZS2PLjmEFtO2e2+Gb2RKssFI5k2ZZZiTg4QIDAQAB",
        }),
  }),
});
