/* RepoLore frontend — source. Compiled to app.js (classic React runtime).
   Talks to the FastAPI backend: POST /generate, poll /jobs/{id},
   GET /jobs/{id}/graph, GET /jobs/{id}/concept?id=..., GET /jobs/{id}/download.
   Globals expected: React, ReactDOM. No external graph library. */
const { useState, useEffect, useRef, useMemo, useCallback } = React;
const ACCENT = "#6d5efc";

/* --------------------------- Small primitives --------------------------- */

/* A render error anywhere below must not blank the whole page. */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="mx-auto max-w-xl px-6 py-24 text-center">
          <div className="font-mono text-[12px] uppercase tracking-wider text-[#ff9a9a]">Something broke</div>
          <p className="mt-3 text-[14px] leading-relaxed text-muted">
            The interface hit an unexpected error. Reload the page to continue — your
            generated bundles are safe on the server.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-5 rounded-xl bg-accent px-5 py-2.5 text-[14px] font-medium text-white hover:brightness-110"
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

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

function TopBar({ onOpenSettings }) {
  return (
    <header className="fixed top-0 inset-x-0 z-30 backdrop-blur-md bg-base/60 border-b border-white/[0.06]">
      <div className="mx-auto max-w-content px-5 sm:px-8 h-14 flex items-center justify-between">
        <a href="#top" className="text-[15px]"><Wordmark /></a>
        <nav className="flex items-center gap-6 text-[13px] text-muted">
          <a href="#how" className="hover:text-ink transition-colors">How it works</a>
          <button onClick={onOpenSettings} className="hover:text-ink transition-colors">Model</button>
          <a href="https://github.com/raghunathsundar1/RepoLore" target="_blank" rel="noopener noreferrer" className="hover:text-ink transition-colors">GitHub</a>
        </nav>
      </div>
    </header>
  );
}

/* --------------------------- Model settings (BYOK) --------------------------- */

function loadStoredLLM() {
  try {
    const raw = localStorage.getItem("repolore_llm");
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (v && v.provider && v.model && v.api_key) return v;
  } catch (e) { /* corrupted storage — treat as unset */ }
  return null;
}

