# Mursix Walktober

A mobile-friendly step challenge for the 47 Mursix walkers. Participants claim their name from the roster, add or edit one step total per day, and see individual and team standings update across the site.

## What is included

- October 1–31, 2026 challenge with the four supplied teams and all 47 participants preloaded.
- Public team totals and individual leaderboard, refreshed every 30 seconds.
- Search across the full roster.
- Name claim protected by an organizer-shared code, then a personal passphrase.
- Private sign-in sessions, hashed passphrases, and a basic failed-attempt limit.
- Daily step entries from 0 to 100,000; a person can update an entry for a date.
- Cloudflare Worker API, static website, D1 database migration, and GitHub Actions deploy workflow.

Daily entries are private to the participant. The site makes team and individual totals public.

## Local preview

You will need Node.js and npm. From the project folder:

```sh
npm install
Copy-Item .dev.vars.example .dev.vars
```

Edit `.dev.vars` and set a private local `CLAIM_CODE` plus a random `SESSION_SECRET` of at least 32 characters. Then create the local database and start the site:

```sh
npm run db:local
npm run dev
```

Wrangler prints a local preview URL, usually `http://localhost:8787`.

## First Cloudflare deployment

Create a Cloudflare account and sign in with Wrangler:

```sh
npx wrangler login
npx wrangler d1 create walktober
```

Copy the database ID returned by Wrangler into `wrangler.jsonc`, replacing the all-zero `database_id`. The D1 database name must remain `walktober`. Apply the roster and schema to the remote database:

```sh
npm run db:remote
```

Deploy once to create the Worker service:

```sh
npm run deploy
```

Set the two private Worker secrets. For `CLAIM_CODE`, choose a private code and give it directly to Walktober participants. For `SESSION_SECRET`, generate a new random value; for example, run `node -p "require('node:crypto').randomBytes(32).toString('hex')"`, then paste that value when Wrangler prompts for it.

```sh
npx wrangler secret put CLAIM_CODE
npx wrangler secret put SESSION_SECRET
```

The site will be available at the `workers.dev` URL Wrangler reports. The API needs the D1 database and both secrets; name claiming and sign-in return a setup message until the secrets are configured.

## Deploy on pushes to `main`

The included GitHub Actions workflow deploys each push to `main` after Cloudflare is configured. Before that, it safely skips deployment instead of attempting to publish with missing credentials. You can also start a deployment from the Actions tab with **Run workflow** after the setup is complete. Add these Actions secrets in the GitHub repository settings:

- `CLOUDFLARE_API_TOKEN` — a Cloudflare API token limited to this account, with Workers edit and D1 read access.
- `CLOUDFLARE_ACCOUNT_ID` — that Cloudflare account's ID.

Keep the challenge code and session secret in Cloudflare Worker secrets; they do not belong in GitHub or this repository. Once the workflow is configured, pushes to `main` publish the current project automatically.

## Challenge setup notes

- Claiming a name is first-come, first-served. Use a private, hard-to-guess organizer code and share it directly with participants so nobody else can reserve a teammate's roster name.
- If a participant needs a claim reset, remove their row from `credentials` in the D1 database. Their step history stays intact. For a full account reset, also delete that participant's `daily_steps` rows.
- The October dates and roster are defined in `migrations/0001_initial.sql` and the challenge window is defined in `src/index.js`.
