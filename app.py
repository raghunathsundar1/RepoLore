"""FastAPI web layer: GitHub URL -> shallow clone -> scan -> produce -> bundle zip + graph JSON.

See CLAUDE.md web-app rules: shallow clone with cleanup, cap file count, background
job with progress for anything but tiny repos, fail gracefully on bad repos.
"""
import json
import logging
import os
import re
import shutil
import sqlite3
import subprocess
import tempfile
import time
import uuid
import zipfile
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import BackgroundTasks, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict

from graph import build_graph
from llm import DEFAULT_MODEL, DEFAULT_PROVIDER, PROVIDERS, make_chat_model, validate_model_config
from okf_producer import build_bundle, draft_concept, make_draft_fn
from okf_scanner import Concept, scan_repo

logger = logging.getLogger("repolore")

GITHUB_URL_RE = re.compile(r"^https://github\.com/[\w.-]+/[\w.-]+?(\.git)?/?$")

# Operational limits — overridable via environment for deployment tuning.
MAX_FILES = int(os.environ.get("REPOLORE_MAX_FILES", "200"))
TINY_THRESHOLD = int(os.environ.get("REPOLORE_TINY_THRESHOLD", "5"))
CLONE_TIMEOUT_SECONDS = int(os.environ.get("REPOLORE_CLONE_TIMEOUT", "60"))
MAX_QUESTION_CHARS = int(os.environ.get("REPOLORE_MAX_QUESTION_CHARS", "2000"))
JOB_RETENTION_DAYS = int(os.environ.get("REPOLORE_JOB_RETENTION_DAYS", "7"))

# Free tier (runs on the SERVER's key): every user gets this much, tracked per IP in
# SQLite. Beyond it they must bring their own API key (BYOK) — see /models and the
# `llm` field on /generate and /ask. BYOK keys are used per-request and NEVER stored.
FREE_GENERATIONS = int(os.environ.get("REPOLORE_FREE_GENERATIONS", "1"))
FREE_ASKS = int(os.environ.get("REPOLORE_FREE_ASKS", "5"))

# Simple in-process per-IP rate limits — each request drives LLM calls, so this
# protects against an endpoint being hammered. /generate is stricter (a full
# clone + one call per file); /ask is lighter (two calls per question).
# NOTE: in-process state (with SQLite + BackgroundTasks) means: run ONE worker.
RATE_LIMIT = int(os.environ.get("REPOLORE_RATE_LIMIT", "5"))          # /generate
ASK_RATE_LIMIT = int(os.environ.get("REPOLORE_ASK_RATE_LIMIT", "30"))  # /ask
RATE_WINDOW = 60        # per this many seconds
_rate_hits = defaultdict(lambda: defaultdict(deque))  # bucket -> ip -> timestamps


def _check_rate_limit(request: Request, bucket: str = "generate", limit: Optional[int] = None) -> None:
    limit = RATE_LIMIT if limit is None else limit
    ip = request.client.host if request.client else "unknown"
    now = time.time()
    hits = _rate_hits[bucket][ip]
    while hits and now - hits[0] > RATE_WINDOW:
        hits.popleft()
    if len(hits) >= limit:
        raise HTTPException(
            status_code=429,
            detail="Too many requests. Please wait a minute and try again.",
        )
    hits.append(now)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
JOBS_DIR = os.path.join(DATA_DIR, "jobs")
DB_PATH = os.path.join(DATA_DIR, "jobs.db")

os.makedirs(JOBS_DIR, exist_ok=True)


