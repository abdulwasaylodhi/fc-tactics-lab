# FC Tactics Lab

Upload FC Mobile screenshots → get the best Manager Mode formation, positions and tactics,
worked out from real card stats (not just OVR).

```
fc-tactics/
  scraper/   Node script that builds the player database from renderz.app
  data/      scraped cache + players.json (not deployed)
  web/       React + Vite site (deploy this folder)
research/    ../research/mechanics.md - how training, rank up and ratings work (with sources)
```

## Update the player database

```
cd scraper
node scrape.mjs            # resumes from cache; Ctrl+C is safe
node scrape.mjs --min 118  # different OVR cut-off
node scrape.mjs --build    # rebuild players.json from cache only
```

Runs entirely on your machine (no AI usage). ~1 request/second, never touches renderz's `/api/`
(disallowed in its robots.txt). To pick up new cards, delete `data/cache/list` and run again -
detail pages already fetched are reused. The build copies the database to `web/public/db.json`.

## Run the site locally

```
cd web
npm install
npm run dev      # http://localhost:5173
npm test         # engine tests (penalty formula vs in-game ratings, assignment, OCR matching)
```

## Deploy to Vercel

Either:
- `npm i -g vercel`, then in `web/` run `vercel` (first time) and `vercel --prod`, or
- push the project to GitHub, import it at vercel.com/new and set **Root Directory = `fc-tactics/web`**.

It's a static site: screenshots are read in the visitor's browser (Tesseract.js), nothing is uploaded.

## How the recommendation works

| Piece | Source | Status |
|---|---|---|
| Card stats, alternate positions, skill trees | renderz.app | scraped |
| Rank Up = +1 OVR per rank, 1 skill point per rank | renderz upgrade code + EA | verified |
| Out-of-position OVR = floor(base × multiplier) + rank | fitted to 27 in-game ratings | verified (`npm test`) |
| Skill points spent on the skills that suit the position | card skill tree | modelled |
| Training stat boost per level | only in renderz's disallowed API | **estimate** (+1/level on 8 key stats) - drop real numbers into `setTrainingTable` |
| Position fit from stats | EA FC 24 position weights | relative score |

Final slot score = 50% in-game rating + 50% stat fit. Formations are solved exactly with the
Hungarian algorithm; tactics are derived from the starting XI's stats (pace, passing, crossing,
aerial, long shots, tackling, stamina, work rates).
