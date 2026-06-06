# Chicken Expo — Frontend

Multipage RTL (Arabic) website for the **Algerian National Fancy Chicken Exhibition 2026**,
organized by the Algerian Brahma Club (ABC).
Backend API lives in a separate repo: https://github.com/anes255/chicken

## Pages
- `index.html` — home (hero, live stats, breeds, objectives)
- `about.html` — club & exhibition objectives
- `rules.html` — competition participation rules
- `register.html` / `login.html` — account by phone number
- `dashboard.html` — "مشاركتي": birds, cages, wilaya & baladya (58-wilaya dropdowns)
- `admin.html` — admin dashboard (stats, participants table, status control, delete)

## Configure the API URL
Edit `js/config.js` and set `window.API_BASE` to your deployed backend URL, e.g.
```js
window.API_BASE = 'https://your-backend.onrender.com';
```
For local development against a backend on port 4000 the default works as-is.

## Logos
`assets/expo-logo.png` (exhibition) and `assets/abc-logo.png` (Algerian Brahma Club)
are included. Optionally add `assets/hero.jpg` for the hero background.

## Serve
Any static host works (Netlify, Vercel, GitHub Pages) or locally:
```bash
npx serve .
```
