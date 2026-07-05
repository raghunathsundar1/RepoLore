/* Auto-generated from app.jsx — do not edit directly. */
/* RepoLore frontend — source. Compiled to app.js (classic React runtime).
   Talks to the FastAPI backend: POST /generate, poll /jobs/{id},
   GET /jobs/{id}/graph, GET /jobs/{id}/concept?id=..., GET /jobs/{id}/download.
   Globals expected: React, ReactDOM. No external graph library. */
const {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback
} = React;
const ACCENT = "#6d5efc";

/* --------------------------- Small primitives --------------------------- */

/* A render error anywhere below must not blank the whole page. */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      error: null
    };
  }
  static getDerivedStateFromError(error) {
    return {
      error
    };
  }
  render() {
    if (this.state.error) {
      return /*#__PURE__*/React.createElement("div", {
        className: "mx-auto max-w-xl px-6 py-24 text-center"
      }, /*#__PURE__*/React.createElement("div", {
        className: "font-mono text-[12px] uppercase tracking-wider text-[#ff9a9a]"
      }, "Something broke"), /*#__PURE__*/React.createElement("p", {
        className: "mt-3 text-[14px] leading-relaxed text-muted"
      }, "The interface hit an unexpected error. Reload the page to continue — your generated bundles are safe on the server."), /*#__PURE__*/React.createElement("button", {
        onClick: () => window.location.reload(),
        className: "mt-5 rounded-xl bg-accent px-5 py-2.5 text-[14px] font-medium text-white hover:brightness-110"
      }, "Reload"));
    }
    return this.props.children;
  }
}
function Reveal({
  as: Tag = "div",
  className = "",
  children,
  ...rest
}) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          el.classList.add("is-in");
          io.unobserve(el);
        }
      });
    }, {
      threshold: 0.12
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return /*#__PURE__*/React.createElement(Tag, {
    ref: ref,
    className: "reveal " + className,
    ...rest
  }, children);
}
function Wordmark({
  className = ""
}) {
  return /*#__PURE__*/React.createElement("span", {
    className: "font-medium tracking-tight text-ink " + className
  }, "Repo", /*#__PURE__*/React.createElement("span", {
    className: "text-muted"
  }, "Lore"));
}

/* ------------------------------- Top bar ------------------------------- */

function TopBar({
  onOpenSettings
}) {
  return /*#__PURE__*/React.createElement("header", {
    className: "fixed top-0 inset-x-0 z-30 backdrop-blur-md bg-base/60 border-b border-white/[0.06]"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mx-auto max-w-content px-5 sm:px-8 h-14 flex items-center justify-between"
  }, /*#__PURE__*/React.createElement("a", {
    href: "#top",
    className: "text-[15px]"
  }, /*#__PURE__*/React.createElement(Wordmark, null)), /*#__PURE__*/React.createElement("nav", {
    className: "flex items-center gap-6 text-[13px] text-muted"
  }, /*#__PURE__*/React.createElement("a", {
    href: "#how",
    className: "hover:text-ink transition-colors"
  }, "How it works"), /*#__PURE__*/React.createElement("button", {
    onClick: onOpenSettings,
    className: "hover:text-ink transition-colors"
  }, "Model"), /*#__PURE__*/React.createElement("a", {
    href: "https://github.com/raghunathsundar1/RepoLore",
    target: "_blank",
    rel: "noopener noreferrer",
    className: "hover:text-ink transition-colors"
  }, "GitHub"))));
}

/* --------------------------- Model settings (BYOK) --------------------------- */

function loadStoredLLM() {
  try {
    const raw = localStorage.getItem("repolore_llm");
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (v && v.provider && v.model && v.api_key) return v;
  } catch (e) {/* corrupted storage — treat as unset */}
  return null;
}
function ModelSettings({
  open,
  notice,
  providers,
  llm,
  onSave,
  onClear,
  onClose
}) {
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
  const spec = providers.find(p => p.id === provider);
  const modelOptions = spec ? spec.models : [];
  const effectiveModel = modelOptions.includes(model) ? model : modelOptions[0] || "";
  return /*#__PURE__*/React.createElement("div", {
    className: "fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4",
    onClick: onClose
  }, /*#__PURE__*/React.createElement("div", {
    className: "w-full max-w-md rounded-2xl border border-white/[0.1] bg-panel p-5 shadow-2xl",
    role: "dialog",
    "aria-modal": "true",
    "aria-label": "Model settings",
    onClick: e => e.stopPropagation()
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-start justify-between"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "text-[15px] font-medium text-ink"
  }, "Model settings"), /*#__PURE__*/React.createElement("div", {
    className: "mt-0.5 text-[12px] text-muted"
  }, "Bring your own key to generate and ask beyond the free tier.")), /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    "aria-label": "Close settings",
    className: "rounded-md p-1 text-muted hover:bg-white/[0.05] hover:text-ink"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "16",
    height: "16",
    viewBox: "0 0 16 16",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M4 4l8 8M12 4l-8 8",
    stroke: "currentColor",
    strokeWidth: "1.5",
    strokeLinecap: "round"
  })))), notice && /*#__PURE__*/React.createElement("div", {
    className: "mt-3 rounded-lg border border-accent/30 bg-accent/[0.08] px-3 py-2 text-[13px] text-ink"
  }, notice), /*#__PURE__*/React.createElement("label", {
    className: "mt-4 block text-[12px] font-medium text-muted"
  }, "Provider"), /*#__PURE__*/React.createElement("select", {
    value: provider,
    onChange: e => {
      setProvider(e.target.value);
      setModel("");
    },
    className: "mt-1 w-full rounded-lg border border-white/[0.1] bg-base px-3 py-2 text-[14px] text-ink outline-none focus:border-accent"
  }, providers.map(p => /*#__PURE__*/React.createElement("option", {
    key: p.id,
    value: p.id
  }, p.label))), /*#__PURE__*/React.createElement("label", {
    className: "mt-3 block text-[12px] font-medium text-muted"
  }, "Model"), /*#__PURE__*/React.createElement("select", {
    value: effectiveModel,
    onChange: e => setModel(e.target.value),
    className: "mt-1 w-full rounded-lg border border-white/[0.1] bg-base px-3 py-2 font-mono text-[13px] text-ink outline-none focus:border-accent"
  }, modelOptions.map(m => /*#__PURE__*/React.createElement("option", {
    key: m,
    value: m
  }, m))), /*#__PURE__*/React.createElement("label", {
    className: "mt-3 block text-[12px] font-medium text-muted"
  }, "API key"), /*#__PURE__*/React.createElement("input", {
    type: "password",
    value: apiKey,
    onChange: e => setApiKey(e.target.value),
    placeholder: provider === "openai" ? "sk-…" : provider === "anthropic" ? "sk-ant-…" : "AIza…",
    autoComplete: "off",
    className: "mt-1 w-full rounded-lg border border-white/[0.1] bg-base px-3 py-2 font-mono text-[13px] text-ink outline-none placeholder:text-faint focus:border-accent"
  }), /*#__PURE__*/React.createElement("p", {
    className: "mt-2 text-[11px] leading-relaxed text-faint"
  }, "Your key stays in this browser (localStorage) and is sent only with your requests. The server never stores or logs it."), /*#__PURE__*/React.createElement("div", {
    className: "mt-4 flex items-center justify-between gap-3"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      onClear();
      onClose();
    },
    className: "text-[13px] text-muted underline-offset-2 hover:text-ink hover:underline"
  }, "Use free tier"), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      onSave({
        provider,
        model: effectiveModel,
        api_key: apiKey.trim()
      });
      onClose();
    },
    disabled: !apiKey.trim() || !effectiveModel,
    className: "rounded-xl bg-accent px-5 py-2 text-[14px] font-medium text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
  }, "Save"))));
}

