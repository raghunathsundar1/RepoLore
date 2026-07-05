"""OKF consumer: a LangGraph agent that answers questions about a generated bundle
by traversing its graph LINKS (connected context), not flat top-k retrieval.

The pipeline: entry (list concepts) -> plan (LLM picks seeds) -> traverse (follow
links, bounded hops) -> answer (LLM grounds on the assembled concepts + cites them).

The ONLY functions that call the model are plan_concepts() and answer_question();
everything else is deterministic, so the agent is testable with stubbed LLM steps.

Permissive per the OKF spec: missing files, unknown types, and broken links are
skipped, never fatal.
"""
import os
import re
from typing import Callable, Dict, List, Optional, TypedDict

from langgraph.graph import END, START, StateGraph

MAX_HOPS = 2          # bound traversal so context stays small
MAX_CONCEPTS = 12     # hard cap on assembled concepts
RESERVED = {"index", "log"}

# ------------------------- deterministic bundle access -------------------------


def read_concept(bundle_dir: str, concept_id: str) -> Optional[str]:
    """Return a concept's markdown, or None if it doesn't exist (broken link)."""
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


def concept_brief(markdown: str, limit: int = 160) -> str:
    """First prose sentence(s) of a concept, for the planner's catalog."""
    if not markdown:
        return ""
    body = markdown
    m = re.match(r"^---\n.*?\n---\n?(.*)$", markdown, re.DOTALL)
    if m:
        body = m.group(1)
    body = body.strip()
    if not body:
        return ""
    snippet = body.split("\n\n")[0].replace("\n", " ").strip()
    return snippet[:limit]


def build_adjacency(edges: List[dict]) -> Dict[str, set]:
    """Undirected adjacency from graph edges, so a link connects both ways."""
    adj: Dict[str, set] = {}
    for e in edges or []:
        s, t = e.get("source"), e.get("target")
        if not s or not t:
            continue
        adj.setdefault(s, set()).add(t)
        adj.setdefault(t, set()).add(s)
    return adj


def traverse(seeds: List[str], adjacency: Dict[str, set], max_hops: int = MAX_HOPS) -> List[str]:
    """BFS from the seed concepts over graph links, up to max_hops. Returns the
    connected set in visit order (seeds first)."""
    visited: List[str] = []
    seen: set = set()
    frontier = [(s, 0) for s in seeds if s]
    while frontier:
        node, depth = frontier.pop(0)
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


# ------------------------------- LLM steps (isolated) -------------------------------


def _default_model():
    from langchain_openai import ChatOpenAI

    return ChatOpenAI(model="gpt-4o-mini", temperature=0)


def plan_concepts(question: str, catalog: List[Dict], model_factory: Callable = _default_model) -> List[str]:
    """LLM step 1: choose the concept ids most relevant to the question (the seeds)."""
    from pydantic import BaseModel, Field

    class Plan(BaseModel):
        relevant_ids: List[str] = Field(description="Concept ids to start from, most relevant first.")

    listing = "\n".join(f"- {c['id']} ({c.get('type', 'concept')}): {c.get('brief', '')}" for c in catalog)
    prompt = (
        "You are routing a question to the right parts of a codebase knowledge base.\n"
        "Each concept below is one source file.\n\n"
        f"Concepts:\n{listing}\n\n"
        f"Question: {question}\n\n"
        "Return the ids of the 1-3 concepts most relevant as starting points. "
        "Use ids exactly as written above."
    )
    model = model_factory().with_structured_output(Plan)
    result = model.invoke(prompt)
    return list(result.relevant_ids)


def answer_question(question: str, concepts: List[Dict], model_factory: Callable = _default_model) -> Dict:
    """LLM step 2: answer using ONLY the assembled concepts, and cite which were used."""
    from pydantic import BaseModel, Field

    class Answer(BaseModel):
        answer: str = Field(description="Answer grounded only in the provided concepts.")
        cited_ids: List[str] = Field(default_factory=list, description="Ids of concepts actually used.")

    context = "\n\n".join(f"### CONCEPT: {c['id']}\n{c['text']}" for c in concepts)
    prompt = (
        "Answer the question using ONLY the concepts below. If they don't contain the "
        "answer, say so plainly. Cite the ids of every concept you used.\n\n"
        f"{context}\n\n"
        f"Question: {question}"
    )
    model = model_factory().with_structured_output(Answer)
    result = model.invoke(prompt)
    return {"answer": result.answer, "cited_ids": list(result.cited_ids)}


