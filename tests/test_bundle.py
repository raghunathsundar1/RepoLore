import os

from okf_bundle import (
    build_adjacency,
    find_path,
    load_bundle,
    neighbors,
    traverse,
)
from okf_producer import build_bundle

SAMPLE = os.path.join(os.path.dirname(__file__), "..", "sample")


def _bundle(tmp_path):
    out = str(tmp_path / "bundle")
    build_bundle(SAMPLE, out, draft_fn=lambda c, s: f"The {c.id} concept is a {c.type}.")
    return out


def test_load_bundle_recovers_graph_from_markdown_links(tmp_path):
    graph = load_bundle(_bundle(tmp_path))
    ids = {n["id"] for n in graph["nodes"]}
    assert ids == {"app", "pkg", "pkg/routes", "pkg/utils"}  # index.md/log.md excluded

    edges = {(e["source"], e["target"]) for e in graph["edges"]}
    # These were written as body markdown links by the producer and parsed back here.
    assert ("app", "pkg/routes") in edges
    assert ("pkg/routes", "pkg/utils") in edges

    node = next(n for n in graph["nodes"] if n["id"] == "pkg/routes")
    assert node["type"] == "module"
    assert node["description"]


def test_traverse_respects_hop_bound(tmp_path):
    graph = load_bundle(_bundle(tmp_path))
    adj = build_adjacency(graph["edges"])
    assert "pkg/utils" in traverse(["app"], adj, max_hops=1)     # app links utils directly
    # From utils, routes is 1 hop; a far-only node would need 2 — bound still holds.
    one_hop = traverse(["pkg/utils"], adj, max_hops=1)
    assert "pkg/routes" in one_hop and "app" in one_hop


def test_find_path_and_neighbors(tmp_path):
    graph = load_bundle(_bundle(tmp_path))
    adj = build_adjacency(graph["edges"])
    assert find_path(adj, "app", "pkg/utils") == ["app", "pkg/utils"]
    assert find_path(adj, "app", "app") == ["app"]

    n = neighbors(graph["edges"], "pkg/utils")
    assert n["links"] == []                       # utils imports nothing
    assert set(n["linked_by"]) == {"app", "pkg/routes"}


def test_load_bundle_is_permissive_about_broken_links(tmp_path):
    d = tmp_path / "b"
    d.mkdir()
    (d / "a.md").write_text(
        "---\ntype: module\n---\n\nProse.\n\n## Related concepts\n\n- [b](/b.md)\n- [ghost](/ghost.md)\n",
        encoding="utf-8",
    )
    (d / "b.md").write_text("---\ntype: module\n---\n\nProse.\n", encoding="utf-8")

    graph = load_bundle(str(d))
    edges = {(e["source"], e["target"]) for e in graph["edges"]}
    assert ("a", "b") in edges
    assert not any(t == "ghost" for _, t in edges)  # broken link skipped, not fatal


def test_mcp_tools_operate_on_the_bundle(tmp_path):
    import mcp_server

    mcp_server.BUNDLE_DIR = _bundle(tmp_path)

    listed = mcp_server.list_concepts(contains="routes")
    assert [c["id"] for c in listed] == ["pkg/routes"]

    assert "## Related concepts" in mcp_server.read_concept("pkg/routes")
    assert mcp_server.read_concept("nope").startswith("No concept")

    walked = mcp_server.traverse("app", 1)
    assert {c["id"] for c in walked["visited"]} == {"app", "pkg", "pkg/routes", "pkg/utils"}
    assert ["app", "pkg/utils"] in [list(e) for e in walked["edges"]]

    path = mcp_server.find_path("app", "pkg/utils")
    assert path["connected"] and path["path"] == ["app", "pkg/utils"]
