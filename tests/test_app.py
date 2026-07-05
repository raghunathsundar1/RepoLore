import os
import shutil

import pytest
from fastapi.testclient import TestClient

import app as app_module

SAMPLE = os.path.join(os.path.dirname(__file__), "..", "sample")


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(app_module, "DB_PATH", str(tmp_path / "jobs.db"))
    monkeypatch.setattr(app_module, "JOBS_DIR", str(tmp_path / "jobs"))
    os.makedirs(app_module.JOBS_DIR, exist_ok=True)
    app_module._init_db()
    app_module._rate_hits.clear()  # isolate the per-IP rate limiter between tests
    return TestClient(app_module.app)


def _fake_clone_factory(source_dir):
    def _fake_clone(url):
        dest = os.path.join(app_module.tempfile.mkdtemp(prefix="repolore_test_"), "repo")
        shutil.copytree(source_dir, dest)
        return dest

    return _fake_clone


def _fake_build_bundle(repo_root, out_dir, concepts=None, draft_fn=None, on_progress=None):
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, "index.md"), "w", encoding="utf-8") as f:
        f.write("# Index\n")
    if on_progress is not None:
        for i in range(len(concepts)):
            on_progress(i + 1, len(concepts))
    return concepts


def _real_build_no_llm(repo_root, out_dir, concepts=None, draft_fn=None, on_progress=None):
    # Drive the real bundle writer (frontmatter + concept files + index + log)
    # but stub the single LLM call, so /concept serves genuine concept files.
    import okf_producer

    def stub(concept, source):
        return f"Prose for {concept.id}. It is a {concept.type}."

    return okf_producer.build_bundle(repo_root, out_dir, concepts=concepts, draft_fn=stub, on_progress=on_progress)


def test_generate_rejects_non_github_url(client):
    res = client.post("/generate", json={"url": "https://example.com/owner/repo"})
    assert res.status_code == 400


def test_concept_endpoint_serves_real_generated_markdown(client, monkeypatch):
    monkeypatch.setattr(app_module, "_clone_shallow", _fake_clone_factory(SAMPLE))
    monkeypatch.setattr(app_module, "build_bundle", _real_build_no_llm)

    res = client.post("/generate", json={"url": "https://github.com/owner/repo"})
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "done"
    job_id = body["job_id"]

    # Graph endpoint returns nodes the frontend force-graph consumes.
    graph = client.get(f"/jobs/{job_id}/graph").json()
    ids = {n["id"] for n in graph["nodes"]}
    assert "pkg/routes" in ids

    # Concept endpoint returns the generated markdown for a real node.
    concept = client.get(f"/jobs/{job_id}/concept", params={"id": "pkg/routes"})
    assert concept.status_code == 200
    md = concept.json()["markdown"]
    assert "type: module" in md
    assert "Prose for pkg/routes." in md

    # Unknown / path-traversal ids are rejected, not served off disk.
    assert client.get(f"/jobs/{job_id}/concept", params={"id": "../../secret"}).status_code == 404
    assert client.get(f"/jobs/{job_id}/concept", params={"id": "nope"}).status_code == 404

    # Bundle download works.
    dl = client.get(f"/jobs/{job_id}/download")
    assert dl.status_code == 200
    assert dl.headers["content-type"] == "application/zip"


def test_concept_endpoint_409_before_done(client):
    app_module._create_job("pending-concept", total=3)
    res = client.get("/jobs/pending-concept/concept", params={"id": "whatever"})
    assert res.status_code == 409


def test_generate_rate_limited(client, monkeypatch):
    monkeypatch.setattr(app_module, "RATE_LIMIT", 5)
    # The rate check runs before URL validation, so cheap invalid URLs exercise it.
    for _ in range(app_module.RATE_LIMIT):
        assert client.post("/generate", json={"url": "nope"}).status_code == 400
    assert client.post("/generate", json={"url": "nope"}).status_code == 429


def _make_done_bundle(client, monkeypatch):
    monkeypatch.setattr(app_module, "_clone_shallow", _fake_clone_factory(SAMPLE))
    monkeypatch.setattr(app_module, "build_bundle", _real_build_no_llm)
    res = client.post("/generate", json={"url": "https://github.com/owner/repo"})
    assert res.status_code == 200
    return res.json()["job_id"]