def _db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _init_db() -> None:
    with _db() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS jobs (
                id TEXT PRIMARY KEY,
                status TEXT NOT NULL,
                progress INTEGER NOT NULL DEFAULT 0,
                total INTEGER NOT NULL DEFAULT 0,
                error TEXT,
                zip_path TEXT,
                graph_json TEXT,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS usage (
                ip TEXT PRIMARY KEY,
                generations_used INTEGER NOT NULL DEFAULT 0,
                asks_used INTEGER NOT NULL DEFAULT 0,
                first_seen TEXT NOT NULL
            )
            """
        )


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _usage_row(ip: str) -> dict:
    with _db() as conn:
        row = conn.execute("SELECT * FROM usage WHERE ip = ?", (ip,)).fetchone()
    if row is None:
        return {"generations_used": 0, "asks_used": 0}
    return {"generations_used": row["generations_used"], "asks_used": row["asks_used"]}


def _bump_usage(ip: str, column: str) -> None:
    assert column in ("generations_used", "asks_used")
    now = datetime.now(timezone.utc).isoformat()
    with _db() as conn:
        conn.execute(
            "INSERT INTO usage (ip, first_seen) VALUES (?, ?) ON CONFLICT(ip) DO NOTHING",
            (ip, now),
        )
        conn.execute(f"UPDATE usage SET {column} = {column} + 1 WHERE ip = ?", (ip,))


_init_db()


def _cleanup_old_jobs(retention_days: int = JOB_RETENTION_DAYS) -> int:
    """Delete job rows and their on-disk bundles older than the retention window.
    Keeps data/ from growing without bound. Returns how many jobs were removed."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=retention_days)).isoformat()
    with _db() as conn:
        rows = conn.execute("SELECT id FROM jobs WHERE created_at < ?", (cutoff,)).fetchall()
        old_ids = [row["id"] for row in rows]
        if old_ids:
            conn.executemany("DELETE FROM jobs WHERE id = ?", [(i,) for i in old_ids])
    for job_id in old_ids:
        shutil.rmtree(os.path.join(JOBS_DIR, job_id), ignore_errors=True)
    if old_ids:
        logger.info("cleaned up %d job(s) older than %d day(s)", len(old_ids), retention_days)
    return len(old_ids)


from contextlib import asynccontextmanager


@asynccontextmanager
async def _lifespan(_app: FastAPI):
    if not os.environ.get("OPENAI_API_KEY"):
        logger.warning(
            "OPENAI_API_KEY is not set - /generate and /ask will fail at the LLM step. "
            "Set it in the environment or a .env file."
        )
    try:
        _cleanup_old_jobs()
    except Exception:
        logger.exception("job retention cleanup failed (continuing)")
    # The remote MCP transport (mounted at /mcp) needs its session manager running.
    async with remote_mcp.session_manager.run():
        yield


app = FastAPI(title="RepoLore", lifespan=_lifespan)


@app.middleware("http")
async def _security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "same-origin")
    return response


@app.get("/healthz")
def healthz():
    """Liveness/readiness probe: verifies the job store is reachable."""
    try:
        with _db() as conn:
            conn.execute("SELECT 1")
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"job store unavailable: {exc}")
    return {"status": "ok"}


class LLMConfig(BaseModel):
    """User-supplied model choice + key (BYOK). The key is used for this request
    only — never persisted, never logged."""
    model_config = ConfigDict(protected_namespaces=())  # allow a field named `model`

    provider: str
    model: str
    api_key: str


class GenerateRequest(BaseModel):
    url: str
    llm: Optional[LLMConfig] = None


class AskRequest(BaseModel):
    question: str
    bundle_id: str
    llm: Optional[LLMConfig] = None


def _resolve_byok(llm: Optional[LLMConfig]):
    """Validate a BYOK config and build its chat model, or None for free tier."""
    if llm is None:
        return None
    error = validate_model_config(llm.provider, llm.model)
    if error:
        raise HTTPException(status_code=400, detail=error)
    if not llm.api_key.strip():
        raise HTTPException(status_code=400, detail="API key is empty. Paste your provider API key.")
    return make_chat_model(llm.provider, llm.model, llm.api_key.strip())


def _validate_github_url(url: str) -> None:
    if not GITHUB_URL_RE.match(url.strip()):
        raise HTTPException(
            status_code=400,
            detail="Please provide a valid GitHub repository URL (https://github.com/<owner>/<repo>).",
        )