/* -------------------------- Repo input + CTA --------------------------- */

function RepoInput({
  value,
  onChange,
  onSubmit,
  busy
}) {
  const inputRef = useRef(null);
  useEffect(() => {
    inputRef.current && inputRef.current.focus();
  }, []);
  return /*#__PURE__*/React.createElement("form", {
    onSubmit: e => {
      e.preventDefault();
      onSubmit();
    },
    className: "w-full max-w-xl mx-auto"
  }, /*#__PURE__*/React.createElement("div", {
    className: "focus-ring flex items-center gap-2 rounded-2xl border border-white/[0.09] bg-panel p-2 pl-4 transition-all"
  }, /*#__PURE__*/React.createElement("span", {
    className: "hidden sm:block text-faint font-mono text-sm select-none"
  }, "↳"), /*#__PURE__*/React.createElement("input", {
    ref: inputRef,
    value: value,
    onChange: e => onChange(e.target.value),
    spellCheck: false,
    autoComplete: "off",
    placeholder: "https://github.com/owner/repo",
    className: "flex-1 bg-transparent outline-none font-mono text-[14px] sm:text-[15px] text-ink placeholder:text-faint py-2"
  }), /*#__PURE__*/React.createElement("button", {
    type: "submit",
    disabled: busy,
    className: "shrink-0 rounded-xl bg-accent px-5 py-2.5 text-[14px] font-medium text-white transition-all hover:brightness-110 active:brightness-95 disabled:opacity-60 disabled:cursor-not-allowed"
  }, busy ? "Generating…" : "Generate")), /*#__PURE__*/React.createElement("p", {
    className: "mt-3 text-center text-[13px] text-muted"
  }, "Paste any public GitHub repo. ", /*#__PURE__*/React.createElement("span", {
    className: "text-faint"
  }, "Python, JavaScript & TypeScript supported.")));
}

/* ------------------------------- Hero ---------------------------------- */

