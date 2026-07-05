import os

from okf_scanner import scan_repo

SAMPLE = os.path.join(os.path.dirname(__file__), "..", "sample")


def _by_id(concepts):
    return {c.id: c for c in concepts}


def test_scan_repo_finds_all_concepts():
    concepts = scan_repo(SAMPLE)
    ids = {c.id for c in concepts}
    assert ids == {"app", "pkg", "pkg/routes", "pkg/utils"}


def test_scan_repo_assigns_types():
    concepts = _by_id(scan_repo(SAMPLE))
    assert concepts["pkg"].type == "package"
    assert concepts["app"].type == "module"
    assert concepts["pkg/routes"].type == "module"


def test_scan_repo_resolves_links_from_real_imports():
    concepts = _by_id(scan_repo(SAMPLE))
    assert set(concepts["app"].links) == {"pkg", "pkg/routes", "pkg/utils"}
    assert set(concepts["pkg/routes"].links) == {"pkg", "pkg/utils"}
    assert concepts["pkg/utils"].links == []


def test_scan_repo_never_links_to_reserved_ids(tmp_path):
    (tmp_path / "index.py").write_text("x = 1\n", encoding="utf-8")
    (tmp_path / "log.py").write_text("y = 2\n", encoding="utf-8")
    (tmp_path / "app.py").write_text("import index\nimport log\n", encoding="utf-8")

    concepts = _by_id(scan_repo(str(tmp_path)))
    assert "index" not in concepts
    assert "log" not in concepts
    assert concepts["app"].links == []
