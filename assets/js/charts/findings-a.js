/* ===========================================================================
   findings-a.js — Finding 02 (#viz-cli-mcp dumbbell, #viz-toolcalls bars) and
   Finding 04 (#viz-effort small multiples). Built on SBViz (core.js); styles in
   assets/css/findings-a.css (prefix fa-). Every number comes from window.SLACKBENCH.

   Charts 1 and 2 share one two-series encoding:
     MCP tools     = gray (hollow ring in the dumbbell, gray bar in the bars)
     Files via CLI = --c-highlight (filled dot, blue bar)
   Interactive marks are HTML hit targets layered under a pointer-transparent SVG,
   so the SVG can stay role="img" while every row stays focusable.
   =========================================================================== */
(function () {
  "use strict";
  var V = window.SBViz;
  if (!V) return;

  var METRICS = [{ key: "overall", label: "Overall", name: "Overall" }].concat(V.CATS.map(function (c) {
    return { key: c.key, label: c.key, name: c.name };
  }));
  var TABLE_METRICS = METRICS.slice(1).concat([METRICS[0]]); /* paper column order: AS HA SU CI Overall */
  var CLI = "Files via CLI", MCP = "MCP tools";
  /* the shared tooltip lives outside the cards, so its line keys get color expressions directly */
  var KEY_CLI = "var(--c-highlight)";
  var KEY_MCP = "color-mix(in srgb, var(--c-overall) 55%, var(--surface))";
  var WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

  /* ---------- small helpers ---------- */
  function metricOf(key) {
    for (var i = 0; i < METRICS.length; i++) if (METRICS[i].key === key) return METRICS[i];
    return METRICS[0];
  }
  function round2(v) { var r = Math.round(v * 100) / 100; return r === 0 ? 0 : r; }
  function font(size, weight, mono) { return (weight || 400) + " " + size + "px " + V.css(mono ? "--font-mono" : "--font-sans"); }
  function textW(t, f) { return V.measureText(t, f); }
  function maxOf(arr) { return Math.max.apply(null, arr); }
  function minOf(arr) { return Math.min.apply(null, arr); }
  function sum(arr, f) { return arr.reduce(function (a, d) { var v = f(d); return a + (v == null ? 0 : v); }, 0); }
  function p2(v) { return V.fmt.pct(v, 2); }                       /* 59.90 */
  function pct1(v) { return v == null ? "–" : V.fmt.pct(v, 1) + "%"; } /* 58.6% */
  function n0(v) { return V.fmt.num(v, 0); }                        /* 13,651 */
  function signed(v) { return v === 0 ? "0.00" : V.fmt.signed(v, 2); } /* +14.38 / −5.17 */
  function word(n) { return WORDS[n] || String(n); }
  function deltaWords(d) {
    return d > 0 ? "gain of " + p2(d) + " points" : d < 0 ? "loss of " + p2(-d) + " points" : "no change";
  }

  /** word-wrap for SVG text, measured with canvas */
  function wrapText(text, maxW, f) {
    var words = String(text).split(/\s+/), lines = [], cur = "";
    words.forEach(function (w) {
      var t = cur ? cur + " " + w : w;
      if (!cur || textW(t, f) <= maxW) cur = t;
      else { lines.push(cur); cur = w; }
    });
    if (cur) lines.push(cur);
    return lines;
  }

  /* ---------- shared chrome ---------- */
  function buildHead(host, title, sub) {
    host.appendChild(V.el("div", { class: "viz-head" },
      V.el("div", null,
        V.el("h4", { class: "viz-title", text: title }),
        V.el("p", { class: "viz-sub", text: sub }))));
  }

  /** Overall | AS | HA | SU | CI toggle (real buttons, aria-pressed) */
  function buildSeg(label, current, onPick, swatches) {
    var group = V.el("div", { class: "seg fa-seg", role: "group", "aria-label": label });
    var buttons = METRICS.map(function (m) {
      var b = V.el("button", {
        type: "button", "data-metric": m.key, title: m.name,
        "aria-label": m.label === m.name ? null : m.label + ", " + m.name,
        "aria-pressed": m.key === current ? "true" : "false"
      }, swatches ? V.el("span", { class: "swatch", "data-cat": m.key, "aria-hidden": "true" }) : null, m.label);
      b.addEventListener("click", function () {
        if (b.getAttribute("aria-pressed") === "true") return;
        buttons.forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
        onPick(m.key);
      });
      group.appendChild(b);
      return b;
    });
    return group;
  }

  function keyIcon(kind) {
    var svg = V.s("svg", { class: "fa-key", viewBox: "0 0 12 12", width: 12, height: 12, "aria-hidden": "true", focusable: "false" });
    svg.appendChild(kind === "ring"
      ? V.s("circle", { class: "fa-key-ring", cx: 6, cy: 6, r: 4 })
      : V.s("circle", { class: "fa-key-dot", cx: 6, cy: 6, r: 5 }));
    return svg;
  }
  /** legend: "dots" mirrors the dumbbell markers, "bars" mirrors the bars */
  function buildLegend(kind) {
    var mark = function (which) {
      return kind === "bars"
        ? V.el("i", { class: "swatch fa-sw-" + which, "aria-hidden": "true" })
        : keyIcon(which === "mcp" ? "ring" : "dot");
    };
    return V.el("div", { class: "viz-legend fa-legend" },
      V.el("span", null, mark("mcp"), MCP),
      V.el("span", null, mark("cli"), CLI));
  }

  /** focusable HTML hit target (>= row size) with hover/focus/tap tooltip */
  function addHit(layer, box, label, tip, hooks) {
    var d = V.el("div", { class: "fa-hit", tabindex: "0", role: "img", "aria-label": label });
    d.style.left = box.x + "px";
    d.style.top = box.y + "px";
    d.style.width = box.w + "px";
    d.style.height = box.h + "px";
    layer.appendChild(d);
    V.bindTip(d, tip, {
      onEnter: function () { d.classList.add("is-on"); if (hooks && hooks.onEnter) hooks.onEnter(); },
      onLeave: function () { d.classList.remove("is-on"); if (hooks && hooks.onLeave) hooks.onLeave(); }
    });
    return d;
  }

  /** up / down / flat glyph centred at (gx, cy) */
  function glyphPath(d, gx, cy) {
    if (d > 0) return "M" + (gx - 4) + "," + (cy + 3) + "L" + (gx + 4) + "," + (cy + 3) + "L" + gx + "," + (cy - 4) + "Z";
    if (d < 0) return "M" + (gx - 4) + "," + (cy - 3) + "L" + (gx + 4) + "," + (cy - 3) + "L" + gx + "," + (cy + 4) + "Z";
    /* "=" for no change, so a zero never reads as a minus sign */
    return "M" + (gx - 4) + "," + (cy - 2.5) + "h8v1.5h-8Z" + "M" + (gx - 4) + "," + (cy + 1) + "h8v1.5h-8Z";
  }

  /* =========================================================================
     1. Pass rate with MCP tools vs. files via CLI — dumbbell, sorted by gain
     ========================================================================= */
  V.register("viz-cli-mcp", function (host, api) {
    var data = api.data.cliVsMcp || [];
    var avgGain = api.data.cli ? api.data.cli.avgGain : null;
    var metric = "overall";

    api.clear(host);
    buildHead(host, "Pass rate with MCP tools vs. files via CLI",
      "Pass rate (%) for " + data.length + " agents, each run both ways; sorted by gain");
    var controls = host.appendChild(api.el("div", { class: "viz-controls fa-controls" }));
    controls.appendChild(buildSeg("Score shown", metric, function (k) { metric = k; render(); }, false));
    controls.appendChild(buildLegend("dots"));
    var body = host.appendChild(api.el("div", { class: "viz-body fa-body" }));

    var tRows = [];
    data.forEach(function (a) {
      [["mcp", "MCP"], ["cli", "CLI"]].forEach(function (acc) {
        var r = { model: a.model, harness: a.harness, access: acc[1] };
        METRICS.forEach(function (m) { r[m.key] = a[acc[0]][m.key]; });
        tRows.push(r);
      });
    });
    api.tableTwin(host, {
      summary: "Show data table",
      caption: "Pass rate (%) with Slack MCP tools (MCP) and with the exported workspace as files (CLI)." +
        (avgGain != null ? " Average overall gain with CLI: " + signed(avgGain) + " points." : ""),
      columns: [{ key: "model", label: "Model" }, { key: "harness", label: "Harness" }, { key: "access", label: "Access" }]
        .concat(TABLE_METRICS.map(function (m) { return { key: m.key, label: m.label, num: true, fmt: p2 }; })),
      rows: tRows
    });
    host.appendChild(api.el("div", { class: "viz-foot" },
      api.el("span", { text: "Gain = CLI minus MCP, in points. With CLI access, agents read the exported workspace with grep, jq, and cat." })));

    function summary(rows, m) {
      var up = rows.filter(function (r) { return r.d > 0; });
      var down = rows.filter(function (r) { return r.d < 0; });
      var flat = rows.filter(function (r) { return r.d === 0; });
      var best = rows[0];
      var s = "Dumbbell chart: " + m.name + " pass rate with MCP tools versus files via CLI for " + rows.length +
        " agents. Files via CLI score higher for " + up.length + " of " + rows.length;
      if (down.length) s += ", lower for " + down.map(function (r) { return r.a.model + " (" + signed(r.d) + ")"; }).join(", ");
      if (flat.length) s += ", the same for " + flat.map(function (r) { return r.a.model; }).join(", ");
      s += ". Largest gain: " + best.a.harness + " with " + best.a.model + ", " + signed(best.d) + " points.";
      if (m.key === "overall" && avgGain != null) s += " Average gain " + signed(avgGain) + " points.";
      return s;
    }

    function render() {
      api.clear(body);
      var W = Math.max(220, Math.floor(body.clientWidth));
      var m = metricOf(metric);
      var rows = data.map(function (a, i) {
        var c = a.cli[metric], p = a.mcp[metric];
        return { a: a, i: i, cli: c, mcp: p, d: round2(c - p) };
      }).sort(function (u, v) { return v.d - u.d || u.i - v.i; });
      if (!rows.length) return;

      var vals = [];
      rows.forEach(function (r) { vals.push(r.cli, r.mcp); });
      var lo = Math.floor(minOf(vals) / 10) * 10;
      var hi = Math.ceil(maxOf(vals) / 10) * 10;
      if (hi === lo) hi = lo + 10;

      var narrow = W < 440;
      var fModel = font(13, 500), fHarn = font(12, 400), fDelta = font(12.5, 600), fHead = font(11.5, 500);
      var showAvg = metric === "overall" && avgGain != null;
      var deltaTextW = Math.ceil(maxOf(rows.map(function (r) { return textW(signed(r.d), fDelta); })
        .concat(showAvg ? [textW(signed(avgGain), fDelta)] : [])));
      var deltaW = Math.max(deltaTextW + 19, Math.ceil(textW("CLI − MCP", fHead)) + 4);
      var gx = W - deltaTextW - 12; /* glyph column */
      var labelW = 0;
      if (!narrow) {
        labelW = Math.ceil(maxOf(rows.map(function (r) {
          return Math.max(textW(r.a.model, fModel), textW(r.a.harness, fHarn));
        }))) + 18;
        labelW = Math.min(labelW, Math.round(W * 0.36));
      }
      var x0 = labelW + 10, x1 = W - deltaW - 16;
      var x = api.linear([lo, hi], [x0, x1]);
      var step = (x1 - x0) / ((hi - lo) / 10) < 34 ? 20 : 10;
      var ticks = [];
      for (var t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) ticks.push(t);

      var headH = 22, rowH = narrow ? 50 : 40;
      var rowsTop = headH + 2;
      var rowsBottom = rowsTop + rows.length * rowH;
      var H = rowsBottom + (showAvg ? 38 : 4);

      /* summary image first in reading order; the hit layer is stacked beneath it by CSS */
      var svg = body.appendChild(api.s("svg", {
        class: "fa-plot", width: W, height: H, viewBox: "0 0 " + W + " " + H,
        role: "img", "aria-label": summary(rows, m)
      }));
      var hits = body.appendChild(api.el("div", { class: "fa-hits" }));

      /* top axis (ticks) + column heads + hairline grid through the rows */
      var gGrid = svg.appendChild(api.s("g", { class: "grid" }));
      var gAxis = svg.appendChild(api.s("g", { class: "axis" }));
      /* narrow rows put the label above the marks, so the grid skips the label line */
      var spans = narrow
        ? rows.map(function (r, k) { return [rowsTop + k * rowH + 22, rowsTop + (k + 1) * rowH]; })
        : [[rowsTop, rowsBottom]];
      ticks.forEach(function (tv) {
        var tx = Math.round(x(tv)) + 0.5;
        spans.forEach(function (sp) { gGrid.appendChild(api.s("line", { x1: tx, x2: tx, y1: sp[0], y2: sp[1] })); });
        gAxis.appendChild(api.s("text", { x: tx, y: 13, "text-anchor": "middle", text: String(tv) }));
      });
      if (!narrow) svg.appendChild(api.s("text", { class: "fa-t-colhead", x: 0, y: 13, text: m.name }));
      svg.appendChild(api.s("text", { class: "fa-t-colhead", x: W, y: 13, "text-anchor": "end", text: "CLI − MCP" }));

      rows.forEach(function (r, k) {
        var top = rowsTop + k * rowH;
        var cy = narrow ? top + 34 : top + rowH / 2;
        var g = svg.appendChild(api.s("g", { class: "fa-row" }));
        if (narrow) {
          var tl = api.s("text", { class: "fa-t-model", x: 0, y: top + 16 });
          tl.appendChild(api.s("tspan", { text: r.a.model }));
          tl.appendChild(api.s("tspan", { class: "fa-t-harness", dx: 7, text: r.a.harness }));
          g.appendChild(tl);
        } else {
          g.appendChild(api.s("text", { class: "fa-t-model", x: 0, y: cy - 2, text: r.a.model }));
          g.appendChild(api.s("text", { class: "fa-t-harness", x: 0, y: cy + 13, text: r.a.harness }));
        }
        var xm = x(r.mcp), xc = x(r.cli);
        if (Math.abs(xc - xm) > 0.5) {
          g.appendChild(api.s("line", { class: "fa-conn " + (r.d >= 0 ? "fa-conn--gain" : "fa-conn--loss"), x1: xm, x2: xc, y1: cy, y2: cy }));
        }
        g.appendChild(api.s("circle", { class: "fa-ring", cx: xm, cy: cy, r: 7.5 }));
        g.appendChild(api.s("circle", { class: "fa-dot-mcp", cx: xm, cy: cy, r: 4.5 }));
        g.appendChild(api.s("circle", { class: "fa-ring", cx: xc, cy: cy, r: 7 }));
        g.appendChild(api.s("circle", { class: "fa-dot-cli", cx: xc, cy: cy, r: 5 }));
        g.appendChild(api.s("path", { class: "fa-glyph", d: glyphPath(r.d, gx, cy) }));
        g.appendChild(api.s("text", { class: "fa-t-delta", x: W, y: cy + 4.5, "text-anchor": "end", text: signed(r.d) }));

        addHit(hits, { x: 0, y: top, w: W, h: rowH },
          r.a.harness + " with " + r.a.model + ", " + m.name + ": " + p2(r.cli) + " with files via CLI, " +
            p2(r.mcp) + " with MCP tools, a " + deltaWords(r.d) + ".",
          function () {
            return {
              title: r.a.model, sub: r.a.harness + " · " + m.name, big: signed(r.d) + " points",
              rows: [{ label: CLI, value: p2(r.cli), color: KEY_CLI }, { label: MCP, value: p2(r.mcp), color: KEY_MCP }],
              note: "Gain = CLI minus MCP pass rate."
            };
          },
          { onEnter: function () { g.classList.add("is-hot"); }, onLeave: function () { g.classList.remove("is-hot"); } });
      });

      if (showAvg) {
        var ay = rowsBottom + 4;
        svg.appendChild(api.s("line", { class: "fa-sum-rule", x1: 0, x2: W, y1: ay + 0.5, y2: ay + 0.5 }));
        var acy = ay + 19;
        svg.appendChild(api.s("text", { class: "fa-t-sum", x: 0, y: acy + 4.5, text: "Average gain, all " + rows.length + " agents" }));
        svg.appendChild(api.s("path", { class: "fa-glyph", d: glyphPath(avgGain, gx, acy) }));
        svg.appendChild(api.s("text", { class: "fa-t-delta", x: W, y: acy + 4.5, "text-anchor": "end", text: signed(avgGain) }));
      }
    }
    return render;
  }, { roving: ".fa-hit" });

  /* =========================================================================
     2. Where tool calls go — paired bars (MCP above CLI) per call category
     ========================================================================= */
  V.register("viz-toolcalls", function (host, api) {
    var T = api.data.toolCalls || [];
    var totCli = sum(T, function (d) { return d.cli; });
    var totMcp = sum(T, function (d) { return d.mcp; });

    api.clear(host);
    buildHead(host, "Where tool calls go", "Share of tool calls, aggregated over the runs above");
    var controls = host.appendChild(api.el("div", { class: "viz-controls fa-controls" }));
    controls.appendChild(buildLegend("bars"));
    var body = host.appendChild(api.el("div", { class: "viz-body fa-body" }));

    var pctOrBlank = function (v, r) { return r && r._total ? "" : pct1(v); };
    api.tableTwin(host, {
      summary: "Show data table",
      caption: "Tool calls by category with MCP tools and with files via CLI, as counts and as a share of all calls.",
      columns: [
        { key: "label", label: "Category" },
        { key: "detail", label: "CLI vs. MCP tools" },
        { key: "mcp", label: "MCP calls", num: true, fmt: n0 },
        { key: "mcpPct", label: "MCP share", num: true, fmt: pctOrBlank },
        { key: "cli", label: "CLI calls", num: true, fmt: n0 },
        { key: "cliPct", label: "CLI share", num: true, fmt: pctOrBlank }
      ],
      rows: T.concat([{ label: "Total", detail: "", mcp: totMcp, cli: totCli, _total: true, _class: "fa-total" }])
    });
    host.appendChild(api.el("div", { class: "viz-foot" },
      api.el("span", { text: "Totals: " + n0(totCli) + " calls with files via CLI, " + n0(totMcp) + " with MCP tools. Tool and schema loading is built in for CLI (–)." })));

    function summary() {
      var topM = T.slice().sort(function (a, b) { return (b.mcpPct || 0) - (a.mcpPct || 0); })[0];
      var topC = T.slice().sort(function (a, b) { return (b.cliPct || 0) - (a.cliPct || 0); })[0];
      return "Bar chart of tool-call shares. With MCP tools the largest share is " + topM.label + " (" + pct1(topM.mcpPct) +
        " of " + n0(totMcp) + " calls); with files via CLI it is " + topC.label + " (" + pct1(topC.cliPct) +
        " of " + n0(totCli) + " calls).";
    }

    function render() {
      api.clear(body);
      if (!T.length) return;
      var W = Math.max(220, Math.floor(body.clientWidth));
      var narrow = W < 470;
      var fDet = font(11.5, 400, true), fVal = font(12, 500), fTag = font(10.5, 400, true);
      var maxPct = Math.ceil(maxOf(T.map(function (d) { return Math.max(d.cliPct || 0, d.mcpPct || 0); })) / 10) * 10;
      var labelW = narrow ? W : Math.round(Math.min(250, Math.max(160, W * 0.37)));
      var tagW = Math.ceil(Math.max(textW("MCP", fTag), textW("CLI", fTag))) + 9;
      var valW = Math.ceil(textW("00.0%", fVal)) + 10;
      var bx0 = Math.round((narrow ? 0 : labelW + 12) + tagW);
      var bx1 = W - valW;
      var x = api.linear([0, maxPct], [bx0, bx1]);
      var barH = 12, barGap = 4, pairH = barH * 2 + barGap, lineH = 15, pad = 10;

      /* layout pass */
      var y = 0;
      var groups = T.map(function (d) {
        var det = wrapText(d.detail, (narrow ? W : labelW) - 4, fDet);
        var labH = 17 + det.length * lineH;
        var g = { d: d, det: det, top: y };
        if (narrow) {
          g.labTop = y + pad; g.barsTop = g.labTop + labH + 4; g.h = labH + 4 + pairH + 2 * pad;
        } else {
          var inner = Math.max(labH, pairH);
          g.labTop = y + pad + (inner - labH) / 2; g.barsTop = y + pad + (inner - pairH) / 2; g.h = inner + 2 * pad;
        }
        y += g.h;
        return g;
      });
      var H = Math.ceil(y);

      var svg = body.appendChild(api.s("svg", { class: "fa-plot", width: W, height: H, viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": summary() }));
      var hits = body.appendChild(api.el("div", { class: "fa-hits" }));

      groups.forEach(function (g, i) {
        var d = g.d;
        var gg = svg.appendChild(api.s("g", { class: "fa-group" }));
        if (i > 0) gg.appendChild(api.s("line", { class: "fa-sep", x1: 0, x2: W, y1: Math.round(g.top) + 0.5, y2: Math.round(g.top) + 0.5 }));
        gg.appendChild(api.s("text", { class: "fa-t-label", x: 0, y: g.labTop + 12, text: d.label }));
        g.det.forEach(function (line, k) {
          gg.appendChild(api.s("text", { class: "fa-t-detail", x: 0, y: g.labTop + 17 + 11 + k * lineH, text: line }));
        });
        var bl = Math.round(bx0) + 0.5;
        gg.appendChild(api.s("line", { class: "baseline", x1: bl, x2: bl, y1: g.barsTop - 3, y2: g.barsTop + pairH + 3 }));
        [["mcp", "MCP", "fa-bar-mcp"], ["cli", "CLI", "fa-bar-cli"]].forEach(function (s, k) {
          var by = g.barsTop + k * (barH + barGap), cy = by + barH / 2;
          var v = d[s[0] + "Pct"];
          gg.appendChild(api.s("text", { class: "fa-t-tag", x: bx0 - 7, y: cy + 3.5, "text-anchor": "end", text: s[1] }));
          if (v == null) {
            gg.appendChild(api.s("text", { class: "fa-t-val", x: bx0 + 6, y: cy + 4, text: "–" }));
            gg.appendChild(api.s("text", { class: "fa-t-note", x: bx0 + 6 + textW("–", fVal) + 6, y: cy + 4, text: "built-in for CLI" }));
            return;
          }
          var xe = x(v);
          if (xe - bx0 > 0.4) gg.appendChild(api.s("path", { class: s[2], d: api.hbar(bx0, xe, by, barH, 4) }));
          gg.appendChild(api.s("text", { class: "fa-t-val", x: Math.max(xe, bx0) + 6, y: cy + 4, text: pct1(v) }));
        });

        var cliTxt = d.cli == null ? "built in, no separate calls" : pct1(d.cliPct) + " (" + n0(d.cli) + " calls)";
        addHit(hits, { x: 0, y: g.top, w: W, h: g.h },
          d.label + " (" + d.detail + "): MCP tools " + pct1(d.mcpPct) + " (" + n0(d.mcp) + " calls); files via CLI " + cliTxt + ".",
          function () {
            return {
              title: d.label, sub: d.detail,
              rows: [
                { label: MCP + " · " + n0(d.mcp) + " calls", value: pct1(d.mcpPct), color: KEY_MCP },
                { label: CLI + " · " + (d.cli == null ? "built in" : n0(d.cli) + " calls"), value: pct1(d.cliPct), color: KEY_CLI }
              ],
              note: "Share of " + n0(totMcp) + " MCP and " + n0(totCli) + " CLI tool calls."
            };
          });
      });
    }
    return render;
  }, { roving: ".fa-hit" });

  /* =========================================================================
     3. Pass rate by reasoning effort — small multiples on one shared y-scale
     ========================================================================= */
  V.register("viz-effort", function (host, api) {
    var E = api.data.effort || [];
    var LV = [{ key: "low", label: "Low", short: "Low" }, { key: "medium", label: "Medium", short: "Med" }, { key: "high", label: "High", short: "High" }];
    var metric = "overall";
    /* one domain for every panel and every metric, so toggling never rescales */
    var maxAll = 0;
    E.forEach(function (a) { LV.forEach(function (l) { METRICS.forEach(function (m) { maxAll = Math.max(maxAll, a[l.key][m.key]); }); }); });
    var yTop = Math.max(20, Math.ceil(maxAll / 20) * 20);

    api.clear(host);
    buildHead(host, "Pass rate by reasoning effort",
      "Low, medium, and high effort for " + E.length + " agents; one panel each, same scale");
    var controls = host.appendChild(api.el("div", { class: "viz-controls fa-controls" }));
    controls.appendChild(buildSeg("Score shown", metric, function (k) { metric = k; render(); }, true));
    var body = host.appendChild(api.el("div", { class: "viz-body fa-body" }));

    var tRows = [];
    E.forEach(function (a) {
      LV.forEach(function (l) {
        var r = { model: a.model, harness: a.harness, effort: l.label };
        METRICS.forEach(function (m) { r[m.key] = a[l.key][m.key]; });
        tRows.push(r);
      });
    });
    api.tableTwin(host, {
      summary: "Show data table",
      caption: "Pass rate (%) at low, medium, and high reasoning effort.",
      columns: [{ key: "model", label: "Model" }, { key: "harness", label: "Harness" }, { key: "effort", label: "Effort" }]
        .concat(TABLE_METRICS.map(function (m) { return { key: m.key, label: m.label, num: true, fmt: p2 }; })),
      rows: tRows
    });
    var allRise = E.length > 0 && E.every(function (a) { return a.low.overall < a.medium.overall && a.medium.overall < a.high.overall; });
    host.appendChild(api.el("div", { class: "viz-foot" },
      api.el("span", { text: (allRise ? "Overall rises with effort for all " + word(E.length) + " agents; individual categories can dip. " : "") +
        "Medium is the default setting for the leaderboard." })));

    function summary(m) {
      var vals = E.map(function (a) { return LV.map(function (l) { return a[l.key][m.key]; }); });
      var rise = vals.filter(function (v) { return v[2] > v[0]; }).length;
      var dips = E.filter(function (a, i) { var v = vals[i]; return v[1] < v[0] || v[2] < v[1]; })
        .map(function (a) { return a.model; });
      return "Small multiples: " + m.name + " pass rate at low, medium, and high reasoning effort for " + E.length +
        " agents. High beats low for " + rise + " of " + E.length + "." +
        (dips.length ? " Dips between adjacent levels: " + dips.join(", ") + "." : " No agent dips between adjacent levels.");
    }

    /** value label at an end point, on the side away from the neighbouring segment */
    function endLabel(svg, px, py, val, neighbour, anchor) {
      var below = neighbour > val; /* neighbour drawn above → the segment rises away; label goes below */
      var ty = below ? py + 16 : py - 9;
      svg.appendChild(api.s("text", {
        class: "fa-ef-val", x: anchor === "start" ? px - 5 : px + 5, y: ty, "text-anchor": anchor, text: p2(val)
      }));
    }

    function mini(pw, v, showTicks) {
      var padL = 16, padR = 6, top = 18, ph = 104;
      var H = top + ph + 36;
      var xs = [padL + 10, 0, pw - padR - 10];
      xs[1] = (xs[0] + xs[2]) / 2;
      var y = api.linear([0, yTop], [top + ph, top]);
      var svg = api.s("svg", { class: "fa-ef-svg", width: pw, height: H, viewBox: "0 0 " + pw + " " + H, "aria-hidden": "true", focusable: "false" });
      var gg = svg.appendChild(api.s("g", { class: "grid" }));
      for (var t = 0; t <= yTop + 1e-9; t += 20) {
        var gy = Math.round(y(t)) + 0.5;
        gg.appendChild(api.s("line", { x1: padL, x2: pw - padR, y1: gy, y2: gy }));
        if (showTicks) svg.appendChild(api.s("text", { class: "fa-ef-tick", x: padL - 5, y: gy + 3.5, "text-anchor": "end", text: String(t) }));
      }
      var pts = v.map(function (val, k) { return [xs[k], y(val)]; });
      svg.appendChild(api.s("path", {
        class: "fa-ef-line",
        d: "M" + pts.map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join("L")
      }));
      pts.forEach(function (p) {
        svg.appendChild(api.s("circle", { class: "fa-ring", cx: p[0], cy: p[1], r: 6 }));
        svg.appendChild(api.s("circle", { class: "fa-ef-dot", cx: p[0], cy: p[1], r: 4 }));
      });
      endLabel(svg, pts[0][0], pts[0][1], v[0], v[1], "start");
      endLabel(svg, pts[2][0], pts[2][1], v[2], v[1], "end");
      LV.forEach(function (l, k) {
        svg.appendChild(api.s("text", { class: "fa-ef-x", x: xs[k], y: H - 6, "text-anchor": "middle", text: pw < 130 ? l.short : l.label }));
      });
      return svg;
    }

    function render() {
      api.clear(body);
      if (!E.length) return;
      var W = Math.max(200, Math.floor(body.clientWidth));
      var m = metricOf(metric);
      var gap = 10;
      var cols = W >= 5 * 100 + 4 * gap ? 5 : W >= 3 * 116 + 2 * gap ? 3 : 2;
      cols = Math.min(cols, E.length);
      var pw = Math.floor((W - (cols - 1) * gap) / cols);

      body.appendChild(api.el("p", { class: "fa-ef-ylabel", text: m.name + " pass rate (%), 0–" + yTop + " in every panel" }));
      var grid = body.appendChild(api.el("div", {
        class: "fa-ef-grid", role: "group", "aria-label": summary(m), style: { "--fa-cols": String(cols) }
      }));
      E.forEach(function (a, i) {
        var v = LV.map(function (l) { return a[l.key][metric]; });
        var panel = grid.appendChild(api.el("div", {
          class: "fa-ef-panel", "data-cat": metric, tabindex: "0", role: "img",
          "aria-label": a.harness + " with " + a.model + ", " + m.name + " pass rate: " + p2(v[0]) + " at low, " +
            p2(v[1]) + " at medium, " + p2(v[2]) + " at high effort."
        }));
        panel.appendChild(api.el("div", { class: "fa-ef-model", text: a.model }));
        panel.appendChild(api.el("div", { class: "fa-ef-harness", text: a.harness }));
        panel.appendChild(mini(pw, v, i % cols === 0));
        api.bindTip(panel, function () {
          return {
            title: a.model, sub: a.harness + " · " + m.name,
            rows: LV.map(function (l, k) { return { label: l.label + " effort", value: p2(v[k]) }; }),
            note: "Low to high: " + signed(round2(v[2] - v[0])) + " points"
          };
        });
      });
    }
    return render;
  }, { roving: ".fa-ef-panel" });
})();