def test_ask_traverses_bundle_and_returns_path(client, monkeypatch):
    job_id = _make_done_bundle(client, monkeypatch)

    # Stub both LLM steps so /ask runs the real LangGraph agent without a key.
    import okf_consumer

    monkeypatch.setattr(okf_consumer, "plan_concepts", lambda q, catalog: ["pkg/routes"])
    monkeypatch.setattr(
        okf_consumer, "answer_question",
        lambda q, concepts: {"answer": "routes uses utils to log.", "cited_ids": ["pkg/routes", "pkg/utils"]},
    )

    res = client.post("/ask", json={"question": "how does routing log?", "bundle_id": job_id})
    assert res.status_code == 200
    body = res.json()

    # The agent followed the routes -> utils link: both are on the visited path.
    assert "pkg/routes" in body["visited_concept_ids"]
    assert "pkg/utils" in body["visited_concept_ids"]
    assert body["cited_concept_ids"] == ["pkg/routes", "pkg/utils"]
    assert "utils" in body["answer"]


def test_ask_rejects_empty_question(client, monkeypatch):
    job_id = _make_done_bundle(client, monkeypatch)
    assert client.post("/ask", json={"question": "   ", "bundle_id": job_id}).status_code == 400


def test_ask_unknown_bundle_404(client):
    assert client.post("/ask", json={"question": "hi", "bundle_id": "nope"}).status_code == 404


def test_ask_rejects_oversized_question(client, monkeypatch):
    job_id = _make_done_bundle(client, monkeypatch)
    big = "x" * (app_module.MAX_QUESTION_CHARS + 1)
    assert client.post("/ask", json={"question": big, "bundle_id": job_id}).status_code == 413


BYOK = {"provider": "openai", "model": "gpt-4o-mini", "api_key": "sk-user-own-key"}


def test_free_generation_then_402_then_byok_works(client, monkeypatch):
    monkeypatch.setattr(app_module, "_clone_shallow", _fake_clone_factory(SAMPLE))
    monkeypatch.setattr(app_module, "build_bundle", _fake_build_bundle)

    # 1st generation: free (server key).
    assert client.post("/generate", json={"url": "https://github.com/owner/repo"}).status_code == 200
    assert client.get("/usage").json()["free_generations_left"] == 0

    # 2nd without a key: payment required.
    res = client.post("/generate", json={"url": "https://github.com/owner/repo"})
    assert res.status_code == 402
    assert "API key" in res.json()["detail"]

    # 2nd WITH the user's own key: allowed.
    res = client.post("/generate", json={"url": "https://github.com/owner/repo", "llm": BYOK})
    assert res.status_code == 200


def test_generate_rejects_bad_byok_config(client, monkeypatch):
    monkeypatch.setattr(app_module, "_clone_shallow", _fake_clone_factory(SAMPLE))
    bad_provider = {**BYOK, "provider": "nope"}
    assert client.post("/generate", json={"url": "https://github.com/o/r", "llm": bad_provider}).status_code == 400
    empty_key = {**BYOK, "api_key": "   "}
    assert client.post("/generate", json={"url": "https://github.com/o/r", "llm": empty_key}).status_code == 400


def test_free_asks_capped_then_byok_works(client, monkeypatch):
    job_id = _make_done_bundle(client, monkeypatch)

    import okf_consumer

    monkeypatch.setattr(okf_consumer, "plan_concepts", lambda q, c, **kw: ["pkg/routes"])
    monkeypatch.setattr(okf_consumer, "answer_question", lambda q, t, **kw: {"answer": "ok", "cited_ids": []})
    monkeypatch.setattr(app_module, "FREE_ASKS", 2)

    assert client.post("/ask", json={"question": "q1", "bundle_id": job_id}).status_code == 200
    assert client.post("/ask", json={"question": "q2", "bundle_id": job_id}).status_code == 200
    res = client.post("/ask", json={"question": "q3", "bundle_id": job_id})
    assert res.status_code == 402

    # With their own key the ask goes through (BYOK model is stubbed at the plan/answer level).
    res = client.post("/ask", json={"question": "q3", "bundle_id": job_id, "llm": BYOK})
    assert res.status_code == 200


def test_models_and_usage_endpoints(client):
    body = client.get("/models").json()
    provider_ids = {p["id"] for p in body["providers"]}
    assert provider_ids == {"openai", "anthropic", "google"}
    assert all(p["models"] for p in body["providers"])
    assert body["default"]["provider"] == "openai"

    u = client.get("/usage").json()
    assert u["free_generations_left"] >= 0 and u["free_asks_left"] >= 0


MCP_HEADERS = {"Accept": "application/json, text/event-stream", "Content-Type": "application/json"}


def _mcp_call(c, id_, method, params=None):
    body = {"jsonrpc": "2.0", "id": id_, "method": method}
    if params is not None:
        body["params"] = params
    res = c.post("/mcp/", json=body, headers=MCP_HEADERS)
    assert res.status_code == 200
    return res.json()["result"]


