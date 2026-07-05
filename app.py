"""FastAPI web layer: GitHub URL -> shallow clone -> scan -> produce -> bundle zip + graph JSON.

See CLAUDE.md web-app rules: shallow clone with cleanup, cap file count, background
job with progress for anything but tiny repos, fail gracefully on bad repos.
"""
import json
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
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import BackgroundTasks, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from graph import build_graph
from okf_producer import build_bundle
from okf_scanner import Concept, scan_repo

GITHUB_URL_RE = re.compile(r"^https://github\.com/[\w.-]+/[\w.-]+?(\.git)?/?$")
MAX_FILES = 200
TINY_THRESHOLD = 5
CLONE_TIMEOUT_SECONDS = 60

# Simple in-process per-IP rate limits — each request drives LLM calls, so this
# protects against an endpoint being hammered. /generate is stricter (a full
# clone + one call per file); /ask is lighter (two calls per question).
RATE_LIMIT = 5          # /generate: max requests
ASK_RATE_LIMIT = 30     # /ask: max requests
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


_init_db()

app = FastAPI(title="RepoLore")


class GenerateRequest(BaseModel):
    url: str


class AskRequest(BaseModel):
    question: str
    bundle_id: str


def _validate_github_url(url: str) -> None:
    if not GITHUB_URL_RE.match(url.strip()):
        raise HTTPException(
            status_code=400,
            detail="Please provide a valid GitHub repository URL (https://github.com/<owner>/<repo>).",
        )


def _clone_shallow(url: str) -> str:
    tmp_dir = tempfile.mkdtemp(prefix="repolore_")
    try:
        result = subprocess.run(
            ["git", "clone", "--depth", "1", url, tmp_dir],
            capture_output=True,
            text=True,
            timeout=CLONE_TIMEOUT_SECONDS,
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


def _run_job(job_id: str, tmp_dir: str, concepts: List[Concept]) -> None:
    try:
        bundle_dir = os.path.join(JOBS_DIR, job_id, "bundle")
        zip_path = os.path.join(JOBS_DIR, job_id, "bundle.zip")

        def on_progress(done: int, total: int) -> None:
            _update_progress(job_id, done, total)

        build_bundle(tmp_dir, bundle_dir, concepts=concepts, on_progress=on_progress)
        _zip_bundle(bundle_dir, zip_path)
        _finish_job(job_id, zip_path, json.dumps(build_graph(concepts)))
    except Exception as exc:
        _fail_job(job_id, str(exc))
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


@app.post("/generate")
def generate(req: GenerateRequest, background_tasks: BackgroundTasks, request: Request):
    _check_rate_limit(request)
    _validate_github_url(req.url)
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

    if len(concepts) <= TINY_THRESHOLD:
        _run_job(job_id, tmp_dir, concepts)
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

    background_tasks.add_task(_run_job, job_id, tmp_dir, concepts)
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

    job = _get_job(req.bundle_id)
    if job["status"] != "done":
        raise HTTPException(status_code=409, detail="This bundle isn't ready yet.")

    bundle_dir = os.path.join(JOBS_DIR, req.bundle_id, "bundle")
    if not os.path.isdir(bundle_dir):
        raise HTTPException(status_code=404, detail="Bundle files are missing.")

    graph = json.loads(job["graph_json"])

    # Import here so the rest of the API works without the consumer's deps loaded.
    from okf_consumer import answer_from_bundle

    try:
        result = answer_from_bundle(question, bundle_dir, graph["nodes"], graph["edges"])
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to answer: {exc}")

    return result


app.mount("/", StaticFiles(directory=os.path.join(BASE_DIR, "design"), html=True), name="frontend")