function ModelSettings({ open, notice, providers, llm, onSave, onClear, onClose }) {
  const [provider, setProvider] = useState("openai");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");

  useEffect(() => {
    if (!open) return;
    setProvider(llm ? llm.provider : "openai");
    setModel(llm ? llm.model : "");
    setApiKey(llm ? llm.api_key : "");
  }, [open]);

  if (!open) return null;
  const spec = providers.find((p) => p.id === provider);
  const modelOptions = spec ? spec.models : [];
  const effectiveModel = modelOptions.includes(model) ? model : (modelOptions[0] || "");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-white/[0.1] bg-panel p-5 shadow-2xl"
        role="dialog" aria-modal="true" aria-label="Model settings"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[15px] font-medium text-ink">Model settings</div>
            <div className="mt-0.5 text-[12px] text-muted">Bring your own key to generate and ask beyond the free tier.</div>
          </div>
          <button onClick={onClose} aria-label="Close settings" className="rounded-md p-1 text-muted hover:bg-white/[0.05] hover:text-ink">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
        </div>

        {notice && (
          <div className="mt-3 rounded-lg border border-accent/30 bg-accent/[0.08] px-3 py-2 text-[13px] text-ink">{notice}</div>
        )}

        <label className="mt-4 block text-[12px] font-medium text-muted">Provider</label>
        <select
          value={provider}
          onChange={(e) => { setProvider(e.target.value); setModel(""); }}
          className="mt-1 w-full rounded-lg border border-white/[0.1] bg-base px-3 py-2 text-[14px] text-ink outline-none focus:border-accent"
        >
          {providers.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>

        <label className="mt-3 block text-[12px] font-medium text-muted">Model</label>
        <select
          value={effectiveModel}
          onChange={(e) => setModel(e.target.value)}
          className="mt-1 w-full rounded-lg border border-white/[0.1] bg-base px-3 py-2 font-mono text-[13px] text-ink outline-none focus:border-accent"
        >
          {modelOptions.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>

        <label className="mt-3 block text-[12px] font-medium text-muted">API key</label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={provider === "openai" ? "sk-…" : provider === "anthropic" ? "sk-ant-…" : "AIza…"}
          autoComplete="off"
          className="mt-1 w-full rounded-lg border border-white/[0.1] bg-base px-3 py-2 font-mono text-[13px] text-ink outline-none placeholder:text-faint focus:border-accent"
        />
        <p className="mt-2 text-[11px] leading-relaxed text-faint">
          Your key stays in this browser (localStorage) and is sent only with your requests.
          The server never stores or logs it.
        </p>

        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            onClick={() => { onClear(); onClose(); }}
            className="text-[13px] text-muted underline-offset-2 hover:text-ink hover:underline"
          >
            Use free tier
          </button>
          <button
            onClick={() => { onSave({ provider, model: effectiveModel, api_key: apiKey.trim() }); onClose(); }}
            disabled={!apiKey.trim() || !effectiveModel}
            className="rounded-xl bg-accent px-5 py-2 text-[14px] font-medium text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </div>
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
        Paste any public GitHub repo. <span className="text-faint">Python, JavaScript & TypeScript supported.</span>
      </p>
    </form>
  );
}

/* ------------------------------- Hero ---------------------------------- */

function TierLine({ llm, usage, providers, onOpenSettings }) {
  const label = llm ? ((providers.find((p) => p.id === llm.provider) || {}).label || llm.provider) : "";
  return (
    <p className="mt-2 text-center text-[12px] text-faint">
      {llm ? (
        <React.Fragment>
          Using your {label} key · <span className="font-mono">{llm.model}</span>{" "}
          <button onClick={onOpenSettings} className="text-muted underline underline-offset-2 hover:text-ink">change</button>
        </React.Fragment>
      ) : usage && usage.free_generations_left === 0 ? (
        <React.Fragment>
          Free run used —{" "}
          <button onClick={onOpenSettings} className="text-accent underline underline-offset-2 hover:brightness-110">
            add your API key
          </button>{" "}
          to keep generating.
        </React.Fragment>
      ) : (
        <React.Fragment>
          Your first graph is free — no key needed.{" "}
          <button onClick={onOpenSettings} className="text-muted underline underline-offset-2 hover:text-ink">
            Use your own key
          </button>
        </React.Fragment>
      )}
    </p>
  );
}

function Hero({ url, setUrl, onGenerate, busy, tier }) {
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
          {tier}
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
      <div className="w-full max-w-md" role="status" aria-live="polite">
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
    <div ref={wrapRef} className="absolute inset-0" role="img" aria-label="Interactive knowledge graph of the codebase. Concepts are nodes; imports are edges.">
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}

/* ------------------------- Concept side panel -------------------------- */

function parseConcept(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const frontmatter = m ? m[1] : "";
  let body = (m ? m[2] : md).trim();

  // Split the OKF "## Related concepts" section off the prose, and pull the
  // concept ids out of its standard markdown links so we can make them clickable.
  const related = [];
  const idx = body.search(/^##\s+Related concepts/im);
  if (idx !== -1) {
    const section = body.slice(idx);
    body = body.slice(0, idx).trim();
    const re = /[-*]\s*\[([^\]]+)\]\([^)]+\)/g;
    let hit;
    while ((hit = re.exec(section)) !== null) related.push(hit[1]);
  }
  return { frontmatter, body, related };
}