def test_remote_mcp_traverses_a_generated_bundle(client, monkeypatch):
    job_id = _make_done_bundle(client, monkeypatch)

    # The /mcp transport needs the app lifespan running -> context-managed client.
    with TestClient(app_module.app) as mcp_client:
        _mcp_call(mcp_client, 1, "initialize", {
            "protocolVersion": "2025-06-18", "capabilities": {},
            "clientInfo": {"name": "test", "version": "0"},
        })
        tools = {t["name"] for t in _mcp_call(mcp_client, 2, "tools/list")["tools"]}
        assert tools == {"list_concepts", "read_concept", "concept_links", "traverse", "find_path"}

        result = _mcp_call(mcp_client, 3, "tools/call", {
            "name": "traverse", "arguments": {"bundle_id": job_id, "start": "app", "hops": 1},
        })
        assert not result.get("isError")
        import json as _json
        payload = _json.loads(result["content"][0]["text"]) if result["content"][0]["type"] == "text" else result
        # traverse from app reaches its direct imports over the real link graph
        visited = {v["id"] for v in (payload.get("visited") or [])} if isinstance(payload, dict) else set()
        assert "pkg/utils" in visited or "pkg/routes" in visited

        bad = _mcp_call(mcp_client, 4, "tools/call", {
            "name": "list_concepts", "arguments": {"bundle_id": "does-not-exist"},
        })
        assert bad.get("isError") is True


def test_orphaned_jobs_marked_failed_on_startup(client):
    app_module._create_job("orphan-job", total=3)
    with TestClient(app_module.app):  # running the lifespan simulates a restart
        pass
    job = client.get("/jobs/orphan-job").json()
    assert job["status"] == "error"
    assert "restart" in job["error"]


def test_healthz_ok_and_security_headers(client):
    res = client.get("/healthz")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}
    assert res.headers["X-Content-Type-Options"] == "nosniff"
    assert res.headers["X-Frame-Options"] == "DENY"


def test_cleanup_old_jobs_removes_stale_rows_and_dirs(client):
    import datetime

    # One fresh job, one stale job (backdated), each with an on-disk dir.
    app_module._create_job("fresh-job", total=1)
    app_module._create_job("stale-job", total=1)
    old = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=30)).isoformat()
    with app_module._db() as conn:
        conn.execute("UPDATE jobs SET created_at = ? WHERE id = 'stale-job'", (old,))
    os.makedirs(os.path.join(app_module.JOBS_DIR, "stale-job"), exist_ok=True)
    os.makedirs(os.path.join(app_module.JOBS_DIR, "fresh-job"), exist_ok=True)

    removed = app_module._cleanup_old_jobs(retention_days=7)
    assert removed == 1
    assert not os.path.exists(os.path.join(app_module.JOBS_DIR, "stale-job"))
    assert os.path.exists(os.path.join(app_module.JOBS_DIR, "fresh-job"))
    assert client.get("/jobs/stale-job").status_code == 404
    assert client.get("/jobs/fresh-job").status_code == 200


def test_generate_tiny_repo_runs_synchronously(client, monkeypatch):
    monkeypatch.setattr(app_module, "_clone_shallow", _fake_clone_factory(SAMPLE))
    monkeypatch.setattr(app_module, "build_bundle", _fake_build_bundle)

    res = client.post("/generate", json={"url": "https://github.com/owner/repo"})
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "done"
    assert body["total"] == 4
    assert len(body["graph"]["nodes"]) == 4
    assert body["download_url"].endswith("/download")

    download = client.get(body["download_url"])
    assert download.status_code == 200
    assert download.headers["content-type"] == "application/zip"


def test_generate_rejects_empty_repo(client, monkeypatch, tmp_path):
    empty_dir = tmp_path / "empty_repo"
    empty_dir.mkdir()
    monkeypatch.setattr(app_module, "_clone_shallow", _fake_clone_factory(str(empty_dir)))

    res = client.post("/generate", json={"url": "https://github.com/owner/repo"})
    assert res.status_code == 422


def test_generate_rejects_oversized_repo(client, monkeypatch):
    monkeypatch.setattr(app_module, "_clone_shallow", _fake_clone_factory(SAMPLE))
    monkeypatch.setattr(app_module, "MAX_FILES", 1)

    res = client.post("/generate", json={"url": "https://github.com/owner/repo"})
    assert res.status_code == 413


def test_job_status_not_found(client):
    res = client.get("/jobs/does-not-exist")
    assert res.status_code == 404


def test_graph_not_ready_before_job_done(client, monkeypatch):
    monkeypatch.setattr(app_module, "_clone_shallow", _fake_clone_factory(SAMPLE))
    monkeypatch.setattr(app_module, "MAX_FILES", 1)
    app_module.TINY_THRESHOLD  # sanity import touch

    # Manually create a pending job to check the "not finished yet" path.
    app_module._create_job("pending-job", total=4)
    res = client.get("/jobs/pending-job/graph")
    assert res.status_code == 409
    res = client.get("/jobs/pending-job/download")
    assert res.status_code == 409
