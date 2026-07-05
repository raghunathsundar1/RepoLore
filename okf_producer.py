"""LLM prose generation + OKF bundle writing.

draft_concept() is the ONLY function that calls the model (see CLAUDE.md). Everything
else here is deterministic and testable by injecting a stub draft_fn.
"""
import os
import re
import sys
from datetime import datetime, timezone
from typing import Callable, List, Optional

from okf_scanner import Concept, scan_repo

_FENCE_LINE_RE = re.compile(r"^```[a-zA-Z0-9_+-]*\s*$")


def _load_dotenv(path: str = ".env") -> None:
    """Load KEY=VALUE pairs from a .env file into os.environ, without overriding
    variables the shell environment already set. Hand-rolled to avoid a new
    dependency for parsing a handful of lines (see CLAUDE.md: lean project)."""
    if not os.path.exists(path):
        return
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            os.environ.setdefault(key, value)


_load_dotenv()


def strip_code_fences(text: str) -> str:
    """Strip a stray leading/trailing triple-backtick fence line, if present."""
    lines = text.strip("\n").splitlines()
    if lines and _FENCE_LINE_RE.match(lines[0].strip()):
        lines = lines[1:]
    if lines and lines[-1].strip() == "```":
        lines = lines[:-1]
    return "\n".join(lines).strip()


def draft_concept(concept: Concept, source: str) -> str:
    """Call the LLM to draft prose explaining a single concept file."""
    from langchain_openai import ChatOpenAI

    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)
    prompt = (
        "You are documenting a codebase one file at a time for a knowledge base.\n"
        f"File path: {concept.path}\n"
        f"Concept id: {concept.id}\n"
        f"Type: {concept.type}\n\n"
        "Source:\n"
        "```python\n"
        f"{source}\n"
        "```\n\n"
        "Write a concise 2-4 short paragraph explanation of what this file does, "
        "its role in the codebase, and why it matters. Do not mention or invent "
        "links to other files or modules - links are handled separately. Do not "
        "include a title heading, frontmatter, or code fences - prose only."
    )
    response = llm.invoke(prompt)
    return response.content


def _render_frontmatter(concept: Concept) -> str:
    lines = ["---", f"type: {concept.type}", f"id: {concept.id}", f"path: {concept.path}"]
    if concept.links:
        lines.append("links:")
        lines.extend(f"  - {link}" for link in concept.links)
    else:
        lines.append("links: []")
    lines.append("---")
    return "\n".join(lines)


def _write_index(out_dir: str, concepts: List[Concept]) -> None:
    lines = ["# Index", ""]
    for concept in sorted(concepts, key=lambda c: c.id):
        lines.append(f"- [{concept.id}]({concept.id}.md) ({concept.type})")
    with open(os.path.join(out_dir, "index.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


def _write_log(out_dir: str, concepts: List[Concept]) -> None:
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    log_path = os.path.join(out_dir, "log.md")
    is_new = not os.path.exists(log_path)
    with open(log_path, "a", encoding="utf-8") as f:
        if is_new:
            f.write("# Log\n\n")
        f.write(f"- {timestamp} generated {len(concepts)} concept(s)\n")


def build_bundle(
    repo_root: str,
    out_dir: str,
    concepts: Optional[List[Concept]] = None,
    draft_fn: Callable[[Concept, str], str] = draft_concept,
    on_progress: Optional[Callable[[int, int], None]] = None,
) -> List[Concept]:
    if concepts is None:
        concepts = scan_repo(repo_root)

    os.makedirs(out_dir, exist_ok=True)
    total = len(concepts)
    for i, concept in enumerate(concepts):
        source_path = os.path.join(repo_root, concept.path.replace("/", os.sep))
        with open(source_path, "r", encoding="utf-8", errors="replace") as f:
            source = f.read()

        prose = strip_code_fences(draft_fn(concept, source))
        frontmatter = _render_frontmatter(concept)

        concept_path = os.path.join(out_dir, *concept.id.split("/")) + ".md"
        os.makedirs(os.path.dirname(concept_path) or out_dir, exist_ok=True)
        with open(concept_path, "w", encoding="utf-8") as f:
            f.write(frontmatter + "\n\n" + prose + "\n")

        if on_progress is not None:
            on_progress(i + 1, total)

    _write_index(out_dir, concepts)
    _write_log(out_dir, concepts)
    return concepts


def main():
    if len(sys.argv) != 3:
        print("usage: python okf_producer.py <repo> <out-bundle>", file=sys.stderr)
        sys.exit(1)

    repo, out_dir = sys.argv[1], sys.argv[2]
    concepts = build_bundle(repo, out_dir)
    print(f"wrote {len(concepts)} concept(s) to {out_dir}")


if __name__ == "__main__":
    main()