def _clone_shallow(url: str) -> str:
    tmp_dir = tempfile.mkdtemp(prefix="repolore_")
    # GIT_TERMINAL_PROMPT=0 makes private-repo clones fail immediately instead of
    # hanging on a credential prompt until the timeout.
    env = {**os.environ, "GIT_TERMINAL_PROMPT": "0", "GCM_INTERACTIVE": "never"}
    try:
        result = subprocess.run(
            ["git", "clone", "--depth", "1", "--single-branch", "--no-tags", url, tmp_dir],
            capture_output=True,
            text=True,
            timeout=CLONE_TIMEOUT_SECONDS,
            env=env,
        )
    except subprocess.TimeoutExpired:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        raise HTTPException(status_code=400, detail="Cloning the repository timed out.")

    if result.returncode != 0:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        raise HTTPException(
            status_code=400,
            detail="Could not clone repository. It may be private, invalid, or nonexistent.",
        )

    return tmp_dir


def _create_job(job_id: str, total: int) -> None:
    with _db() as conn:
        conn.execute(
            "INSERT INTO jobs (id, status, progress, total, created_at) VALUES (?, 'pending', 0, ?, ?)",
            (job_id, total, datetime.now(timezone.utc).isoformat()),
        )


def _update_progress(job_id: str, progress: int, total: int) -> None:
    with _db() as conn:
        conn.execute(
            "UPDATE jobs SET status = 'running', progress = ?, total = ? WHERE id = ?",
            (progress, total, job_id),
        )


def _finish_job(job_id: str, zip_path: str, graph_json: str) -> None:
    with _db() as conn:
        conn.execute(
            "UPDATE jobs SET status = 'done', zip_path = ?, graph_json = ? WHERE id = ?",
            (zip_path, graph_json, job_id),
        )


def _fail_job(job_id: str, error: str) -> None:
    with _db() as conn:
        conn.execute("UPDATE jobs SET status = 'error', error = ? WHERE id = ?", (error, job_id))


def _get_job(job_id: str) -> sqlite3.Row:
    with _db() as conn:
        row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    return row


def _zip_bundle(bundle_dir: str, zip_path: str) -> None:
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, _, files in os.walk(bundle_dir):
            for filename in files:
                full = os.path.join(root, filename)
                zf.write(full, os.path.relpath(full, bundle_dir))


def _run_job(job_id: str, tmp_dir: str, concepts: List[Concept], draft_fn=draft_concept) -> None:
    try:
        bundle_dir = os.path.join(JOBS_DIR, job_id, "bundle")
        zip_path = os.path.join(JOBS_DIR, job_id, "bundle.zip")

        def on_progress(done: int, total: int) -> None:
            _update_progress(job_id, done, total)

        build_bundle(tmp_dir, bundle_dir, concepts=concepts, draft_fn=draft_fn, on_progress=on_progress)
        _zip_bundle(bundle_dir, zip_path)
        _finish_job(job_id, zip_path, json.dumps(build_graph(concepts)))
        logger.info("job %s finished: %d concept(s)", job_id, len(concepts))
    except Exception as exc:
        logger.exception("job %s failed", job_id)
        _fail_job(job_id, str(exc))
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


@app.get("/models")
def models():
    """Providers + curated model suggestions for the BYOK settings UI."""
    return {
        "providers": [
            {"id": pid, "label": spec["label"], "models": spec["models"]}
            for pid, spec in PROVIDERS.items()
        ],
        "default": {"provider": DEFAULT_PROVIDER, "model": DEFAULT_MODEL},
        "free_generations": FREE_GENERATIONS,
        "free_asks": FREE_ASKS,
    }


