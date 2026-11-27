# St. Mary's U P School, Thevara: interactive invitation

An envelope you open, built with WebGL (Three.js) and GSAP, for the 146th Annual Day & farewell meeting (16 January 2027).

## Edit the text
All wording (Malayalam + English), the programme and the names live in `src/content.js`.

## Run locally
```bash
npm install
npm run dev        # http://localhost:5180
```
Language: the site opens in English by default. Add `?lang=ml` to open in Malayalam (e.g. `…/stmarys-invitation/?lang=ml`), or `?lang=en` for English. Add `?nogl` to see the non-WebGL fallback.

## Publish (GitHub Pages)
1. Push this folder to a GitHub repository (branch `main`).
2. In the repo: **Settings → Pages → Source: GitHub Actions**.
3. Every push to `main` builds and deploys automatically. The link is `https://<user>.github.io/<repo>/`.
