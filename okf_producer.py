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


def _first_sentence(prose: str, limit: int = 200) -> str:
    """Derive a one-sentence `description` from the drafted prose (OKF recommended)."""
    text = (prose or "").strip().replace("\n", " ")
    if not text:
        return ""
    match = re.search(r"(.+?[.!?])(\s|$)", text)
    sentence = match.group(1) if match else text
    return sentence[:limit].strip()


def _yaml_scalar(value: str) -> str:
    """Double-quote a YAML scalar so colons/quotes in a description stay valid."""
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def _render_frontmatter(concept: Concept, description: str, timestamp: str) -> str:
    # OKF v0.1: `type` is the only required key; title/description/resource/tags/
    # timestamp are the recommended optional keys. Identity is the file path.
    lines = [
        "---",
        f"type: {concept.type}",
        f"title: {concept.id}",
    ]
    if description:
        lines.append(f"description: {_yaml_scalar(description)}")
    lines.append(f"resource: {concept.path}")
    lines.append("tags:")
    lines.append("  - python")
    lines.append(f"  - {concept.type}")
    lines.append(f"timestamp: {timestamp}")
    lines.append("---")
    return "\n".join(lines)


def _render_links_section(concept: Concept) -> str:
    """Inter-concept links as standard markdown links in the body (OKF canonical form),
    using absolute bundle-relative URLs like [pkg/utils](/pkg/utils.md)."""
    if not concept.links:
        return ""
    lines = ["## Related concepts", ""]
    lines.extend(f"- [{link}](/{link}.md)" for link in concept.links)
    return "\n".join(lines)


def _write_index(out_dir: str, entries: List[tuple]) -> None:
    # OKF index.md: no frontmatter; `* [Title](url) - short description` lines.
    lines = ["# Index", ""]
    for concept_id, description in sorted(entries):
        line = f"* [{concept_id}](/{concept_id}.md)"
        if description:
            line += f" - {description}"
        lines.append(line)
    with open(os.path.join(out_dir, "index.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


def _write_log(out_dir: str, concepts: List[Concept], date: str) -> None:
    # OKF log.md: date-grouped entries, newest first, entries begin with a bold category.
    lines = [
        "# Log",
        "",
        f"## {date}",
        "",
        f"- **Creation** Generated {len(concepts)} concept(s) from the repository.",
        "",
    ]
    with open(os.path.join(out_dir, "log.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


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
    now = datetime.now(timezone.utc)
    timestamp = now.strftime("%Y-%m-%dT%H:%M:%SZ")
    date = now.strftime("%Y-%m-%d")

    total = len(concepts)
    index_entries: List[tuple] = []
    for i, concept in enumerate(concepts):
        source_path = os.path.join(repo_root, concept.path.replace("/", os.sep))
        with open(source_path, "r", encoding="utf-8", errors="replace") as f:
            source = f.read()

        prose = strip_code_fences(draft_fn(concept, source))
        description = _first_sentence(prose)
        frontmatter = _render_frontmatter(concept, description, timestamp)
        links_section = _render_links_section(concept)

        parts = [frontmatter, prose]
        if links_section:
            parts.append(links_section)
        content = "\n\n".join(parts) + "\n"

        concept_path = os.path.join(out_dir, *concept.id.split("/")) + ".md"
        os.makedirs(os.path.dirname(concept_path) or out_dir, exist_ok=True)
        with open(concept_path, "w", encoding="utf-8") as f:
            f.write(content)

        index_entries.append((concept.id, description))
        if on_progress is not None:
            on_progress(i + 1, total)

    _write_index(out_dir, index_entries)
    _write_log(out_dir, concepts, date)
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