@app.get("/usage")
def usage(request: Request):
    """How much of the free tier this user (by IP) has left."""
    row = _usage_row(_client_ip(request))
    return {
        "free_generations_left": max(0, FREE_GENERATIONS - row["generations_used"]),
        "free_asks_left": max(0, FREE_ASKS - row["asks_used"]),
    }


@app.post("/generate")
def generate(req: GenerateRequest, background_tasks: BackgroundTasks, request: Request):
    _check_rate_limit(request)
    _validate_github_url(req.url)

    # BYOK: validate + build the user's model up front (cheap, no network call).
    # Free tier: gate BEFORE the expensive clone.
    byok_model = _resolve_byok(req.llm)
    ip = _client_ip(request)
    if byok_model is None and _usage_row(ip)["generations_used"] >= FREE_GENERATIONS:
        raise HTTPException(
            status_code=402,
            detail=(
                "Your free generation is used. Add your own API key (Model settings) "
                "to keep generating — OpenAI, Anthropic, and Google Gemini are supported."
            ),
        )
    draft_fn = make_draft_fn(byok_model) if byok_model is not None else draft_concept

    tmp_dir = _clone_shallow(req.url)

    try:
        concepts = scan_repo(tmp_dir)
    except Exception:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        raise HTTPException(status_code=400, detail="Failed to scan repository.")

    if not concepts:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        raise HTTPException(status_code=422, detail="No Python files found in this repository.")

    if len(concepts) > MAX_FILES:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        raise HTTPException(
            status_code=413,
            detail=(
                f"Repository has {len(concepts)} Python files, which exceeds the limit of "
                f"{MAX_FILES}. Estimated cost: {len(concepts)} LLM calls."
            ),
        )

    job_id = str(uuid.uuid4())
    _create_job(job_id, total=len(concepts))

    # All checks passed and the job is real — a free-tier run is consumed now.
    if byok_model is None:
        _bump_usage(ip, "generations_used")

    if len(concepts) <= TINY_THRESHOLD:
        _run_job(job_id, tmp_dir, concepts, draft_fn=draft_fn)
        job = _get_job(job_id)
        if job["status"] == "error":
            raise HTTPException(status_code=500, detail=job["error"])
        return {
            "job_id": job_id,
            "status": "done",
            "total": len(concepts),
            "graph": json.loads(job["graph_json"]),
            "download_url": f"/jobs/{job_id}/download",
        }

    background_tasks.add_task(_run_job, job_id, tmp_dir, concepts, draft_fn)
    return {"job_id": job_id, "status": "pending", "total": len(concepts)}


@app.get("/jobs/{job_id}")
def job_status(job_id: str):
    job = _get_job(job_id)
    return {
        "job_id": job["id"],
        "status": job["status"],
        "progress": job["progress"],
        "total": job["total"],
        "error": job["error"],
        "download_url": f"/jobs/{job_id}/download" if job["status"] == "done" else None,
    }


@app.get("/jobs/{job_id}/graph")
def job_graph(job_id: str):
    job = _get_job(job_id)
    if job["status"] != "done":
        raise HTTPException(status_code=409, detail="Job is not finished yet.")
    return JSONResponse(json.loads(job["graph_json"]))


@app.get("/jobs/{job_id}/download")
def job_download(job_id: str):
    job = _get_job(job_id)
    if job["status"] != "done":
        raise HTTPException(status_code=409, detail="Job is not finished yet.")
    return FileResponse(job["zip_path"], filename=f"{job_id}.zip", media_type="application/zip")


@app.get("/jobs/{job_id}/concept")
def job_concept(job_id: str, id: str):
    job = _get_job(job_id)
    if job["status"] != "done":
        raise HTTPException(status_code=409, detail="Job is not finished yet.")

    # Only serve ids that are real nodes in this job's graph — this is also the
    # path-traversal guard, since the id becomes part of a file path below.
    graph = json.loads(job["graph_json"])
    valid_ids = {n["id"] for n in graph["nodes"]}
    if id not in valid_ids:
        raise HTTPException(status_code=404, detail="Concept not found.")

    concept_path = os.path.join(JOBS_DIR, job_id, "bundle", *id.split("/")) + ".md"
    if not os.path.exists(concept_path):
        raise HTTPException(status_code=404, detail="Concept file is missing from the bundle.")

    with open(concept_path, "r", encoding="utf-8") as f:
        markdown = f.read()
    return {"id": id, "markdown": markdown}


