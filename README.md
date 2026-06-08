# Tube Race

A daily fog-of-war navigation game on the London Underground. You are dropped at
a station and have to reach the target, but you can only see where you are and
the stations one hop away. The rest of the map stays dark until you explore it.

Built with a Python data pipeline, a TypeScript + React game, and a Dijkstra
shortest-path engine that scores your route against the optimal one.

## Why this project exists

I wanted a daily puzzle in the spirit of Wordle that runs on a real algorithm
rather than a word list, costs nothing to operate, and is grounded in something
Londoners actually have opinions about. The tube map is a graph, navigating it
under fog of war is genuine pathfinding, and Dijkstra does the real work behind
the scenes.

## How it works

The Underground is modelled as a weighted graph: stations are nodes, adjacent
stops on a line are edges. A line change carries an extra cost, which matches how
people actually judge a good tube route.

The Python pipeline pulls ordered stop sequences for all 11 tube lines from TfL
Open Data and builds a single `graph.json`. The fiddly part is identity: TfL
returns one stop point per platform, so Victoria on the Victoria line and
Victoria on the District line arrive separately and have to be merged into one
station node by their parent Naptan code. Interchanges then fall out for free, as
any station served by more than one line.

The browser loads `graph.json` and runs the whole game client-side. Dijkstra
computes the optimal route between the day's start and target, which is the par
you are scored against. The same date seed picks the same puzzle for everyone, so
it is shareable as a spoiler-free emoji grid.

No backend, no LLM, no per-play cost.

## Repo structure

```
tube-race/
├── pipeline/                  # Python: TfL Open Data -> graph.json
│   └── tube_pipeline/         # tfl_client, build_graph, models, cli
├── web/                       # React 19 + TypeScript + Vite game
│   ├── public/data/           # graph.json (generated, committed)
│   └── src/
│       ├── engine/            # Dijkstra, daily seed, scoring, fog (pure TS)
│       └── components/        # SVG map, HUD, share grid
├── infrastructure/           # Terraform: S3 + CloudFront + OIDC (see docs/deploy.md)
├── docs/deploy.md            # hosting model and deploy runbook
├── SPEC.md                    # build contract: schema + engine API
├── pyproject.toml
└── Makefile
```

## Getting started

Prerequisites: Python 3.11+, Node 20+, [uv](https://docs.astral.sh/uv/).

```bash
# Python pipeline
uv venv
uv pip install -e ".[dev]"
make build-graph            # writes web/public/data/graph.json

# Web game
cd web
npm install
npm run dev                 # http://localhost:5173
```

## Tech

Python 3.11, httpx, pydantic v2. React 19, TypeScript, Vite, Tailwind v4,
Vitest. Dijkstra shortest path. TfL Unified API.

## Hosting

The site is a static SPA served stand-alone at
`https://tube-race.isseikuzuki.co.uk` from its own S3 bucket and CloudFront
distribution, deployed from `main` by GitHub Actions over OIDC. The hosting
model, the one-time manual bootstrap, the repo variables to set, and how to move
the site live in [docs/deploy.md](docs/deploy.md).

## Status

Early build. Navigate mode first (known target, fogged map). Hunt mode (hidden
target, distance clues) to follow.