function TierLine({
  llm,
  usage,
  providers,
  onOpenSettings
}) {
  const label = llm ? (providers.find(p => p.id === llm.provider) || {}).label || llm.provider : "";
  return /*#__PURE__*/React.createElement("p", {
    className: "mt-2 text-center text-[12px] text-faint"
  }, llm ? /*#__PURE__*/React.createElement(React.Fragment, null, "Using your ", label, " key · ", /*#__PURE__*/React.createElement("span", {
    className: "font-mono"
  }, llm.model), " ", /*#__PURE__*/React.createElement("button", {
    onClick: onOpenSettings,
    className: "text-muted underline underline-offset-2 hover:text-ink"
  }, "change")) : usage && usage.free_generations_left === 0 ? /*#__PURE__*/React.createElement(React.Fragment, null, "Free run used —", " ", /*#__PURE__*/React.createElement("button", {
    onClick: onOpenSettings,
    className: "text-accent underline underline-offset-2 hover:brightness-110"
  }, "add your API key"), " ", "to keep generating.") : /*#__PURE__*/React.createElement(React.Fragment, null, "Your first graph is free — no key needed.", " ", /*#__PURE__*/React.createElement("button", {
    onClick: onOpenSettings,
    className: "text-muted underline underline-offset-2 hover:text-ink"
  }, "Use your own key")));
}
function Hero({
  url,
  setUrl,
  onGenerate,
  busy,
  tier
}) {
  return /*#__PURE__*/React.createElement("section", {
    id: "top",
    className: "relative overflow-hidden"
  }, /*#__PURE__*/React.createElement("div", {
    "aria-hidden": true,
    className: "pointer-events-none absolute left-1/2 top-[-10%] h-[520px] w-[820px] -translate-x-1/2 rounded-full opacity-[0.16] blur-[120px]",
    style: {
      background: "radial-gradient(circle, #6d5efc 0%, transparent 68%)"
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "relative mx-auto max-w-content px-5 sm:px-8 pt-36 sm:pt-44 pb-20 text-center"
  }, /*#__PURE__*/React.createElement(Reveal, null, /*#__PURE__*/React.createElement("p", {
    className: "font-mono text-[12px] tracking-[0.22em] text-faint uppercase"
  }, "Open Knowledge Format"), /*#__PURE__*/React.createElement("h1", {
    className: "mt-6 mx-auto max-w-3xl font-medium tracking-tight leading-[1.04] text-ink",
    style: {
      fontSize: "clamp(2.6rem, 6.2vw, 4.5rem)"
    }
  }, "Turn any codebase into a", /*#__PURE__*/React.createElement("br", {
    className: "hidden sm:block"
  }), " ", /*#__PURE__*/React.createElement("span", {
    className: "grad-accent"
  }, "knowledge graph"), "."), /*#__PURE__*/React.createElement("p", {
    className: "mt-6 mx-auto max-w-xl text-[16px] sm:text-[17px] leading-relaxed text-muted"
  }, "Paste a repo. RepoLore reads every source file and maps how its ideas connect — one concept per file, cross-linked from real imports.")), /*#__PURE__*/React.createElement(Reveal, {
    className: "mt-10",
    style: {
      transitionDelay: "80ms"
    }
  }, /*#__PURE__*/React.createElement(RepoInput, {
    value: url,
    onChange: setUrl,
    onSubmit: onGenerate,
    busy: busy
  }), tier)));
}

/* ---------------------- Scanning / progress state ---------------------- */

function ScanningState({
  done,
  total
}) {
  const pct = total ? Math.round(done / total * 100) : 0;
  return /*#__PURE__*/React.createElement("div", {
    className: "absolute inset-0 flex flex-col items-center justify-center px-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "w-full max-w-md",
    role: "status",
    "aria-live": "polite"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-baseline justify-between font-mono text-[12px] text-muted"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-ink"
  }, total ? "Drafting concepts" : "Cloning & scanning repository"), /*#__PURE__*/React.createElement("span", null, total ? done + " / " + total : "…")), /*#__PURE__*/React.createElement("div", {
    className: "mt-3 h-[3px] w-full overflow-hidden rounded-full bg-white/[0.06]"
  }, /*#__PURE__*/React.createElement("div", {
    className: "h-full rounded-full bg-accent transition-[width] duration-300 ease-out " + (total ? "" : "w-1/3 pulse-soft"),
    style: total ? {
      width: pct + "%"
    } : undefined
  })), /*#__PURE__*/React.createElement("p", {
    className: "mt-5 font-mono text-[12px] text-faint pulse-soft"
  }, total ? "one concept per file — this calls the model once each" : "shallow-cloning the repository…")));
}

/* ----------------------- Force-directed graph -------------------------- */

/* Tiny self-contained force layout — no external graph library.
   Charge repulsion + spring links + centering, cooled by alpha. */