# ------------------------------- the LangGraph agent -------------------------------


class AskState(TypedDict, total=False):
    question: str
    bundle_dir: str
    nodes: List[dict]
    edges: List[dict]
    catalog: List[dict]
    planned_ids: List[str]
    visited_ids: List[str]
    concept_texts: List[dict]
    answer: str
    cited_ids: List[str]


def build_agent(plan_fn: Callable = plan_concepts, answer_fn: Callable = answer_question):
    """Compile the consumer agent. plan_fn/answer_fn are injectable for testing."""

    def entry(state: AskState) -> dict:
        catalog = []
        for node in state.get("nodes", []):
            cid = node.get("id")
            if not cid or cid in RESERVED:
                continue
            brief = concept_brief(read_concept(state["bundle_dir"], cid) or "")
            catalog.append({"id": cid, "type": node.get("type", "concept"), "brief": brief})
        return {"catalog": catalog}

    def plan(state: AskState) -> dict:
        catalog = state.get("catalog", [])
        valid = {c["id"] for c in catalog}
        try:
            proposed = plan_fn(state["question"], catalog)
        except Exception:
            proposed = []
        planned = [i for i in proposed if i in valid]
        if not planned and catalog:  # permissive fallback: never come back empty
            planned = [catalog[0]["id"]]
        return {"planned_ids": planned}

    def traverse_node(state: AskState) -> dict:
        adjacency = build_adjacency(state.get("edges", []))
        visited = traverse(state.get("planned_ids", []), adjacency)[:MAX_CONCEPTS]
        texts = []
        for cid in visited:
            md = read_concept(state["bundle_dir"], cid)
            if md:  # skip broken links / missing files, keep going
                texts.append({"id": cid, "text": md})
        return {"visited_ids": visited, "concept_texts": texts}

    def answer(state: AskState) -> dict:
        texts = state.get("concept_texts", [])
        if not texts:
            return {"answer": "I couldn't find any concepts related to that question.", "cited_ids": []}
        try:
            result = answer_fn(state["question"], texts)
        except Exception as exc:
            return {"answer": f"Failed to generate an answer: {exc}", "cited_ids": []}
        visited = set(state.get("visited_ids", []))
        cited = [c for c in result.get("cited_ids", []) if c in visited]
        return {"answer": result.get("answer", ""), "cited_ids": cited}

    graph = StateGraph(AskState)
    graph.add_node("entry", entry)
    graph.add_node("plan", plan)
    graph.add_node("traverse", traverse_node)
    graph.add_node("answer", answer)
    graph.add_edge(START, "entry")
    graph.add_edge("entry", "plan")
    graph.add_edge("plan", "traverse")
    graph.add_edge("traverse", "answer")
    graph.add_edge("answer", END)
    return graph.compile()


def answer_from_bundle(
    question: str,
    bundle_dir: str,
    nodes: List[dict],
    edges: List[dict],
    plan_fn: Optional[Callable] = None,
    answer_fn: Optional[Callable] = None,
) -> Dict:
    """Run the consumer agent over an existing bundle. Returns the API payload.

    plan_fn/answer_fn default to the module-level LLM steps, resolved at call time
    so they can be monkeypatched in tests."""
    agent = build_agent(
        plan_fn=plan_fn or plan_concepts,
        answer_fn=answer_fn or answer_question,
    )
    final = agent.invoke({
        "question": question,
        "bundle_dir": bundle_dir,
        "nodes": nodes or [],
        "edges": edges or [],
    })
    return {
        "answer": final.get("answer", ""),
        "visited_concept_ids": final.get("visited_ids", []),
        "cited_concept_ids": final.get("cited_ids", []),
    }
