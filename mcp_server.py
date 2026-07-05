"""RepoLore MCP server — expose an OKF bundle's knowledge graph to any agent.

Point it at a bundle directory (the folder you get from RepoLore's "Download bundle",
unzipped, or from `python okf_producer.py <repo> <out>`), and an MCP client such as
Claude Code can walk the codebase's real link graph — no vector store, no API key on
the server side. The connected agent does the reasoning; this server does the graph.

Configure the bundle with the REPOLORE_BUNDLE env var (defaults to ./bundle):

    claude mcp add repolore -e REPOLORE_BUNDLE=/path/to/bundle -- python /path/to/mcp_server.py

Tools: list_concepts, read_concept, concept_links, traverse, find_path.
"""
import os
from typing import List

from mcp.server.fastmcp import FastMCP

from okf_bundle import (
    build_adjacency,
    concept_brief,
    find_path as _find_path,
    load_bundle,
    neighbors as _neighbors,
    read_concept as _read_concept,
    traverse as _traverse,
)

BUNDLE_DIR = os.environ.get("REPOLORE_BUNDLE", os.path.join(os.getcwd(), "bundle"))

mcp = FastMCP("repolore")


def _bundle():
    """Load the bundle fresh each call so a regenerated bundle is picked up."""
    if not os.path.isdir(BUNDLE_DIR):
        raise FileNotFoundError(
            f"No OKF bundle at {BUNDLE_DIR!r}. Set REPOLORE_BUNDLE to a bundle directory."
        )
    graph = load_bundle(BUNDLE_DIR)
    return graph, build_adjacency(graph["edges"])


@mcp.tool()
def list_concepts(contains: str = "", type: str = "") -> list:
    """List the concepts in the bundle (one per source file).

    Optionally filter by `type` (e.g. "module", "package", "test") and/or `contains`
    (a substring matched against the concept id and description). Returns each
    concept's id, type, and one-line description — start here to see what's available.
    """
    graph, _ = _bundle()
    contains = contains.lower()
    out = []
    for node in graph["nodes"]:
        if type and node.get("type") != type:
            continue
        if contains and contains not in (node["id"] + " " + node.get("description", "")).lower():
            continue
        out.append({"id": node["id"], "type": node.get("type", "concept"), "description": node.get("description", "")})
    return out


@mcp.tool()
def read_concept(id: str) -> str:
    """Return the full markdown of one concept, given its id (e.g. "api/routes").

    The document includes the concept's prose and its links to related concepts.
    """
    md = _read_concept(BUNDLE_DIR, id)
    if md is None:
        return f"No concept with id {id!r} in this bundle."
    return md


@mcp.tool()
def concept_links(id: str) -> dict:
    """Show a concept's direct graph neighbors: `links` (concepts it points to) and
    `linked_by` (concepts that point to it). Use this to see how a file connects.
    """
    graph, _ = _bundle()
    if id not in {n["id"] for n in graph["nodes"]}:
        return {"id": id, "error": "unknown concept", "links": [], "linked_by": []}
    result = _neighbors(graph["edges"], id)
    result["id"] = id
    return result


@mcp.tool()
def traverse(start: str, hops: int = 2) -> dict:
    """Walk the graph from a concept, following links up to `hops` (default 2), and
    return the CONNECTED set of concepts — OKF's connected-context retrieval, the
    thing plain top-k search can't do.

    Returns the visited concepts (id, type, brief) and the edges among them, so you
    can see and follow the exact path. Great for "what does X touch?" questions.
    """
    graph, adjacency = _bundle()
    ids = {n["id"] for n in graph["nodes"]}
    if start not in ids:
        return {"start": start, "error": "unknown concept", "visited": [], "edges": []}

    visited = _traverse([start], adjacency, max_hops=max(0, hops))
    visited_set = set(visited)
    briefs = []
    by_id = {n["id"]: n for n in graph["nodes"]}
    for cid in visited:
        node = by_id.get(cid, {})
        briefs.append({
            "id": cid,
            "type": node.get("type", "concept"),
            "brief": node.get("description") or concept_brief(_read_concept(BUNDLE_DIR, cid) or ""),
        })
    edges = [[e["source"], e["target"]] for e in graph["edges"]
             if e["source"] in visited_set and e["target"] in visited_set]
    return {"start": start, "hops": hops, "visited": briefs, "edges": edges}


@mcp.tool()
def find_path(source: str, target: str) -> dict:
    """Find a shortest link-path between two concepts. Returns the ordered list of
    concept ids to hop through, or an empty path if they aren't connected. Answers
    "how does X relate to Y?" directly from the graph.
    """
    graph, adjacency = _bundle()
    ids = {n["id"] for n in graph["nodes"]}
    if source not in ids or target not in ids:
        return {"source": source, "target": target, "path": [], "error": "unknown concept"}
    path = _find_path(adjacency, source, target)
    return {"source": source, "target": target, "path": path or [], "connected": path is not None}


if __name__ == "__main__":
    mcp.run()