function runForce(nodes, links) {
  const N = nodes.length;
  nodes.forEach((n, i) => {
    const a = i / N * Math.PI * 2;
    n.x = Math.cos(a) * 160 + (Math.random() - 0.5) * 30;
    n.y = Math.sin(a) * 160 + (Math.random() - 0.5) * 30;
    n.vx = 0;
    n.vy = 0;
  });
  let alpha = 1;
  const REST = 74,
    K_LINK = 0.05,
    K_REP = 2600,
    K_CENTER = 0.012,
    DAMP = 0.82;
  function tick() {
    alpha = Math.max(0.004, alpha * 0.975);
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const a = nodes[i],
          b = nodes[j];
        let dx = a.x - b.x,
          dy = a.y - b.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) {
          d2 = 1;
          dx = Math.random() - 0.5;
          dy = Math.random() - 0.5;
        }
        const dist = Math.sqrt(d2);
        let rep = K_REP / d2;
        if (rep > 8) rep = 8;
        const fx = dx / dist * rep,
          fy = dy / dist * rep;
        a.vx += fx * alpha;
        a.vy += fy * alpha;
        b.vx -= fx * alpha;
        b.vy -= fy * alpha;
      }
    }
    links.forEach(l => {
      const a = l.source,
        b = l.target;
      let dx = b.x - a.x,
        dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const f = (dist - REST) * K_LINK;
      const fx = dx / dist * f,
        fy = dy / dist * f;
      a.vx += fx * alpha;
      a.vy += fy * alpha;
      b.vx -= fx * alpha;
      b.vy -= fy * alpha;
    });
    for (let i = 0; i < N; i++) {
      const n = nodes[i];
      n.vx += -n.x * K_CENTER * alpha;
      n.vy += -n.y * K_CENTER * alpha;
      n.vx *= DAMP;
      n.vy *= DAMP;
      n.x += n.vx;
      n.y += n.vy;
    }
  }
  return {
    tick,
    alpha: () => alpha,
    reheat: () => {
      alpha = 0.5;
    }
  };
}
function ForceGraph({
  data,
  degree,
  pathIds,
  selectedId,
  onSelect
}) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const selRef = useRef(selectedId);
  useEffect(() => {
    selRef.current = selectedId;
  }, [selectedId]);
  // The traversal path to light up — fed via a ref so it never re-inits the layout.
  const pathRef = useRef(pathIds);
  useEffect(() => {
    pathRef.current = pathIds || [];
  }, [pathIds]);
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const ctx = canvas.getContext("2d");
    const nodes = data.nodes.map(n => ({
      ...n,
      r: 5 + Math.min(9, (degree[n.id] || 0) * 1.05)
    }));
    if (!nodes.length) return;
    const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
    const links = data.links.filter(l => byId[l.source] && byId[l.target]).map(l => ({
      source: byId[l.source],
      target: byId[l.target]
    }));
    const adj = {};
    nodes.forEach(n => adj[n.id] = new Set());
    links.forEach(l => {
      adj[l.source.id].add(l.target.id);
      adj[l.target.id].add(l.source.id);
    });
    const view = {
      tx: 0,
      ty: 0,
      k: 0.85
    };
    const S = {
      hoverId: null,
      dragging: false,
      moved: 0,
      last: null,
      w: 0,
      h: 0,
      fitted: false,
      pathGlow: 0,
      pathKey: ""
    };
    const sim = runForce(nodes, links);
    function resize() {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      S.w = rect.width;
      S.h = rect.height;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      canvas.style.width = rect.width + "px";
      canvas.style.height = rect.height + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    const toScreen = n => ({
      x: S.w / 2 + view.tx + n.x * view.k,
      y: S.h / 2 + view.ty + n.y * view.k
    });
    const toWorld = (px, py) => ({
      x: (px - S.w / 2 - view.tx) / view.k,
      y: (py - S.h / 2 - view.ty) / view.k
    });
    function fitView() {
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      nodes.forEach(n => {
        minX = Math.min(minX, n.x);
        maxX = Math.max(maxX, n.x);
        minY = Math.min(minY, n.y);
        maxY = Math.max(maxY, n.y);
      });
      const pad = 70;
      const gw = maxX - minX || 1,
        gh = maxY - minY || 1;
      const k = Math.min((S.w - pad * 2) / gw, (S.h - pad * 2) / gh, 1.4);
      view.k = Math.max(0.4, k);
      const cx = (minX + maxX) / 2,
        cy = (minY + maxY) / 2;
      view.tx = -cx * view.k;
      view.ty = -cy * view.k;
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
      links.forEach(l => {
        const a = toScreen(l.source),
          b = toScreen(l.target);
        const lit = activeSet && (l.source.id === active || l.target.id === active);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = lit ? "rgba(109,94,252,0.55)" : "rgba(230,232,235,0.07)";
        ctx.lineWidth = lit ? 1.4 : 1;
        ctx.stroke();
      });
      nodes.forEach(n => {
        const p = toScreen(n);
        const r = n.r * view.k;
        const isActive = n.id === active;
        const inHood = !activeSet || activeSet.has(n.id);
        const glowStrength = isActive ? 0.55 : inHood ? 0.22 : 0.08;
        const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 4.2);
        glow.addColorStop(0, "rgba(109,94,252," + glowStrength + ")");
        glow.addColorStop(1, "rgba(109,94,252,0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 4.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        if (n.type === "test") {
          ctx.fillStyle = "#0f1114";
          ctx.fill();
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
        links.forEach(l => {
          if (pset.has(l.source.id) && pset.has(l.target.id)) {
            const a = toScreen(l.source),
              b = toScreen(l.target);
            ctx.strokeStyle = "rgba(139,125,255," + (0.35 + 0.5 * g) + ")";
            ctx.shadowBlur = 9 * g;
            ctx.lineWidth = 2.6;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        });
        nodes.forEach(n => {
          if (!pset.has(n.id)) return;
          const p = toScreen(n),
            r = n.r * view.k;
          ctx.strokeStyle = "rgba(139,125,255," + (0.55 + 0.45 * g) + ")";
          ctx.lineWidth = 2;
          ctx.shadowBlur = (7 + 7 * pulse) * g;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r + 3.5 + pulse * 1.6, 0, Math.PI * 2);
          ctx.stroke();
        });
        ctx.restore();
      }
      if (active && byId[active]) {
        const n = byId[active];
        const p = toScreen(n);
        ctx.font = '500 12px "JetBrains Mono", monospace';
        const tw = ctx.measureText(n.id).width;
        const padX = 8,
          boxH = 22,
          ry = p.y - n.r * view.k - boxH - 8;
        const rx = p.x - (tw + padX * 2) / 2;
        ctx.fillStyle = "rgba(20,22,25,0.94)";
        ctx.strokeStyle = "rgba(255,255,255,0.08)";
        ctx.lineWidth = 1;
        roundRect(ctx, rx, ry, tw + padX * 2, boxH, 7);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#e6e8eb";
        ctx.textBaseline = "middle";
        ctx.fillText(n.id, rx + padX, ry + boxH / 2 + 0.5);
      }
    }
    let raf;
    function loop() {
      const steps = sim.alpha() > 0.1 ? 2 : 1;
      for (let s = 0; s < steps; s++) sim.tick();
      if (!S.fitted && sim.alpha() < 0.12) {
        fitView();
        S.fitted = true;
      }

      // Ease the path glow: reset to 0 on a new path (fresh light-up), then
      // approach 1 while a path is set, or 0 once it's cleared.
      const pathNow = pathRef.current || [];
      const key = pathNow.join("|");
      if (key !== S.pathKey) {
        S.pathKey = key;
        S.pathGlow = 0;
      }
      const target = pathNow.length ? 1 : 0;
      S.pathGlow += (target - S.pathGlow) * 0.09;
      draw();
      raf = requestAnimationFrame(loop);
    }
    loop();
    function pick(px, py) {
      const w = toWorld(px, py);
      let best = null,
        bestD = Infinity;
      nodes.forEach(n => {
        const d = Math.hypot(n.x - w.x, n.y - w.y);
        if (d < bestD) {
          bestD = d;
          best = n;
        }
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
        view.tx += px - S.last[0];
        view.ty += py - S.last[1];
        S.moved += Math.abs(px - S.last[0]) + Math.abs(py - S.last[1]);
        S.last = [px, py];
        return;
      }
      const hit = pick(px, py);
      const id = hit ? hit.id : null;
      if (id !== S.hoverId) {
        S.hoverId = id;
        canvas.style.cursor = id ? "pointer" : "grab";
      }
    }
    function onDown(e) {
      const [px, py] = localXY(e);
      S.dragging = true;
      S.moved = 0;
      S.last = [px, py];
      canvas.style.cursor = "grabbing";
      canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
    }
    function onUp(e) {
      const [px, py] = localXY(e);
      if (S.moved < 5) {
        const hit = pick(px, py);
        onSelect(hit ? hit.id : null);
      }
      S.dragging = false;
      S.last = null;
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
    function onDouble() {
      S.fitted = false;
      sim.reheat();
    }
    canvas.style.cursor = "grab";
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointerleave", () => {
      S.hoverId = null;
      S.dragging = false;
    });
    canvas.addEventListener("wheel", onWheel, {
      passive: false
    });
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
  return /*#__PURE__*/React.createElement("div", {
    ref: wrapRef,
    className: "absolute inset-0",
    role: "img",
    "aria-label": "Interactive knowledge graph of the codebase. Concepts are nodes; imports are edges."
  }, /*#__PURE__*/React.createElement("canvas", {
    ref: canvasRef,
    className: "block h-full w-full"
  }));
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
  return {
    frontmatter,
    body,
    related
  };
}
function ConceptPanel({
  jobId,
  node,
  degree,
  onClose,
  onCite
}) {
  const [state, setState] = useState({
    loading: false,
    frontmatter: "",
    body: "",
    related: [],
    error: ""
  });
  useEffect(() => {
    if (!node || !jobId) return;
    let cancelled = false;
    setState({
      loading: true,
      frontmatter: "",
      body: "",
      related: [],
      error: ""
    });
    fetch("/jobs/" + jobId + "/concept?id=" + encodeURIComponent(node.id)).then(r => r.ok ? r.json() : r.json().then(j => Promise.reject(j.detail || "Failed to load concept"))).then(d => {
      if (cancelled) return;
      const p = parseConcept(d.markdown || "");
      setState({
        loading: false,
        frontmatter: p.frontmatter,
        body: p.body,
        related: p.related,
        error: ""
      });
    }).catch(err => {
      if (!cancelled) setState({
        loading: false,
        frontmatter: "",
        body: "",
        related: [],
        error: String(err)
      });
    });
    return () => {
      cancelled = true;
    };
  }, [jobId, node && node.id]);
  const paragraphs = state.body ? state.body.split(/\n\s*\n/) : [];
  return /*#__PURE__*/React.createElement("div", {
    className: "absolute top-0 left-0 z-20 h-full w-full sm:w-[340px] bg-panel border-r border-white/[0.07] shadow-2xl " + "transition-transform duration-300 ease-[cubic-bezier(0.22,0.61,0.36,1)] " + (node ? "translate-x-0" : "-translate-x-full pointer-events-none")
  }, node && /*#__PURE__*/React.createElement("div", {
    className: "flex h-full flex-col"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-start justify-between gap-3 border-b border-white/[0.06] px-5 py-4"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "font-mono text-[13px] text-ink"
  }, node.id), /*#__PURE__*/React.createElement("div", {
    className: "mt-1 font-mono text-[11px] uppercase tracking-wider text-faint"
  }, node.type, " · ", degree[node.id] || 0, " links")), /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    "aria-label": "Close concept",
    className: "rounded-md p-1 text-muted hover:text-ink hover:bg-white/[0.05] transition-colors"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "16",
    height: "16",
    viewBox: "0 0 16 16",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M4 4l8 8M12 4l-8 8",
    stroke: "currentColor",
    strokeWidth: "1.5",
    strokeLinecap: "round"
  })))), /*#__PURE__*/React.createElement("div", {
    className: "panel-scroll flex-1 overflow-y-auto px-5 py-5"
  }, state.loading && /*#__PURE__*/React.createElement("p", {
    className: "font-mono text-[12px] text-faint pulse-soft"
  }, "Loading concept…"), state.error && /*#__PURE__*/React.createElement("p", {
    className: "text-[13px] text-[#ff9a9a]"
  }, state.error), !state.loading && !state.error && /*#__PURE__*/React.createElement(React.Fragment, null, state.frontmatter && /*#__PURE__*/React.createElement("pre", {
    className: "mb-4 overflow-x-auto rounded-[10px] border border-white/[0.06] bg-base p-3.5 font-mono text-[12px] leading-relaxed text-muted"
  }, "---\n" + state.frontmatter + "\n---"), paragraphs.map((p, i) => /*#__PURE__*/React.createElement("p", {
    key: i,
    className: "mb-3.5 text-[14px] leading-relaxed text-[#b7bcc4]"
  }, p)), state.related.length > 0 && onCite && /*#__PURE__*/React.createElement("div", {
    className: "mt-4 border-t border-white/[0.06] pt-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-2 font-mono text-[11px] uppercase tracking-wider text-faint"
  }, "Related concepts"), /*#__PURE__*/React.createElement("div", {
    className: "flex flex-wrap gap-1.5"
  }, state.related.map(id => /*#__PURE__*/React.createElement("button", {
    key: id,
    onClick: () => onCite(id),
    className: "rounded-md border border-white/[0.1] bg-elevated px-2 py-1 font-mono text-[11px] text-muted transition-colors hover:border-accent hover:text-accent"
  }, id))))))));
}

