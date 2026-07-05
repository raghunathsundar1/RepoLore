"""Deterministic repo scanner: one source file = one concept, links resolved from
real imports. Pluggable per language — Python uses the stdlib `ast`; JavaScript and
TypeScript use tree-sitter. No LLM calls (see CLAUDE.md: structure is deterministic).

Adding a language means adding a resolver: pick which files it owns, how a file maps
to a concept id, and how to turn its imports into links to other files in the repo.
The rest of the pipeline is unchanged.
"""
import ast
import json
import os
import posixpath
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set

IGNORED_DIRS = {
    ".git", "__pycache__", ".venv", "venv", "env", "node_modules",
    ".mypy_cache", ".pytest_cache", "build", "dist", ".tox", "coverage",
}

# index.md and log.md are reserved bundle files (see CLAUDE.md): never a concept, never a link target.
RESERVED_IDS = {"index", "log"}


@dataclass
class Concept:
    id: str
    path: str
    type: str
    links: List[str] = field(default_factory=list)
    language: str = ""


# ------------------------------- shared helpers -------------------------------


def _iter_files(repo_root: str, extensions: tuple):
    for dirpath, dirnames, filenames in os.walk(repo_root):
        dirnames[:] = [d for d in dirnames if d not in IGNORED_DIRS and not d.startswith(".")]
        for filename in filenames:
            if filename.endswith(extensions):
                full = os.path.join(dirpath, filename)
                yield os.path.relpath(full, repo_root).replace(os.sep, "/")


def _read(repo_root: str, rel: str) -> Optional[str]:
    try:
        with open(os.path.join(repo_root, rel.replace("/", os.sep)), "r", encoding="utf-8", errors="replace") as f:
            return f.read()
    except OSError:
        return None


def _is_test_path(rel: str, extra_dirs=()) -> bool:
    parts = rel.split("/")
    return any(p in ("tests", "test") or p in extra_dirs for p in parts[:-1])


# ------------------------------- Python (ast) -------------------------------


class PythonResolver:
    extensions = (".py",)

    def concept_id(self, rel: str) -> str:
        if rel.endswith("/__init__.py"):
            return rel[: -len("/__init__.py")]
        if rel == "__init__.py":
            return "__init__"
        return rel[: -len(".py")]

    def language_of(self, rel: str) -> str:
        return "python"

    def classify_type(self, rel: str) -> str:
        filename = rel.rsplit("/", 1)[-1]
        if filename == "__init__.py":
            return "package"
        if _is_test_path(rel) or filename.startswith("test_") or filename.endswith("_test.py"):
            return "test"
        return "module"

    def build_index(self, rels: List[str]) -> Dict[str, str]:
        # dotted module name -> concept id
        return {self.concept_id(rel).replace("/", "."): self.concept_id(rel) for rel in rels}

    def extract_links(self, rel: str, source: str, module_map: Dict[str, str]) -> Set[str]:
        try:
            tree = ast.parse(source, filename=rel)
        except SyntaxError:
            return set()
        links: Set[str] = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    if alias.name in module_map:
                        links.add(module_map[alias.name])
            elif isinstance(node, ast.ImportFrom):
                links.update(self._resolve_from(node, rel, module_map))
        return links

    def _resolve_from(self, node: ast.ImportFrom, rel: str, module_map: Dict[str, str]) -> List[str]:
        dirname = rel.rsplit("/", 1)[0] if "/" in rel else ""
        package_parts = [p for p in dirname.split("/") if p]
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
            candidate = ".".join(base_parts + [alias.name])
            if candidate in module_map:
                links.append(module_map[candidate])
        return links


# --------------------------- JavaScript / TypeScript ---------------------------

# Order matters when a bare specifier could resolve to more than one file.
_JS_PROBE = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"]
_TS_EXT = (".ts", ".mts", ".cts")
_PARSERS: dict = {}


def _js_parser(kind: str):
    """Lazily build and cache a tree-sitter parser (kind: js | ts | tsx)."""
    if not _PARSERS:
        from tree_sitter import Language, Parser
        import tree_sitter_javascript as tsjs
        import tree_sitter_typescript as tsts

        langs = {
            "js": Language(tsjs.language()),
            "ts": Language(tsts.language_typescript()),
            "tsx": Language(tsts.language_tsx()),
        }
        for name, lang in langs.items():
            _PARSERS[name] = Parser(lang)
    return _PARSERS[kind]


