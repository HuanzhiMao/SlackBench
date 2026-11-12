/* ===========================================================================
   findings-b.js — visuals for Findings 01, 05, 06 and 07
     #viz-human         Humans vs. 33 agents, by category      (strip plot)
     #viz-harness       Same model, different harness         (dot plot)
     #viz-answer-first  Answer first, caveat later            (ranked bars)
     #viz-validity      The measurements hold up              (stat tiles, matrix, dumbbells)
   Built on SBViz (core.js). Every number comes from window.SLACKBENCH (data.js);
   the only derived values are medians, ranks and differences computed from it.
   Layering in every chart: a decorative SVG (role="img", aria-label = takeaway)
   plus an HTML overlay of focusable hit targets (.fb-hit) that drive the tooltip.
   =========================================================================== */
(function () {
  "use strict";
  var V = window.SBViz;
  if (!V) return;

  /* ---------- shared helpers ---------- */
  var LAB = 12;          /* px: in-chart labels */
  var NAME = 13;         /* px: row names */
  var CAT_NAME = {};
  V.CATS.forEach(function (c) { CAT_NAME[c.key] = c.name; });

  function font(size, weight) { return (weight || 400) + " " + size + "px " + (V.css("--font-sans") || "sans-serif"); }
  function tw(text, size, weight) { return V.measureText(String(text), font(size, weight)) + 1; }
  function f2(v) { return V.fmt.pct(v, 2); }                          /* 80.25, 62.50 — the paper's precision */
  function raw(v) { return v == null ? "–" : String(v); }             /* human scores as reported: 91, 84.5 */
  function signed(v) { return v > 0 ? "+" + f2(v) : v < 0 ? "−" + f2(-v) : f2(0); }
  function round2(v) { return Math.round(v * 100) / 100; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function paperUrl() { var c = window.SLACKBENCH_CONFIG; return (c && c.links && c.links.paper) || null; }
  function focusVisible(node) { try { return node.matches(":focus-visible"); } catch (e) { return true; } }

  function head(host, title, sub) {
    host.appendChild(V.el("div", { class: "viz-head" },
      V.el("div", null,
        V.el("h4", { class: "viz-title", text: title }),
        sub ? V.el("p", { class: "viz-sub", text: sub }) : null)));
  }
  function foot(host, text) {
    var url = paperUrl();
    host.appendChild(V.el("div", { class: "viz-foot" },
      V.el("span", { text: text }),
      url ? V.el("a", { href: url, target: "_blank", rel: "noopener", text: "Source: paper" }) : V.el("span", { text: "Source: paper" })));
  }
  /* legend key: a tiny inline SVG that mirrors the mark */
  function key(children, w) {
    w = w || 14;
    return V.s("svg", { class: "fb-key", width: w, height: 14, viewBox: "0 0 " + w + " 14", "aria-hidden": "true", focusable: "false" }, children);
  }
  function legend(items, cls) {
    var l = V.el("div", { class: "viz-legend fb-legend" + (cls ? " " + cls : "") });
    items.forEach(function (it) { l.appendChild(V.el("span", null, it[0], V.el("span", { text: it[1] }))); });
    return l;
  }
  /* values render with tabular figures: measure them as if every digit were a "0" */
  function twNum(v, size, weight) { return tw(String(v).replace(/[0-9]/g, "0"), size, weight); }
  /* "Key value" label (muted key, strong value), left edge at x0. */
  function kvWidth(k, v) { return tw(k, LAB, 400) + 4 + twNum(v, LAB, 600); }
  function kvText(x0, y, k, v) {
    return V.s("text", { x: x0, y: y, class: "fb-lab fb-halo" },
      V.s("tspan", { class: "fb-k", text: k }),
      V.s("tspan", { class: "fb-v", dx: 4, text: v }));
  }
  /* A column cell: muted key at xKey, value right-aligned at xRight (values line up across rows). */
  function kvCol(xKey, xRight, y, k, v) {
    var g = V.s("g", { class: "fb-lab" });
    g.appendChild(V.s("text", { x: xKey, y: y, class: "fb-k fb-halo", text: k }));
    g.appendChild(V.s("text", { x: xRight, y: y, "text-anchor": "end", class: "fb-v fb-halo", text: v }));
    return g;
  }
  /* Row name with a muted suffix (e.g. model + harness). */
  function nameText(x0, y, main, rest) {
    var t = V.s("text", { x: x0, y: y, class: "fb-name fb-halo" }, V.s("tspan", { text: main }));
    if (rest) t.appendChild(V.s("tspan", { class: "fb-muted", dx: 6, text: rest }));
    return t;
  }
  function axisTicks(svg, x, ticks, y, fmtTick) {
    var g = V.s("g", { class: "axis", "aria-hidden": "true" });
    ticks.forEach(function (t) {
      g.appendChild(V.s("text", { x: x(t), y: y, "text-anchor": "middle", text: fmtTick ? fmtTick(t) : String(t) }));
    });
    svg.appendChild(g);
  }
  function gridLines(g, x, ticks, y1, y2) {
    ticks.forEach(function (t) { g.appendChild(V.s("line", { x1: x(t), x2: x(t), y1: y1, y2: y2 })); });
  }
  /* A focusable, positioned hit target in the HTML overlay. */
  function hitBox(layer, x, y, w, h, label, cls) {
    var n = V.el("div", {
      class: "fb-hit" + (cls ? " " + cls : ""), tabindex: "0", role: "img", "aria-label": label,
      style: { left: x + "px", top: y + "px", width: w + "px", height: h + "px" }
    });
    layer.appendChild(n);
    return n;
  }
  /* Table twin (core.js) + two local fixes: the caption is repeated above the scroll box so it
     never clips with a wide table (the real <caption> stays for assistive tech), and the given
     columns may wrap while the rest stay on one line. */
  function twin(host, spec, wrapCols) {
    var det = V.tableTwin(host, spec);
    var cap = det.querySelector("caption"), sc = det.querySelector(".table-scroll");
    if (cap && sc && !det.querySelector(".viz-table-cap")) {
      det.insertBefore(V.el("p", { class: "fb-cap", "aria-hidden": "true", text: cap.textContent }), sc);
      cap.classList.add("sr-only");
    }
    (wrapCols || []).forEach(function (ci) {
      det.querySelectorAll("tr").forEach(function (tr) { if (tr.children[ci]) tr.children[ci].classList.add("fb-wrap"); });
    });
    return det;
  }
  function overlaps(list, b, pad) {
    pad = pad == null ? 8 : pad;
    for (var i = 0; i < list.length; i++) if (b.x0 < list[i].x1 + pad && list[i].x0 < b.x1 + pad) return true;
    return false;
  }

  /* Deterministic beeswarm: each dot takes the smallest vertical offset (≤ cap)
     that keeps it clear of dots already placed; failing that, the least-overlap offset.
     Highest values are placed first, so the best agent sits on the row's center line. */
  function swarm(items, x, cap, rS, rB) {
    var placed = [];
    function clearance(cx, dy, r) {
      var m = Infinity;
      for (var i = 0; i < placed.length; i++) {
        var p = placed[i], ddx = cx - p._cx, ddy = dy - p._dy;
        var c = Math.sqrt(ddx * ddx + ddy * ddy) - (r + p._r + 0.5);
        if (c < m) m = c;
      }
      return m;
    }
    items.slice().sort(function (p, q) { return q.v - p.v || p.i - q.i; }).forEach(function (t) {
      var cx = x(t.v), r = t.best ? rB : rS, dy = null, k, j, o;
      for (k = 0; k <= cap && dy === null; k++) {
        var c = k === 0 ? [0] : [k, -k];
        for (j = 0; j < c.length; j++) if (clearance(cx, c[j], r) >= 0) { dy = c[j]; break; }
      }
      if (dy === null) {
        var bestC = -Infinity;
        for (o = -cap; o <= cap; o++) { var cl = clearance(cx, o, r); if (cl > bestC + 1e-9) { bestC = cl; dy = o; } }
      }
      t._cx = cx; t._dy = dy; t._r = r;
      placed.push(t);
    });
  }

  /* =========================================================================
     01 · Humans vs. 33 agents, by category
     ========================================================================= */
  V.register("viz-human", function (host, api) {
    var D = api.data, R = D.results || [], HU = D.human || {};
    var N = R.length;
    var top1 = R.slice().sort(function (p, q) { return (p.rank || 1e9) - (q.rank || 1e9) || q.overall - p.overall; })[0] || {};
    var defs = [{ key: "overall", name: "Overall", cat: "overall" }].concat(api.CATS.map(function (c) {
      return { key: c.key, name: c.name, cat: c.key };
    }));
    var rows = defs.map(function (def) {
      var items = [];
      R.forEach(function (a, i) { if (typeof a[def.key] === "number") items.push({ i: i, a: a, v: a[def.key] }); });
      var vals = items.map(function (t) { return t.v; }).sort(function (p, q) { return p - q; });
      var n = vals.length, max = vals[n - 1];
      var median = n % 2 ? vals[(n - 1) / 2] : (vals[n / 2 - 1] + vals[n / 2]) / 2;
      items.forEach(function (t) {
        t.best = t.v === max;
        t.rank = 1 + items.filter(function (o) { return o.v > t.v; }).length;
        t.tied = items.filter(function (o) { return o.v === t.v; }).length > 1;
      });
      return {
        def: def, items: items, n: n, max: max, median: median, human: HU[def.key],
        best: items.filter(function (t) { return t.best; })
      };
    });
    var ci = HU.ci95 && HU.ci95.length === 2 ? HU.ci95 : null;
    var ciText = ci ? ci[0].toFixed(1) + "–" + ci[1].toFixed(1) : "";
    var who = (HU.annotators || 3) + " researchers";
    function agentLabel(a) { return a.model + " (" + a.harness + ")"; }
    var summary = "Strip plot of pass rates (%) for " + N + " agents, with human researchers marked, overall and in each task category. " +
      "Best agent vs. humans: " + rows.map(function (r) { return r.def.name + " " + f2(r.max) + " vs. " + raw(r.human); }).join("; ") + ". " +
      "Ringed in every row: " + agentLabel(top1) + ", the top agent overall: " +
      rows.map(function (r) { return r.def.name + " " + f2(top1[r.def.key]); }).join(", ") + ".";

    /* ---- static scaffolding (built once) ---- */
    var topIdx = R.indexOf(top1);
    api.clear(host);
    host.classList.add("fb-card");
    head(host, "Humans vs. " + N + " agents, by category",
      "Pass rate (%). Each dot is one agent; the vertical tick marks human researchers.");
    host.appendChild(legend([
      [key(api.s("circle", { cx: 7, cy: 7, r: 4, class: "fb-dot--agent" })), "Agent"],
      [key(api.s("circle", { cx: 7, cy: 7, r: 5.5, class: "fb-dot--best", "data-cat": "overall" })), "Best agent in row"],
      topIdx >= 0 ? [key(api.s("circle", { cx: 7, cy: 7, r: 5.5, class: "fb-ring fb-ring--echo" })), top1.model + ", top overall"] : null,
      [key(api.s("line", { x1: 7, x2: 7, y1: 1, y2: 13, class: "fb-human" })), "Human researchers"],
      ci ? [key([api.s("rect", { x: 0, y: 1, width: 20, height: 12, rx: 2, class: "fb-ci fb-ci--key" })], 20), "Human 95% CI (overall)"] : null
    ].filter(Boolean)));
    var body = api.el("div", { class: "viz-body fb-body" });
    host.appendChild(body);
    var live = api.el("p", { class: "sr-only", "aria-live": "polite" });
    host.appendChild(live);
    twin(host, {
      summary: "Show data table",
      caption: "Pass rate (%). Best agent of the " + N + " in each row, the median agent, and " + agentLabel(top1) +
        ", the top agent overall (ringed in the chart). Every agent's scores are in the leaderboard.",
      columns: [
        { key: "cat", label: "Category" },
        { key: "human", label: "Human", num: true, fmt: raw },
        { key: "bestName", label: "Best agent" },
        { key: "best", label: "Score", num: true, fmt: f2 },
        { key: "median", label: "Median", num: true, fmt: f2 },
        { key: "top", label: top1.model, num: true, fmt: f2 }
      ],
      rows: rows.map(function (r) {
        return {
          cat: r.def.name, human: r.human, best: r.max, median: r.median, top: top1[r.def.key],
          bestName: r.best.map(function (t) { return agentLabel(t.a); }).join("; ")
        };
      })
    }, [0, 2]);
    foot(host, "Agents: mean of 3 runs. Humans: " + who + " allowed to use AI tools" +
      (ci ? "; band = 95% bootstrap CI" : "") + ". Rings follow the top agent overall, or the dot you hover.");

    /* ---- interaction state ---- */
    /* Rings: at rest they trace the top agent overall through every row (the prose compares its
       per-category scores with the humans); hovering or focusing a dot moves them to that agent. */
    var geo = null, hiG = null, owner = null, cursor = {}, hiRow = -1;
    function rings(i, ri) {
      api.clear(hiG);
      if (i < 0) return;
      geo.forEach(function (g, rj) {
        var t = g.byAgent[i];
        if (!t) return;
        hiG.appendChild(api.s("circle", {
          cx: t._cx, cy: g.cy + t._dy, r: t._r + 3.5,
          class: "fb-ring" + (rj === ri ? "" : " fb-ring--echo")
        }));
      });
    }
    function clearHi(ri) {
      if (ri != null && ri !== hiRow) return;   /* another row owns the highlight now */
      if (hiG && geo) rings(topIdx, -1);
      hiRow = -1;
    }
    function hiAgent(i, ri) {
      rings(i, ri);
      hiRow = ri;
    }
    function hiHuman(ri) {
      rings(topIdx, -1);
      hiRow = ri;
      var g = geo[ri];
      hiG.appendChild(api.s("line", { x1: g.hx, x2: g.hx, y1: g.tickY1, y2: g.tickY2, class: "fb-human fb-human--hi" }));
    }
    function tipFor(ri, t) {
      var r = rows[ri];
      if (t === "human") {
        return {
          title: "Human researchers (with AI tools)", sub: r.def.name + " · mean of " + who, big: raw(r.human),
          rows: [{ label: "Best agent", value: f2(r.max), colorKey: r.def.cat }],
          note: r.def.key === "overall" && ci ? "95% bootstrap CI " + ciText : null
        };
      }
      return {
        title: t.a.model, sub: t.a.harness + " · " + r.def.name, big: f2(t.v),
        rows: [{ label: "Human researchers", value: raw(r.human), colorKey: "human" }],
        note: t.best ? (r.best.length > 1 ? "Tied for best of " + r.n + " agents" : "Best of " + r.n + " agents")
          : "Rank " + t.rank + " of " + r.n + (t.tied ? " (tied)" : "")
      };
    }
    function say(ri, t) {
      var r = rows[ri];
      live.textContent = t === "human"
        ? r.def.name + ": human researchers, " + raw(r.human) + "."
        : r.def.name + ": " + t.a.model + ", " + t.a.harness + ", " + f2(t.v) + (t.best ? ", best of " + r.n : ", rank " + t.rank + " of " + r.n) + ".";
    }

    function bindRow(hit, ri) {
      var g = geo[ri], current = null;
      function show(t, at) {
        current = t;
        if (t === "human") hiHuman(ri); else hiAgent(t.i, ri);
        owner = hit;
        api.tip.show(at || (t === "human" ? g.hEl : t._el), tipFor(ri, t), hit);
      }
      function hide() { current = null; clearHi(ri); api.tip.hide(hit); }
      function nearest(px, py) {
        var bestT = null, bestD = Infinity;
        rows[ri].items.forEach(function (t) {
          var dx = px - t._cx, dy = py - (g.cy + t._dy);
          var d = Math.sqrt(dx * dx + dy * dy) - t._r;
          if (d < bestD) { bestD = d; bestT = t; }
        });
        var dH = py < g.bandTop
          ? (px >= g.hLab[0] - 4 && px <= g.hLab[1] + 4 ? 0 : Math.abs(px - g.hx) + (g.bandTop - py))
          : Math.abs(px - g.hx) - 1;
        if (dH < bestD) { bestD = dH; bestT = "human"; }
        /* the "Best …" label below the band points at the best agent */
        if (py > g.bandTop + g.bandH && px >= g.bLab[0] - 4 && px <= g.bLab[1] + 4) return rows[ri].best[0];
        return bestD <= 14 ? bestT : null;
      }
      function onPoint(e) {
        var b = hit.getBoundingClientRect();
        var t = nearest(e.clientX - b.left, e.clientY - b.top + g.y0);
        if (!t) { if (current) hide(); return; }
        /* re-show when the target changed, or when a scroll hid the tooltip (hiRow reset) */
        if (t !== current || hiRow !== ri) show(t, e); else api.tip.move(e);
      }
      function step(t) { cursor[ri] = t === "human" ? "human" : t.i; show(t); say(ri, t); }
      hit.addEventListener("pointermove", function (e) { if (e.pointerType !== "touch") onPoint(e); });
      hit.addEventListener("pointerdown", function (e) { if (e.pointerType === "touch") onPoint(e); });
      hit.addEventListener("pointerleave", function (e) { if (e.pointerType !== "touch") hide(); });
      hit.addEventListener("focus", function () {
        if (!focusVisible(hit)) return;
        var seq = g.seq, c = cursor[ri], t = null;
        for (var i = 0; i < seq.length && t === null; i++) if ((seq[i] === "human" ? "human" : seq[i].i) === c) t = seq[i];
        step(t || rows[ri].best[0]);
      });
      hit.addEventListener("blur", hide);
      hit.addEventListener("keydown", function (e) {
        var seq = g.seq, k = e.key, idx = seq.indexOf(current);
        if (k === "Escape") { hide(); return; }
        if (k !== "ArrowRight" && k !== "ArrowLeft" && k !== "ArrowUp" && k !== "ArrowDown" && k !== "Home" && k !== "End") return;
        if (k === "ArrowUp" || k === "ArrowDown") return; /* leave vertical keys to the page */
        e.preventDefault();
        if (idx < 0) idx = seq.indexOf(rows[ri].best[0]);
        if (k === "ArrowRight") idx = Math.min(seq.length - 1, idx + 1);
        else if (k === "ArrowLeft") idx = Math.max(0, idx - 1);
        else if (k === "Home") idx = 0;
        else idx = seq.length - 1;
        step(seq[idx]);
      });
    }

    /* core.js hides the tooltip on scroll (unless its owner has focus); drop the rings with it */
    window.addEventListener("scroll", function () {
      if (hiRow >= 0 && geo && geo[hiRow] && document.activeElement !== geo[hiRow].hit) clearHi();
    }, { passive: true });

    return function render() {
      if (owner) api.tip.hide(owner);
      owner = null;
      hiRow = -1;
      api.clear(body);
      var W = Math.floor(body.clientWidth);
      if (W < 60) return;
      var narrow = W < 440;
      var padL = 6, padR = 12;
      var x = api.linear([0, 100], [padL, W - padR]);
      var rS = 4, rB = 6, cap = narrow ? 16 : 14;
      var headH = 22, bandH = 2 * (cap + rS + 2), labH = 19, gap = narrow ? 12 : 14;
      var rowH = headH + bandH + labH;
      var axisY = rows.length * (rowH + gap) - gap + 10;
      var H = axisY + 14;
      var ticks = x.ticks(5);

      var svg = api.s("svg", { class: "fb-svg", width: W, height: H, viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": summary });
      var gGrid = api.s("g", { class: "grid", "aria-hidden": "true" });
      var gBack = api.s("g"), gMuted = api.s("g"), gTick = api.s("g"), gBest = api.s("g"), gText = api.s("g");
      hiG = api.s("g", { class: "fb-hi", "aria-hidden": "true" });
      var hits = api.el("div", { class: "fb-hits" });
      geo = [];

      rows.forEach(function (r, ri) {
        var y0 = ri * (rowH + gap), bandTop = y0 + headH, cy = bandTop + bandH / 2;
        gridLines(gGrid, x, ticks, bandTop, bandTop + bandH);

        /* row name with its color key */
        gText.appendChild(api.s("circle", { cx: 5, cy: y0 + 9.5, r: 4.5, class: "fb-dot--best", "data-cat": r.def.cat }));
        gText.appendChild(nameText(16, y0 + 14, r.def.name));
        var nameRight = 16 + tw(r.def.name, NAME, 500);

        /* human 95% CI (overall only) */
        if (r.def.key === "overall" && ci) {
          gBack.appendChild(api.s("rect", { x: x(ci[0]), y: bandTop, width: x(ci[1]) - x(ci[0]), height: bandH, rx: 3, class: "fb-ci" }));
        }

        /* agents */
        swarm(r.items, x, cap, rS, rB);
        var byAgent = {};
        r.items.forEach(function (t) {
          t._el = api.s("circle", {
            cx: t._cx, cy: cy + t._dy, r: t._r,
            class: "fb-dot " + (t.best ? "fb-dot--best" : "fb-dot--agent"), "data-cat": t.best ? r.def.cat : null
          });
          (t.best ? gBest : gMuted).appendChild(t._el);
          byAgent[t.i] = t;
        });

        /* human tick + label above the band */
        var hx = x(r.human), tickY1 = y0 + headH - 3, tickY2 = bandTop + bandH;
        var hEl = api.s("line", { x1: hx, x2: hx, y1: tickY1, y2: tickY2, class: "fb-human" });
        gTick.appendChild(hEl);
        var hw = kvWidth("Human", raw(r.human));
        var hx0 = clamp(hx - hw / 2, 0, W - hw);
        var hLine = "top";
        if (hx0 < nameRight + 10) { hx0 = Math.max(hx + 6, nameRight + 10); if (hx0 + hw > W) hLine = "bottom"; }

        /* best-agent label below the band */
        var bx = x(r.max), bw = kvWidth("Best", f2(r.max));
        var bx0 = clamp(bx - bw / 2, 0, W - bw);
        var labY = bandTop + bandH + 14;
        gText.appendChild(kvText(bx0, labY, "Best", f2(r.max)));
        if (hLine === "bottom") {
          hx0 = clamp(hx - hw / 2, 0, W - hw);
          if (!overlaps([{ x0: bx0, x1: bx0 + bw }], { x0: hx0, x1: hx0 + hw })) gText.appendChild(kvText(hx0, labY, "Human", raw(r.human)));
          else hLine = "none";
        } else {
          gText.appendChild(kvText(hx0, y0 + 14, "Human", raw(r.human)));
        }

        /* keyboard order: left to right, human included */
        var seq = r.items.slice().sort(function (p, q) { return p.v - q.v || q.i - p.i; });
        var at = 0;
        while (at < seq.length && seq[at].v <= r.human) at++;
        seq.splice(at, 0, "human");

        geo.push({
          y0: y0, cy: cy, bandTop: bandTop, bandH: bandH, hx: hx, hEl: hEl, tickY1: tickY1, tickY2: tickY2,
          hLab: hLine === "top" ? [hx0, hx0 + hw] : [hx - 4, hx + 4], bLab: [bx0, bx0 + bw], byAgent: byAgent, seq: seq
        });

        var label = r.def.name + ". Best agent: " + r.best.map(function (t) { return agentLabel(t.a); }).join(" and ") + ", " + f2(r.max) +
          ". Human researchers: " + raw(r.human) + (r.def.key === "overall" && ci ? " (95% CI " + ciText + ")" : "") +
          ". Median of " + r.n + " agents: " + f2(r.median) + ". Use left and right arrow keys to step through the agents.";
        geo[ri].hit = hitBox(hits, 0, y0, W, rowH, label, "fb-hit--row");
        bindRow(geo[ri].hit, ri);
      });

      svg.appendChild(gGrid);
      svg.appendChild(gBack);
      svg.appendChild(gMuted);
      svg.appendChild(gTick);
      svg.appendChild(gBest);
      svg.appendChild(gText);
      svg.appendChild(hiG);
      rings(topIdx, -1);
      axisTicks(svg, x, ticks, axisY + 2);
      body.appendChild(svg);
      body.appendChild(hits);
    };
  });

  /* =========================================================================
     05 · Same model, different harness
     ========================================================================= */
  V.register("viz-harness", function (host, api) {
    var R = api.data.results || [];
    var byModel = {}, order = [];
    R.forEach(function (a) {
      if (!byModel[a.model]) { byModel[a.model] = []; order.push(a.model); }
      byModel[a.model].push(a);
    });
    var groups = order.filter(function (m) { return byModel[m].length >= 2; }).map(function (m) {
      var list = byModel[m].slice().sort(function (p, q) { return p.overall - q.overall; });
      var lo = list[0], hi = list[list.length - 1];
      return { model: m, list: list, lo: lo, hi: hi, spread: round2(hi.overall - lo.overall) };
    }).sort(function (p, q) { return q.spread - p.spread || p.model.localeCompare(q.model); });
    var maxV = Math.max.apply(null, groups.map(function (g) { return g.hi.overall; }));
    var DOM_HI = Math.ceil(maxV / 20) * 20;
    var MR = 5.5, DODGE = 6;
    var summary = "Dot plot of overall pass rate (%) for the " + groups.length + " models that were run in more than one harness. " +
      groups.map(function (g) {
        return g.model + ": " + g.list.slice().reverse().map(function (a) { return a.harness + " " + f2(a.overall); }).join(", ") + " (spread " + f2(g.spread) + ")";
      }).join("; ") + ".";

    /* legend: one shape per harness (the site-wide harness shape language) */
    var seen = [];
    groups.forEach(function (g) { g.list.forEach(function (a) { if (seen.indexOf(a.harness) < 0) seen.push(a.harness); }); });
    var named = ["Claude Code", "Codex CLI", "OpenHands", "Terminus-2"].filter(function (h) { return seen.indexOf(h) >= 0; });
    var other = seen.filter(function (h) { return api.harnessShape(h) === "diamond"; }).sort();
    var items = named.map(function (h) { return [key(api.s("path", { d: api.marker(api.harnessShape(h), 7, 7, 4.6), class: "fb-mark-key" })), h]; });
    if (other.length) items.push([key(api.s("path", { d: api.marker("diamond", 7, 7, 4.6), class: "fb-mark-key" })), other.join(", ")]);

    api.clear(host);
    host.classList.add("fb-card");
    head(host, "Same model, different harness",
      "Overall pass rate (%) of each model in every harness it was run in. Δ = best minus worst harness; rows sorted by Δ.");
    host.appendChild(legend(items));
    var body = api.el("div", { class: "viz-body fb-body" });
    host.appendChild(body);
    var tRows = [];
    groups.forEach(function (g) {
      g.list.slice().reverse().forEach(function (a, i) {
        tRows.push({ model: g.model, harness: a.harness, overall: a.overall, AS: a.AS, HA: a.HA, SU: a.SU, CI: a.CI, spread: i === 0 ? g.spread : null });
      });
    });
    twin(host, {
      summary: "Show data table",
      caption: "Pass rate (%) by harness for models run in more than one harness. Δ: best minus worst harness, overall.",
      columns: [
        { key: "model", label: "Model" }, { key: "harness", label: "Harness" },
        { key: "overall", label: "Overall", num: true, fmt: f2 },
        { key: "AS", label: "AS", num: true, fmt: f2 }, { key: "HA", label: "HA", num: true, fmt: f2 },
        { key: "SU", label: "SU", num: true, fmt: f2 }, { key: "CI", label: "CI", num: true, fmt: f2 },
        { key: "spread", label: "Δ", num: true, fmt: function (v) { return v == null ? "" : f2(v); } }
      ],
      rows: tRows
    }, [0]);
    foot(host, "Each marker is one harness–model pair from the leaderboard; shapes match the cost chart.");

    var ringG = null, ringOwner = null, owner = null;
    window.addEventListener("scroll", function () {
      if (ringOwner && document.activeElement !== ringOwner) { api.clear(ringG); ringOwner = null; }
    }, { passive: true });
    function tipFor(g, a) {
      return {
        title: g.model, sub: a.harness + " · Overall", big: f2(a.overall),
        rows: api.CATS.map(function (c) { return { label: c.name, value: f2(a[c.key]), colorKey: c.key }; })
      };
    }

    /* Marker layout for one row.
       1) Markers closer than THR px are dodged vertically, alternating along a chain; a ▲/▼ pair
          puts ▼ on top (tips meet: an hourglass, never mistaken for the ◆ "other" marker).
       2) Labels: a marker dodged down owns the slot below the line; ends of the span label outward
          (left of the leftmost, right of the rightmost); anything else goes below, or nowhere if it
          would collide (the tooltip and the table still carry it). */
    var THR = 2 * MR - 1;
    function place(g, x, W) {
      var ms = g.list.map(function (a) { return { a: a, x: x(a.overall), dy: 0, shape: api.harnessShape(a.harness) }; });
      for (var i = 1; i < ms.length; i++) {
        if (ms[i].x - ms[i - 1].x >= THR) continue;
        if (!ms[i - 1].dy) {
          var flip = ms[i - 1].shape === "triangle" && ms[i].shape === "triangle-down";
          ms[i - 1].dy = flip ? DODGE : -DODGE;
        }
        ms[i].dy = -ms[i - 1].dy;
      }
      var xmin = ms[0].x, xmax = ms[ms.length - 1].x, boxes = [], needsBelow = false;
      var order = ms.map(function (m, k) { return k; }).sort(function (p, q) {
        return (ms[q].dy > 0 ? 1 : 0) - (ms[p].dy > 0 ? 1 : 0) || p - q;
      });
      order.forEach(function (k) {
        var m = ms[k], w = tw(m.a.harness, LAB, 400), cands = [];
        if (m.dy > 0) cands.push("below");
        if (m.x - xmin < THR) cands.push("left");
        if (xmax - m.x < THR) cands.push("right");
        if (m.dy === 0) cands.push("below");
        m.lab = null;
        for (var c = 0; c < cands.length && !m.lab; c++) {
          var b, cy = m.dy;
          if (cands[c] === "left") b = { x0: m.x - MR - 7 - w, x1: m.x - MR - 7, ty: cy + 4 };
          else if (cands[c] === "right") b = { x0: m.x + MR + 7, x1: m.x + MR + 7 + w, ty: cy + 4 };
          else { var c0 = clamp(m.x - w / 2, 0, W - w); b = { x0: c0, x1: c0 + w, ty: 21 + Math.max(0, cy), below: true }; }
          if (b.x0 < 0 || b.x1 > W) continue;
          var hit = boxes.some(function (o) {
            return b.x0 < o.x1 + 6 && o.x0 < b.x1 + 6 && Math.abs(b.ty - o.ty) < 13;
          });
          if (hit) continue;
          m.lab = b;
          boxes.push(b);
          if (b.below) needsBelow = true;
        }
      });
      var dyMax = Math.max.apply(null, ms.map(function (m) { return Math.abs(m.dy); }));
      return { ms: ms, needsBelow: needsBelow, dyMax: dyMax };
    }

    return function render() {
      if (owner) api.tip.hide(owner);
      owner = null;
      api.clear(body);
      var W = Math.floor(body.clientWidth);
      if (W < 60) return;
      var padL = 8, padR = 12;
      var x = api.linear([0, DOM_HI], [padL, W - padR]);
      var ticks = x.ticks(4);
      var HEAD = 20, LINE = 15, GAP = 14;
      var layout = [], y = 0;
      groups.forEach(function (g) {
        var p = place(g, x, W);
        var base = HEAD + LINE + (p.dyMax ? 2 : 0);
        var h = base + (p.needsBelow ? 21 + p.dyMax + 4 : MR + 7 + p.dyMax);
        layout.push({ g: g, p: p, y0: y, lineY: y + base, h: h });
        y += h + GAP;
      });
      var plotBottom = y - GAP;
      var axisY = plotBottom + 18;
      var H = axisY + 4;

      var svg = api.s("svg", { class: "fb-svg", width: W, height: H, viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": summary });
      var gGrid = api.s("g", { class: "grid", "aria-hidden": "true" });
      gridLines(gGrid, x, ticks, layout.length ? layout[0].lineY - 12 : 0, plotBottom);
      svg.appendChild(gGrid);
      var gRows = api.s("g");
      svg.appendChild(gRows);
      ringG = api.s("g", { class: "fb-hi", "aria-hidden": "true" });
      ringOwner = null;
      var hits = api.el("div", { class: "fb-hits" });

      var dCol = Math.max.apply(null, groups.map(function (g) { return kvWidth("Δ", f2(g.spread)); }));
      layout.forEach(function (L) {
        var g = L.g, ly = L.lineY, gr = api.s("g");
        gr.appendChild(nameText(0, L.y0 + 14, g.model));
        gr.appendChild(kvCol(W - dCol, W, L.y0 + 14, "Δ", f2(g.spread)));
        gr.appendChild(api.s("line", { x1: x(g.lo.overall), x2: x(g.hi.overall), y1: ly, y2: ly, class: "fb-conn" }));
        L.p.ms.forEach(function (m) {
          m.el = api.s("path", { d: api.marker(m.shape, m.x, ly + m.dy, MR), class: "fb-mark" });
          gr.appendChild(m.el);
        });
        L.p.ms.forEach(function (m) {
          if (!m.lab) return;
          gr.appendChild(api.s("text", { x: m.lab.x0, y: ly + m.lab.ty, class: "fb-hlab fb-halo", text: m.a.harness }));
        });
        gRows.appendChild(gr);
        L.p.ms.forEach(function (m) {
          var a = m.a;
          var hit = hitBox(hits, m.x - 12, ly + m.dy - 12, 24, 24,
            g.model + " in " + a.harness + ": " + f2(a.overall) + " overall", "fb-hit--dot");
          api.bindTip(hit, function () { owner = hit; return tipFor(g, a); }, {
            onEnter: function () {
              api.clear(ringG);
              ringOwner = hit;
              ringG.appendChild(api.s("circle", { cx: m.x, cy: ly + m.dy, r: MR + 5, class: "fb-ring" }));
            },
            onLeave: function () { if (ringOwner === hit) { api.clear(ringG); ringOwner = null; } }
          });
        });
      });
      svg.appendChild(ringG);
      axisTicks(svg, x, ticks, axisY);
      body.appendChild(svg);
      body.appendChild(hits);
    };
  }, { roving: ".fb-hit" });

  /* =========================================================================
     06 · Answer first, caveat later
     ========================================================================= */
  V.register("viz-answer-first", function (host, api) {
    var AF = (api.data.answerFirst || []).slice().sort(function (p, q) { return q.pct - p.pct; });
    var maxV = Math.max.apply(null, AF.map(function (d) { return d.pct; }));
    var DOM_HI = Math.max(10, Math.ceil(maxV / 10) * 10 + (maxV % 10 === 0 ? 10 : 0));
    var summary = "Ranked bar chart: share of Hallucination tasks where the agent gives a specific answer first and only notes at the end that it rests on a different premise. " +
      AF.map(function (d) { return d.model + " (" + d.harness + ") " + d.pct + "%"; }).join(", ") + ".";

    api.clear(host);
    host.classList.add("fb-card");
    head(host, "Answer first, caveat later",
      "Share of Hallucination tasks where the agent gives a specific answer first and only notes at the end that it rests on a different premise");
    var body = api.el("div", { class: "viz-body fb-body" });
    host.appendChild(body);
    twin(host, {
      summary: "Show data table",
      caption: "Share of Hallucination (HA) tasks with an answer-first, caveat-later response.",
      columns: [
        { key: "model", label: "Model" }, { key: "harness", label: "Harness" },
        { key: "pct", label: "Share of HA tasks (%)", num: true, fmt: function (v) { return raw(v); } }
      ],
      rows: AF
    });
    foot(host, "Axis: share of Hallucination (HA) tasks, 0–" + DOM_HI + "%.");

    var owner = null;
    return function render() {
      if (owner) api.tip.hide(owner);
      owner = null;
      api.clear(body);
      var W = Math.floor(body.clientWidth);
      if (W < 60) return;
      var padR = 40;
      var x = api.linear([0, DOM_HI], [0, W - padR]);
      var ticks = x.ticks(3);
      var LABEL_H = 20, BAR = 14, GAP = 16, rowH = LABEL_H + BAR;
      var plotBottom = AF.length * (rowH + GAP) - GAP;
      var axisY = plotBottom + 20;
      var H = axisY + 4;

      var svg = api.s("svg", { class: "fb-svg", width: W, height: H, viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": summary });
      var gGrid = api.s("g", { class: "grid", "aria-hidden": "true" });
      svg.appendChild(gGrid);
      var gBars = api.s("g"), gText = api.s("g");
      svg.appendChild(gBars);
      svg.appendChild(gText);
      var hits = api.el("div", { class: "fb-hits" });
      gridLines(gGrid, x, ticks.filter(function (t) { return t > 0; }), LABEL_H - 6, plotBottom + 6);
      AF.forEach(function (d, i) {
        var y0 = i * (rowH + GAP), by = y0 + LABEL_H;
        gText.appendChild(nameText(0, y0 + 13, d.model, d.harness));
        var bar = api.s("path", { d: api.hbar(x(0), x(d.pct), by, BAR, 4), class: "fb-bar" });
        gBars.appendChild(bar);
        gText.appendChild(api.s("text", { x: x(d.pct) + 6, y: by + BAR / 2 + 4.5, class: "fb-lab fb-v fb-halo", text: d.pct + "%" }));
        var hit = hitBox(hits, 0, y0, W, rowH, d.model + " (" + d.harness + "): " + d.pct + "% of Hallucination tasks", "fb-hit--row");
        api.bindTip(hit, function () {
          owner = hit;
          return { title: d.model, sub: d.harness, big: d.pct + "%", note: "of Hallucination tasks: a specific answer first; the different premise comes up only at the end" };
        }, {
          onEnter: function () { bar.classList.add("is-hi"); },
          onLeave: function () { bar.classList.remove("is-hi"); }
        });
      });
      axisTicks(svg, x, ticks, axisY, function (t) { return t + "%"; });
      body.appendChild(svg);
      body.appendChild(hits);
    };
  }, { roving: ".fb-hit" });

  /* =========================================================================
     07 · The measurements hold up
     ========================================================================= */
  V.register("viz-validity", function (host, api) {
    var D = api.data, J = D.judge || {}, M = D.officialMcp || [];
    var judges = J.judges || [], mx = J.matrix || [];
    var off = [];
    mx.forEach(function (row, i) { row.forEach(function (v, j) { if (j > i && v != null) off.push(v); }); });
    var minOff = off.length ? Math.min.apply(null, off) : null;
    var floorOff = minOff != null ? Math.floor(minOff) : null;
    var pairLabel = minOff == null ? "–" : (minOff > floorOff ? ">" : "≥") + floorOff + "%";
    var tasks = (D.stats && D.stats.tasks) || 140;
    var MCP_CATS = ["AS", "HA"];

    api.clear(host);
    host.classList.add("fb-card");
    head(host, "The measurements hold up", "Is the LLM judge reliable, and do our Slack tools behave like the official ones?");

    /* ---- stat tiles ---- */
    function tile(value, label, note) {
      return api.el("div", { class: "fb-tile" },
        api.el("p", { class: "fb-tile-v", text: value }),
        api.el("p", { class: "fb-tile-l", text: label }),
        api.el("p", { class: "fb-tile-n", text: note }));
    }
    host.appendChild(api.el("div", { class: "fb-tiles" },
      tile(raw(J.humanAgreement) + "%", "Judge–human agreement",
        (J.model || "GPT-5.4") + " judge vs. hand review of all " + raw(J.reviewedJudgments) + " judgments for Codex CLI with GPT-5.5 (all " + tasks + " queries)"),
      tile(pairLabel, "Agreement between judges",
        "Every pair of GPT-5.4, Claude Opus 4.7, and Gemini 3.1 Pro, on AS, HA, and CI answers from six agents")));

    /* ---- judge agreement matrix (upper triangle) ---- */
    function pct1(v) { return v === 100 ? "100%" : v.toFixed(1) + "%"; }
    var table = api.el("table", { class: "dtable fb-matrix" },
      api.el("caption", { text: "Pairwise verdict agreement between LLM judges" }));
    function words(cell, label) {
      /* wrap only between words, never inside "GPT-5.4" */
      label.split(" ").forEach(function (word, wi) {
        if (wi) cell.appendChild(document.createTextNode(" "));
        cell.appendChild(api.el("span", { class: "fb-nw", text: word }));
      });
      return cell;
    }
    var trh = api.el("tr", null, api.el("th", { scope: "col" }, api.el("span", { class: "sr-only", text: "Judge" })));
    judges.forEach(function (j) { trh.appendChild(words(api.el("th", { scope: "col", class: "n" }), j)); });
    table.appendChild(api.el("thead", null, trh));
    var tb = api.el("tbody");
    judges.forEach(function (j, i) {
      var tr = api.el("tr", null, words(api.el("th", { scope: "row" }), j));
      judges.forEach(function (k, c) {
        var v = mx[i] && mx[i][c];
        if (c < i || v == null) {
          tr.appendChild(api.el("td", { class: "n fb-na" },
            api.el("span", { "aria-hidden": "true", text: "–" }),
            api.el("span", { class: "sr-only", text: "same pair as above" })));
        } else {
          tr.appendChild(api.el("td", { class: "n" + (c === i ? " fb-diag" : " fb-cell"), text: pct1(v) }));
        }
      });
      tb.appendChild(tr);
    });
    table.appendChild(tb);
    host.appendChild(api.el("div", { class: "fb-sec fb-sec--matrix" }, api.el("div", { class: "table-scroll" }, table)));

    /* ---- our Slack tools vs. the official Slack MCP server ---- */
    var mcpRows = M.map(function (m) {
      var r = { model: m.model, harness: m.harness, d: {} };
      MCP_CATS.forEach(function (c) { r.d[c] = round2(m.official[c] - m.ours[c]); });
      r.m = m;
      return r;
    });
    var sec = api.el("div", { class: "fb-sec" },
      api.el("h5", { class: "fb-sec-h", text: "Our Slack tools vs. the official Slack MCP server" }),
      api.el("p", { class: "fb-sec-n", text: "Filtered subset of Agentic Search and Hallucination queries, " + M.length + " agents. Δ = official − ours." }));
    sec.appendChild(legend([
      [key(api.s("circle", { cx: 7, cy: 7, r: 4.5, class: "fb-on fb-on--key" })), "Our Slack tools"],
      [key(api.s("circle", { cx: 7, cy: 7, r: 5, class: "fb-off" })), "Official Slack MCP"]
    ], "fb-legend--mcp"));
    var panels = api.el("div", { class: "fb-panels" });
    var panelBodies = MCP_CATS.map(function (c) {
      var pb = api.el("div", { class: "viz-body fb-body" });
      panels.appendChild(api.el("div", { class: "fb-panel" },
        api.el("p", { class: "fb-panel-h" },
          api.el("i", { class: "swatch", "data-cat": c, "aria-hidden": "true" }),
          api.el("span", { text: CAT_NAME[c] }),
          api.el("span", { class: "fb-panel-sub", text: "filtered" })),
        pb));
      return pb;
    });
    sec.appendChild(panels);
    host.appendChild(sec);
    twin(host, {
      summary: "Show data table",
      caption: "Pass rate (%) on a filtered subset of AS and HA queries: our Slack tools vs. the official Slack MCP server.",
      columns: [
        { key: "model", label: "Model" }, { key: "harness", label: "Harness" },
        { key: "asO", label: "AS ours", num: true, fmt: f2 }, { key: "asF", label: "AS official", num: true, fmt: f2 },
        { key: "haO", label: "HA ours", num: true, fmt: f2 }, { key: "haF", label: "HA official", num: true, fmt: f2 }
      ],
      rows: M.map(function (m) {
        return { model: m.model, harness: m.harness, asO: m.ours.AS, asF: m.official.AS, haO: m.ours.HA, haF: m.official.HA };
      })
    }, [0]);
    foot(host, "MCP comparison: queries that can only be answered after our manual filtering of Slack messages are removed.");

    var vmax = 0;
    M.forEach(function (m) { MCP_CATS.forEach(function (c) { vmax = Math.max(vmax, m.ours[c], m.official[c]); }); });
    var DOM_HI = Math.ceil(vmax / 20) * 20;
    var owner = null;

    function drawPanel(pb, c) {
      api.clear(pb);
      var W = Math.floor(pb.clientWidth);
      if (W < 60) return;
      /* Δ sits at the end of each dumbbell line, in a column sized to the widest Δ */
      var dCol = Math.max.apply(null, mcpRows.map(function (r) { return kvWidth("Δ", signed(r.d[c])); }));
      var padL = 8, padR = 14;
      var x = api.linear([0, DOM_HI], [padL, W - dCol - padR]);
      var ticks = x.ticks(3);
      var HEAD = 18, LINE = 13, GAP = 10, rowH = HEAD + LINE + 8;
      var plotBottom = mcpRows.length * (rowH + GAP) - GAP;
      var axisY = plotBottom + 16, H = axisY + 4;
      var ds = mcpRows.map(function (r) { return r.d[c]; });
      var ahead = ds.filter(function (d) { return d > 0; }).length, tie = ds.filter(function (d) { return d === 0; }).length;
      var aria = CAT_NAME[c] + ", filtered subset: our Slack tools vs. the official Slack MCP server for " + mcpRows.length + " agents. Official is higher for " +
        ahead + " of " + mcpRows.length + (tie ? ", tied for " + tie : "") + ". " +
        mcpRows.map(function (r) { return r.model + " (" + r.harness + ") ours " + f2(r.m.ours[c]) + ", official " + f2(r.m.official[c]); }).join("; ") + ".";
      var svg = api.s("svg", { class: "fb-svg", width: W, height: H, viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": aria });
      var gGrid = api.s("g", { class: "grid", "aria-hidden": "true" });
      svg.appendChild(gGrid);
      var hits = api.el("div", { class: "fb-hits" });
      gridLines(gGrid, x, ticks, HEAD + LINE - 14, plotBottom + 2);
      mcpRows.forEach(function (r, i) {
        var y0 = i * (rowH + GAP), ly = y0 + HEAD + LINE - 4;
        var dTxt = signed(r.d[c]);
        var fits = tw(r.model, NAME, 500) + 6 + tw(r.harness, 12.5, 400) <= W;
        svg.appendChild(nameText(0, y0 + 13, r.model, fits ? r.harness : null));
        svg.appendChild(kvCol(W - dCol, W, ly + 4, "Δ", dTxt));
        var xo = x(r.m.ours[c]), xf = x(r.m.official[c]);
        svg.appendChild(api.s("line", { x1: Math.min(xo, xf), x2: Math.max(xo, xf), y1: ly, y2: ly, class: "fb-conn" }));
        svg.appendChild(api.s("circle", { cx: xf, cy: ly, r: 5, class: "fb-off" }));
        svg.appendChild(api.s("circle", { cx: xo, cy: ly, r: 4, class: "fb-on" }));
        var hit = hitBox(hits, 0, y0, W, rowH,
          r.model + " (" + r.harness + "), " + CAT_NAME[c] + " filtered: ours " + f2(r.m.ours[c]) + ", official Slack MCP " + f2(r.m.official[c]) + ", difference " + dTxt,
          "fb-hit--row");
        api.bindTip(hit, function () {
          owner = hit;
          return {
            title: r.model, sub: r.harness + " · " + CAT_NAME[c] + " (filtered)",
            rows: [{ label: "Our Slack tools", value: f2(r.m.ours[c]) }, { label: "Official Slack MCP", value: f2(r.m.official[c]) }],
            note: "Official − ours: " + dTxt
          };
        });
      });
      axisTicks(svg, x, ticks, axisY);
      pb.appendChild(svg);
      pb.appendChild(hits);
    }

    return function render() {
      if (owner) api.tip.hide(owner);
      owner = null;
      var w = host.clientWidth;
      panels.classList.toggle("is-stacked", w < 520);
      host.classList.toggle("fb-narrow", w < 400);
      panelBodies.forEach(function (pb, i) { drawPanel(pb, MCP_CATS[i]); });
    };
  }, { roving: ".fb-hit" });
})();