/* ------------------------------ Chat panel ----------------------------- */

function ChatMessage({
  m,
  onCite
}) {
  if (m.role === "user") {
    return /*#__PURE__*/React.createElement("div", {
      className: "flex justify-end"
    }, /*#__PURE__*/React.createElement("div", {
      className: "max-w-[85%] rounded-2xl rounded-br-sm border border-accent/30 bg-accent/[0.14] px-3.5 py-2 text-[14px] leading-relaxed text-ink"
    }, m.text));
  }
  const paragraphs = (m.text || "").split(/\n\s*\n/);
  return /*#__PURE__*/React.createElement("div", {
    className: "max-w-[94%]"
  }, /*#__PURE__*/React.createElement("div", {
    className: "rounded-2xl rounded-bl-sm border px-3.5 py-2.5 " + (m.error ? "border-[#ff9a9a]/30 bg-[#ff9a9a]/[0.06]" : "border-white/[0.08] bg-base")
  }, paragraphs.map((p, i) => /*#__PURE__*/React.createElement("p", {
    key: i,
    className: "text-[14px] leading-relaxed " + (m.error ? "text-[#ff9a9a]" : "text-[#c7cbd2]") + (i ? " mt-2" : "")
  }, p))), m.cited && m.cited.length > 0 && /*#__PURE__*/React.createElement("div", {
    className: "mt-2 flex flex-wrap items-center gap-1.5"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-[11px] text-faint"
  }, "sources:"), m.cited.map(id => /*#__PURE__*/React.createElement("button", {
    key: id,
    onClick: () => onCite(id),
    className: "rounded-md border border-white/[0.1] bg-panel px-2 py-1 font-mono text-[11px] text-muted transition-colors hover:border-accent hover:text-accent"
  }, id))));
}
function ChatPanel({
  bundleId,
  llm,
  onNeedKey,
  onAsk,
  onAnswer,
  onCite,
  onCollapse
}) {
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
    setMessages(m => [...m, {
      role: "user",
      text: q
    }]);
    setLoading(true);
    onAsk(); // fade any current highlight while we walk the graph again
    try {
      const payload = {
        question: q,
        bundle_id: bundleId
      };
      if (llm) payload.llm = llm;
      const res = await fetch("/ask", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      const body = await res.json();
      if (res.status === 402) {
        setMessages(m => [...m, {
          role: "assistant",
          text: body.detail,
          error: true
        }]);
        onNeedKey && onNeedKey(body.detail);
      } else if (!res.ok) {
        setMessages(m => [...m, {
          role: "assistant",
          text: body.detail || "Something went wrong.",
          error: true
        }]);
      } else {
        setMessages(m => [...m, {
          role: "assistant",
          text: body.answer,
          cited: body.cited_concept_ids || []
        }]);
        onAnswer(body); // light up the visited path in the graph
      }
    } catch (err) {
      setMessages(m => [...m, {
        role: "assistant",
        text: "Network error: " + err.message,
        error: true
      }]);
    } finally {
      setLoading(false);
    }
  }
  return /*#__PURE__*/React.createElement("div", {
    className: "flex h-full flex-col"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-start justify-between gap-2 border-b border-white/[0.06] px-4 py-3"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "text-[14px] font-medium text-ink"
  }, "Ask this codebase"), /*#__PURE__*/React.createElement("div", {
    className: "mt-0.5 text-[12px] text-muted"
  }, "Answers by walking the graph — watch the path light up.")), onCollapse && /*#__PURE__*/React.createElement("button", {
    onClick: onCollapse,
    "aria-label": "Collapse chat",
    className: "-mr-1 shrink-0 rounded-md p-1 text-muted transition-colors hover:bg-white/[0.05] hover:text-ink"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "16",
    height: "16",
    viewBox: "0 0 16 16",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M4 6l4 4 4-4",
    stroke: "currentColor",
    strokeWidth: "1.5",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  })))), /*#__PURE__*/React.createElement("div", {
    ref: listRef,
    role: "log",
    "aria-live": "polite",
    "aria-label": "Chat messages",
    className: "panel-scroll flex-1 space-y-4 overflow-y-auto px-4 py-4"
  }, messages.length === 0 && /*#__PURE__*/React.createElement("div", {
    className: "text-[13px] leading-relaxed text-faint"
  }, "Ask something that spans two files — e.g.", " ", /*#__PURE__*/React.createElement("span", {
    className: "text-muted"
  }, "“How does request routing produce log output?”"), " ", "The agent follows the link between the concepts and highlights it in the graph."), messages.map((m, i) => /*#__PURE__*/React.createElement(ChatMessage, {
    key: i,
    m: m,
    onCite: onCite
  })), loading && /*#__PURE__*/React.createElement("div", {
    className: "font-mono text-[12px] text-faint pulse-soft"
  }, "walking the graph…")), /*#__PURE__*/React.createElement("form", {
    onSubmit: submit,
    className: "border-t border-white/[0.06] p-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "focus-ring flex items-center gap-2 rounded-xl border border-white/[0.09] bg-base p-1.5 pl-3"
  }, /*#__PURE__*/React.createElement("input", {
    value: input,
    onChange: e => setInput(e.target.value),
    placeholder: "Ask about this codebase…",
    "aria-label": "Ask a question about this codebase",
    className: "flex-1 bg-transparent py-1.5 text-[14px] text-ink outline-none placeholder:text-faint"
  }), /*#__PURE__*/React.createElement("button", {
    type: "submit",
    disabled: loading || !input.trim(),
    className: "shrink-0 rounded-lg bg-accent px-3.5 py-1.5 text-[13px] font-medium text-white transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
  }, "Ask"))));
}

