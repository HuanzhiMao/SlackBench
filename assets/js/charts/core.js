/* ===========================================================================
   SBViz — tiny shared chart toolkit for the SlackBench site (no dependencies).

   Lifecycle
     SBViz.register("viz-id", function setup(host, api) {
       // runs once: build controls, keep state in this closure
       return function render() { ... }   // (re)draws into host; called on load,
     });                                    // on width change, on theme change,
                                            // and once web fonts finish loading.
   Conventions (see assets/css/site.css → "Charts (shared)")
     * colors come from CSS custom properties via SBViz.color()/css(), never hex
     * bars ≤ 24px thick, rounded 4px at the data end, square at the baseline
     * markers r ≥ 4 with a 2px ring in the surface color
     * hairline solid gridlines (.grid line), axis labels use .axis text
     * every chart ships a data-table twin: SBViz.tableTwin(...)
     * text from data goes in via textContent (SBViz.el / SBViz.s), never innerHTML
   =========================================================================== */
(function () {
  "use strict";

  var SVGNS = "http://www.w3.org/2000/svg";
  var root = document.documentElement;
  var D = window.SLACKBENCH || {};

  /* ---------- DOM helpers ---------- */
  function applyAttrs(node, attrs, isSvg) {
    if (!attrs) return;
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === "text") { node.textContent = v; return; }
      if (k === "class") { node.setAttribute("class", v); return; }
      if (k === "style" && typeof v === "object") {
        Object.keys(v).forEach(function (p) {
          if (p.indexOf("--") === 0) node.style.setProperty(p, v[p]); else node.style[p] = v[p];
        });
        return;
      }
      if (k.indexOf("on") === 0 && typeof v === "function") { node.addEventListener(k.slice(2).toLowerCase(), v); return; }
      node.setAttribute(k, v === true ? "" : String(v));
    });
  }
  function append(node, children) {
    children.forEach(function (c) {
      if (c == null || c === false) return;
      if (Array.isArray(c)) { append(node, c); return; }
      node.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
    });
    return node;
  }
  /** HTML element: el("div", {class: "x", text: "hi"}, child, ...) */
  function el(tag, attrs) {
    var n = document.createElement(tag);
    applyAttrs(n, attrs, false);
    return append(n, Array.prototype.slice.call(arguments, 2));
  }
  /** SVG element: s("rect", {x: 0, ...}, child, ...) */
  function s(tag, attrs) {
    var n = document.createElementNS(SVGNS, tag);
    applyAttrs(n, attrs, true);
    return append(n, Array.prototype.slice.call(arguments, 2));
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }
  var _uid = 0;
  function uid(p) { _uid += 1; return (p || "sb") + "-" + _uid; }

  /* ---------- Theme-aware colors ---------- */
  function css(name) { return getComputedStyle(root).getPropertyValue(name).trim(); }
  var COLOR_VARS = {
    AS: "--c-as", HA: "--c-ha", SU: "--c-su", CI: "--c-ci",
    overall: "--c-overall", human: "--c-human", muted: "--c-muted", highlight: "--c-highlight",
    accent: "--accent", ink: "--ink", ink2: "--ink-2", ink3: "--ink-3", line: "--line", grid: "--line-2",
    axis: "--axis", surface: "--surface", bg: "--bg", soft: "--bg-soft"
  };
  function color(key) { return css(COLOR_VARS[key] || key); }
  /** text color that sits on top of a category fill (dataviz: near-black on amber, white elsewhere) */
  function onFill(key) { return key === "SU" ? "#0b0b0b" : "#ffffff"; }

  var CATS = [
    { key: "AS", name: "Agentic Search", short: "Search" },
    { key: "HA", name: "Hallucination", short: "Hallucination" },
    { key: "SU", name: "Summarization", short: "Summary" },
    { key: "CI", name: "Circumstance Inference", short: "Inference" }
  ];
  var HARNESS_SHAPE = {
    "Claude Code": "circle", "Codex CLI": "square", "OpenHands": "triangle", "Terminus-2": "triangle-down"
  };
  function harnessShape(h) { return HARNESS_SHAPE[h] || "diamond"; }

  /* ---------- Scales ---------- */
  function niceStep(span, n) {
    var raw = span / Math.max(1, n);
    var mag = Math.pow(10, Math.floor(Math.log10(raw)));
    var f = raw / mag;
    return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag;
  }
  function niceTicks(min, max, n) {
    if (max === min) return [min];
    var step = niceStep(max - min, n || 5);
    var start = Math.ceil(min / step - 1e-9) * step, out = [];
    for (var v = start; v <= max + step * 1e-9; v += step) out.push(+v.toFixed(10));
    return out;
  }
  function linear(domain, range) {
    var d0 = domain[0], d1 = domain[1], r0 = range[0], r1 = range[1];
    var f = function (v) { return r0 + ((v - d0) / (d1 - d0)) * (r1 - r0); };
    f.invert = function (p) { return d0 + ((p - r0) / (r1 - r0)) * (d1 - d0); };
    f.ticks = function (n) { return niceTicks(Math.min(d0, d1), Math.max(d0, d1), n); };
    f.domain = domain; f.range = range;
    return f;
  }
  function log(domain, range) {
    var l0 = Math.log10(domain[0]), l1 = Math.log10(domain[1]);
    var lin = linear([l0, l1], range);
    var f = function (v) { return lin(Math.log10(v)); };
    f.invert = function (p) { return Math.pow(10, lin.invert(p)); };
    /** decade ticks, plus 2× and 5× when the span is short */
    f.ticks = function () {
      var out = [], lo = Math.floor(l0), hi = Math.ceil(l1), dense = (l1 - l0) < 2.5;
      for (var e = lo; e <= hi; e++) {
        [1, 2, 5].forEach(function (m) {
          if (m !== 1 && !dense) return;
          var v = m * Math.pow(10, e);
          if (v >= domain[0] * 0.9999 && v <= domain[1] * 1.0001) out.push(v);
        });
      }
      return out;
    };
    f.domain = domain; f.range = range;
    return f;
  }

  /* ---------- Formatting ---------- */
  var fmt = {
    pct: function (v, d) { return v == null ? "–" : Number(v).toFixed(d == null ? 2 : d); },
    num: function (v, d) { return v == null ? "–" : Number(v).toLocaleString("en-US", { maximumFractionDigits: d == null ? 0 : d, minimumFractionDigits: d == null ? 0 : d }); },
    signed: function (v, d) { if (v == null) return "–"; var x = Number(v).toFixed(d == null ? 2 : d); return (v > 0 ? "+" : v < 0 ? "−" : "±") + x.replace("-", ""); },
    usd: function (v) {
      if (v == null) return "–";
      if (v < 10) return "$" + v.toFixed(2);
      if (v < 100) return "$" + v.toFixed(1);
      return "$" + Math.round(v).toLocaleString("en-US");
    },
    usdTick: function (v) { return v >= 1000 ? "$" + v / 1000 + "K" : v < 1 ? "$" + v : "$" + v; },
    steps: function (v) { return v == null ? "–" : Number(v).toFixed(1); }
  };

  /* ---------- Mark geometry ---------- */
  /** Horizontal bar from x0 (baseline, square) to x1 (data end, rounded r). */
  function hbar(x0, x1, y, h, r) {
    var w = x1 - x0;
    if (w <= 0) return "";
    r = Math.min(r == null ? 4 : r, h / 2, w);
    return "M" + x0 + "," + y + "H" + (x1 - r) + "A" + r + "," + r + " 0 0 1 " + x1 + "," + (y + r) +
      "V" + (y + h - r) + "A" + r + "," + r + " 0 0 1 " + (x1 - r) + "," + (y + h) + "H" + x0 + "Z";
  }
  /** Vertical bar from y0 (baseline, square, larger y) up to y1 (data end, rounded). */
  function vbar(x, y0, y1, w, r) {
    var h = y0 - y1;
    if (h <= 0) return "";
    r = Math.min(r == null ? 4 : r, w / 2, h);
    return "M" + x + "," + y0 + "V" + (y1 + r) + "A" + r + "," + r + " 0 0 1 " + (x + r) + "," + y1 +
      "H" + (x + w - r) + "A" + r + "," + r + " 0 0 1 " + (x + w) + "," + (y1 + r) + "V" + y0 + "Z";
  }
  /** Marker path centered at (cx, cy); r is the circumradius-ish size (≥ 4). */
  function marker(shape, cx, cy, r) {
    var k;
    switch (shape) {
      case "square": k = r * 0.9; return "M" + (cx - k) + "," + (cy - k) + "h" + 2 * k + "v" + 2 * k + "h" + -2 * k + "Z";
      case "triangle": k = r * 1.15; return "M" + cx + "," + (cy - k) + "L" + (cx + k * 0.95) + "," + (cy + k * 0.62) + "L" + (cx - k * 0.95) + "," + (cy + k * 0.62) + "Z";
      case "triangle-down": k = r * 1.15; return "M" + cx + "," + (cy + k) + "L" + (cx + k * 0.95) + "," + (cy - k * 0.62) + "L" + (cx - k * 0.95) + "," + (cy - k * 0.62) + "Z";
      case "diamond": k = r * 1.25; return "M" + cx + "," + (cy - k) + "L" + (cx + k) + "," + cy + "L" + cx + "," + (cy + k) + "L" + (cx - k) + "," + cy + "Z";
      default: return "M" + (cx - r) + "," + cy + "a" + r + "," + r + " 0 1 0 " + 2 * r + ",0a" + r + "," + r + " 0 1 0 " + -2 * r + ",0Z";
    }
  }

  /* ---------- Text measurement ---------- */
  var _ctx = null;
  function measureText(text, font) {
    if (!_ctx) _ctx = document.createElement("canvas").getContext("2d");
    _ctx.font = font || "12px " + css("--font-sans");
    return _ctx.measureText(String(text)).width;
  }

  /* ---------- Tooltip (single shared instance) ---------- */
  var tipNode = null, tipOwner = null;
  function tipEl() {
    if (!tipNode) {
      tipNode = el("div", { class: "sb-tip", role: "tooltip", id: "sb-tip", "aria-hidden": "true" });
      document.body.appendChild(tipNode);
    }
    return tipNode;
  }
  /**
   * content: Node, or { title, sub, big, rows: [{label, value, colorKey|color}], note }
   * at: a PointerEvent / MouseEvent, or {x, y} in client coordinates, or an Element (anchors to its box)
   */
  function tipShow(at, content, owner) {
    var t = tipEl();
    clear(t);
    if (content instanceof Node) t.appendChild(content);
    else if (content) {
      if (content.title) t.appendChild(el("div", { class: "tip-title", text: content.title }));
      if (content.sub) t.appendChild(el("div", { class: "tip-sub", text: content.sub }));
      if (content.big != null) t.appendChild(el("div", { class: "tip-big", text: content.big }));
      if (content.rows && content.rows.length) {
        var rows = el("div", { class: "tip-rows" });
        content.rows.forEach(function (r) {
          var k = el("span", { class: "k" });
          if (r.colorKey) k.style.setProperty("--c", "var(" + (COLOR_VARS[r.colorKey] || r.colorKey) + ")");
          else if (r.color) k.style.setProperty("--c", r.color);
          else k.style.visibility = "hidden";
          rows.appendChild(el("div", { class: "tip-row" }, k, el("span", { class: "l", text: r.label }), el("span", { class: "v", text: r.value })));
        });
        t.appendChild(rows);
      }
      if (content.note) t.appendChild(el("div", { class: "tip-note", text: content.note }));
    }
    tipOwner = owner || null;
    t.classList.add("is-on");
    t.setAttribute("aria-hidden", "false");
    tipMove(at);
  }
  function tipMove(at) {
    if (!tipNode) return;
    var x, y;
    if (at && at.getBoundingClientRect && !(at instanceof Event)) {
      var b = at.getBoundingClientRect();
      x = b.left + b.width / 2; y = b.top;
    } else if (at) { x = at.clientX != null ? at.clientX : at.x; y = at.clientY != null ? at.clientY : at.y; }
    if (x == null) return;
    var tw = tipNode.offsetWidth, th = tipNode.offsetHeight, pad = 12, gap = 14;
    var vw = document.documentElement.clientWidth, vh = window.innerHeight;
    var left = x + gap, top = y - th - gap;
    if (left + tw + pad > vw) left = x - tw - gap;
    if (left < pad) left = Math.max(pad, Math.min(vw - tw - pad, x - tw / 2));
    if (top < pad) top = y + gap + 6;
    if (top + th + pad > vh) top = Math.max(pad, vh - th - pad);
    tipNode.style.transform = "translate(" + Math.round(left) + "px," + Math.round(top) + "px)";
  }
  function tipHide(owner) {
    if (!tipNode) return;
    if (owner && tipOwner && owner !== tipOwner) return;
    var was = tipOwner;
    tipNode.classList.remove("is-on");
    tipNode.setAttribute("aria-hidden", "true");
    tipOwner = null;
    /* lets charts that track a hovered mark reset their own highlight state */
    if (was) document.dispatchEvent(new CustomEvent("sb:tiphide", { detail: { owner: was } }));
  }
  /**
   * Wire hover + keyboard focus + tap to a mark (or its larger hit target).
   * getContent(evt) → tooltip content (see tipShow). onEnter/onLeave optional for highlighting.
   */
  function bindTip(node, getContent, opts) {
    opts = opts || {};
    var show = function (e) { tipShow(e && e.type === "focus" ? node : e, getContent(e), node); if (opts.onEnter) opts.onEnter(e); };
    var hide = function (e) { tipHide(node); if (opts.onLeave) opts.onLeave(e); };
    node.addEventListener("pointerenter", show);
    node.addEventListener("pointermove", function (e) {
      if (e.pointerType === "touch") return;
      if (tipOwner !== node) show(e); /* re-show after a scroll hid it, without re-entering */
      else tipMove(e);
    });
    node.addEventListener("pointerleave", function (e) { if (e.pointerType !== "touch") hide(e); });
    node.addEventListener("focus", show);
    node.addEventListener("blur", hide);
    return node;
  }
  document.addEventListener("pointerdown", function (e) {
    if (tipOwner && !tipOwner.contains(e.target)) tipHide();
  }, true);
  window.addEventListener("scroll", function () {
    if (!tipOwner) return;
    /* a keyboard-focused mark keeps its tooltip, re-anchored as the page moves; hover tips hide */
    if (document.activeElement === tipOwner) tipMove(tipOwner);
    else tipHide();
  }, { passive: true });

  /* ---------- Data-table twin ---------- */
  /**
   * tableTwin(host, { summary, caption, columns: [{key, label, num, fmt, best}], rows })
   * columns[].best: "max" | "min" bolds the best value in that column.
   */
  function tableTwin(host, spec) {
    var det = el("details", { class: "viz-table" }, el("summary", { text: spec.summary || "Show data table" }));
    var table = el("table", { class: "dtable" });
    if (spec.caption) {
      /* visible caption sits outside the horizontal scroller so it never clips on phones;
         the real <caption> stays for assistive tech */
      det.appendChild(el("p", { class: "viz-table-cap", "aria-hidden": "true", text: spec.caption }));
      table.appendChild(el("caption", { class: "sr-only", text: spec.caption }));
    }
    var thead = el("thead"), tr = el("tr");
    spec.columns.forEach(function (c) { tr.appendChild(el("th", { scope: "col", class: c.num ? "n" : null, text: c.label })); });
    thead.appendChild(tr); table.appendChild(thead);
    var best = {};
    spec.columns.forEach(function (c) {
      if (!c.best) return;
      var vals = spec.rows.map(function (r) { return r[c.key]; }).filter(function (v) { return v != null; });
      best[c.key] = c.best === "min" ? Math.min.apply(null, vals) : Math.max.apply(null, vals);
    });
    var tbody = el("tbody");
    spec.rows.forEach(function (r) {
      var row = el("tr", { class: r._class || null });
      spec.columns.forEach(function (c, i) {
        var v = r[c.key];
        var txt = c.fmt ? c.fmt(v, r) : v == null ? "–" : String(v);
        var cls = [c.num ? "n" : "", best[c.key] != null && v === best[c.key] ? "best" : ""].join(" ").trim();
        row.appendChild(el(i === 0 ? "th" : "td", { scope: i === 0 ? "row" : null, class: cls || null, text: txt }));
      });
      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    /* focusable region so keyboard users (incl. Safari) can scroll wide tables sideways */
    det.appendChild(el("div", { class: "table-scroll", tabindex: "0", role: "region", "aria-label": spec.caption || spec.summary || "Data table" }, table));
    host.appendChild(det);
    return det;
  }

  /* ---------- Roving tab stop: one Tab stop per chart, arrow keys move between marks ---------- */
  function roving(container, selector) {
    var items = Array.prototype.slice.call(container.querySelectorAll(selector));
    if (!items.length) return;
    var hintId = container.id ? container.id + "-kbd-hint" : uid("kbd-hint");
    if (!document.getElementById(hintId)) {
      container.appendChild(el("span", { id: hintId, class: "sr-only", text: "Use the arrow keys to move between data points." }));
    }
    var idx = items.indexOf(document.activeElement);
    if (idx < 0) idx = Math.max(0, Math.min(container.__sbRove || 0, items.length - 1));
    items.forEach(function (n, i) {
      n.setAttribute("tabindex", i === idx ? "0" : "-1");
      n.setAttribute("aria-describedby", hintId);
    });
    container.__sbRove = idx;
    if (container.__sbRoveBound) return;
    container.__sbRoveBound = true;
    var list = function () { return Array.prototype.slice.call(container.querySelectorAll(selector)); };
    /* components may redraw marks on their own (e.g. a metric toggle): keep a single Tab stop */
    if (window.MutationObserver) {
      new MutationObserver(function () {
        var all = list();
        if (!all.length) return;
        var cur = all.indexOf(document.activeElement);
        var keep = cur >= 0 ? cur : Math.max(0, Math.min(container.__sbRove || 0, all.length - 1));
        all.forEach(function (n, k) {
          var want = k === keep ? "0" : "-1";
          if (n.getAttribute("tabindex") !== want) n.setAttribute("tabindex", want);
          if (!n.hasAttribute("aria-describedby")) n.setAttribute("aria-describedby", hintId);
        });
        if (!document.getElementById(hintId)) {
          container.appendChild(el("span", { id: hintId, class: "sr-only", text: "Use the arrow keys to move between data points." }));
        }
      }).observe(container, { childList: true, subtree: true });
    }
    container.addEventListener("keydown", function (e) {
      var all = list(), i = all.indexOf(document.activeElement), j;
      if (i < 0) return;
      switch (e.key) {
        case "ArrowDown": case "ArrowRight": j = Math.min(all.length - 1, i + 1); break;
        case "ArrowUp": case "ArrowLeft": j = Math.max(0, i - 1); break;
        case "Home": j = 0; break;
        case "End": j = all.length - 1; break;
        default: return;
      }
      e.preventDefault();
      if (j === i) return;
      all.forEach(function (n, k) { n.setAttribute("tabindex", k === j ? "0" : "-1"); });
      container.__sbRove = j;
      all[j].focus();
    });
    container.addEventListener("focusin", function (e) {
      var all = list(), i = all.indexOf(e.target);
      if (i < 0) return;
      all.forEach(function (n, k) { n.setAttribute("tabindex", k === i ? "0" : "-1"); });
      container.__sbRove = i;
    });
  }

  /* ---------- Registry & lifecycle ---------- */
  var registry = [];
  var mounted = false;
  var reduceMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  /**
   * register(id, setup, opts?) — opts.roving: CSS selector of focusable marks that should share
   * a single Tab stop (arrow keys move between them); applied after every render.
   */
  function register(id, setup, opts) {
    var entry = { id: id, setup: setup, opts: opts || {} };
    registry.push(entry);
    if (mounted) mount(entry); /* registered after the initial mount pass */
  }

  function mount(entry) {
    var host = document.getElementById(entry.id);
    if (!host) return;
    if (!window.SLACKBENCH || !window.SLACKBENCH.results) {
      clear(host).appendChild(el("p", { class: "viz-error", text: "The data for this chart could not be loaded." }));
      return;
    }
    var render = null, lastW = -1, raf = 0;
    var run = function (force) {
      var w = host.clientWidth;
      if (!force && Math.abs(w - lastW) < 1) return;
      lastW = w;
      try {
        if (render) render();
        if (entry.opts.roving) roving(host, entry.opts.roving);
      }
      catch (err) {
        console.error("[SBViz] render failed for #" + entry.id, err);
      }
    };
    try {
      var out = entry.setup(host, api);
      render = typeof out === "function" ? out : out && out.render;
    } catch (err) {
      console.error("[SBViz] setup failed for #" + entry.id, err);
      clear(host).appendChild(el("p", { class: "viz-error", text: "This chart could not be displayed." }));
      return;
    }
    run(true);
    var schedule = function (force) {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(function () { run(force); });
    };
    if (window.ResizeObserver) new ResizeObserver(function () { schedule(false); }).observe(host);
    else window.addEventListener("resize", function () { schedule(false); });
    document.addEventListener("sb:themechange", function () { schedule(true); });
    /* re-measure text once web fonts arrive (skipped when they were already loaded) */
    if (document.fonts && document.fonts.ready && document.fonts.status !== "loaded") {
      document.fonts.ready.then(function () { schedule(true); });
    }
  }

  function mountAll() {
    if (mounted) return;
    mounted = true;
    /* one chart per task, in page order, so slow phones never see one long blocking task */
    var queue = registry.slice().sort(function (a, b) {
      var na = document.getElementById(a.id), nb = document.getElementById(b.id);
      if (!na || !nb) return 0;
      return na.compareDocumentPosition(nb) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });
    var next = function () {
      var entry = queue.shift();
      if (!entry) { document.dispatchEvent(new CustomEvent("sb:mounted")); return; }
      mount(entry);
      setTimeout(next, 0);
    };
    next();
  }

  /* Escape dismisses any open chart tooltip (WCAG 1.4.13) */
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && tipOwner) tipHide();
  });

  var api = {
    data: D, CATS: CATS, HARNESS_SHAPE: HARNESS_SHAPE, harnessShape: harnessShape,
    el: el, s: s, clear: clear, uid: uid, css: css, color: color, onFill: onFill,
    linear: linear, log: log, niceTicks: niceTicks, fmt: fmt,
    hbar: hbar, vbar: vbar, marker: marker, measureText: measureText,
    tip: { show: tipShow, move: tipMove, hide: tipHide }, bindTip: bindTip,
    tableTwin: tableTwin, roving: roving, register: register, reduceMotion: reduceMotion
  };
  window.SBViz = api;

  /* Deferred scripts run while readyState is "interactive", before DOMContentLoaded;
     component scripts register in between, so mount on DOMContentLoaded (or load). */
  document.addEventListener("DOMContentLoaded", mountAll);
  window.addEventListener("load", mountAll);
  if (document.readyState === "complete") setTimeout(mountAll, 0);
})();
