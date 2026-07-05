/* RepoLore frontend — source. Compiled to app.js (classic React runtime).
   Talks to the FastAPI backend: POST /generate, poll /jobs/{id},
   GET /jobs/{id}/graph, GET /jobs/{id}/concept?id=..., GET /jobs/{id}/download.
   Globals expected: React, ReactDOM. No external graph library. */
const { useState, useEffect, useRef, useMemo, useCallback } = React;
const ACCENT = "#6d5efc";

/* --------------------------- Small primitives --------------------------- */

function Reveal({ as: Tag = "div", className = "", children, ...rest }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) { el.classList.add("is-in"); io.unobserve(el); }
        });
      },
      { threshold: 0.12 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <Tag ref={ref} className={"reveal " + className} {...rest}>{children}</Tag>;
}

function Wordmark({ className = "" }) {
  return (
    <span className={"font-medium tracking-tight text-ink " + className}>
      Repo<span className="text-muted">Lore</span>
    </span>
  );
}

/* ------------------------------- Top bar ------------------------------- */

function TopBar() {
  return (
    <header className="fixed top-0 inset-x-0 z-30 backdrop-blur-md bg-base/60 border-b border-white/[0.06]">
      <div className="mx-auto max-w-content px-5 sm:px-8 h-14 flex items-center justify-between">
        <a href="#top" className="text-[15px]"><Wordmark /></a>
        <nav className="flex items-center gap-6 text-[13px] text-muted">
          <a href="#how" className="hover:text-ink transition-colors">How it works</a>
          <a href="#" className="hover:text-ink transition-colors">Docs</a>
          <a href="#" className="hover:text-ink transition-colors">GitHub</a>
        </nav>
      </div>
    </header>
  );
}

/* -------------------------- Repo input + CTA --------------------------- */

function RepoInput({ value, onChange, onSubmit, busy }) {
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current && inputRef.current.focus(); }, []);
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className="w-full max-w-xl mx-auto">
      <div className="focus-ring flex items-center gap-2 rounded-2xl border border-white/[0.09] bg-panel p-2 pl-4 transition-all">
        <span className="hidden sm:block text-faint font-mono text-sm select-none">↳</span>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          autoComplete="off"
          placeholder="https://github.com/owner/repo"
          className="flex-1 bg-transparent outline-none font-mono text-[14px] sm:text-[15px] text-ink placeholder:text-faint py-2"
        />
        <button
          type="submit"
          disabled={busy}
          className="shrink-0 rounded-xl bg-accent px-5 py-2.5 text-[14px] font-medium text-white transition-all hover:brightness-110 active:brightness-95 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {busy ? "Generating…" : "Generate"}
        </button>
      </div>
      <p className="mt-3 text-center text-[13px] text-muted">
        Paste any public GitHub repo. <span className="text-faint">Python supported today.</span>
      </p>
    </form>
  );
}

/* ------------------------------- Hero ---------------------------------- */

function Hero({ url, setUrl, onGenerate, busy }) {
  return (
    <section id="top" className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[-10%] h-[520px] w-[820px] -translate-x-1/2 rounded-full opacity-[0.16] blur-[120px]"
        style={{ background: "radial-gradient(circle, #6d5efc 0%, transparent 68%)" }}
      />
      <div className="relative mx-auto max-w-content px-5 sm:px-8 pt-36 sm:pt-44 pb-20 text-center">
        <Reveal>
          <p className="font-mono text-[12px] tracking-[0.22em] text-faint uppercase">Open Knowledge Format</p>
          <h1 className="mt-6 mx-auto max-w-3xl font-medium tracking-tight leading-[1.04] text-ink"
              style={{ fontSize: "clamp(2.6rem, 6.2vw, 4.5rem)" }}>
            Turn any codebase into a<br className="hidden sm:block" />{" "}
            <span className="grad-accent">knowledge graph</span>.
          </h1>
          <p className="mt-6 mx-auto max-w-xl text-[16px] sm:text-[17px] leading-relaxed text-muted">
            Paste a repo. RepoLore reads every source file and maps how its ideas
            connect — one concept per file, cross-linked from real imports.
          </p>
        </Reveal>
        <Reveal className="mt-10" style={{ transitionDelay: "80ms" }}>
          <RepoInput value={url} onChange={setUrl} onSubmit={onGenerate} busy={busy} />
        </Reveal>
      </div>
    </section>
  );
}

