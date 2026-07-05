# CLAUDE.md

## Project
**RepoLore** — a web app: paste a **GitHub URL**, get back an **OKF (Open
Knowledge Format)** bundle plus a **visual knowledge graph** of the codebase.

OKF = a directory of markdown "concept" files with YAML frontmatter, cross-linked
into a graph that agents can traverse and update. One source file = one concept.

Pipeline: `GitHub URL → clone → scan → produce → bundle + graph JSON → UI`

## Commands
```bash
pip install -qU langchain langchain-openai fastapi uvicorn   # deps
export OPENAI_API_KEY=...                                     # required for LLM step

python okf_scanner.py <repo>                 # print concepts + resolved links
python okf_producer.py <repo> <out-bundle>   # generate a bundle from a local folder
uvicorn app:app --reload                     # run the web app
python -m pytest                             # run tests
```

## Architecture
- **Scanner** (`okf_scanner.py`) — deterministic. Walks a repo, one `.py` = one
  concept, resolves internal imports via `ast` into a VALID LINKS list. No LLM.
- **Producer** (`okf_producer.py`) — LLM prose + bundle writing. `draft_concept()`
  is the ONLY function that calls the model; the rest is deterministic + testable.
- **Graph export** (`graph.py`) — reshapes scanner output into `{nodes, edges}`
  JSON. No LLM. Feeds both the API response and the frontend visualization.
- **Consumer** (optional/later) — reads a bundle, follows links, answers questions.
  This is the part that is genuinely an agent (it decides which concepts to visit).
- **Web layer** (`app.py`) — FastAPI. `POST /generate` (url → bundle zip + graph
  JSON); frontend renders the graph and a download link.

## Project layout
- `okf_scanner.py`, `okf_producer.py` — the engine (works on local folders).
- `graph.py` — scanner output → graph JSON.
- `app.py` — FastAPI endpoints + repo fetching.
- `frontend/` — input box, progress, graph view, download button.
- `sample/` — tiny throwaway repo for tests. Not real code.

## Core design rules (do not violate)
- **Structure is deterministic; prose is LLM.** Links come from the scanner's
  VALID LINKS list, derived from real imports. NEVER let the model invent links.
- **Only link to concept files that exist.** Validate targets before writing.
- Every concept file MUST have `type` in frontmatter (OKF's one hard rule).
- Consumer must be permissive: never reject a bundle for missing optional fields,
  unknown `type`, or broken links (per the OKF spec).
- `index.md` and `log.md` are reserved — never a concept, never a link target.
- Keep the LLM call isolated behind one function so the pipeline is testable
  without an API key (tests use stubbed drafts — see `sample/`).

## Web-app rules
- Fetch repos with **shallow clone**: `git clone --depth 1 <url> <tmp>`. Clean up
  the temp dir after processing, always (even on error).
- **Cap the file count** before generating — every file is one LLM call = cost +
  latency. Reject or truncate oversized repos; surface an estimate to the user.
- Generation is slow (one call per file). Prefer a background job with progress
  over a blocking request for anything but tiny repos.
- Fail gracefully on: private repos, invalid URLs, non-Python repos, empty repos.

## Conventions
- Strip stray triple-backtick code fences from model output before writing files.
- `log.md` entries use ISO 8601 UTC timestamps.
- Concept id = file path minus `.py` (e.g. `pkg/routes`); nested ids create
  subdirectories in the bundle.
- Prefer the standard library; justify every new dependency (lean project).

## Gotchas
- Scanner is multi-language via pluggable resolvers: Python uses the stdlib `ast`;
  JavaScript/TypeScript use tree-sitter (relative-import resolution). Add a language
  by adding a resolver (extensions, concept-id, classify, import extraction) to
  `RESOLVERS` in `okf_scanner.py`; the rest of the pipeline is unchanged. Only
  internal (relative/first-party) imports become links — external packages are skipped.
- CLAUDE.md is guidance (~70% adherence), not enforcement. For hard invariants
  (e.g. "never call the LLM in tests"), enforce in code/test structure, not here.