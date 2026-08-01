# Global Communication — 3D Globe Team Dashboard

A team-presence prototype: a draggable, auto-rotating 3D globe (d3-geo orthographic
projection on Canvas 2D) showing 100 cities with live-looking "active / inactive"
status per timezone, hover cards with team member info, a day/night gradient
terminator, and a connected "Work Chat" screen.

No bundler/dev-server framework (no Vite/webpack) — just React + esbuild, kept
deliberately minimal so `npm install` stays fast and dependency-light.

## Structure

- `src/App.tsx` — everything: globe rendering, markers, hover cards, header,
  sidebars, and the Work Chat screen. (Single file by design — see comments
  inside for section markers.)
- `src/main.tsx` — React entry point, mounts `<App />` into `#root`.
- `build.mjs` — esbuild script that bundles `src/main.tsx` → `dist/bundle.js`.
- `dist/index.html` — static HTML shell (loads Tailwind via CDN + `bundle.js`).
  Tracked in git since it's hand-written, not generated.

## Setup

```bash
npm install
npm run build      # builds dist/bundle.js
npm run serve       # serves dist/ at http://localhost:8934
```

Then open http://localhost:8934.

For active development, re-run `npm run build` after each change (or wire up
`esbuild`'s `--watch` mode in `build.mjs` if you want auto-rebuild).

## Deploying

Any static host works since `dist/` is plain HTML/JS. This project has been
deployed to surge.sh via:

```bash
cd dist && npx surge . your-domain.surge.sh
```

## Notes for whoever picks this up next

- Tailwind is loaded via the CDN `<script>` tag in `dist/index.html` (JIT,
  no build step) — fine for a prototype, but swap for a real Tailwind build
  if this becomes a production app.
- All city/team data in `App.tsx` (`CITY_SEED`, `MARKERS`, etc.) is
  synthetic/generated with a seeded PRNG for demo purposes — not real data.
- The `Work Chat` screen's content (channels, messages, decisions/actions) is
  static/hardcoded, not wired to a backend.
