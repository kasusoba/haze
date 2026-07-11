# Haze

[![Chrome](https://img.shields.io/chrome-web-store/users/djfdaikneamfdgjpdhclphkanmccndep.svg?style=flat-square&label=Chrome&logo=google%20chrome&logoColor=white)](https://chrome.google.com/webstore/detail/djfdaikneamfdgjpdhclphkanmccndep)

**Blur, scratchcard, or hide anything on any website.** Point at an element,
pick it, and Haze conceals it - blur or scratchcard it and peek on hover/click,
or hide it outright - then toggle everything back on in one click.

Haze ships with one built-in rule (it blurs Google Search's review ratings) and
is the successor to *Hide Ratings*, but the engine is general: spoilers, prices,
social counts, sensitive data while screen-sharing - anything you don't want to
see until you choose to.

## Features

- **Element picker** - point, adjust granularity (up/down the DOM tree), create a rule.
- **Three effects** - blur, scratchcard (blur + an opaque cover), or hide; adjustable blur radius.
- **Reveal on demand** - hover or click to peek; the global switch hides/shows all.
- **Edit anywhere** - tweak or toggle any rule right in the toolbar popup, or manage them per-site and globally in the options page.
- **Built-in Google Search rule** - blurs review ratings out of the box; toggle or delete it like any rule.
- **Export / import** your rules as JSON.

## Permissions

Haze uses **optional host permissions**: it asks for access to a site only when
you first pick an element there. Google Search is granted at install for the one
built-in rule.

## Development

Built with [WXT](https://wxt.dev) + TypeScript + [Preact](https://preactjs.com)
+ Biome. The popup and options page are Preact and share a `RuleCard` /
`RuleEditor` component set (`components/`); the concealment engine and `lib/*`
are plain TypeScript.

```bash
pnpm install
pnpm dev          # build + watch (does not auto-launch a browser)
pnpm dev:firefox  # Firefox
pnpm build        # production build -> .output/chrome-mv3
pnpm zip          # packaged zip for the store
pnpm compile      # tsc --noEmit
pnpm lint         # biome
```

`pnpm dev` watches and rebuilds with HMR but won't open a browser. Load
`.output/chrome-mv3` as an unpacked extension once, and it hot-reloads on changes.

## Architecture

See [docs/DESIGN.md](docs/DESIGN.md) for the full design - the containment engine
(outermost-wins dedupe), the hybrid CSS-inject + MutationObserver approach, the
selector stability ranking, and the permission model.

The original per-site stylesheets live in the git history (pre-2.0 commits).

> Forked from [ganigeorgiev/hide-ratings-extension](https://github.com/ganigeorgiev/hide-ratings-extension); generalized into Haze.
