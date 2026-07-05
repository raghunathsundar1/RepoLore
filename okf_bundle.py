"""Read an OKF bundle from disk and query its graph — deterministic, no LLM.

A bundle is a directory of concept markdown files (see OKF v0.1): concept id = file
path minus `.md`, `type` in frontmatter, and inter-concept relationships expressed as
standard markdown links in the body. This module parses those into `{nodes, edges}`
and offers the graph operations an agent needs: list, neighbors, connected traversal,
and shortest path. Works on any OKF bundle, not just RepoLore's own.

Permissive per the OKF spec: unknown/missing fields and broken links are tolerated.
"""
import os
import posixpath
import re
from collections import deque
from typing import Dict, List, Optional, Set

RESERVED = {"index", "log"}

# Any markdown link whose href resolves to a concept .md file is a relationship.
_LINK_RE = re.compile(r"\[[^\]]*\]\(([^)\s]+)\)")
_FM_RE = re.compile(r"^---\n(.*?)\n---\n?(.*)$", re.DOTALL)


# ------------------------------- low-level access -------------------------------


def read_concept(bundle_dir: str, concept_id: str) -> Optional[str]:
    """Return a concept's raw markdown, or None if missing (a broken link)."""
    if not concept_id or concept_id in RESERVED:
        return None
    path = os.path.join(bundle_dir, *concept_id.split("/")) + ".md"
    if not os.path.isfile(path):
        return None
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            return f.read()
    except OSError:
        return None


def split_frontmatter(markdown: str):
    """Return (frontmatter_text, body). Empty frontmatter if none present."""
    m = _FM_RE.match(markdown or "")
    if m:
        return m.group(1), m.group(2).strip()
    return "", (markdown or "").strip()


def _frontmatter_value(frontmatter: str, key: str) -> str:
    # Minimal, dependency-free: read a top-level `key: value` scalar.
    m = re.search(rf"^{re.escape(key)}:\s*(.+)$", frontmatter, re.MULTILINE)
    if not m:
        return ""
    return m.group(1).strip().strip('"').strip("'")


def concept_brief(markdown: str, limit: int = 160) -> str:
    """First prose sentence/paragraph of a concept (skips frontmatter and any
    trailing markdown-link sections)."""
    _, body = split_frontmatter(markdown or "")
    if not body:
        return ""
    first = body.split("\n\n")[0].replace("\n", " ").strip()
    return first[:limit]


def _resolve_href(href: str, concept_id: str) -> Optional[str]:
    """Resolve a markdown link href to a concept id, or None if it isn't a .md link.
    Handles absolute bundle-relative (/x.md) and relative (./x.md, ../x.md)."""
    href = href.split("#")[0].split("?")[0].strip()
    if not href.endswith(".md"):
        return None
    path = href[:-3]
    if path.startswith("/"):
        return path[1:]
    base = posixpath.dirname(concept_id)
    return posixpath.normpath(posixpath.join(base, path)) if base else posixpath.normpath(path)


# ------------------------------- load & graph ops -------------------------------


def load_bundle(bundle_dir: str) -> Dict[str, list]:
    """Parse a bundle directory into {nodes, edges}. Nodes carry id/type/title/
    description from frontmatter; edges come from body markdown links."""
    ids: List[str] = []
    for dirpath, dirnames, filenames in os.walk(bundle_dir):
        dirnames[:] = [d for d in dirnames if not d.startswith(".")]
        for filename in filenames:
            if not filename.endswith(".md"):
                continue
            rel = os.path.relpath(os.path.join(dirpath, filename), bundle_dir).replace(os.sep, "/")
            concept_id = rel[:-3]
            if concept_id not in RESERVED:
                ids.append(concept_id)

    valid: Set[str] = set(ids)
    nodes: List[dict] = []
    edges: List[dict] = []
    seen_edges: Set[tuple] = set()

    for concept_id in sorted(ids):
        markdown = read_concept(bundle_dir, concept_id) or ""
        frontmatter, body = split_frontmatter(markdown)
        nodes.append({
            "id": concept_id,
            "type": _frontmatter_value(frontmatter, "type") or "concept",
            "title": _frontmatter_value(frontmatter, "title") or concept_id,
            "description": _frontmatter_value(frontmatter, "description"),
        })
        for href in _LINK_RE.findall(body):
            target = _resolve_href(href, concept_id)
            if target and target in valid and target != concept_id and (concept_id, target) not in seen_edges:
                seen_edges.add((concept_id, target))
                edges.append({"source": concept_id, "target": target})

    return {"nodes": nodes, "edges": edges}


def build_adjacency(edges: List[dict]) -> Dict[str, set]:
    """Undirected adjacency, so a link connects both ways."""
    adj: Dict[str, set] = {}
    for edge in edges or []:
        s, t = edge.get("source"), edge.get("target")
        if not s or not t:
            continue
        adj.setdefault(s, set()).add(t)
        adj.setdefault(t, set()).add(s)
    return adj


def traverse(seeds: List[str], adjacency: Dict[str, set], max_hops: int = 2) -> List[str]:
    """BFS from the seeds over graph links up to max_hops, in visit order."""
    visited: List[str] = []
    seen: Set[str] = set()
    frontier = deque((s, 0) for s in seeds if s)
    while frontier:
        node, depth = frontier.popleft()
        if node in seen:
            continue
        seen.add(node)
        visited.append(node)
        if depth >= max_hops:
            continue
        for neighbor in sorted(adjacency.get(node, ())):
            if neighbor not in seen:
                frontier.append((neighbor, depth + 1))
    return visited


def find_path(adjacency: Dict[str, set], source: str, target: str) -> Optional[List[str]]:
    """Shortest link-path between two concepts (BFS), or None if unconnected."""
    if source == target:
        return [source]
    prev = {source: None}
    queue = deque([source])
    while queue:
        node = queue.popleft()
        for neighbor in sorted(adjacency.get(node, ())):
            if neighbor in prev:
                continue
            prev[neighbor] = node
            if neighbor == target:
                path = [neighbor]
                while prev[path[-1]] is not None:
                    path.append(prev[path[-1]])
                return list(reversed(path))
            queue.append(neighbor)
    return None


def neighbors(edges: List[dict], concept_id: str) -> Dict[str, list]:
    """Directed neighbors: what this concept links to, and what links back to it."""
    links = sorted({e["target"] for e in edges if e.get("source") == concept_id})
    linked_by = sorted({e["source"] for e in edges if e.get("target") == concept_id})
    return {"links": links, "linked_by": linked_by}