/* ---------------------- Scanning / progress state ---------------------- */

function ScanningState({ done, total }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="flex items-baseline justify-between font-mono text-[12px] text-muted">
          <span className="text-ink">{total ? "Drafting concepts" : "Cloning & scanning repository"}</span>
          <span>{total ? done + " / " + total : "…"}</span>
        </div>
        <div className="mt-3 h-[3px] w-full overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className={"h-full rounded-full bg-accent transition-[width] duration-300 ease-out " + (total ? "" : "w-1/3 pulse-soft")}
            style={total ? { width: pct + "%" } : undefined}
          />
        </div>
        <p className="mt-5 font-mono text-[12px] text-faint pulse-soft">
          {total ? "one concept per file — this calls the model once each" : "shallow-cloning the repository…"}
        </p>
      </div>
    </div>
  );
}

/* ----------------------- Force-directed graph -------------------------- */

/* Tiny self-contained force layout — no external graph library.
   Charge repulsion + spring links + centering, cooled by alpha. */
function runForce(nodes, links) {
  const N = nodes.length;
  nodes.forEach((n, i) => {
    const a = (i / N) * Math.PI * 2;
    n.x = Math.cos(a) * 160 + (Math.random() - 0.5) * 30;
    n.y = Math.sin(a) * 160 + (Math.random() - 0.5) * 30;
    n.vx = 0; n.vy = 0;
  });
  let alpha = 1;
  const REST = 74, K_LINK = 0.05, K_REP = 2600, K_CENTER = 0.012, DAMP = 0.82;
  function tick() {
    alpha = Math.max(0.004, alpha * 0.975);
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const a = nodes[i], b = nodes[j];
        let dx = a.x - b.x, dy = a.y - b.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) { d2 = 1; dx = Math.random() - 0.5; dy = Math.random() - 0.5; }
        const dist = Math.sqrt(d2);
        let rep = K_REP / d2; if (rep > 8) rep = 8;
        const fx = (dx / dist) * rep, fy = (dy / dist) * rep;
        a.vx += fx * alpha; a.vy += fy * alpha;
        b.vx -= fx * alpha; b.vy -= fy * alpha;
      }
    }
    links.forEach((l) => {
      const a = l.source, b = l.target;
      let dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const f = (dist - REST) * K_LINK;
      const fx = (dx / dist) * f, fy = (dy / dist) * f;
      a.vx += fx * alpha; a.vy += fy * alpha;
      b.vx -= fx * alpha; b.vy -= fy * alpha;
    });
    for (let i = 0; i < N; i++) {
      const n = nodes[i];
      n.vx += -n.x * K_CENTER * alpha; n.vy += -n.y * K_CENTER * alpha;
      n.vx *= DAMP; n.vy *= DAMP;
      n.x += n.vx; n.y += n.vy;
    }
  }
  return { tick, alpha: () => alpha, reheat: () => { alpha = 0.5; } };
}