@app.post("/ask")
def ask(req: AskRequest, request: Request):
    _check_rate_limit(request, bucket="ask", limit=ASK_RATE_LIMIT)

    question = req.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question is empty.")
    if len(question) > MAX_QUESTION_CHARS:
        raise HTTPException(
            status_code=413,
            detail=f"Question is too long ({len(question)} chars; max {MAX_QUESTION_CHARS}).",
        )

    job = _get_job(req.bundle_id)
    if job["status"] != "done":
        raise HTTPException(status_code=409, detail="This bundle isn't ready yet.")

    bundle_dir = os.path.join(JOBS_DIR, req.bundle_id, "bundle")
    if not os.path.isdir(bundle_dir):
        raise HTTPException(status_code=404, detail="Bundle files are missing.")

    # BYOK uses the user's model; otherwise consume a free question (server key).
    byok_model = _resolve_byok(req.llm)
    ip = _client_ip(request)
    if byok_model is None:
        if _usage_row(ip)["asks_used"] >= FREE_ASKS:
            raise HTTPException(
                status_code=402,
                detail=(
                    f"Your {FREE_ASKS} free questions are used. Add your own API key "
                    "(Model settings) to keep asking."
                ),
            )
        _bump_usage(ip, "asks_used")
    model_factory = (lambda: byok_model) if byok_model is not None else None

    graph = json.loads(job["graph_json"])

    # Import here so the rest of the API works without the consumer's deps loaded.
    from okf_consumer import answer_from_bundle

    try:
        result = answer_from_bundle(
            question, bundle_dir, graph["nodes"], graph["edges"], model_factory=model_factory
        )
    except Exception as exc:
        logger.exception("ask failed for bundle %s", req.bundle_id)
        raise HTTPException(status_code=500, detail=f"Failed to answer: {exc}")

    return result


# ---------------------------- Remote MCP endpoint ----------------------------
# Any MCP client can traverse a generated bundle without cloning anything:
#   claude mcp add repolore --transport http https://<host>/mcp
# Tools take the bundle_id shown in the web app after a generation. All tools are
# deterministic reads over the bundle on disk — no LLM, no key needed.

from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings

import okf_bundle

remote_mcp = FastMCP(
    "repolore",
    stateless_http=True,
    json_response=True,
    streamable_http_path="/",
    # DNS-rebinding protection is a localhost-server defense; on a public host behind
    # a proxy it only rejects legitimate Host headers. The endpoint is deterministic
    # read-only queries over generated bundles, so host validation adds nothing here.
    transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=False),
    instructions=(
        "Query codebase knowledge graphs generated by RepoLore. Each generated repo is "
        "an OKF bundle identified by a bundle_id (shown in the RepoLore web app after "
        "generating, and equal to the job id). Start with list_concepts, then follow "
        "links with traverse / find_path and read full concepts with read_concept."
    ),
)


def _mcp_graph(bundle_id: str):
    """Resolve a bundle_id to (bundle_dir, graph). Raises ValueError with a clear
    message for unknown/unfinished bundles (FastMCP surfaces it as a tool error)."""
    with _db() as conn:
        row = conn.execute("SELECT status FROM jobs WHERE id = ?", (bundle_id,)).fetchone()
    if row is None:
        raise ValueError(f"Unknown bundle_id {bundle_id!r}. Generate a repo in the RepoLore web app first.")
    if row["status"] != "done":
        raise ValueError(f"Bundle {bundle_id!r} is not ready (status: {row['status']}).")
    bundle_dir = os.path.join(JOBS_DIR, bundle_id, "bundle")
    if not os.path.isdir(bundle_dir):
        raise ValueError(f"Bundle files for {bundle_id!r} are missing (it may have been cleaned up).")
    return bundle_dir, okf_bundle.load_bundle(bundle_dir)