/* Floating chat dock — overlays the graph bottom-right so the whole graph (and
   the traversal highlight) stays visible. Collapses to a launcher pill. */
function ChatDock({
  bundleId,
  llm,
  onNeedKey,
  onAsk,
  onAnswer,
  onCite
}) {
  const [open, setOpen] = useState(true);
  if (!open) {
    return /*#__PURE__*/React.createElement("button", {
      onClick: () => setOpen(true),
      className: "absolute bottom-4 right-4 z-30 flex items-center gap-2 rounded-full border border-accent/40 bg-panel/90 px-4 py-2.5 text-[13px] font-medium text-ink shadow-2xl backdrop-blur transition-colors hover:border-accent"
    }, /*#__PURE__*/React.createElement("span", {
      className: "h-2 w-2 rounded-full bg-accent"
    }), "Ask this codebase");
  }
  return /*#__PURE__*/React.createElement("div", {
    className: "absolute bottom-4 right-4 z-30 flex h-[460px] max-h-[calc(100%-2rem)] w-[min(92vw,380px)] flex-col overflow-hidden rounded-2xl border border-white/[0.1] bg-panel/95 shadow-2xl backdrop-blur"
  }, /*#__PURE__*/React.createElement(ChatPanel, {
    bundleId: bundleId,
    llm: llm,
    onNeedKey: onNeedKey,
    onAsk: onAsk,
    onAnswer: onAnswer,
    onCite: onCite,
    onCollapse: () => setOpen(false)
  }));
}

