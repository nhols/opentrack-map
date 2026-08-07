# OpenTrack Map

Tiny webapp for viewing OpenTrack competitions on a map

## Live Site

Use it at <https://nhols.github.io/opentrack-map/>.

## Local Development

Create a local secrets file and add the read-only OpenTrack API token:

```sh
cp .dev.vars.example .dev.vars
```

```sh
make
```

Then open `http://localhost:4173`.

The local server proxies OpenTrack's documented competitions API through
`/api/competitions` using the token in `.dev.vars`.

## Deployment

The static app remains on GitHub Pages. A standalone Cloudflare Worker adds the
server-side OpenTrack token, restricts queries to Great Britain, caches
successful responses for five minutes, and permits browser requests only from
`https://nhols.github.io`.

Deploy the Worker and add its encrypted OpenTrack token:

```sh
npm run deploy:worker
npx wrangler secret put OPENTRACK_API_TOKEN
```

Copy the deployed Worker URL, append `/api/competitions`, and save it as the
GitHub Actions repository variable `OPENTRACK_API_ROOT`. For example:

```text
https://opentrack-map-api.<your-workers-subdomain>.workers.dev/api/competitions
```

Pushes to `main` test the app, insert that public Worker endpoint into
`public/config.js`, and deploy `public/` to the existing GitHub Pages URL. The
OpenTrack token is never included in the static site or GitHub configuration.
