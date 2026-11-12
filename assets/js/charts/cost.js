/* ===========================================================================
   cost.js: Finding 03, "Cost and accuracy are only loosely linked" (#viz-cost)

   Scatter of Overall accuracy (%) against either the cost of one full run of
   SlackBench (log x) or the average number of steps per task (linear x),
   switched by a segmented control; the points glide between the two layouts.
     * shape = harness (SBViz.harnessShape), keyed in the legend
     * color = emphasis: the four agents on the paper's cost-accuracy Pareto
       frontier in --c-highlight, every other agent in a neutral gray. Steps
       mode keeps the same four highlighted (no frontier line there).
     * a few direct labels (frontier agents + the two Muse Wonder harnesses),
       placed with simple collision avoidance; every value is also in the
       tooltip (nearest point within 28px, or keyboard focus) and the table.
   Cost and steps were digitized from the paper's vector figures (data.js), so
   they are only ever shown through fmt.usd / fmt.steps.
   =========================================================================== */
(function () {
  "use strict";
  if (!window.SBViz) return;

  var Y_DOMAIN = [10, 85];
  var X_DOMAIN = { cost: [0.5, 800], steps: [5, 60] };
  var LINE_H = 14;                  /* label line box for 12px text */
  var LINE2_H = 13;                 /* second (muted, 11px) line of a two-line label */
  var NEAR_MOUSE = 28;              /* nearest-point search radius, mouse / pen */
  var NEAR_TOUCH = 36;              /* ... finger */
  var DURATION = 420;               /* mode-switch glide, ms */
  /* label spots around a mark: sides, diagonals, then above/below shifted toward one side */
  var DIRS = ["E", "W", "N", "S", "NE", "NW", "SE", "SW", "NL", "NR", "SL", "SR"];
  var ALIGN = { E: "start", NE: "start", SE: "start", NR: "start", SR: "start",
    W: "end", NW: "end", SW: "end", NL: "end", SL: "end", N: "middle", S: "middle" };
  var LEVELS = [0, 12, 24, 38];     /* extra distance from the mark; > 0 draws a leader line */

  var MODES = {
    cost: {
      title: "Accuracy vs. cost",
      sub: "Overall accuracy against the cost of one full run of SlackBench. The highlighted agents form the cost–accuracy Pareto frontier.",
      seg: "Cost per full run (log)", segShort: "Cost per run",
      axis: "Cost per full run (USD, log scale)", axisShort: "Cost per run (USD, log scale)"
    },
    steps: {
      title: "Accuracy vs. trajectory length",
      sub: "The same {n} cost-frontier agents stay highlighted. Three of them take the fewest steps of any agent, but the top scorer, Gemini 4 Argon, takes nearly twice as many as Claude Opus 5.5.",
      seg: "Avg. steps per task", segShort: "Steps per task",
      axis: "Average steps per task", axisShort: "Avg. steps per task"
    }
  };

  /* Direct labels beyond the frontier agents (priority order; cost mode only),
     and the labels that also carry their value: the numbers the prose cites. */
  var EXTRA_LABELS = ["Muse Wonder|Claude Code", "Muse Wonder|Muse Code"];
  var RIDERS = {
    cost: ["GPT 6 Luna|Codex CLI", "Muse Wonder|Muse Code", "Muse Wonder|Claude Code"],
    steps: ["Claude Opus 5.5|Claude Code", "Gemini 4 Argon|Antigravity"]
  };
  var SHAPE_ORDER = ["circle", "square", "triangle", "triangle-down", "diamond"];

  /* ---------- geometry for label placement ---------- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rectRect(a, b) { return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0; }
  function rectCircle(b, c) {
    var dx = c.x - clamp(c.x, b.x0, b.x1), dy = c.y - clamp(c.y, b.y0, b.y1);
    return dx * dx + dy * dy < c.r * c.r;
  }
  /* Liang-Barsky: does segment g touch rect b? */
  function segRect(g, b) {
    var dx = g.x1 - g.x0, dy = g.y1 - g.y0, t0 = 0, t1 = 1;
    var p = [-dx, dx, -dy, dy], q = [g.x0 - b.x0, b.x1 - g.x0, g.y0 - b.y0, b.y1 - g.y0];
    for (var i = 0; i < 4; i++) {
      if (p[i] === 0) { if (q[i] < 0) return false; continue; }
      var t = q[i] / p[i];
      if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
      else { if (t < t0) return false; if (t < t1) t1 = t; }
    }
    return true;
  }
  function segDist2(px, py, g) {
    var dx = g.x1 - g.x0, dy = g.y1 - g.y0, l2 = dx * dx + dy * dy;
    var t = l2 ? clamp(((px - g.x0) * dx + (py - g.y0) * dy) / l2, 0, 1) : 0;
    var qx = g.x0 + t * dx - px, qy = g.y0 + t * dy - py;
    return qx * qx + qy * qy;
  }
  function segCircle(g, c) { return segDist2(c.x, c.y, g) < c.r * c.r; }
  function orient(ax, ay, bx, by, cx, cy) {
    var v = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    return v > 1e-9 ? 1 : v < -1e-9 ? -1 : 0;
  }
  function segSeg(a, b) {
    return orient(a.x0, a.y0, a.x1, a.y1, b.x0, b.y0) !== orient(a.x0, a.y0, a.x1, a.y1, b.x1, b.y1) &&
      orient(b.x0, b.y0, b.x1, b.y1, a.x0, a.y0) !== orient(b.x0, b.y0, b.x1, b.y1, a.x1, a.y1);
  }
  function rectPoly(b) { return [{ x: b.x0, y: b.y0 }, { x: b.x1, y: b.y0 }, { x: b.x1, y: b.y1 }, { x: b.x0, y: b.y1 }]; }
  function edges(P) {
    return P.map(function (a, i) { var b = P[(i + 1) % P.length]; return { x0: a.x, y0: a.y, x1: b.x, y1: b.y }; });
  }
  function project(P, nx, ny) {
    var lo = Infinity, hi = -Infinity;
    P.forEach(function (p) { var d = p.x * nx + p.y * ny; if (d < lo) lo = d; if (d > hi) hi = d; });
    return [lo, hi];
  }
  /* separating-axis test for two convex polygons */
  function polyPoly(A, B) {
    var sets = [A, B];
    for (var k = 0; k < 2; k++) {
      var P = sets[k];
      for (var i = 0; i < P.length; i++) {
        var a = P[i], b = P[(i + 1) % P.length], nx = b.y - a.y, ny = a.x - b.x;
        var ra = project(A, nx, ny), rb = project(B, nx, ny);
        if (ra[1] <= rb[0] || rb[1] <= ra[0]) return false;
      }
    }
    return true;
  }
  function pointInPoly(x, y, P) {
    var inside = false;
    for (var i = 0, j = P.length - 1; i < P.length; j = i++) {
      var a = P[i], b = P[j];
      if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  }
  function polyCircle(P, c) {
    if (pointInPoly(c.x, c.y, P)) return true;
    return edges(P).some(function (e) { return segCircle(e, c); });
  }
  function segPoly(g, P) {
    if (pointInPoly(g.x0, g.y0, P) || pointInPoly(g.x1, g.y1, P)) return true;
    return edges(P).some(function (e) { return segSeg(g, e); });
  }

  /* label box for a mark at p ({x, y, r}) in direction dir, pushed out by `extra` px */
  function candidate(p, dir, extra, w, h) {
    var cx = p.x, cy = p.y, r = p.r, d = extra * 0.7, k = r * 0.7, x0, y0;
    switch (dir) {
      case "E": x0 = cx + r + 5 + extra; y0 = cy - h / 2; break;
      case "W": x0 = cx - r - 5 - extra - w; y0 = cy - h / 2; break;
      case "N": x0 = cx - w / 2; y0 = cy - r - 1 - extra - h; break;
      case "S": x0 = cx - w / 2; y0 = cy + r + 1 + extra; break;
      case "NE": x0 = cx + k + 3 + d; y0 = cy - k + 1 - d - h; break;
      case "NW": x0 = cx - k - 3 - d - w; y0 = cy - k + 1 - d - h; break;
      case "SE": x0 = cx + k + 3 + d; y0 = cy + k - 1 + d; break;
      case "SW": x0 = cx - k - 3 - d - w; y0 = cy + k - 1 + d; break;
      case "NL": x0 = cx + r + 2 - w; y0 = cy - r - 1 - extra - h; break;
      case "NR": x0 = cx - r - 2; y0 = cy - r - 1 - extra - h; break;
      case "SL": x0 = cx + r + 2 - w; y0 = cy + r + 1 + extra; break;
      default: x0 = cx - r - 2; y0 = cy + r + 1 + extra; /* SR */
    }
    return { x0: x0, y0: y0, x1: x0 + w, y1: y0 + h };
  }
  /* leader from the mark's ring to the nearest point of the label box */
  function leaderFor(p, box) {
    var nx = clamp(p.x, box.x0 + 2, box.x1 - 2), ny = clamp(p.y, box.y0 + 3, box.y1 - 3);
    var dx = nx - p.x, dy = ny - p.y, len = Math.sqrt(dx * dx + dy * dy);
    if (len < p.r + 10) return null;
    var ux = dx / len, uy = dy / len;
    return { x0: p.x + ux * (p.r + 3), y0: p.y + uy * (p.r + 3), x1: nx - ux * 2, y1: ny - uy * 2 };
  }
  /* is a label box (+ optional leader) clear of every mark, label, line and leader? */
  function labelFree(ob, box, lead, selfId) {
    var b = { x0: box.x0 - 2, y0: box.y0 - 1, x1: box.x1 + 2, y1: box.y1 + 1 }, i;
    for (i = 0; i < ob.circles.length; i++) if (ob.circles[i].id !== selfId && rectCircle(b, ob.circles[i])) return false;
    for (i = 0; i < ob.rects.length; i++) if (rectRect(b, ob.rects[i])) return false;
    for (i = 0; i < ob.lines.length; i++) if (segRect(ob.lines[i], b)) return false;
    for (i = 0; i < ob.leads.length; i++) if (segRect(ob.leads[i], b)) return false;
    if (lead) {
      for (i = 0; i < ob.circles.length; i++) if (ob.circles[i].id !== selfId && segCircle(lead, ob.circles[i])) return false;
      for (i = 0; i < ob.rects.length; i++) if (segRect(lead, ob.rects[i])) return false;
      for (i = 0; i < ob.lines.length; i++) if (segSeg(lead, ob.lines[i])) return false;
      for (i = 0; i < ob.leads.length; i++) if (segSeg(lead, ob.leads[i])) return false;
    }
    return true;
  }
  function inBounds(b, B) { return b.x0 >= B.x0 && b.x1 <= B.x1 && b.y0 >= B.y0 && b.y1 <= B.y1; }

  /* Greedy placement in the given order: adjacent spots before leader lines,
     longer label variants before shorter ones; a label that fits nowhere is
     skipped. Each placement gets a cost that follows the search order. */
  function placeLabels(items, ob, bounds) {
    var out = [];
    items.forEach(function (it) {
      var found = null;
      for (var li = 0; li < LEVELS.length && !found; li++) {
        for (var vi = 0; vi < it.variants.length && !found; vi++) {
          var v = it.variants[vi];
          for (var di = 0; di < DIRS.length; di++) {
            var box = candidate(it.p, DIRS[di], LEVELS[li], v.w, v.h);
            if (/^[NS][LR]?$/.test(DIRS[di])) {
              /* above/below: slide sideways into the plot while the box still spans the mark */
              var shift = Math.max(0, bounds.x0 - box.x0) - Math.max(0, box.x1 - bounds.x1);
              if (shift && box.x0 + shift <= it.p.x - 4 && box.x1 + shift >= it.p.x + 4) { box.x0 += shift; box.x1 += shift; }
            }
            if (!inBounds(box, bounds)) continue;
            var lead = LEVELS[li] ? leaderFor(it.p, box) : null;
            if (LEVELS[li] && !lead) continue;
            if (!labelFree(ob, box, lead, it.id)) continue;
            found = { it: it, v: v, box: box, lead: lead, align: ALIGN[DIRS[di]], cost: li * 100 + vi * 12 + di * 0.5 };
            break;
          }
        }
      }
      if (!found) return;
      out.push(found);
      ob.rects.push({ x0: found.box.x0 - 1, y0: found.box.y0, x1: found.box.x1 + 1, y1: found.box.y1 });
      if (found.lead) ob.leads.push(found.lead);
    });
    return out;
  }

  /* Greedy depends on order, so try the priority order plus "each label first"
     and keep the layout that places the most important labels most simply. */
  function bestLayout(items, ob, bounds) {
    var idx = items.map(function (_, i) { return i; });
    var orders = [idx].concat(idx.slice(1).map(function (i) {
      return [i].concat(idx.filter(function (j) { return j !== i; }));
    }));
    var best = null;
    orders.forEach(function (order) {
      var o = { circles: ob.circles, rects: ob.rects.slice(), lines: ob.lines, leads: ob.leads.slice() };
      var list = placeLabels(order.map(function (i) { return items[i]; }), o, bounds);
      var score = 0;
      items.forEach(function (it) {
        var hit = list.filter(function (pl) { return pl.it === it; })[0];
        score += hit ? hit.cost : it.miss;
      });
      if (!best || score < best.score) best = { score: score, list: list, ob: o };
    });
    return best;
  }

  /* A short label laid along the longest frontier segment that has room, on
     whichever side is clear. Returns {x, y, angle} or null. */
  function placeAlong(pts, w, h, ob, bounds) {
    var segs = [];
    for (var i = 1; i < pts.length; i++) {
      var a = pts[i - 1], b = pts[i], dx = b.x - a.x, dy = b.y - a.y, len = Math.sqrt(dx * dx + dy * dy);
      if (len > 0) segs.push({ a: a, b: b, len: len, ux: dx / len, uy: dy / len });
    }
    segs.sort(function (s1, s2) { return s2.len - s1.len; });
    for (var k = 0; k < segs.length; k++) {
      var sg = segs[k];
      if (sg.len < w + 2 * (sg.a.r + 10)) continue;
      var mx = (sg.a.x + sg.b.x) / 2, my = (sg.a.y + sg.b.y) / 2;
      var nx = sg.uy, ny = -sg.ux;                      /* normal on the upper side */
      if (ny > 0) { nx = -nx; ny = -ny; }
      for (var side = 1; side >= -1; side -= 2) {
        var off = (h / 2 + 4) * side, cx = mx + nx * off, cy = my + ny * off;
        var P = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(function (c) {
          return { x: cx + sg.ux * c[0] + nx * c[1], y: cy + sg.uy * c[0] + ny * c[1] };
        });
        var ok = P.every(function (p) { return p.x >= bounds.x0 && p.x <= bounds.x1 && p.y >= bounds.y0 && p.y <= bounds.y1; });
        ok = ok && !ob.circles.some(function (c) { return polyCircle(P, c); });
        ok = ok && !ob.rects.some(function (r) { return polyPoly(P, rectPoly(r)); });
        ok = ok && !ob.leads.some(function (g) { return segPoly(g, P); });
        if (ok) return { x: cx, y: cy, angle: Math.atan2(sg.uy, sg.ux) * 180 / Math.PI };
      }
    }
    return null;
  }

  function tr(x, y) { return "translate(" + x.toFixed(2) + "," + y.toFixed(2) + ")"; }
  function crisp(v) { return Math.round(v) + 0.5; }
  function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  SBViz.register("viz-cost", function setup(host, api) {
    var el = api.el, s = api.s, fmt = api.fmt;
    var D = api.data || {};
    var all = Array.isArray(D.results) ? D.results : [];
    var total = all.length;

    var data = [];
    all.forEach(function (r, i) {
      if (!r || !(r.cost > 0) || !(r.steps > 0) || typeof r.overall !== "number") return;
      data.push({ id: "c" + i, r: r, key: r.model + "|" + r.harness, shape: api.harnessShape(r.harness), hl: !!r.costPareto });
    });

    api.clear(host);
    if (!data.length) {
      host.appendChild(el("p", { class: "viz-error", text: "Cost data is not available." }));
      return function () {};
    }

    var byId = {};
    data.forEach(function (d) { byId[d.id] = d; });
    var frontierByAcc = data.filter(function (d) { return d.hl; }).sort(function (a, b) { return b.r.overall - a.r.overall; });
    var frontierByCost = frontierByAcc.slice().sort(function (a, b) { return a.r.cost - b.r.cost; });
    var extras = EXTRA_LABELS.map(function (k) { return data.filter(function (d) { return d.key === k; })[0]; })
      .filter(function (d) { return d && !d.hl; });
    var labeledModels = {};
    frontierByAcc.concat(extras).forEach(function (d) { labeledModels[d.r.model] = (labeledModels[d.r.model] || 0) + 1; });

    /* ---------- state ---------- */
    var mode = "cost";
    var prevPos = null;      /* id -> {x, y} of the last draw, for the mode-switch glide */
    var livePos = null;      /* id -> {x, y} while a glide is in flight */
    var raf = 0;
    var activeId = null;     /* the point that holds the roving tab stop */
    var cur = null;          /* the current drawing: positions, nodes, hit layer */
    var font = "", mcache = {};

    function measure(text, weight, size) {
      var f = weight + " " + size + "px " + font, k = f + "|" + text;
      if (!(k in mcache)) mcache[k] = api.measureText(text, f);
      return mcache[k];
    }
    function fullName(d) { return d.r.model + " in " + d.r.harness; }

    /* ---------- static chrome ---------- */
    var titleEl = el("h4", { class: "viz-title" });
    var subEl = el("p", { class: "viz-sub" });
    host.appendChild(el("div", { class: "viz-head" }, el("div", { class: "cost-headtext" }, titleEl, subEl)));

    var seg = el("div", { class: "seg cost-seg", role: "group", "aria-label": "Horizontal axis" });
    var btns = {};
    Object.keys(MODES).forEach(function (m) {
      btns[m] = el("button", { type: "button", "aria-pressed": m === mode ? "true" : "false", onclick: function () { setMode(m); } },
        el("span", { class: "cost-l", text: MODES[m].seg }),
        el("span", { class: "cost-s", text: MODES[m].segShort }));
      seg.appendChild(btns[m]);
    });
    host.appendChild(el("div", { class: "viz-controls cost-controls" }, seg));

    function keyIcon(shape, hl) {
      return s("svg", { class: "cost-key-icon", width: 14, height: 14, viewBox: "-7 -7 14 14", "aria-hidden": "true" },
        s("path", { class: "cost-pt" + (hl ? " is-hl" : ""), d: api.marker(shape, 0, 0, 4.4) }));
    }
    var legend = el("div", { class: "viz-legend cost-legend" });
    var shapeName = {};
    Object.keys(api.HARNESS_SHAPE || {}).forEach(function (h) { shapeName[api.HARNESS_SHAPE[h]] = h; });
    var otherHarness = [];
    data.forEach(function (d) { if (d.shape === "diamond" && otherHarness.indexOf(d.r.harness) < 0) otherHarness.push(d.r.harness); });
    SHAPE_ORDER.forEach(function (shape) {
      if (!data.some(function (d) { return d.shape === shape; })) return;
      var text = shape === "diamond" ? "Other: " + otherHarness.join(", ") : shapeName[shape] || shape;
      legend.appendChild(el("span", { class: "cost-key" }, keyIcon(shape, false), el("span", { text: text })));
    });
    var frontKeyIcon = el("span", { class: "cost-key-front", "aria-hidden": "true" });
    var frontKeyText = el("span");
    legend.appendChild(el("span", { class: "cost-key" }, frontKeyIcon, frontKeyText));
    host.appendChild(legend);

    var body = el("div", { class: "viz-body cost-body" });
    host.appendChild(body);

    var tableRows = data.slice().sort(function (a, b) { return b.r.overall - a.r.overall; }).map(function (d) {
      return { model: d.r.model, harness: d.r.harness, overall: d.r.overall, cost: d.r.cost, steps: d.r.steps, frontier: d.hl ? "Yes" : "" };
    });
    api.tableTwin(host, {
      summary: "Show data table",
      caption: "Overall accuracy (%), cost of one full run (USD), and average steps per task for the " + data.length +
        " agents with traceable token costs, sorted by overall accuracy. Frontier marks the cost–accuracy Pareto frontier." +
        " Cost and steps are read from the paper's figures.",
      columns: [
        { key: "model", label: "Model" },
        { key: "harness", label: "Harness" },
        { key: "overall", label: "Overall", num: true, fmt: function (v) { return fmt.pct(v); }, best: "max" },
        { key: "cost", label: "Cost", num: true, fmt: function (v) { return fmt.usd(v); }, best: "min" },
        { key: "steps", label: "Steps", num: true, fmt: function (v) { return fmt.steps(v); } },
        { key: "frontier", label: "Frontier" }
      ],
      rows: tableRows
    });

    host.appendChild(el("div", { class: "viz-foot" }, el("span", {
      text: "Cost = average expense of one full run of SlackBench. " + data.length + " of " + total +
        " agents with traceable token costs; values read from the paper's figures."
    })));

    function syncText() {
      var M = MODES[mode];
      var n = frontierByAcc.length;
      titleEl.textContent = M.title;
      subEl.textContent = M.sub.replace("{n}", ["", "one", "two", "three", "four", "five", "six"][n] || String(n));
      api.clear(frontKeyIcon);
      var ic = s("svg", { width: 24, height: 14, viewBox: "-12 -7 24 14" });
      if (mode === "cost") ic.appendChild(s("line", { class: "cost-frontier", x1: -10, x2: 10, y1: 0, y2: 0 }));
      ic.appendChild(s("path", { class: "cost-pt is-hl", d: api.marker("circle", 0, 0, 4.4) }));
      frontKeyIcon.appendChild(ic);
      frontKeyText.textContent = mode === "cost" ? "Pareto frontier (cost)" : "On the cost Pareto frontier";
    }

    function setMode(m) {
      if (m === mode || !MODES[m]) return;
      mode = m;
      Object.keys(btns).forEach(function (k) { btns[k].setAttribute("aria-pressed", k === m ? "true" : "false"); });
      syncText();
      if (cur) api.tip.hide();
      draw(!api.reduceMotion);
    }

    /* ---------- text for assistive tech ---------- */
    function summary() {
      var n = data.length;
      var lo = data[0], hi = data[0];
      var key = mode === "cost" ? "cost" : "steps";
      data.forEach(function (d) { if (d.r[key] < lo.r[key]) lo = d; if (d.r[key] > hi.r[key]) hi = d; });
      if (mode === "cost") {
        return "Scatter plot of overall accuracy against the cost of one full run of SlackBench, log scale, for " + n +
          " agents. Costs range from " + fmt.usd(lo.r.cost) + " for " + fullName(lo) + " to " + fmt.usd(hi.r.cost) +
          " for " + fullName(hi) + ". The cost–accuracy Pareto frontier runs through " +
          frontierByCost.map(function (d) { return fullName(d) + " (" + fmt.usd(d.r.cost) + ", " + fmt.pct(d.r.overall) + "%)"; }).join(", ") + ".";
      }
      return "Scatter plot of overall accuracy against average steps per task for " + n + " agents, from " +
        fmt.steps(lo.r.steps) + " to " + fmt.steps(hi.r.steps) + " steps. Average steps of the " + frontierByAcc.length +
        " cost-frontier agents: " + frontierByAcc.map(function (d) { return fullName(d) + " " + fmt.steps(d.r.steps); }).join(", ") +
        ". The top scorer, Gemini 4 Argon, takes nearly twice as many steps as Claude Opus 5.5.";
    }
    function pointLabel(d) {
      var r = d.r;
      return r.model + ", " + r.harness + ": " + fmt.pct(r.overall) + "% overall, " + fmt.usd(r.cost) + " per full run, " +
        fmt.steps(r.steps) + " steps per task" + (d.hl ? ". On the cost–accuracy Pareto frontier." : ".");
    }
    function tipRow(label, value) {
      return el("div", { class: "tip-row" }, el("span", { class: "l", text: label }), el("span", { class: "v", text: value }));
    }
    function tipContent(d) {
      var r = d.r;
      return el("div", { class: "cost-tip" },
        el("div", { class: "tip-title cost-tip-title" },
          s("svg", { class: "cost-tip-icon" + (d.hl ? " is-hl" : ""), width: 12, height: 12, viewBox: "-6 -6 12 12", "aria-hidden": "true" },
            s("path", { d: api.marker(d.shape, 0, 0, 4.2) })),
          el("span", { text: r.model })),
        el("div", { class: "tip-sub", text: r.harness + (r.rank ? " · rank " + r.rank + " of " + total : "") }),
        el("div", { class: "tip-rows" },
          tipRow("Overall accuracy", fmt.pct(r.overall) + "%"),
          tipRow("Cost per full run", fmt.usd(r.cost)),
          tipRow("Avg. steps per task", fmt.steps(r.steps))),
        d.hl ? el("div", { class: "tip-note", text: "On the cost–accuracy Pareto frontier" }) : null);
    }

    /* ---------- interaction (bound to each new hit layer) ---------- */
    function showRing(id) {
      if (!cur) return;
      var p = cur.pos[id];
      cur.ring.setAttribute("cx", p.x.toFixed(2));
      cur.ring.setAttribute("cy", p.y.toFixed(2));
      cur.ring.setAttribute("r", (p.r + 5).toFixed(1));
      cur.ring.removeAttribute("visibility");
    }
    function hideRing() { if (cur) cur.ring.setAttribute("visibility", "hidden"); }
    function nearest(e, maxD) {
      var b = cur.hit.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top;
      var best = null, bd = maxD * maxD;
      data.forEach(function (d) {
        var p = cur.pos[d.id], dx = p.x - x, dy = p.y - y, d2 = dx * dx + dy * dy;
        if (d2 <= bd) { bd = d2; best = d.id; }
      });
      return best;
    }
    function hover(id) {
      if (!cur || id === cur.hoverId) return;
      cur.hoverId = id;
      if (!id) { hideRing(); api.tip.hide(cur.hit); return; }
      var b = cur.hit.getBoundingClientRect(), p = cur.pos[id];
      showRing(id);
      api.tip.show({ x: b.left + p.x, y: b.top + p.y - p.r - 2 }, tipContent(byId[id]), cur.hit);
    }
    function setTabStop(id) {
      if (!cur) return;
      activeId = id;
      Object.keys(cur.hitNodes).forEach(function (k) { cur.hitNodes[k].setAttribute("tabindex", k === id ? "0" : "-1"); });
    }
    function idOf(node) { return node && node.getAttribute ? node.getAttribute("data-id") : null; }

    function bindHit(hit) {
      hit.addEventListener("pointermove", function (e) { if (e.pointerType !== "touch") hover(nearest(e, NEAR_MOUSE)); });
      hit.addEventListener("pointerleave", function (e) { if (e.pointerType !== "touch") hover(null); });
      hit.addEventListener("pointerdown", function (e) { if (e.pointerType === "touch") { cur.hoverId = null; hover(nearest(e, NEAR_TOUCH)); } });
      hit.addEventListener("mousedown", function (e) { e.preventDefault(); }); /* hover is the mouse path; keep focus for keys */
      hit.addEventListener("focusin", function (e) {
        var id = idOf(e.target);
        if (!id || !cur) return;
        cur.hoverId = null;
        hideRing();             /* the focus ring (CSS) marks the point instead */
        setTabStop(id);
        api.tip.show(e.target, tipContent(byId[id]), e.target);
      });
      hit.addEventListener("focusout", function (e) {
        if (!idOf(e.target)) return;
        hideRing();
        api.tip.hide(e.target);
      });
      hit.addEventListener("keydown", function (e) {
        var id = idOf(e.target);
        if (!id || !cur) return;
        var list = null, step = 0, next = null;
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") { list = cur.byX; step = e.key === "ArrowRight" ? 1 : -1; }
        else if (e.key === "ArrowUp" || e.key === "ArrowDown") { list = cur.byY; step = e.key === "ArrowUp" ? 1 : -1; }
        else if (e.key === "Home") next = cur.byX[0];
        else if (e.key === "End") next = cur.byX[cur.byX.length - 1];
        else if (e.key === "Escape") { api.tip.hide(); hideRing(); return; }
        else return;
        e.preventDefault();
        if (list) next = list[clamp(list.indexOf(id) + step, 0, list.length - 1)];
        if (next && next !== id) { setTabStop(next); cur.hitNodes[next].focus(); }
      });
    }

    /* ---------- drawing ---------- */
    function stopAnim() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }

    function draw(animate) {
      var inFlight = !!raf;
      stopAnim();
      var W = Math.floor(body.clientWidth);
      if (!(W > 0)) return;
      font = api.css("--font-sans") || "sans-serif";
      mcache = {};
      var M = MODES[mode];

      /* segmented control: short labels when the long ones would wrap */
      var segNeed = measure(MODES.cost.seg, 500, 13.5) + measure(MODES.steps.seg, 500, 13.5) + 62;
      host.classList.toggle("cost-compact", W < segNeed);

      var compact = W < 420;
      var H = compact ? clamp(Math.round(W * 1.08), 280, 400) : clamp(Math.round(W * 0.72), 320, 460);
      var R = compact ? 4.5 : 5;
      var mt = 30, mb = 48, mr = compact ? 8 : 12;
      var yTicks = api.niceTicks(Y_DOMAIN[0], Y_DOMAIN[1], H - mt - mb >= 240 ? 7 : 4);
      var ml = Math.ceil(Math.max.apply(null, yTicks.map(function (t) { return measure(String(t), 400, 12); }))) + 10;
      var X0 = ml, X1 = W - mr, Y0 = mt, Y1 = H - mb;
      var ys = api.linear(Y_DOMAIN, [Y1, Y0]);
      var isCost = mode === "cost";
      var xs = isCost ? api.log(X_DOMAIN.cost, [X0, X1]) : api.linear(X_DOMAIN.steps, [X0, X1]);
      var xTicks = isCost ? xs.ticks() : api.niceTicks(X_DOMAIN.steps[0], X_DOMAIN.steps[1], 6);

      var pos = {};
      data.forEach(function (d) {
        pos[d.id] = { x: xs(isCost ? d.r.cost : d.r.steps), y: ys(d.r.overall), r: d.hl ? R + 1 : R };
      });

      var hadFocus = cur && cur.hit.contains(document.activeElement) ? idOf(document.activeElement) : null;
      if (cur) api.tip.hide(cur.hit);

      var svg = s("svg", { class: "cost-svg", width: W, height: H, viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": summary() });

      /* grid + axes */
      var grid = s("g", { class: "grid" });
      yTicks.forEach(function (t) { grid.appendChild(s("line", { x1: X0, x2: X1, y1: crisp(ys(t)), y2: crisp(ys(t)) })); });
      var xAxis = s("g", { class: "cost-xaxis cost-fade" });
      var xGrid = s("g", { class: "grid" });
      xTicks.forEach(function (t) { xGrid.appendChild(s("line", { x1: crisp(xs(t)), x2: crisp(xs(t)), y1: Y0, y2: Y1 })); });
      xAxis.appendChild(xGrid);
      var xLab = s("g", { class: "axis" });
      xTicks.forEach(function (t) {
        xLab.appendChild(s("text", { x: xs(t).toFixed(1), y: Y1 + 18, "text-anchor": "middle", text: isCost ? fmt.usdTick(t) : String(t) }));
      });
      xAxis.appendChild(xLab);
      if (isCost) {   /* minor log ticks: 2×–9× each decade */
        var minor = s("g", { class: "cost-minor" });
        for (var e = -1; e <= 3; e++) {
          for (var m = 1; m <= 9; m++) {
            var v = m * Math.pow(10, e);
            if (v < X_DOMAIN.cost[0] || v > X_DOMAIN.cost[1]) continue;
            var x = crisp(xs(v));
            minor.appendChild(s("line", { x1: x, x2: x, y1: Y1, y2: Y1 + (m === 1 ? 5 : 3) }));
          }
        }
        xAxis.appendChild(minor);
      }
      var yAxis = s("g", { class: "axis" });
      yTicks.forEach(function (t) {
        yAxis.appendChild(s("text", { x: X0 - 8, y: ys(t).toFixed(1), dy: "0.32em", "text-anchor": "end", text: String(t) }));
      });
      var yTitle = "Overall accuracy (%)";
      var xTitle = W < 380 ? M.axisShort : M.axis;
      svg.appendChild(grid);
      svg.appendChild(xAxis);
      svg.appendChild(s("line", { class: "baseline", x1: X0, x2: X1, y1: crisp(Y1), y2: crisp(Y1) }));
      svg.appendChild(yAxis);
      svg.appendChild(s("text", { class: "axis-title", x: 0, y: 12, text: yTitle }));
      svg.appendChild(s("text", { class: "axis-title cost-fade", x: ((X0 + X1) / 2).toFixed(1), y: H - 8, "text-anchor": "middle", text: xTitle }));

      /* Pareto frontier (cost mode only), drawn under the marks */
      var front = s("g", { class: "cost-front cost-fade" });
      var frontPts = frontierByCost.map(function (d) { return pos[d.id]; });
      if (isCost && frontPts.length > 1) {
        front.appendChild(s("path", {
          class: "cost-frontier",
          d: frontPts.map(function (p, i) { return (i ? "L" : "M") + p.x.toFixed(2) + "," + p.y.toFixed(2); }).join("")
        }));
      }
      svg.appendChild(front);

      /* marks: neutral first, highlighted on top */
      var marks = s("g", { class: "cost-marks" });
      var nodes = {};
      data.slice().sort(function (a, b) { return (a.hl ? 1 : 0) - (b.hl ? 1 : 0); }).forEach(function (d) {
        var p = pos[d.id];
        nodes[d.id] = s("path", { class: "cost-pt" + (d.hl ? " is-hl" : ""), d: api.marker(d.shape, 0, 0, p.r), transform: tr(p.x, p.y) });
        marks.appendChild(nodes[d.id]);
      });
      svg.appendChild(marks);

      /* direct labels */
      var ob = { circles: [], rects: [], lines: [], leads: [] };
      data.forEach(function (d) { var p = pos[d.id]; ob.circles.push({ id: d.id, x: p.x, y: p.y, r: p.r + 2.5 }); });
      ob.rects.push({ x0: 0, y0: 0, x1: measure(yTitle, 500, 12) + 8, y1: 18 });
      if (isCost) for (var i = 1; i < frontPts.length; i++) {
        ob.lines.push({ x0: frontPts[i - 1].x, y0: frontPts[i - 1].y, x1: frontPts[i].x, y1: frontPts[i].y });
      }
      var bounds = { x0: X0 + 2, x1: W - 2, y0: Y0 - 10, y1: Y1 - 2 };
      /* the Muse Wonder pair is the cost story (same model, two harnesses, $143 vs $535);
         in steps mode, and on phone-sized plots, only the frontier agents are named */
      var labelList = compact || !isCost ? frontierByAcc : frontierByAcc.concat(extras);
      /* Label variants, most informative first: one line with the cited value,
         then a compact two-line form (name / harness · value), then shorter
         one-liners. The harness is named when the shape alone can't tell it
         (the "other" diamond) or when the same model is labeled twice. */
      var items = labelList.map(function (d) {
        var r = d.r, nm = r.model.replace(/^Claude /, "");
        var needH = labeledModels[r.model] > 1, other = d.shape === "diamond";
        var full = needH || other ? nm + " (" + r.harness + ")" : nm;
        var rider = RIDERS[mode].indexOf(d.key) >= 0 ? (isCost ? fmt.usd(r.cost) : fmt.steps(r.steps) + " steps") : null;
        var wName = d.hl ? 600 : 500, vs = [];
        var one = function (name, rd) {
          vs.push({ name: name, rider: rd, sub: null, h: LINE_H, w: measure(name, wName, 12) + (rd ? measure(", " + rd, 400, 12) : 0) });
        };
        var two = function (name, sub) {
          vs.push({ name: name, rider: null, sub: sub, h: LINE_H + LINE2_H, w: Math.max(measure(name, wName, 12), measure(sub, 400, 11)) });
        };
        if (rider) { one(full, rider); if (other && !needH) one(nm, rider); }
        else one(full, null);
        /* two-line labels stack into neighbours on phone-sized plots: single lines only there */
        if (!compact && (needH || other || rider)) two(nm, [needH || other ? r.harness : null, rider].filter(Boolean).join(" · "));
        if (rider) one(full, null);
        if (other && !needH) one(nm, null);
        /* unplaced penalty: frontier agents first, then the extras in EXTRA_LABELS order */
        var miss = d.hl ? 10000 : 1000 + 500 * (EXTRA_LABELS.length - 1 - EXTRA_LABELS.indexOf(d.key));
        return { id: d.id, d: d, p: pos[d.id], variants: vs, miss: miss };
      });
      var layout = bestLayout(items, ob, bounds);
      var placed = layout.list;
      ob = layout.ob;
      var labels = s("g", { class: "cost-labels cost-fade" });
      placed.forEach(function (pl) {
        var v = pl.v, b = pl.box, a = pl.align;
        if (pl.lead) {
          labels.appendChild(s("line", { class: "cost-leader", x1: pl.lead.x0.toFixed(1), y1: pl.lead.y0.toFixed(1), x2: pl.lead.x1.toFixed(1), y2: pl.lead.y1.toFixed(1) }));
        }
        var tx = (a === "start" ? b.x0 : a === "end" ? b.x1 : (b.x0 + b.x1) / 2).toFixed(1);
        var t = s("text", { class: "cost-label" + (pl.it.d.hl ? " is-hl" : ""), "text-anchor": a, x: tx, y: (b.y0 + LINE_H / 2).toFixed(1), dy: "0.35em" });
        t.appendChild(s("tspan", { text: v.name }));
        if (v.rider) t.appendChild(s("tspan", { class: "cost-label-val", text: ", " + v.rider }));
        if (v.sub) t.appendChild(s("tspan", { class: "cost-label-sub", x: tx, dy: LINE2_H, text: v.sub }));
        labels.appendChild(t);
      });
      if (isCost && frontPts.length > 1) {
        var fl = "Pareto frontier", flw = measure(fl, 500, 11.5);
        var at = placeAlong(frontPts, flw, 13, ob, bounds);
        if (at) {
          labels.appendChild(s("text", {
            class: "cost-frontier-label", "text-anchor": "middle", dy: "0.35em",
            transform: "translate(" + at.x.toFixed(1) + "," + at.y.toFixed(1) + ") rotate(" + at.angle.toFixed(2) + ")", text: fl
          }));
        }
      }
      svg.appendChild(labels);

      var ring = s("circle", { class: "cost-ring", r: 10, visibility: "hidden" });
      svg.appendChild(ring);

      /* hit layer: nearest-point hover + one focusable target per agent (roving tab stop) */
      var byX = data.slice().sort(function (a, b) { return pos[a.id].x - pos[b.id].x || b.r.overall - a.r.overall; })
        .map(function (d) { return d.id; });
      var byY = data.slice().sort(function (a, b) { return a.r.overall - b.r.overall; }).map(function (d) { return d.id; });
      if (!activeId || !pos[activeId]) activeId = byX[0];
      var hit = s("svg", {
        class: "cost-hit", width: W, height: H, viewBox: "0 0 " + W + " " + H, role: "group", tabindex: "-1",
        "aria-label": data.length + " agents. Arrow keys move between points."
      });
      var hitNodes = {};
      byX.forEach(function (id) {
        var p = pos[id];
        hitNodes[id] = s("circle", {
          class: "cost-hit-pt", cx: p.x.toFixed(2), cy: p.y.toFixed(2), r: 12, "data-id": id,
          tabindex: id === activeId ? "0" : "-1", role: "img", "aria-label": pointLabel(byId[id])
        });
        hit.appendChild(hitNodes[id]);
      });

      api.clear(body);
      body.appendChild(svg);
      body.appendChild(hit);
      cur = { pos: pos, hit: hit, ring: ring, hitNodes: hitNodes, byX: byX, byY: byY, hoverId: null };
      bindHit(hit);
      if (hadFocus && hitNodes[hadFocus]) hitNodes[hadFocus].focus({ preventScroll: true });

      /* mode switch: glide the marks from where they are (mid-glide if switched again),
         then fade the labels and frontier in */
      var from = inFlight && livePos ? livePos : prevPos;
      prevPos = pos;
      livePos = null;
      if (animate && from) {
        var live = {};
        [xAxis, front, labels].forEach(function (g) { g.classList.add("cost-hide"); });
        data.forEach(function (d) { var a = from[d.id]; if (a) nodes[d.id].setAttribute("transform", tr(a.x, a.y)); });
        void xAxis.getBoundingClientRect();
        xAxis.classList.remove("cost-hide");
        var t0 = performance.now();
        var step = function (now) {
          var k = ease(Math.min(1, (now - t0) / DURATION));
          data.forEach(function (d) {
            var a = from[d.id], b = pos[d.id];
            if (!a) return;
            live[d.id] = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
            nodes[d.id].setAttribute("transform", tr(live[d.id].x, live[d.id].y));
          });
          livePos = live;
          if (k < 1) raf = requestAnimationFrame(step);
          else { raf = 0; livePos = null; front.classList.remove("cost-hide"); labels.classList.remove("cost-hide"); }
        };
        raf = requestAnimationFrame(step);
      }
    }

    /* the shared tooltip hides itself on scroll; forget the hovered point too, so the
       next pointer move over the same mark shows it again */
    window.addEventListener("scroll", function () {
      if (cur && cur.hoverId) { cur.hoverId = null; hideRing(); }
    }, { passive: true });

    syncText();
    return function render() { draw(false); };
  });
})();
