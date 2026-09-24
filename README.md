# FC Tactics Lab

Tools that pick the best **FC Mobile Manager Mode** formation, positions and tactics for your squad.

| Folder / file | What it is |
|---|---|
| [`fc-tactics/`](fc-tactics/README.md) | The website: upload squad screenshots, get a formation + full tactics sheet. React + Vite + Motion, deployed on Vercel. Includes the player-database scraper. |
| `fc_strategy.cpp` | The original command-line version in C++ (with beginner "LESSON" comments). Reads `players.txt` and `formations.txt`. |
| `research/mechanics.md` | How training, rank up and out-of-position ratings work in FC Mobile, with sources. |

### C++ version

```
g++ -O2 -std=c++11 -static -o fc_strategy.exe fc_strategy.cpp
./fc_strategy.exe --style attack --top 5
```

Player data comes from [RenderZ](https://renderz.app), created under license from Electronic Arts.
Not affiliated with or endorsed by EA or RenderZ.
