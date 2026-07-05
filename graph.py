"""Reshapes scanner output into {nodes, edges} JSON. No LLM calls here."""
import json
import sys
from typing import Dict, List

from okf_scanner import Concept, scan_repo


def build_graph(concepts: List[Concept]) -> Dict[str, list]:
    nodes = [{"id": c.id, "path": c.path, "type": c.type, "language": c.language} for c in concepts]
    edges = [
        {"source": c.id, "target": target}
        for c in concepts
        for target in c.links
    ]
    return {"nodes": nodes, "edges": edges}


def main():
    if len(sys.argv) != 2:
        print("usage: python graph.py <repo>", file=sys.stderr)
        sys.exit(1)

    concepts = scan_repo(sys.argv[1])
    print(json.dumps(build_graph(concepts), indent=2))


if __name__ == "__main__":
    main()
