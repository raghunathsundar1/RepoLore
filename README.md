# RepoLore

**Turn any codebase into a knowledge graph.**

Paste a public GitHub URL and RepoLore reads every source file, writes one
cross-linked **OKF (Open Knowledge Format)** concept per file, and renders an
interactive knowledge graph of how the code connects. Then you can **ask questions**
about the codebase — and watch an agent *walk the graph* to answer them.

```
GitHub URL → clone → scan → produce → bundle + graph JSON → UI → ask
```

## Why it's different

Most "chat with your repo" tools do flat top-k vector retrieval. RepoLore's chat is
a **graph-traversal agent**: it picks the most relevant concept(s), then follows the
real import links between files to assemble a *connected* context set — and the graph
**lights up the exact path it walked**. No vector store; the traversal *is* the
retrieval. That visible path is the whole point.

## Features

- **Deterministic structure, LLM prose.** Links come from real imports — the model
  never invents edges.
- **Multi-language scanning.** Python (stdlib `ast`) and JavaScript/TypeScript
  (tree-sitter) today, via pluggable per-language resolvers; adding a language is a
  self-contained resolver. Only internal imports become links; external packages are skipped.
- **OKF bundle.** Targets the [Open Knowledge Format v0.1](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf)
  (Google Cloud): one markdown concept per file, required `type` frontmatter plus the
  recommended `title`/`description`/`resource`/`tags`/`timestamp`, and inter-concept
  links as **standard markdown links in the body** (`[x](/x.md)`). Reserved `index.md`
  and `log.md`. Downloadable as a zip and portable to any OKF-compliant consumer.
- **Interactive graph.** Force-directed, degree-sized nodes, hover labels,
  click-to-open concept, zoom/pan.
- **Traversal chat.** A LangGraph agent (`entry → plan → traverse → answer`) that
  cites the concepts it used and highlights the visited path in the graph.
- **Production-minded web app.** Background jobs with live progress, per-IP rate
  limits, graceful failure on private/invalid/empty/non-Python repos.

## Quickstart

Requirements: **Python 3.10+**, **git**, and an **OpenAI API key**.

```bash
pip install -r requirements.txt

# key is read from a .env file (never commit it) or the environment
echo "OPENAI_API_KEY=sk-..." > .env

python -m uvicorn app:app --reload
```

Open **http://127.0.0.1:8000**, paste a repo, and hit **Generate**. Each source file
is one LLM call, so start small. When the graph is ready, use the chat dock (bottom
right) to ask questions.

### CLI (no web server)

```bash
python okf_scanner.py <repo>                # print concepts + resolved links
python okf_producer.py <repo> <out-bundle>  # generate a bundle from a local folder
python graph.py <repo>                       # print {nodes, edges} graph JSON
```

## API

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/generate` | `{ url }` → clones, scans, produces a bundle. Returns a graph (tiny repos) or a job to poll. |
| `GET` | `/jobs/{id}` | Job status + progress. |
| `GET` | `/jobs/{id}/graph` | `{ nodes, edges }` for the graph view. |
| `GET` | `/jobs/{id}/concept?id=<cid>` | A single concept's generated markdown. |
| `GET` | `/jobs/{id}/download` | The OKF bundle as a zip. |
| `POST` | `/ask` | `{ question, bundle_id }` → `{ answer, visited_concept_ids, cited_concept_ids }`. |

## Use it as an MCP server

RepoLore ships an [MCP](https://modelcontextprotocol.io) server so **Claude Code or
any agent can traverse a codebase's OKF bundle directly** — walking the real link
graph, no vector store, no API key on the server side. This is the OKF thesis made
usable: the connected agent does the reasoning, RepoLore serves the graph.

First get a bundle (download one from the web app and unzip it, or `python
okf_producer.py <repo> ./bundle`), then point the server at it:

```bash
claude mcp add repolore -e REPOLORE_BUNDLE=/abs/path/to/bundle -- python /abs/path/to/mcp_server.py
```

Tools exposed (all deterministic, no LLM):

| Tool | What it does |
|---|---|
| `list_concepts(contains, type)` | List concepts (one per file), optionally filtered. |
| `read_concept(id)` | Full markdown for one concept. |
| `concept_links(id)` | Direct neighbors: what it links to / what links to it. |
| `traverse(start, hops)` | The connected concept set within N hops — OKF's connected-context retrieval. |
| `find_path(source, target)` | Shortest link-path between two concepts. |

## Architecture

| File | Role | LLM? |
|---|---|---|
| `okf_scanner.py` | Walk repo, resolve imports → VALID LINKS (Python + JS/TS) | No |
| `okf_producer.py` | Draft concept prose + write the OKF bundle | Yes (one isolated call) |
| `graph.py` | Scanner output → `{ nodes, edges }` JSON | No |
| `okf_bundle.py` | Read an OKF bundle dir → graph + traversal/path queries | No |
| `okf_consumer.py` | LangGraph agent: traverse links to answer questions | Yes (two isolated calls) |
| `mcp_server.py` | MCP server exposing the bundle's graph to any agent | No |
| `app.py` | FastAPI endpoints, SQLite job store, rate limits | No |
| `design/` | Dark, Linear-style UI (see below) | — |
| `sample/` | Tiny throwaway repo used by the tests | — |

Every model call is isolated behind a single function so the pipeline is testable
without an API key (tests stub the drafts and the agent's plan/answer steps).

### Frontend (`design/`)

No runtime CDNs: **React is self-hosted** in `design/vendor/` and **Tailwind is
prebuilt** to `design/styles.css`. The UI source is `design/app.jsx`, compiled to
`design/app.js` (classic React runtime) — **edit the `.jsx`, never the `.js`.**

```bash
# after changing UI markup/classes:
npx -y tailwindcss@3.4.17 -c design/tailwind.config.js -i design/tailwind.input.css -o design/styles.css --minify
```

## Tests

```bash
python -m pytest        # 27 tests, no API key required (LLM calls are stubbed)
```

The suite covers scanner link-resolution, bundle writing, graph shaping, the FastAPI
layer, and the consumer agent — including a test that a question requiring a link
between two concepts causes the agent to traverse that link.

## License

Not yet specified.