/* ---------------------------- Graph stage ------------------------------ */

function GraphStage({
  phase,
  scan,
  graph,
  degree,
  jobId,
  pathIds,
  selectedId,
  setSelectedId,
  onDownload,
  onAsk,
  onAnswer,
  llm,
  onNeedKey,
  errorMsg
}) {
  const nodeCount = graph.nodes.length;
  return /*#__PURE__*/React.createElement(Reveal, {
    id: "graph",
    className: "mx-auto max-w-content px-5 sm:px-8 pb-24"
  }, /*#__PURE__*/React.createElement("div", {
    className: "relative overflow-hidden rounded-2xl border border-white/[0.08] bg-elevated grid-dots",
    style: {
      height: "clamp(440px, 68vh, 660px)"
    }
  }, phase !== "ready" && /*#__PURE__*/React.createElement("div", {
    className: "pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center px-5 py-4"
  }, /*#__PURE__*/React.createElement("span", {
    className: "font-mono text-[12px] text-muted"
  }, phase === "scanning" ? "building bundle" : phase === "error" ? "generation failed" : "knowledge graph")), phase === "idle" && /*#__PURE__*/React.createElement("div", {
    className: "absolute inset-0 flex flex-col items-center justify-center text-center px-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "font-mono text-[13px] text-faint"
  }, "The graph appears here."), /*#__PURE__*/React.createElement("div", {
    className: "mt-2 text-[13px] text-muted/70 max-w-xs"
  }, "Enter a repository above and press ", /*#__PURE__*/React.createElement("span", {
    className: "text-muted"
  }, "Generate"), " to build it.")), phase === "scanning" && /*#__PURE__*/React.createElement(ScanningState, {
    done: scan.done,
    total: scan.total
  }), phase === "error" && /*#__PURE__*/React.createElement("div", {
    className: "absolute inset-0 flex flex-col items-center justify-center text-center px-8"
  }, /*#__PURE__*/React.createElement("div", {
    className: "font-mono text-[12px] uppercase tracking-wider text-[#ff9a9a]"
  }, "Couldn’t generate"), /*#__PURE__*/React.createElement("div", {
    className: "mt-3 max-w-md text-[14px] leading-relaxed text-muted"
  }, errorMsg), /*#__PURE__*/React.createElement("div", {
    className: "mt-4 text-[12px] text-faint"
  }, "Edit the URL above and try again.")), phase === "ready" && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(ForceGraph, {
    data: graph,
    degree: degree,
    pathIds: pathIds,
    selectedId: selectedId,
    onSelect: setSelectedId
  }), /*#__PURE__*/React.createElement("div", {
    className: "pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4 py-3"
  }, /*#__PURE__*/React.createElement("span", {
    className: "font-mono text-[12px] text-muted"
  }, nodeCount, " concepts · ", graph.links.length, " links"), /*#__PURE__*/React.createElement("button", {
    onClick: onDownload,
    className: "pointer-events-auto rounded-lg border border-white/[0.12] bg-panel/70 px-3 py-1.5 text-[12px] text-ink transition-colors hover:border-white/25 hover:bg-panel"
  }, "Download bundle")), /*#__PURE__*/React.createElement(ConceptPanel, {
    jobId: jobId,
    node: selectedId ? graph.nodes.find(n => n.id === selectedId) : null,
    degree: degree,
    onClose: () => setSelectedId(null),
    onCite: setSelectedId
  }), /*#__PURE__*/React.createElement("div", {
    className: "pointer-events-none absolute bottom-3 left-4 z-10 hidden sm:block"
  }, /*#__PURE__*/React.createElement("span", {
    className: "font-mono text-[11px] text-faint/70"
  }, "click a node · scroll to zoom · drag to pan")), /*#__PURE__*/React.createElement(ChatDock, {
    bundleId: jobId,
    llm: llm,
    onNeedKey: onNeedKey,
    onAsk: onAsk,
    onAnswer: onAnswer,
    onCite: setSelectedId
  }))));
}

/* ---------------------------- How it works ----------------------------- */

