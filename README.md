# المعرض الوطني لدجاج الزينة — Frontend (Brahma Club Algeria)

Static, multi-page frontend for the National Ornamental Chicken Exhibition.
Green & beige theme, RTL Arabic, animated.

## Pages
- `index.html` — home (hero, about, the 9 goals, CTA)
- `conditions.html` — participation conditions (شروط المشاركة)
- `register.html` — participant registration (name, phone, password, wilaya, baladya, birds, cages…)
- `login.html` — login (participant or admin)
- `dashboard.html` — participant profile (view & edit)
- `admin.html` — admin dashboard (statistics + participant management)

## Admin access
Phone: `0779452212` · Password: `admin123`

## Configuration
Edit [`assets/js/config.js`](assets/js/config.js) and set `API_BASE` to your deployed
backend URL (the `chicken` repo). Local dev auto-targets `http://localhost:4000`.

## Run locally
Any static server works, e.g.:
```bash
npx serve .      # or: python -m http.server 5500
```
The backend (`chicken` repo) must be running for login/registration to work.

## Deploy
Push to any static host (Netlify, Vercel, GitHub Pages). No build step.
