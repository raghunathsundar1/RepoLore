"""Deterministic repo scanner: one .py file = one concept, links resolved via ast.

No LLM calls in this module. See CLAUDE.md: structure is deterministic, prose is LLM.
"""
import ast
import json
import os
import sys
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

IGNORED_DIRS = {
    ".git", "__pycache__", ".venv", "venv", "env", "node_modules",
    ".mypy_cache", ".pytest_cache", "build", "dist", ".tox",
}

# index.md and log.md are reserved bundle files (see CLAUDE.md): never a concept, never a link target.
RESERVED_IDS = {"index", "log"}


@dataclass
class Concept:
    id: str
    path: str
    type: str
    links: List[str] = field(default_factory=list)


def _iter_python_files(repo_root: str):
    for dirpath, dirnames, filenames in os.walk(repo_root):
        dirnames[:] = [d for d in dirnames if d not in IGNORED_DIRS and not d.startswith(".")]
        for filename in filenames:
            if filename.endswith(".py"):
                full = os.path.join(dirpath, filename)
                rel = os.path.relpath(full, repo_root).replace(os.sep, "/")
                yield rel


def _concept_id(rel_path: str) -> str:
    if rel_path.endswith("/__init__.py"):
        return rel_path[: -len("/__init__.py")]
    if rel_path == "__init__.py":
        return "__init__"
    return rel_path[: -len(".py")]


def _dotted_name(rel_path: str) -> str:
    concept_id = _concept_id(rel_path)
    return concept_id.replace("/", ".")


def _classify_type(rel_path: str) -> str:
    filename = rel_path.rsplit("/", 1)[-1]
    if filename == "__init__.py":
        return "package"
    parts = rel_path.split("/")
    if any(p == "tests" or p == "test" for p in parts[:-1]) or filename.startswith("test_") or filename.endswith("_test.py"):
        return "test"
    return "module"


def _current_package_parts(rel_path: str) -> List[str]:
    dirname = rel_path.rsplit("/", 1)[0] if "/" in rel_path else ""
    return [p for p in dirname.split("/") if p]


def _resolve_import_from(node: ast.ImportFrom, rel_path: str, module_map: Dict[str, str], self_id: str) -> List[str]:
    package_parts = _current_package_parts(rel_path)
    if node.level == 0:
        base_parts = node.module.split(".") if node.module else []
    else:
        up = node.level - 1
        base_parts = package_parts[: len(package_parts) - up] if up else package_parts
        if node.module:
            base_parts = base_parts + node.module.split(".")

    links: List[str] = []
    base_dotted = ".".join(base_parts)
    if base_dotted and base_dotted in module_map:
        links.append(module_map[base_dotted])

    for alias in node.names:
        if alias.name == "*":
            continue
        candidate_parts = base_parts + [alias.name]
        candidate_dotted = ".".join(candidate_parts)
        if candidate_dotted in module_map:
            links.append(module_map[candidate_dotted])

    return [link for link in links if link != self_id]


def _resolve_import(node: ast.Import, module_map: Dict[str, str], self_id: str) -> List[str]:
    links = []
    for alias in node.names:
        if alias.name in module_map:
            links.append(module_map[alias.name])
    return [link for link in links if link != self_id]


def scan_repo(repo_root: str) -> List[Concept]:
    rel_paths = sorted(_iter_python_files(repo_root))

    module_map: Dict[str, str] = {}
    for rel_path in rel_paths:
        concept_id = _concept_id(rel_path)
        if concept_id in RESERVED_IDS:
            continue
        module_map[_dotted_name(rel_path)] = concept_id

    concepts: List[Concept] = []
    for rel_path in rel_paths:
        concept_id = _concept_id(rel_path)
        if concept_id in RESERVED_IDS:
            continue
        full_path = os.path.join(repo_root, rel_path.replace("/", os.sep))
        try:
            with open(full_path, "r", encoding="utf-8", errors="replace") as f:
                source = f.read()
            tree = ast.parse(source, filename=rel_path)
        except (SyntaxError, OSError):
            concepts.append(Concept(id=concept_id, path=rel_path, type=_classify_type(rel_path), links=[]))
            continue

        links: set = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                links.update(_resolve_import(node, module_map, concept_id))
            elif isinstance(node, ast.ImportFrom):
                links.update(_resolve_import_from(node, rel_path, module_map, concept_id))

        concepts.append(Concept(
            id=concept_id,
            path=rel_path,
            type=_classify_type(rel_path),
            links=sorted(links),
        ))

    return concepts


def main():
    if len(sys.argv) != 2:
        print("usage: python okf_scanner.py <repo>", file=sys.stderr)
        sys.exit(1)

    concepts = scan_repo(sys.argv[1])
    payload = [
        {"id": c.id, "path": c.path, "type": c.type, "links": c.links}
        for c in concepts
    ]
    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()
