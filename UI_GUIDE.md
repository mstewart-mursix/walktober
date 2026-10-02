# Walktober UI Update Guide

This guide explains where to make visual changes to the Walktober website, how to preview them, and how to publish them. The site is a small static frontend served by a Cloudflare Worker.

## The main files

| File | Use it for |
| --- | --- |
| `public/index.html` | Page sections, headings, labels, buttons, form markup, and accessible names. |
| `public/styles.css` | Colors, typography, spacing, layout, responsive behavior, and animation. |
| `public/app.js` | Browser behavior: loading the leaderboard, sorting and searching walkers, opening the sign-in dialog, and saving step entries. |
| `public/scene.js` | Visual motion only: the parallax scenes, falling leaves, fireflies, and scroll-in reveals. It never touches data. |
| `public/assets/*.svg` | The scenery layers (dawn ridges, aspen grove, night camp, stars, clouds). They are generated; do not edit them by hand. |
| `tools/generate-assets.mjs` | The script that draws the scenery. Change it and run `node tools/generate-assets.mjs` to rebuild `public/assets/`. |
| `src/index.js` | Server API and account/step handling. Leave this alone for visual-only changes. |
| `migrations/0001_initial.sql` | Database schema, roster, and initial team assignments. A visual change normally does not need a database migration. |

The browser loads `public/styles.css`, `public/app.js`, and `public/scene.js` from the `<head>` of `public/index.html`. The display, body, and label fonts (Fraunces, DM Sans, DM Mono) load from Google Fonts in the same place; the page falls back to system fonts if they are unavailable.

## Make a visual change

1. Edit `public/index.html` to change page copy or markup. The main sections are the dawn hero, challenge summary, team standings (the ridge-trail “climb” panel, team list, and step-entry card), the aspen-grove total, individual leaderboard, the night-camp “How it works” section, and footer.
2. Edit `public/styles.css` to change the appearance. Shared colors, fonts, and corner radius are defined near the top in `:root`. The mobile layouts are in the `@media` sections near the bottom.
3. Edit `public/app.js` only when a change needs new browser behavior. The app updates leaderboard content in JavaScript, so edit its rendering functions when changing the structure of dynamic lists or rows.
4. Keep IDs used by JavaScript in place. For example, `step-form`, `step-date`, `step-count`, `team-list`, `walker-search`, `leaderboard-body`, `climb-trail`, `climb-markers`, and `grove-total` connect the HTML to `public/app.js`. If an ID or form field changes, update its JavaScript selector or event handler too.
5. Preserve labels and status text for screen readers. For buttons and inputs, keep a visible label or an accessible name; use `:focus-visible` styles so keyboard users can see where they are.

### Parallax scenes

Each scene is a container with `data-scene` (`top` for the hero, `center` for the grove, `bottom` for the night camp). Inside it, any element can carry:

- `data-parallax` — how far it travels vertically against the scroll. In the hero, larger values sit further away.
- `data-parallax-x` — sideways travel as the scene scrolls past (the grove's “walking past the trunks” effect).
- `data-drift` — how many pixels it leans away from the mouse pointer.

To change the depth of a layer, edit those numbers in `public/index.html`; no JavaScript change is needed. Scene colors live in two places: the sky and glow gradients in `public/styles.css`, and the ridge, tree, and trunk colors in `tools/generate-assets.mjs`. Team colors are the `.team-1` to `.team-4` rules near the top of `public/styles.css`. All motion switches off for visitors who ask their device to reduce motion.

For copy-only changes, there is usually no reason to edit CSS or JavaScript. For a layout change, start with the smallest relevant CSS rule and check both desktop and narrow phone widths.

## Preview on your computer

You need Node.js and npm. From the repository folder, install the packages once and create local development secrets:

```powershell
npm install
Copy-Item .dev.vars.example .dev.vars
```

Open `.dev.vars` and replace the example values with local-only values. Do not use or share the production secrets. `.dev.vars` is ignored by Git and should never be committed.

Create the local database and start the preview:

```powershell
npm run db:local
npm run dev
```

Open the local URL Wrangler prints; it is usually `http://localhost:8787`. Changes to the files under `public/` should appear as the local preview reloads. Stop the preview with **Ctrl+C** in the terminal.

## Publish the change

Push or commit the finished change to the repository’s `main` branch. The GitHub Actions workflow in `.github/workflows/deploy.yml` then deploys the site to Cloudflare when its deployment credentials are configured. Check the repository’s **Actions** page for a successful deployment before expecting the public site to show the update. A browser refresh may be needed afterward.

Do not put `CLAIM_CODE`, `SESSION_SECRET`, Cloudflare API tokens, or other private values in website files. The public UI files are delivered to every visitor.

## When the change is more than visual

- **Change what a button does or how data is saved:** inspect `public/app.js` and, if the server API must change, `src/index.js`.
- **Change the roster, team assignments, or challenge dates:** the database setup lives in `migrations/0001_initial.sql`; challenge date validation also lives in `src/index.js`. Coordinate data changes carefully because applying a remote migration changes the live database.
- **Change the page icon:** edit `public/favicon.svg`.

For Cloudflare setup, local development details, and deployment requirements, see [README.md](README.md).