function HowItWorks() {
  const steps = [{
    n: "01",
    t: "Scan",
    d: "We clone the repo and walk every source file, resolving real imports into a validated link list."
  }, {
    n: "02",
    t: "Generate",
    d: "Each file becomes one OKF concept — prose plus structured, cross-linked frontmatter."
  }, {
    n: "03",
    t: "Explore",
    d: "Traverse the graph, open any concept, or download the whole bundle for your agents."
  }];
  return /*#__PURE__*/React.createElement(Reveal, {
    id: "how",
    as: "section",
    className: "mx-auto max-w-content px-5 sm:px-8 pb-28"
  }, /*#__PURE__*/React.createElement("div", {
    className: "grid gap-3 sm:grid-cols-3"
  }, steps.map(s => /*#__PURE__*/React.createElement("div", {
    key: s.n,
    className: "rounded-2xl border border-white/[0.07] bg-panel p-6 transition-colors hover:border-white/[0.14]"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-3"
  }, /*#__PURE__*/React.createElement("span", {
    className: "font-mono text-[12px] text-accent"
  }, s.n), /*#__PURE__*/React.createElement("span", {
    className: "h-px flex-1 bg-white/[0.06]"
  })), /*#__PURE__*/React.createElement("h3", {
    className: "mt-4 text-[17px] font-medium text-ink"
  }, s.t), /*#__PURE__*/React.createElement("p", {
    className: "mt-2 text-[14px] leading-relaxed text-muted"
  }, s.d)))));
}

/* ------------------------------- Footer -------------------------------- */

function Footer() {
  return /*#__PURE__*/React.createElement("footer", {
    className: "border-t border-white/[0.06]"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mx-auto max-w-content px-5 sm:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4"
  }, /*#__PURE__*/React.createElement(Wordmark, {
    className: "text-[14px]"
  }), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-6 text-[13px] text-muted"
  }, /*#__PURE__*/React.createElement("a", {
    href: "https://github.com/raghunathsundar1/RepoLore",
    target: "_blank",
    rel: "noopener noreferrer",
    className: "hover:text-ink transition-colors"
  }, "GitHub"), /*#__PURE__*/React.createElement("span", {
    className: "text-faint"
  }, "Built on the Open Knowledge Format."))));
}

/* -------------------------------- App ---------------------------------- */

function computeDegree(nodes, links) {
  const deg = {};
  nodes.forEach(n => deg[n.id] = 0);
  links.forEach(l => {
    deg[l.source] = (deg[l.source] || 0) + 1;
    deg[l.target] = (deg[l.target] || 0) + 1;
  });
  return deg;
}
function App() {
  const [url, setUrl] = useState("https://github.com/pallets/flask");
  const [phase, setPhase] = useState("idle"); // idle | scanning | ready | error
  const [scan, setScan] = useState({
    done: 0,
    total: 0
  });
  const [graph, setGraph] = useState({
    nodes: [],
    links: []
  });
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
  const [settings, setSettings] = useState({
    open: false,
    notice: ""
  });
  const refreshUsage = useCallback(() => {
    fetch("/usage").then(r => r.json()).then(setUsage).catch(() => {});
  }, []);
  useEffect(() => {
    fetch("/models").then(r => r.json()).then(d => setProviders(d.providers || [])).catch(() => {});
    refreshUsage();
  }, [refreshUsage]);
  const saveLlm = config => {
    setLlm(config);
    try {
      localStorage.setItem("repolore_llm", JSON.stringify(config));
    } catch (e) {}
  };
  const clearLlm = () => {
    setLlm(null);
    try {
      localStorage.removeItem("repolore_llm");
    } catch (e) {}
  };
  const openSettings = notice => setSettings({
    open: true,
    notice: typeof notice === "string" ? notice : ""
  });
  const applyGraph = useCallback(g => {
    const nodes = g.nodes || [];
    const rawEdges = g.edges || g.links || [];
    const links = rawEdges.map(e => ({
      source: e.source,
      target: e.target
    }));
    setGraph({
      nodes,
      links
    });
    setDegree(computeDegree(nodes, links));
  }, []);
  const scrollToGraph = () => {
    setTimeout(() => {
      const el = document.getElementById("graph");
      el && el.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });
    }, 60);
  };
  const poll = useCallback(id => {
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
        setScan({
          done: j.progress || 0,
          total: j.total || 0
        });
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
    setScan({
      done: 0,
      total: 0
    });
    scrollToGraph();
    try {
      const payload = {
        url: url.trim()
      };
      if (llm) payload.llm = llm;
      const res = await fetch("/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
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
      setScan({
        done: 0,
        total: body.total || 0
      });
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
  const onDownload = () => {
    if (jobId) window.location.href = "/jobs/" + jobId + "/download";
  };
  if (window.__bootTimer) clearTimeout(window.__bootTimer);
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(TopBar, {
    onOpenSettings: openSettings
  }), /*#__PURE__*/React.createElement("main", null, /*#__PURE__*/React.createElement(Hero, {
    url: url,
    setUrl: setUrl,
    onGenerate: startGenerate,
    busy: phase === "scanning",
    tier: /*#__PURE__*/React.createElement(TierLine, {
      llm: llm,
      usage: usage,
      providers: providers,
      onOpenSettings: openSettings
    })
  }), /*#__PURE__*/React.createElement(GraphStage, {
    phase: phase,
    scan: scan,
    graph: graph,
    degree: degree,
    jobId: jobId,
    pathIds: pathIds,
    selectedId: selectedId,
    setSelectedId: setSelectedId,
    onDownload: onDownload,
    onAsk: () => setPathIds([]),
    onAnswer: body => setPathIds(body.visited_concept_ids || []),
    llm: llm,
    onNeedKey: openSettings,
    errorMsg: errorMsg
  }), /*#__PURE__*/React.createElement(HowItWorks, null)), /*#__PURE__*/React.createElement(Footer, null), /*#__PURE__*/React.createElement(ModelSettings, {
    open: settings.open,
    notice: settings.notice,
    providers: providers,
    llm: llm,
    onSave: saveLlm,
    onClear: clearLlm,
    onClose: () => setSettings({
      open: false,
      notice: ""
    })
  }));
}
if (window.__bootTimer) clearTimeout(window.__bootTimer);
ReactDOM.createRoot(document.getElementById("root")).render(/*#__PURE__*/React.createElement(ErrorBoundary, null, /*#__PURE__*/React.createElement(App, null)));