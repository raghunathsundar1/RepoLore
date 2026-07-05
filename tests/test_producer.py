import os

from okf_producer import build_bundle, strip_code_fences
from okf_scanner import scan_repo

SAMPLE = os.path.join(os.path.dirname(__file__), "..", "sample")


def stub_draft(concept, source):
    return f"Stub prose for {concept.id}."


def test_strip_code_fences_removes_wrapping_fence():
    assert strip_code_fences("```markdown\nhello\n```") == "hello"
    assert strip_code_fences("no fences here") == "no fences here"


def test_build_bundle_writes_expected_files(tmp_path):
    out_dir = str(tmp_path / "bundle")
    concepts = build_bundle(SAMPLE, out_dir, draft_fn=stub_draft)

    assert len(concepts) == 4
    assert os.path.exists(os.path.join(out_dir, "index.md"))
    assert os.path.exists(os.path.join(out_dir, "log.md"))
    assert os.path.exists(os.path.join(out_dir, "app.md"))
    assert os.path.exists(os.path.join(out_dir, "pkg.md"))
    assert os.path.exists(os.path.join(out_dir, "pkg", "routes.md"))
    assert os.path.exists(os.path.join(out_dir, "pkg", "utils.md"))


def test_build_bundle_concept_file_is_okf_aligned(tmp_path):
    out_dir = str(tmp_path / "bundle")
    build_bundle(SAMPLE, out_dir, draft_fn=stub_draft)

    content = open(os.path.join(out_dir, "pkg", "routes.md"), encoding="utf-8").read()
    # OKF frontmatter: required type + recommended title/description/resource/tags/timestamp.
    assert content.startswith("---\n")
    assert "type: module" in content
    assert "title: pkg/routes" in content
    assert 'description: "Stub prose for pkg/routes."' in content
    assert "resource: pkg/routes.py" in content
    assert "timestamp: " in content
    # Prose, then links as STANDARD MARKDOWN LINKS in the body (not frontmatter).
    assert "Stub prose for pkg/routes." in content
    assert "## Related concepts" in content
    assert "[pkg/utils](/pkg/utils.md)" in content
    assert "\nlinks:" not in content  # links are no longer a frontmatter key


def test_index_and_log_follow_okf_structure(tmp_path):
    out_dir = str(tmp_path / "bundle")
    build_bundle(SAMPLE, out_dir, draft_fn=stub_draft)

    index = open(os.path.join(out_dir, "index.md"), encoding="utf-8").read()
    assert not index.startswith("---")  # index.md has no frontmatter
    assert "* [pkg/routes](/pkg/routes.md) - Stub prose for pkg/routes." in index

    log = open(os.path.join(out_dir, "log.md"), encoding="utf-8").read()
    assert "**Creation**" in log
    import re
    assert re.search(r"## \d{4}-\d{2}-\d{2}", log)  # ISO date heading


def test_build_bundle_reports_progress(tmp_path):
    out_dir = str(tmp_path / "bundle")
    calls = []
    build_bundle(SAMPLE, out_dir, draft_fn=stub_draft, on_progress=lambda done, total: calls.append((done, total)))

    assert calls == [(1, 4), (2, 4), (3, 4), (4, 4)]


def test_build_bundle_uses_provided_concepts(tmp_path):
    out_dir = str(tmp_path / "bundle")
    concepts = scan_repo(SAMPLE)
    result = build_bundle(SAMPLE, out_dir, concepts=concepts, draft_fn=stub_draft)
    assert result is concepts