function ForceGraph({ data, degree, pathIds, selectedId, onSelect }) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const selRef = useRef(selectedId);
  useEffect(() => { selRef.current = selectedId; }, [selectedId]);
  // The traversal path to light up — fed via a ref so it never re-inits the layout.
  const pathRef = useRef(pathIds);
  useEffect(() => { pathRef.current = pathIds || []; }, [pathIds]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const ctx = canvas.getContext("2d");

    const nodes = data.nodes.map((n) => ({ ...n, r: 5 + Math.min(9, (degree[n.id] || 0) * 1.05) }));
    if (!nodes.length) return;
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
    const links = data.links
      .filter((l) => byId[l.source] && byId[l.target])
      .map((l) => ({ source: byId[l.source], target: byId[l.target] }));
    const adj = {};
    nodes.forEach((n) => (adj[n.id] = new Set()));
    links.forEach((l) => { adj[l.source.id].add(l.target.id); adj[l.target.id].add(l.source.id); });

    const view = { tx: 0, ty: 0, k: 0.85 };
    const S = { hoverId: null, dragging: false, moved: 0, last: null, w: 0, h: 0, fitted: false, pathGlow: 0, pathKey: "" };
    const sim = runForce(nodes, links);

    function resize() {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      S.w = rect.width; S.h = rect.height;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      canvas.style.width = rect.width + "px";
      canvas.style.height = rect.height + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const toScreen = (n) => ({ x: S.w / 2 + view.tx + n.x * view.k, y: S.h / 2 + view.ty + n.y * view.k });
    const toWorld = (px, py) => ({ x: (px - S.w / 2 - view.tx) / view.k, y: (py - S.h / 2 - view.ty) / view.k });

    function fitView() {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      nodes.forEach((n) => {
        minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x);
        minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y);
      });
      const pad = 70;
      const gw = maxX - minX || 1, gh = maxY - minY || 1;
      const k = Math.min((S.w - pad * 2) / gw, (S.h - pad * 2) / gh, 1.4);
      view.k = Math.max(0.4, k);
      const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
      view.tx = -cx * view.k; view.ty = -cy * view.k;
    }

    function roundRect(c, x, y, w, h, r) {
      c.beginPath();
      c.moveTo(x + r, y);
      c.arcTo(x + w, y, x + w, y + h, r);
      c.arcTo(x + w, y + h, x, y + h, r);
      c.arcTo(x, y + h, x, y, r);
      c.arcTo(x, y, x + w, y, r);
      c.closePath();
    }

    function draw() {
      const sel = selRef.current;
      const active = S.hoverId || sel;
      const activeSet = active ? new Set([active, ...adj[active]]) : null;

      ctx.clearRect(0, 0, S.w, S.h);

      links.forEach((l) => {
        const a = toScreen(l.source), b = toScreen(l.target);
        const lit = activeSet && (l.source.id === active || l.target.id === active);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = lit ? "rgba(109,94,252,0.55)" : "rgba(230,232,235,0.07)";
        ctx.lineWidth = lit ? 1.4 : 1;
        ctx.stroke();
      });

      nodes.forEach((n) => {
        const p = toScreen(n);
        const r = n.r * view.k;
        const isActive = n.id === active;
        const inHood = !activeSet || activeSet.has(n.id);
        const glowStrength = isActive ? 0.55 : inHood ? 0.22 : 0.08;

        const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 4.2);
        glow.addColorStop(0, "rgba(109,94,252," + glowStrength + ")");
        glow.addColorStop(1, "rgba(109,94,252,0)");
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(p.x, p.y, r * 4.2, 0, Math.PI * 2); ctx.fill();

        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        if (n.type === "test") {
          ctx.fillStyle = "#0f1114"; ctx.fill();
          ctx.lineWidth = 1.6;
          ctx.strokeStyle = isActive ? "#8b7dff" : inHood ? "rgba(230,232,235,0.55)" : "rgba(230,232,235,0.28)";
          ctx.stroke();
        } else {
          ctx.fillStyle = isActive ? "#8b7dff" : inHood ? ACCENT : "#4038a0";
          ctx.fill();
        }
      });

      // Traversal-path overlay: glowing accent edges + pulsing rings on the walked
      // concepts. S.pathGlow eases 0->1 on a new answer and back to 0 when cleared.
      const path = pathRef.current || [];
      if (path.length && S.pathGlow > 0.01) {
        const pset = new Set(path);
        const g = Math.min(1, S.pathGlow);
        const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 360);

        ctx.save();
        ctx.lineCap = "round";
        ctx.shadowColor = "rgba(109,94,252,0.9)";
        links.forEach((l) => {
          if (pset.has(l.source.id) && pset.has(l.target.id)) {
            const a = toScreen(l.source), b = toScreen(l.target);
            ctx.strokeStyle = "rgba(139,125,255," + (0.35 + 0.5 * g) + ")";
            ctx.shadowBlur = 9 * g;
            ctx.lineWidth = 2.6;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          }
        });
        nodes.forEach((n) => {
          if (!pset.has(n.id)) return;
          const p = toScreen(n), r = n.r * view.k;
          ctx.strokeStyle = "rgba(139,125,255," + (0.55 + 0.45 * g) + ")";
          ctx.lineWidth = 2;
          ctx.shadowBlur = (7 + 7 * pulse) * g;
          ctx.beginPath(); ctx.arc(p.x, p.y, r + 3.5 + pulse * 1.6, 0, Math.PI * 2); ctx.stroke();
        });
        ctx.restore();
      }

      if (active && byId[active]) {
        const n = byId[active];
        const p = toScreen(n);
        ctx.font = '500 12px "JetBrains Mono", monospace';
        const tw = ctx.measureText(n.id).width;
        const padX = 8, boxH = 22, ry = p.y - n.r * view.k - boxH - 8;
        const rx = p.x - (tw + padX * 2) / 2;
        ctx.fillStyle = "rgba(20,22,25,0.94)";
        ctx.strokeStyle = "rgba(255,255,255,0.08)";
        ctx.lineWidth = 1;
        roundRect(ctx, rx, ry, tw + padX * 2, boxH, 7);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#e6e8eb";
        ctx.textBaseline = "middle";
        ctx.fillText(n.id, rx + padX, ry + boxH / 2 + 0.5);
      }
    }

    let raf;
    function loop() {
      const steps = sim.alpha() > 0.1 ? 2 : 1;
      for (let s = 0; s < steps; s++) sim.tick();
      if (!S.fitted && sim.alpha() < 0.12) { fitView(); S.fitted = true; }

      // Ease the path glow: reset to 0 on a new path (fresh light-up), then
      // approach 1 while a path is set, or 0 once it's cleared.
      const pathNow = pathRef.current || [];
      const key = pathNow.join("|");
      if (key !== S.pathKey) { S.pathKey = key; S.pathGlow = 0; }
      const target = pathNow.length ? 1 : 0;
      S.pathGlow += (target - S.pathGlow) * 0.09;

      draw();
      raf = requestAnimationFrame(loop);
    }
    loop();

    function pick(px, py) {
      const w = toWorld(px, py);
      let best = null, bestD = Infinity;
      nodes.forEach((n) => {
        const d = Math.hypot(n.x - w.x, n.y - w.y);
        if (d < bestD) { bestD = d; best = n; }
      });
      return best && bestD <= best.r + 6 ? best : null;
    }
    function localXY(e) {
      const rect = canvas.getBoundingClientRect();
      return [e.clientX - rect.left, e.clientY - rect.top];
    }
    function onMove(e) {
      const [px, py] = localXY(e);
      if (S.dragging && S.last) {
        view.tx += px - S.last[0]; view.ty += py - S.last[1];
        S.moved += Math.abs(px - S.last[0]) + Math.abs(py - S.last[1]);
        S.last = [px, py];
        return;
      }
      const hit = pick(px, py);
      const id = hit ? hit.id : null;
      if (id !== S.hoverId) { S.hoverId = id; canvas.style.cursor = id ? "pointer" : "grab"; }
    }
    function onDown(e) {
      const [px, py] = localXY(e);
      S.dragging = true; S.moved = 0; S.last = [px, py];
      canvas.style.cursor = "grabbing";
      canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
    }
    function onUp(e) {
      const [px, py] = localXY(e);
      if (S.moved < 5) { const hit = pick(px, py); onSelect(hit ? hit.id : null); }
      S.dragging = false; S.last = null;
      canvas.style.cursor = S.hoverId ? "pointer" : "grab";
    }
    function onWheel(e) {
      e.preventDefault();
      const [px, py] = localXY(e);
      const before = toWorld(px, py);
      const factor = Math.exp(-e.deltaY * 0.0012);
      view.k = Math.max(0.35, Math.min(3, view.k * factor));
      const after = toWorld(px, py);
      view.tx += (after.x - before.x) * view.k;
      view.ty += (after.y - before.y) * view.k;
    }
    function onDouble() { S.fitted = false; sim.reheat(); }

    canvas.style.cursor = "grab";
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointerleave", () => { S.hoverId = null; S.dragging = false; });
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("dblclick", onDouble);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("dblclick", onDouble);
    };
  }, [data, degree, onSelect]);

  return (
    <div ref={wrapRef} className="absolute inset-0">
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}