class JsResolver:
    extensions = (".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts")

    def concept_id(self, rel: str) -> str:
        return rel[: rel.rfind(".")]

    def language_of(self, rel: str) -> str:
        return "typescript" if rel.endswith(_TS_EXT + (".tsx",)) else "javascript"

    def classify_type(self, rel: str) -> str:
        filename = rel.rsplit("/", 1)[-1].lower()
        if _is_test_path(rel, extra_dirs=("__tests__",)) or ".test." in filename or ".spec." in filename:
            return "test"
        if filename.rsplit(".", 1)[0] == "index":
            return "package"
        return "module"

    def build_index(self, rels: List[str]) -> Set[str]:
        return set(rels)

    def extract_links(self, rel: str, source: str, files: Set[str]) -> Set[str]:
        parser = _js_parser(self._kind(rel))
        blob = source.encode("utf-8")
        tree = parser.parse(blob)
        base_dir = posixpath.dirname(rel)

        links: Set[str] = set()
        for spec in self._specifiers(tree.root_node, blob):
            if not spec.startswith("."):  # bare specifier = external (node_modules); skip
                continue
            target = self._resolve(base_dir, spec, files)
            if target:
                links.add(self.concept_id(target))
        return links

    def _kind(self, rel: str) -> str:
        if rel.endswith(".tsx"):
            return "tsx"
        if rel.endswith(_TS_EXT):
            return "ts"
        return "js"

    def _specifiers(self, root, blob: bytes) -> List[str]:
        out: List[str] = []
        stack = [root]
        while stack:
            node = stack.pop()
            if node.type in ("import_statement", "export_statement"):
                for child in node.children:
                    if child.type == "string":
                        out.append(self._text(blob, child))
                        break
            elif node.type == "call_expression":
                fn = node.child_by_field_name("function")
                if fn is not None and blob[fn.start_byte:fn.end_byte].decode("utf-8", "replace") in ("require", "import"):
                    args = node.child_by_field_name("arguments")
                    if args is not None:
                        for child in args.children:
                            if child.type == "string":
                                out.append(self._text(blob, child))
                                break
            stack.extend(node.children)
        return out

    @staticmethod
    def _text(blob: bytes, node) -> str:
        return blob[node.start_byte:node.end_byte].decode("utf-8", "replace").strip().strip("'\"`")

    def _resolve(self, base_dir: str, spec: str, files: Set[str]) -> Optional[str]:
        raw = posixpath.normpath(posixpath.join(base_dir, spec) if base_dir else spec)
        candidates = [raw]                                   # explicit extension, e.g. './x.js'
        candidates += [raw + ext for ext in _JS_PROBE]       # './x' -> x.ts/x.js/...
        candidates += [raw + "/index" + ext for ext in _JS_PROBE]  # './dir' -> dir/index.*
        for candidate in candidates:
            if candidate in files:
                return candidate
        return None


RESOLVERS = [PythonResolver(), JsResolver()]
_ALL_EXTENSIONS = tuple(ext for resolver in RESOLVERS for ext in resolver.extensions)


def _resolver_for(rel: str):
    for resolver in RESOLVERS:
        if rel.endswith(resolver.extensions):
            return resolver
    return None


def scan_repo(repo_root: str) -> List[Concept]:
    # Collect every supported source file with the resolver that owns it.
    entries = []  # (rel, resolver, concept_id)
    for rel in _iter_files(repo_root, _ALL_EXTENSIONS):
        resolver = _resolver_for(rel)
        if resolver is None:
            continue
        concept_id = resolver.concept_id(rel)
        if concept_id in RESERVED_IDS:
            continue
        entries.append((rel, resolver, concept_id))
    entries.sort(key=lambda e: e[0])

    all_ids = {concept_id for _, _, concept_id in entries}

    # Build each language's link index over its own files.
    files_by_resolver = defaultdict(list)
    for rel, resolver, _ in entries:
        files_by_resolver[id(resolver)].append(rel)
    indexes = {id(r): r.build_index(files_by_resolver[id(r)]) for r in RESOLVERS if id(r) in files_by_resolver}

    concepts: List[Concept] = []
    for rel, resolver, concept_id in entries:
        source = _read(repo_root, rel)
        links: Set[str] = set()
        if source is not None:
            try:
                links = resolver.extract_links(rel, source, indexes[id(resolver)])
            except Exception:
                links = set()  # never let one unparseable file break the scan
        links = {l for l in links if l in all_ids and l != concept_id and l not in RESERVED_IDS}
        concepts.append(Concept(
            id=concept_id,
            path=rel,
            type=resolver.classify_type(rel),
            links=sorted(links),
            language=resolver.language_of(rel),
        ))
    return concepts


def main():
    if len(sys.argv) != 2:
        print("usage: python okf_scanner.py <repo>", file=sys.stderr)
        sys.exit(1)

    concepts = scan_repo(sys.argv[1])
    payload = [
        {"id": c.id, "path": c.path, "type": c.type, "language": c.language, "links": c.links}
        for c in concepts
    ]
    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()
