import os

from graph import build_graph
from okf_consumer import answer_from_bundle, build_adjacency, concept_brief, traverse
from okf_producer import build_bundle
from okf_scanner import scan_repo

SAMPLE = os.path.join(os.path.dirname(__file__), "..", "sample")


def _sample_bundle(tmp_path):
    out_dir = str(tmp_path / "bundle")
    build_bundle(SAMPLE, out_dir, draft_fn=lambda c, s: f"Concept {c.id}: this file is a {c.type}.")
    concepts = scan_repo(SAMPLE)
    graph = build_graph(concepts)
    return out_dir, graph


def test_traverse_follows_links_within_hop_bound():
    # app -> {pkg, pkg/routes, pkg/utils}; pkg/routes -> {pkg, pkg/utils}
    adj = build_adjacency([
        {"source": "app", "target": "pkg/routes"},
        {"source": "pkg/routes", "target": "pkg/utils"},
    ])
    # Seed at app; utils is 2 hops away (app -> routes -> utils).
    visited = traverse(["app"], adj, max_hops=2)
    assert "pkg/routes" in visited
    assert "pkg/utils" in visited
    # With only 1 hop, the far concept is not reached.
    assert "pkg/utils" not in traverse(["app"], adj, max_hops=1)


def test_concept_brief_strips_frontmatter():
    md = "---\ntype: module\nid: x\n---\n\nThis is the prose. More."
    assert concept_brief(md).startswith("This is the prose.")


def test_agent_traverses_link_between_two_concepts(tmp_path):
    out_dir, graph = _sample_bundle(tmp_path)

    # Planner seeds only on pkg/routes; the ANSWER requires pkg/utils, which is
    # reachable only by following the routes -> utils link.
    def plan_fn(question, catalog):
        return ["pkg/routes"]

    seen = {}

    def answer_fn(question, concepts):
        seen["ids"] = [c["id"] for c in concepts]
        # Cite both endpoints of the link to prove the connected context was assembled.
        return {"answer": "routes logs via utils.", "cited_ids": ["pkg/routes", "pkg/utils"]}

    result = answer_from_bundle(
        "How does request routing produce log output?",
        out_dir, graph["nodes"], graph["edges"],
        plan_fn=plan_fn, answer_fn=answer_fn,
    )

    # Traversal followed the link: utils is in the assembled + visited set.
    assert "pkg/utils" in seen["ids"]
    assert "pkg/routes" in result["visited_concept_ids"]
    assert "pkg/utils" in result["visited_concept_ids"]

    # The connecting edge exists in the graph, so the frontend can light it up.
    edge_pairs = {frozenset((e["source"], e["target"])) for e in graph["edges"]}
    assert frozenset(("pkg/routes", "pkg/utils")) in edge_pairs

    assert result["cited_concept_ids"] == ["pkg/routes", "pkg/utils"]
    assert "utils" in result["answer"]


def test_agent_is_permissive_on_bad_plan(tmp_path):
    out_dir, graph = _sample_bundle(tmp_path)

    # Planner returns junk ids; agent must fall back, not crash or return empty.
    def plan_fn(question, catalog):
        return ["does/not/exist", "index"]

    def answer_fn(question, concepts):
        return {"answer": "ok", "cited_ids": ["nonexistent"]}

    result = answer_from_bundle("anything", out_dir, graph["nodes"], graph["edges"],
                                plan_fn=plan_fn, answer_fn=answer_fn)
    assert result["visited_concept_ids"]          # fell back to a real concept
    assert result["cited_concept_ids"] == []      # bogus citation filtered out
