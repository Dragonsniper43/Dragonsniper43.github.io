# Stream Ops Tools — landing page

Single-page static site showcasing two desktop apps: **StreamMod** (Twitch/YouTube/Discord moderation dashboard with VLC control) and **Cuelist** (OBS now-playing, marathon timer, and alerts overlay).

Plain HTML/CSS/vanilla JS, no build step, no framework.

## Local preview

```
python -m http.server 8000
```

then open `http://localhost:8000/`.

## Structure

- `index.html` — single page, all sections
- `css/style.css` — theme, layout, animation
- `js/main.js` — scroll-reveal + sticky nav behavior
- `assets/logos/` — hand-authored SVG marks and lockups
- `assets/screenshots/` — app screenshots (falls back to a placeholder graphic if missing)

## Status

Hosting is not yet decided — this repo has no remote configured. See the project plan for the shortlist of free hosting options under consideration.