function ConceptPanel({ jobId, node, degree, onClose, onCite }) {
  const [state, setState] = useState({ loading: false, frontmatter: "", body: "", related: [], error: "" });

  useEffect(() => {
    if (!node || !jobId) return;
    let cancelled = false;
    setState({ loading: true, frontmatter: "", body: "", related: [], error: "" });
    fetch("/jobs/" + jobId + "/concept?id=" + encodeURIComponent(node.id))
      .then((r) => (r.ok ? r.json() : r.json().then((j) => Promise.reject(j.detail || "Failed to load concept"))))
      .then((d) => {
        if (cancelled) return;
        const p = parseConcept(d.markdown || "");
        setState({ loading: false, frontmatter: p.frontmatter, body: p.body, related: p.related, error: "" });
      })
      .catch((err) => { if (!cancelled) setState({ loading: false, frontmatter: "", body: "", related: [], error: String(err) }); });
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
                {state.related.length > 0 && onCite && (
                  <div className="mt-4 border-t border-white/[0.06] pt-4">
                    <div className="mb-2 font-mono text-[11px] uppercase tracking-wider text-faint">Related concepts</div>
                    <div className="flex flex-wrap gap-1.5">
                      {state.related.map((id) => (
                        <button
                          key={id}
                          onClick={() => onCite(id)}
                          className="rounded-md border border-white/[0.1] bg-elevated px-2 py-1 font-mono text-[11px] text-muted transition-colors hover:border-accent hover:text-accent"
                        >
                          {id}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
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

function ChatPanel({ bundleId, llm, onNeedKey, onAsk, onAnswer, onCite, onCollapse }) {
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
      const payload = { question: q, bundle_id: bundleId };
      if (llm) payload.llm = llm;
      const res = await fetch("/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (res.status === 402) {
        setMessages((m) => [...m, { role: "assistant", text: body.detail, error: true }]);
        onNeedKey && onNeedKey(body.detail);
      } else if (!res.ok) {
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

      <div ref={listRef} role="log" aria-live="polite" aria-label="Chat messages" className="panel-scroll flex-1 space-y-4 overflow-y-auto px-4 py-4">
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
            aria-label="Ask a question about this codebase"
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
function ChatDock({ bundleId, llm, onNeedKey, onAsk, onAnswer, onCite }) {
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
      <ChatPanel bundleId={bundleId} llm={llm} onNeedKey={onNeedKey} onAsk={onAsk} onAnswer={onAnswer} onCite={onCite} onCollapse={() => setOpen(false)} />
    </div>
  );
}

/* ---------------------------- Graph stage ------------------------------ */

function GraphStage({ phase, scan, graph, degree, jobId, pathIds, selectedId, setSelectedId, onDownload, onAsk, onAnswer, llm, onNeedKey, errorMsg }) {
  const nodeCount = graph.nodes.length;
  const [copiedMcp, setCopiedMcp] = useState(false);

  const copyMcp = () => {
    const cmd =
      "claude mcp add repolore --transport http " + window.location.origin + "/mcp" +
      "\n# then ask about bundle_id: " + jobId;
    navigator.clipboard && navigator.clipboard.writeText(cmd).then(() => {
      setCopiedMcp(true);
      setTimeout(() => setCopiedMcp(false), 2000);
    });
  };
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

            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-2 px-4 py-3">
              <span className="font-mono text-[12px] text-muted">
                {nodeCount} concepts · {graph.links.length} links
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={copyMcp}
                  title="Copy the command that connects Claude Code (or any MCP client) to this bundle"
                  className="pointer-events-auto rounded-lg border border-white/[0.12] bg-panel/70 px-3 py-1.5 font-mono text-[12px] text-muted transition-colors hover:border-white/25 hover:bg-panel hover:text-ink"
                >
                  {copiedMcp ? "Copied ✓" : "MCP"}
                </button>
                <button
                  onClick={onDownload}
                  className="pointer-events-auto rounded-lg border border-white/[0.12] bg-panel/70 px-3 py-1.5 text-[12px] text-ink transition-colors hover:border-white/25 hover:bg-panel"
                >
                  Download bundle
                </button>
              </div>
            </div>

            <ConceptPanel
              jobId={jobId}
              node={selectedId ? graph.nodes.find((n) => n.id === selectedId) : null}
              degree={degree}
              onClose={() => setSelectedId(null)}
              onCite={setSelectedId}
            />

            <div className="pointer-events-none absolute bottom-3 left-4 z-10 hidden sm:block">
              <span className="font-mono text-[11px] text-faint/70">
                click a node · scroll to zoom · drag to pan
              </span>
            </div>

            <ChatDock bundleId={jobId} llm={llm} onNeedKey={onNeedKey} onAsk={onAsk} onAnswer={onAnswer} onCite={setSelectedId} />
          </React.Fragment>
        )}
      </div>
    </Reveal>
  );
}

/* ------------------------- What it is + features ------------------------ */

function WhatIsIt() {
  return (
    <Reveal as="section" className="mx-auto max-w-content px-5 sm:px-8 pb-20">
      <div className="grid gap-8 lg:grid-cols-[1fr_1.4fr] lg:gap-16">
        <div>
          <p className="font-mono text-[12px] uppercase tracking-[0.22em] text-faint">What it is</p>
          <h2 className="mt-3 text-[26px] sm:text-[30px] font-medium tracking-tight leading-tight text-ink">
            A knowledge layer for your code.
          </h2>
        </div>
        <div className="space-y-4 text-[15px] leading-relaxed text-muted">
          <p>
            RepoLore reads a repository one file at a time and writes an{" "}
            <span className="text-ink">Open Knowledge Format</span> bundle — a folder of
            cross-linked markdown concepts that people and AI agents can read without any
            special tooling. One source file becomes one concept; the whole bundle becomes
            the graph you see above.
          </p>
          <p>
            The structure is never guessed. Every edge in the graph comes from a real import
            in your code, resolved by real parsers — the model only writes the prose. That is
            what makes the graph trustworthy enough to traverse, question, and hand to agents.
          </p>
        </div>
      </div>
    </Reveal>
  );
}

function Features() {
  const features = [
    {
      t: "Real edges, never invented",
      d: "Links are resolved from actual imports. The model writes explanations; it is never allowed to make up a connection.",
    },
    {
      t: "Portable OKF bundles",
      d: "One typed markdown concept per file, following Google Cloud's open OKF v0.1 spec. Download the zip and use it with any OKF consumer.",
    },
    {
      t: "Ask by traversal, not RAG",
      d: "The chat agent walks the graph's links to assemble connected context — and the path it walked lights up so you can see the reasoning.",
    },
    {
      t: "Python, JavaScript, TypeScript",
      d: "Python via the standard library's parser, JS/TS via tree-sitter. Each new language is one self-contained resolver.",
    },
    {
      t: "Your model, your key",
      d: "The first graph is free. After that, bring an OpenAI, Anthropic, or Gemini key — it stays in your browser and is never stored on the server.",
    },
    {
      t: "Built for agents",
      d: "Every generated bundle is queryable over MCP — one command connects Claude Code, which can then list, read, traverse, and find paths between concepts.",
    },
  ];
  return (
    <Reveal as="section" className="mx-auto max-w-content px-5 sm:px-8 pb-24">
      <p className="font-mono text-[12px] uppercase tracking-[0.22em] text-faint">Features</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f) => (
          <div key={f.t} className="rounded-2xl border border-white/[0.07] bg-panel p-6 transition-colors hover:border-white/[0.14]">
            <h3 className="text-[15px] font-medium text-ink">{f.t}</h3>
            <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{f.d}</p>
          </div>
        ))}
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
          <a href="https://github.com/raghunathsundar1/RepoLore" target="_blank" rel="noopener noreferrer" className="hover:text-ink transition-colors">GitHub</a>
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

  // Free tier + BYOK model settings.
  const [llm, setLlm] = useState(loadStoredLLM);
  const [providers, setProviders] = useState([]);
  const [usage, setUsage] = useState(null);
  const [settings, setSettings] = useState({ open: false, notice: "" });

  const refreshUsage = useCallback(() => {
    fetch("/usage").then((r) => r.json()).then(setUsage).catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/models").then((r) => r.json()).then((d) => setProviders(d.providers || [])).catch(() => {});
    refreshUsage();
  }, [refreshUsage]);

  const saveLlm = (config) => {
    setLlm(config);
    try { localStorage.setItem("repolore_llm", JSON.stringify(config)); } catch (e) {}
  };
  const clearLlm = () => {
    setLlm(null);
    try { localStorage.removeItem("repolore_llm"); } catch (e) {}
  };
  const openSettings = (notice) => setSettings({ open: true, notice: typeof notice === "string" ? notice : "" });

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
    const startedAt = Date.now();
    const MAX_POLL_MS = 30 * 60 * 1000; // a stuck job (e.g. server restarted mid-run) must not poll forever
    let consecutiveFailures = 0;

    pollRef.current = setInterval(async () => {
      if (Date.now() - startedAt > MAX_POLL_MS) {
        clearInterval(pollRef.current);
        setErrorMsg("Generation is taking too long — the job may be stuck. Try again.");
        setPhase("error");
        return;
      }
      try {
        const r = await fetch("/jobs/" + id);
        const j = await r.json();
        consecutiveFailures = 0; // a transient network blip should not kill the run
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
        consecutiveFailures += 1;
        if (consecutiveFailures >= 3) {
          clearInterval(pollRef.current);
          setErrorMsg("Lost contact with the server: " + err.message);
          setPhase("error");
        }
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
      const payload = { url: url.trim() };
      if (llm) payload.llm = llm;
      const res = await fetch("/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (res.status === 402) {
        setErrorMsg(body.detail);
        setPhase("error");
        openSettings(body.detail);
        refreshUsage();
        return;
      }
      if (!res.ok) {
        setErrorMsg(body.detail || "Something went wrong.");
        setPhase("error");
        return;
      }
      refreshUsage();
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
  }, [phase, url, llm, applyGraph, poll, refreshUsage]);

  useEffect(() => () => clearInterval(pollRef.current), []);

  // Escape closes the concept drawer (keyboard parity with the close button).
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") setSelectedId(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onDownload = () => { if (jobId) window.location.href = "/jobs/" + jobId + "/download"; };

  if (window.__bootTimer) clearTimeout(window.__bootTimer);

  return (
    <div>
      <TopBar onOpenSettings={openSettings} />
      <main>
        <Hero
          url={url}
          setUrl={setUrl}
          onGenerate={startGenerate}
          busy={phase === "scanning"}
          tier={<TierLine llm={llm} usage={usage} providers={providers} onOpenSettings={openSettings} />}
        />
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
          llm={llm}
          onNeedKey={openSettings}
          errorMsg={errorMsg}
        />
        <WhatIsIt />
        <Features />
        <HowItWorks />
      </main>
      <Footer />
      <ModelSettings
        open={settings.open}
        notice={settings.notice}
        providers={providers}
        llm={llm}
        onSave={saveLlm}
        onClear={clearLlm}
        onClose={() => setSettings({ open: false, notice: "" })}
      />
    </div>
  );
}

if (window.__bootTimer) clearTimeout(window.__bootTimer);
ReactDOM.createRoot(document.getElementById("root")).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