@remote_mcp.tool()
def list_concepts(bundle_id: str, contains: str = "", type: str = "") -> list:
    """List the concepts (one per source file) in a generated bundle. Optionally
    filter by `type` (module/package/test) or a `contains` substring. Start here."""
    _, graph = _mcp_graph(bundle_id)
    needle = contains.lower()
    return [
        {"id": n["id"], "type": n.get("type", "concept"), "description": n.get("description", "")}
        for n in graph["nodes"]
        if (not type or n.get("type") == type)
        and (not needle or needle in (n["id"] + " " + n.get("description", "")).lower())
    ]


@remote_mcp.tool()
def read_concept(bundle_id: str, id: str) -> str:
    """Return one concept's full markdown (prose + its links to related concepts)."""
    bundle_dir, graph = _mcp_graph(bundle_id)
    if id not in {n["id"] for n in graph["nodes"]}:
        return f"No concept with id {id!r} in bundle {bundle_id!r}."
    return okf_bundle.read_concept(bundle_dir, id) or ""


@remote_mcp.tool()
def concept_links(bundle_id: str, id: str) -> dict:
    """A concept's direct neighbors: `links` (what it points to) and `linked_by`
    (what points to it)."""
    _, graph = _mcp_graph(bundle_id)
    if id not in {n["id"] for n in graph["nodes"]}:
        return {"id": id, "error": "unknown concept", "links": [], "linked_by": []}
    result = okf_bundle.neighbors(graph["edges"], id)
    result["id"] = id
    return result


@remote_mcp.tool()
def traverse(bundle_id: str, start: str, hops: int = 2) -> dict:
    """Walk the graph from a concept up to `hops` links away and return the CONNECTED
    set (ids, types, briefs) plus the edges among them — connected-context retrieval
    over real import links, not similarity search."""
    bundle_dir, graph = _mcp_graph(bundle_id)
    ids = {n["id"] for n in graph["nodes"]}
    if start not in ids:
        return {"start": start, "error": "unknown concept", "visited": [], "edges": []}
    adjacency = okf_bundle.build_adjacency(graph["edges"])
    visited = okf_bundle.traverse([start], adjacency, max_hops=max(0, hops))
    visited_set = set(visited)
    by_id = {n["id"]: n for n in graph["nodes"]}
    briefs = [
        {
            "id": cid,
            "type": by_id.get(cid, {}).get("type", "concept"),
            "brief": by_id.get(cid, {}).get("description")
            or okf_bundle.concept_brief(okf_bundle.read_concept(bundle_dir, cid) or ""),
        }
        for cid in visited
    ]
    edges = [[e["source"], e["target"]] for e in graph["edges"]
             if e["source"] in visited_set and e["target"] in visited_set]
    return {"start": start, "hops": hops, "visited": briefs, "edges": edges}


@remote_mcp.tool()
def find_path(bundle_id: str, source: str, target: str) -> dict:
    """Shortest link-path between two concepts — answers "how does X relate to Y?"
    directly from the graph."""
    _, graph = _mcp_graph(bundle_id)
    ids = {n["id"] for n in graph["nodes"]}
    if source not in ids or target not in ids:
        return {"source": source, "target": target, "path": [], "error": "unknown concept"}
    adjacency = okf_bundle.build_adjacency(graph["edges"])
    path = okf_bundle.find_path(adjacency, source, target)
    return {"source": source, "target": target, "path": path or [], "connected": path is not None}


app.mount("/mcp", remote_mcp.streamable_http_app())
app.mount("/", StaticFiles(directory=os.path.join(BASE_DIR, "design"), html=True), name="frontend")