/* ------------------------- Concept side panel -------------------------- */

function parseConcept(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (m) return { frontmatter: m[1], body: m[2].trim() };
  return { frontmatter: "", body: md.trim() };
}

function ConceptPanel({ jobId, node, degree, onClose }) {
  const [state, setState] = useState({ loading: false, frontmatter: "", body: "", error: "" });

  useEffect(() => {
    if (!node || !jobId) return;
    let cancelled = false;
    setState({ loading: true, frontmatter: "", body: "", error: "" });
    fetch("/jobs/" + jobId + "/concept?id=" + encodeURIComponent(node.id))
      .then((r) => (r.ok ? r.json() : r.json().then((j) => Promise.reject(j.detail || "Failed to load concept"))))
      .then((d) => {
        if (cancelled) return;
        const p = parseConcept(d.markdown || "");
        setState({ loading: false, frontmatter: p.frontmatter, body: p.body, error: "" });
      })
      .catch((err) => { if (!cancelled) setState({ loading: false, frontmatter: "", body: "", error: String(err) }); });
    return () => { cancelled = true; };
  }, [jobId, node && node.id]);

  const paragraphs = state.body ? state.body.split(/\n\s*\n/) : [];

  return (
    <div
      className={
        "absolute top-0 left-0 z-20 h-full w-full sm:w-[340px] bg-panel border-r border-white/[0.07] shadow-2xl " +
        "transition-transform duration-300 ease-[cubic-bezier(0.22,0.61,0.36,1)] " +
        (node ? "translate-x-0" : "-translate-x-full pointer-events-none")
      }
    >
      {node && (
        <div className="flex h-full flex-col">
          <div className="flex items-start justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
            <div>
              <div className="font-mono text-[13px] text-ink">{node.id}</div>
              <div className="mt-1 font-mono text-[11px] uppercase tracking-wider text-faint">
                {node.type} · {degree[node.id] || 0} links
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close concept"
              className="rounded-md p-1 text-muted hover:text-ink hover:bg-white/[0.05] transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <div className="panel-scroll flex-1 overflow-y-auto px-5 py-5">
            {state.loading && <p className="font-mono text-[12px] text-faint pulse-soft">Loading concept…</p>}
            {state.error && <p className="text-[13px] text-[#ff9a9a]">{state.error}</p>}
            {!state.loading && !state.error && (
              <React.Fragment>
                {state.frontmatter && (
                  <pre className="mb-4 overflow-x-auto rounded-[10px] border border-white/[0.06] bg-base p-3.5 font-mono text-[12px] leading-relaxed text-muted">
                    {"---\n" + state.frontmatter + "\n---"}
                  </pre>
                )}
                {paragraphs.map((p, i) => (
                  <p key={i} className="mb-3.5 text-[14px] leading-relaxed text-[#b7bcc4]">{p}</p>
                ))}
              </React.Fragment>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------ Chat panel ----------------------------- */

function ChatMessage({ m, onCite }) {
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm border border-accent/30 bg-accent/[0.14] px-3.5 py-2 text-[14px] leading-relaxed text-ink">
          {m.text}
        </div>
      </div>
    );
  }
  const paragraphs = (m.text || "").split(/\n\s*\n/);
  return (
    <div className="max-w-[94%]">
      <div className={"rounded-2xl rounded-bl-sm border px-3.5 py-2.5 " + (m.error ? "border-[#ff9a9a]/30 bg-[#ff9a9a]/[0.06]" : "border-white/[0.08] bg-base")}>
        {paragraphs.map((p, i) => (
          <p key={i} className={"text-[14px] leading-relaxed " + (m.error ? "text-[#ff9a9a]" : "text-[#c7cbd2]") + (i ? " mt-2" : "")}>{p}</p>
        ))}
      </div>
      {m.cited && m.cited.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-faint">sources:</span>
          {m.cited.map((id) => (
            <button
              key={id}
              onClick={() => onCite(id)}
              className="rounded-md border border-white/[0.1] bg-panel px-2 py-1 font-mono text-[11px] text-muted transition-colors hover:border-accent hover:text-accent"
            >
              {id}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ChatPanel({ bundleId, onAsk, onAnswer, onCite, onCollapse }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const listRef = useRef(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  async function submit(e) {
    e.preventDefault();
    const q = input.trim();
    if (!q || loading) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: q }]);
    setLoading(true);
    onAsk(); // fade any current highlight while we walk the graph again
    try {
      const res = await fetch("/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, bundle_id: bundleId }),
      });
      const body = await res.json();
      if (!res.ok) {
        setMessages((m) => [...m, { role: "assistant", text: body.detail || "Something went wrong.", error: true }]);
      } else {
        setMessages((m) => [...m, { role: "assistant", text: body.answer, cited: body.cited_concept_ids || [] }]);
        onAnswer(body); // light up the visited path in the graph
      }
    } catch (err) {
      setMessages((m) => [...m, { role: "assistant", text: "Network error: " + err.message, error: true }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-2 border-b border-white/[0.06] px-4 py-3">
        <div>
          <div className="text-[14px] font-medium text-ink">Ask this codebase</div>
          <div className="mt-0.5 text-[12px] text-muted">Answers by walking the graph — watch the path light up.</div>
        </div>
        {onCollapse && (
          <button
            onClick={onCollapse}
            aria-label="Collapse chat"
            className="-mr-1 shrink-0 rounded-md p-1 text-muted transition-colors hover:bg-white/[0.05] hover:text-ink"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </div>

      <div ref={listRef} className="panel-scroll flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="text-[13px] leading-relaxed text-faint">
            Ask something that spans two files — e.g.{" "}
            <span className="text-muted">“How does request routing produce log output?”</span>{" "}
            The agent follows the link between the concepts and highlights it in the graph.
          </div>
        )}
        {messages.map((m, i) => <ChatMessage key={i} m={m} onCite={onCite} />)}
        {loading && <div className="font-mono text-[12px] text-faint pulse-soft">walking the graph…</div>}
      </div>

      <form onSubmit={submit} className="border-t border-white/[0.06] p-3">
        <div className="focus-ring flex items-center gap-2 rounded-xl border border-white/[0.09] bg-base p-1.5 pl-3">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about this codebase…"
            className="flex-1 bg-transparent py-1.5 text-[14px] text-ink outline-none placeholder:text-faint"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="shrink-0 rounded-lg bg-accent px-3.5 py-1.5 text-[13px] font-medium text-white transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Ask
          </button>
        </div>
      </form>
    </div>
  );
}

/* Floating chat dock — overlays the graph bottom-right so the whole graph (and
   the traversal highlight) stays visible. Collapses to a launcher pill. */
function ChatDock({ bundleId, onAsk, onAnswer, onCite }) {
  const [open, setOpen] = useState(true);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="absolute bottom-4 right-4 z-30 flex items-center gap-2 rounded-full border border-accent/40 bg-panel/90 px-4 py-2.5 text-[13px] font-medium text-ink shadow-2xl backdrop-blur transition-colors hover:border-accent"
      >
        <span className="h-2 w-2 rounded-full bg-accent"></span>
        Ask this codebase
      </button>
    );
  }

  return (
    <div className="absolute bottom-4 right-4 z-30 flex h-[460px] max-h-[calc(100%-2rem)] w-[min(92vw,380px)] flex-col overflow-hidden rounded-2xl border border-white/[0.1] bg-panel/95 shadow-2xl backdrop-blur">
      <ChatPanel bundleId={bundleId} onAsk={onAsk} onAnswer={onAnswer} onCite={onCite} onCollapse={() => setOpen(false)} />
    </div>
  );
}

/* ---------------------------- Graph stage ------------------------------ */

function GraphStage({ phase, scan, graph, degree, jobId, pathIds, selectedId, setSelectedId, onDownload, onAsk, onAnswer, errorMsg }) {
  const nodeCount = graph.nodes.length;
  return (
    <Reveal id="graph" className="mx-auto max-w-content px-5 sm:px-8 pb-24">
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-elevated grid-dots"
           style={{ height: "clamp(440px, 68vh, 660px)" }}>
        {phase !== "ready" && (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center px-5 py-4">
            <span className="font-mono text-[12px] text-muted">
              {phase === "scanning" ? "building bundle"
                : phase === "error" ? "generation failed" : "knowledge graph"}
            </span>
          </div>
        )}

        {phase === "idle" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
            <div className="font-mono text-[13px] text-faint">The graph appears here.</div>
            <div className="mt-2 text-[13px] text-muted/70 max-w-xs">
              Enter a repository above and press <span className="text-muted">Generate</span> to build it.
            </div>
          </div>
        )}

        {phase === "scanning" && <ScanningState done={scan.done} total={scan.total} />}

        {phase === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-8">
            <div className="font-mono text-[12px] uppercase tracking-wider text-[#ff9a9a]">Couldn’t generate</div>
            <div className="mt-3 max-w-md text-[14px] leading-relaxed text-muted">{errorMsg}</div>
            <div className="mt-4 text-[12px] text-faint">Edit the URL above and try again.</div>
          </div>
        )}

        {phase === "ready" && (
          <React.Fragment>
            <ForceGraph data={graph} degree={degree} pathIds={pathIds} selectedId={selectedId} onSelect={setSelectedId} />

            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4 py-3">
              <span className="font-mono text-[12px] text-muted">
                {nodeCount} concepts · {graph.links.length} links
              </span>
              <button
                onClick={onDownload}
                className="pointer-events-auto rounded-lg border border-white/[0.12] bg-panel/70 px-3 py-1.5 text-[12px] text-ink transition-colors hover:border-white/25 hover:bg-panel"
              >
                Download bundle
              </button>
            </div>

            <ConceptPanel
              jobId={jobId}
              node={selectedId ? graph.nodes.find((n) => n.id === selectedId) : null}
              degree={degree}
              onClose={() => setSelectedId(null)}
            />

            <div className="pointer-events-none absolute bottom-3 left-4 z-10 hidden sm:block">
              <span className="font-mono text-[11px] text-faint/70">
                click a node · scroll to zoom · drag to pan
              </span>
            </div>

            <ChatDock bundleId={jobId} onAsk={onAsk} onAnswer={onAnswer} onCite={setSelectedId} />
          </React.Fragment>
        )}
      </div>
    </Reveal>
  );
}

/* ---------------------------- How it works ----------------------------- */

function HowItWorks() {
  const steps = [
    { n: "01", t: "Scan", d: "We clone the repo and walk every source file, resolving real imports into a validated link list." },
    { n: "02", t: "Generate", d: "Each file becomes one OKF concept — prose plus structured, cross-linked frontmatter." },
    { n: "03", t: "Explore", d: "Traverse the graph, open any concept, or download the whole bundle for your agents." },
  ];
  return (
    <Reveal id="how" as="section" className="mx-auto max-w-content px-5 sm:px-8 pb-28">
      <div className="grid gap-3 sm:grid-cols-3">
        {steps.map((s) => (
          <div key={s.n} className="rounded-2xl border border-white/[0.07] bg-panel p-6 transition-colors hover:border-white/[0.14]">
            <div className="flex items-center gap-3">
              <span className="font-mono text-[12px] text-accent">{s.n}</span>
              <span className="h-px flex-1 bg-white/[0.06]" />
            </div>
            <h3 className="mt-4 text-[17px] font-medium text-ink">{s.t}</h3>
            <p className="mt-2 text-[14px] leading-relaxed text-muted">{s.d}</p>
          </div>
        ))}
      </div>
    </Reveal>
  );
}

/* ------------------------------- Footer -------------------------------- */

function Footer() {
  return (
    <footer className="border-t border-white/[0.06]">
      <div className="mx-auto max-w-content px-5 sm:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        <Wordmark className="text-[14px]" />
        <div className="flex items-center gap-6 text-[13px] text-muted">
          <a href="#" className="hover:text-ink transition-colors">GitHub</a>
          <span className="text-faint">Built on the Open Knowledge Format.</span>
        </div>
      </div>
    </footer>
  );
}

/* -------------------------------- App ---------------------------------- */

function computeDegree(nodes, links) {
  const deg = {};
  nodes.forEach((n) => (deg[n.id] = 0));
  links.forEach((l) => { deg[l.source] = (deg[l.source] || 0) + 1; deg[l.target] = (deg[l.target] || 0) + 1; });
  return deg;
}

function App() {
  const [url, setUrl] = useState("https://github.com/pallets/flask");
  const [phase, setPhase] = useState("idle"); // idle | scanning | ready | error
  const [scan, setScan] = useState({ done: 0, total: 0 });
  const [graph, setGraph] = useState({ nodes: [], links: [] });
  const [degree, setDegree] = useState({});
  const [jobId, setJobId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [pathIds, setPathIds] = useState([]); // traversal path the chat agent walked
  const [errorMsg, setErrorMsg] = useState("");
  const pollRef = useRef(null);

  const applyGraph = useCallback((g) => {
    const nodes = g.nodes || [];
    const rawEdges = g.edges || g.links || [];
    const links = rawEdges.map((e) => ({ source: e.source, target: e.target }));
    setGraph({ nodes, links });
    setDegree(computeDegree(nodes, links));
  }, []);

  const scrollToGraph = () => {
    setTimeout(() => {
      const el = document.getElementById("graph");
      el && el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 60);
  };

  const poll = useCallback((id) => {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch("/jobs/" + id);
        const j = await r.json();
        if (j.status === "error") {
          clearInterval(pollRef.current);
          setErrorMsg(j.error || "Generation failed.");
          setPhase("error");
          return;
        }
        setScan({ done: j.progress || 0, total: j.total || 0 });
        if (j.status === "done") {
          clearInterval(pollRef.current);
          const gr = await fetch("/jobs/" + id + "/graph");
          applyGraph(await gr.json());
          setPhase("ready");
        }
      } catch (err) {
        clearInterval(pollRef.current);
        setErrorMsg("Network error: " + err.message);
        setPhase("error");
      }
    }, 1400);
  }, [applyGraph]);

  const startGenerate = useCallback(async () => {
    if (phase === "scanning") return;
    setSelectedId(null);
    setPathIds([]);
    setErrorMsg("");
    setPhase("scanning");
    setScan({ done: 0, total: 0 });
    scrollToGraph();
    try {
      const res = await fetch("/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const body = await res.json();
      if (!res.ok) {
        setErrorMsg(body.detail || "Something went wrong.");
        setPhase("error");
        return;
      }
      setJobId(body.job_id);
      setScan({ done: 0, total: body.total || 0 });
      if (body.status === "done") {
        applyGraph(body.graph);
        setPhase("ready");
      } else {
        poll(body.job_id);
      }
    } catch (err) {
      setErrorMsg("Network error: " + err.message + ". Is the RepoLore server running?");
      setPhase("error");
    }
  }, [phase, url, applyGraph, poll]);

  useEffect(() => () => clearInterval(pollRef.current), []);

  const onDownload = () => { if (jobId) window.location.href = "/jobs/" + jobId + "/download"; };

  if (window.__bootTimer) clearTimeout(window.__bootTimer);

  return (
    <div>
      <TopBar />
      <main>
        <Hero url={url} setUrl={setUrl} onGenerate={startGenerate} busy={phase === "scanning"} />
        <GraphStage
          phase={phase}
          scan={scan}
          graph={graph}
          degree={degree}
          jobId={jobId}
          pathIds={pathIds}
          selectedId={selectedId}
          setSelectedId={setSelectedId}
          onDownload={onDownload}
          onAsk={() => setPathIds([])}
          onAnswer={(body) => setPathIds(body.visited_concept_ids || [])}
          errorMsg={errorMsg}
        />
        <HowItWorks />
      </main>
      <Footer />
    </div>
  );
}

if (window.__bootTimer) clearTimeout(window.__bootTimer);
ReactDOM.createRoot(document.getElementById("root")).render(<App />);
