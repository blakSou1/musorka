<div align="center">

# musorka — Default Project Dump

**🌐 Live menu: [blaksou1.github.io/musorka](https://blaksou1.github.io/musorka/)**

![HTML5](https://img.shields.io/badge/HTML5-E34F26?logo=html5&logoColor=white&style=flat-square)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?logo=javascript&logoColor=black&style=flat-square)
![Three.js](https://img.shields.io/badge/Three.js-000000?logo=threedotjs&logoColor=white&style=flat-square)
![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-222222?logo=githubpages&logoColor=white&style=flat-square)

A dumping ground for experiments: standalone pages, analyses, prototypes and game-design documents.
No build step — plain HTML/JS published directly via GitHub Pages. `index.html` is the menu that links everything.

</div>

---

## Contents

> Pages are in Russian.

### Experiments & tools

| Page | What it is |
|------|------------|
| [`grass-tsushima/`](https://blaksou1.github.io/musorka/grass-tsushima/) | Ghost of Tsushima-style procedural grass on Three.js (own folder, own README) |
| [`github-stats/`](https://blaksou1.github.io/musorka/github-stats/) | GitHub profile statistics dashboard |
| [`nat-punch-test/public/`](https://blaksou1.github.io/musorka/nat-punch-test/public/) | WebRTC NAT punch-through connectivity test |
| [`optimization-demo.html`](https://blaksou1.github.io/musorka/optimization-demo.html) | Rendering/performance optimization demo |
| [`gacha.html`](https://blaksou1.github.io/musorka/gacha.html) | Gacha simulator |

### Dota 2

| Page | What it is |
|------|------------|
| [`dota2-stats.html`](https://blaksou1.github.io/musorka/dota2-stats.html) | Match statistics breakdown |
| [`dota2-convars.html`](https://blaksou1.github.io/musorka/dota2-convars.html) | All Dota 2 console variables (`dota2_variables.txt`) |
| [`dota2-data.html`](https://blaksou1.github.io/musorka/dota2-data.html) | Heroes, abilities, entities (`dota2data.js`) |

### Game design & analysis

| Page | What it is |
|------|------------|
| [`the-last-knot.html`](https://blaksou1.github.io/musorka/the-last-knot.html) | Full GDD v1.0 for «The Last Knot» |
| [`tlk-pitch.html`](https://blaksou1.github.io/musorka/tlk-pitch.html) | Pitch deck for «The Last Knot» |
| [`gdd-analysis.html`](https://blaksou1.github.io/musorka/gdd-analysis.html) | Analysis of itch.io GDDs + 5 own GDDs (see `gdd-0*.md`) |
| [`gamejam-ideas.html`](https://blaksou1.github.io/musorka/gamejam-ideas.html) | 12 game jam ideas with team decisions |
| [`venom-design.html`](https://blaksou1.github.io/musorka/venom-design.html) | «Venom» design document |
| [`failed-games/`](https://blaksou1.github.io/musorka/failed-games/) | Registry of failed gamedev projects |
| [`failed-games-repo/`](https://blaksou1.github.io/musorka/failed-games-repo/) | Same registry, repo view |
| [`dialogue_analysis.html`](https://blaksou1.github.io/musorka/dialogue_analysis.html) | Dialogue system analysis |
| [`youtube-analysis.html`](https://blaksou1.github.io/musorka/youtube-analysis.html) | YouTube: RotoMatic vs Mathrock Interactive |

### Deep dives

| Page | What it is |
|------|------------|
| [`afro-samurai.html`](https://blaksou1.github.io/musorka/afro-samurai.html) | Afro Samurai — full breakdown |
| [`gacha-psychology.html`](https://blaksou1.github.io/musorka/gacha-psychology.html) | Why gacha drops don't drop: psychology of pull mechanics |

## Structure

```
musorka/
├── index.html              # menu — entry point, links every page
├── *.html                  # standalone pages (self-contained, no bundler)
├── gdd-0*.md               # Game Design Documents (markdown sources)
├── dota2_variables.txt     # raw Dota 2 console variables dump
├── dota2data.js            # Dota 2 heroes/abilities/entities data
├── grass-tsushima/         # standalone Three.js grass demo (own README)
├── github-stats/           # GitHub stats dashboard
├── nat-punch-test/         # WebRTC NAT punch-through test
├── failed-games/           # failed-projects registry
└── failed-games-repo/
```

## Run locally

Pages use `fetch` and ES modules, so they need http instead of `file://`:

```bash
python -m http.server 8000
# open http://localhost:8000/musorka/
```

## Deploying

Already live at **https://blaksou1.github.io/musorka/** (GitHub Pages, `main` / `/root`, `.nojekyll` disables Jekyll so raw `.md` and dotfiles are served as-is).

Add a new page → drop an `.html` file into the repo, add a link to `index.html`, push.

