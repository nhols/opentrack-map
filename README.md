# OpenTrack Map

Tiny local webapp for loading OpenTrack competitions and plotting the records that include latitude and longitude.

```sh
make
```

Then open `http://localhost:4173`.

The app uses OpenTrack's documented competitions API:
`https://data.opentrack.run/api/competitions/`

## GitHub Pages

This app is static: GitHub Pages can serve the `public/` folder directly.

In GitHub:

1. Open the repository settings.
2. Go to Pages.
3. Set the source to deploy from GitHub Actions.
4. Use an action that uploads `public/` as the Pages artifact.
