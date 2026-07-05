import os

from graph import build_graph
from okf_scanner import scan_repo

SAMPLE = os.path.join(os.path.dirname(__file__), "..", "sample")


def test_build_graph_shape():
    concepts = scan_repo(SAMPLE)
    result = build_graph(concepts)

    assert set(result.keys()) == {"nodes", "edges"}
    assert len(result["nodes"]) == 4
    node_ids = {n["id"] for n in result["nodes"]}
    assert node_ids == {"app", "pkg", "pkg/routes", "pkg/utils"}

    edge_pairs = {(e["source"], e["target"]) for e in result["edges"]}
    assert ("app", "pkg/routes") in edge_pairs
    assert ("pkg/routes", "pkg/utils") in edge_pairs


def test_build_graph_every_edge_endpoint_is_a_node():
    concepts = scan_repo(SAMPLE)
    result = build_graph(concepts)
    node_ids = {n["id"] for n in result["nodes"]}
    for edge in result["edges"]:
        assert edge["source"] in node_ids
        assert edge["target"] in node_ids
