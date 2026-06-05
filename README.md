# OpenTrack Map

Tiny for vieing OpenTrack competitions on a map

## Live Site

Use it at <https://nhols.github.io/opentrack-map/>.

## Local Development

```sh
make
```

Then open `http://localhost:4173`.

The app uses OpenTrack's documented competitions API:
`https://data.opentrack.run/api/competitions/`

## GitHub Pages

This app is static. GitHub Pages serves the checked-in `public/` folder via the workflow in `.github/workflows/pages.yml`.

Deployments run on pushes to `main` and publish to <https://nhols.github.io/opentrack-map/>.
