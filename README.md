# Clearchart marketing site

Waitlist site for Clearchart (working name), a digital medication chart on a tablet for Australian aged care.

Live at https://clearchart.s82.studio

## Run locally

```bash
npm start
```

Then open http://localhost:4173. No dependencies; needs Node 18+.

## Deploying

Every push to `main` deploys `public/` to GitHub Pages through `.github/workflows/pages.yml`. The custom domain comes from `public/CNAME`.

## The waitlist form

- **On GitHub Pages:** the form's `data-endpoint` is empty, so joining opens a pre-filled email to `enquiries@s82.studio`.
- **Locally:** `server.js` points the form at `/api/waitlist` and saves sign-ups to `data/waitlist.jsonl` (git-ignored).
- **To collect sign-ups directly:** set `data-endpoint` on the form in `public/index.html` to your backend's URL, and add that origin to `connect-src` in the Content-Security-Policy meta tag. Use an Australian-hosted backend to match the privacy copy.

## Files

- `public/index.html`: the landing page
- `public/privacy.html`: draft privacy policy (get it reviewed by an Australian privacy lawyer)
- `public/styles.css`, `public/app.js`: styles, the chart toggle, role tabs and waitlist form
- `server.js`: local server for development and testing the form

## Before a wider launch

- Get the privacy policy reviewed.
- Self-host the fonts so visitors' IP addresses aren't sent to Google.
- Add cookieless analytics if you need conversion numbers.
