/* ===========================================================================
   leaderboard.js — the SlackBench leaderboard (mount: #lb-root)

   * ranked horizontal bar list: semantic HTML rows, bars positioned by CSS
     from two custom properties (--v on the row, --lb-plot-w on the wrapper),
     so every animation is transform-only
   * metric switch (Overall / AS / HA / SU / CI) re-sorts with a FLIP transition
   * harness chips emphasize one harness (others de-emphasized, never removed)
   * human reference line + label for the selected metric
   * hover / focus tooltip; also lights up the same model under other harnesses
   * sortable full results table with a pinned human reference row
   Built on SBViz (assets/js/charts/core.js); styles in assets/css/leaderboard.css.
   =========================================================================== */
(function () {
  "use strict";
  if (!window.SBViz) return;

  var FLIP_MS = 350;
  var COLOR_VAR = { overall: "--c-overall", AS: "--c-as", HA: "--c-ha", SU: "--c-su", CI: "--c-ci" };

  window.SBViz.register("lb-root", function setup(host, api) {
    var el = api.el, fmt = api.fmt;
    var D = api.data || {};
    var H = D.human || {};
    var RUNS = (D.stats && D.stats.runs) || 3;

    var rows = (D.results || []).map(function (d, i) { return { d: d, base: i }; });
    api.clear(host);
    if (!rows.length) {
      host.appendChild(el("p", { class: "viz-error", text: "The leaderboard data could not be loaded." }));
      return function () {};
    }
    /* canonical order = the paper's rank (Overall, descending); it also breaks ties */
    rows.sort(function (a, b) { return (a.d.rank - b.d.rank) || (a.base - b.base); });
    rows.forEach(function (r, i) { r.base = i; });
    var N = rows.length;

    /* ---------- metrics, ranks, orders ---------- */
    var METRICS = [{ key: "overall", name: "Overall", short: "Overall" }].concat(api.CATS.map(function (c) {
      return { key: c.key, name: c.name, short: c.key };
    }));
    var MET = {};
    METRICS.forEach(function (m) { MET[m.key] = m; });

    /* agent scores: two decimals, exactly as in the paper's results table */
    function score(v) { return v == null || isNaN(v) ? "–" : Number(v).toFixed(2); }
    /* human scores: as reported (91, 84.5), no padded precision */
    function asReported(v) { return v == null ? "–" : String(v); }
    function num(v) { return v == null || isNaN(v) ? -Infinity : Number(v); }

    var ORDER = {};
    METRICS.forEach(function (m) {
      var k = m.key;
      rows.forEach(function (r) {
        var v = num(r.d[k]), above = 0, tied = false;
        rows.forEach(function (o) {
          var w = num(o.d[k]);
          if (w > v) above += 1;
          else if (o !== r && w === v) tied = true;
        });
        (r.rank = r.rank || {})[k] = k === "overall" && r.d.rank != null ? r.d.rank : above + 1;
        (r.tied = r.tied || {})[k] = tied;
      });
      /* sorted by the metric, descending; ties keep the canonical (Overall) order */
      ORDER[k] = rows.slice().sort(function (a, b) { return (num(b.d[k]) - num(a.d[k])) || (a.base - b.base); });
    });
    var MAXV = 1;
    rows.forEach(function (r) { METRICS.forEach(function (m) { if (num(r.d[m.key]) > MAXV) MAXV = num(r.d[m.key]); }); });
    MAXV = Math.min(100, MAXV);

    /* harness counts (chips) and same-model siblings (hover) */
    var hCount = {};
    rows.forEach(function (r) { hCount[r.d.harness] = (hCount[r.d.harness] || 0) + 1; });
    var harnesses = Object.keys(hCount).sort(function (a, b) { return (hCount[b] - hCount[a]) || a.localeCompare(b); });
    var byModel = {};
    rows.forEach(function (r) { (byModel[r.d.model] = byModel[r.d.model] || []).push(r); });
    rows.forEach(function (r) { r.sibs = byModel[r.d.model].filter(function (o) { return o !== r; }); });

    var state = { metric: "overall", harness: null, size: "" };
    var geom = { plotW: 0, trackW: 0 };
    var ids = {
      ml: api.uid("lb-ml"), hl: api.uid("lb-hl"), desc: api.uid("lb-desc"),
      hint: api.uid("lb-hint"), cap: api.uid("lb-cap")
    };

    /* ---------- controls ---------- */
    var segBtns = [];
    var seg = el("div", { class: "seg lb-seg", role: "group", "aria-labelledby": ids.ml });
    METRICS.forEach(function (m) {
      var isCat = m.key !== "overall";
      var b = el("button", {
        type: "button", class: "lb-seg-btn", "data-metric": m.key,
        "aria-pressed": String(m.key === state.metric),
        "aria-label": isCat ? m.name + " (" + m.key + ")" : null,
        title: isCat ? null : "Unweighted mean of the four categories",
        onclick: function () { setMetric(m.key); }
      },
        el("span", { class: "swatch", "data-cat": isCat ? m.key : "overall", "aria-hidden": "true" }),
        el("span", { class: isCat ? "lb-full" : null, text: m.name }),
        isCat ? el("span", { class: "lb-short", "aria-hidden": "true", text: m.short }) : null);
      segBtns.push(b);
      seg.appendChild(b);
    });

    var chipBtns = [];
    var chips = el("div", { class: "chips lb-chips", role: "group", "aria-labelledby": ids.hl });
    function addChip(h, label) {
      var b = el("button", {
        type: "button", class: "chip lb-chip", "aria-pressed": String(h === state.harness),
        title: h ? "Highlight agents run in " + h : "No highlight",
        onclick: function () { setHarness(h && h === state.harness ? null : h); }
      }, el("span", { text: label }), h ? el("span", { class: "count", text: String(hCount[h]) }) : null);
      b._h = h;
      chipBtns.push(b);
      chips.appendChild(b);
    }
    addChip(null, "All");
    harnesses.forEach(function (h) { addChip(h, h); });

    var controls = el("div", { class: "viz-controls lb-controls" },
      el("div", { class: "lb-ctl" }, el("span", { class: "control-label lb-ctl-label", id: ids.ml, text: "Metric" }), seg),
      el("div", { class: "lb-ctl" }, el("span", { class: "control-label lb-ctl-label", id: ids.hl, text: "Harness" }), chips));

    /* ---------- legend ---------- */
    var legSw = el("span", { class: "swatch lb-leg-bar", "aria-hidden": "true" });
    var legBarText = el("span");
    var legOther = el("span", { class: "lb-leg-item lb-leg-other", hidden: true },
      el("span", { class: "swatch lb-leg-muted", "aria-hidden": "true" }), "Other harnesses");
    var legNote = el("span", { class: "lb-leg-note" });
    var legend = el("div", { class: "viz-legend lb-legend" },
      el("span", { class: "lb-leg-item" }, legSw, legBarText),
      el("span", { class: "lb-leg-item" }, el("span", { class: "lb-leg-human", "aria-hidden": "true" }), "Human researchers (with AI tools)"),
      legOther, legNote);

    /* ---------- chart: head (ticks + human label), overlay (grid + human line), rows ---------- */
    var TICKS = [0, 25, 50, 75, 100];
    var humanLine = null;
    var ticks = TICKS.map(function (v) {
      var t = el("span", { class: "lb-tick", text: String(v) });
      t.style.setProperty("--x", v);
      return { v: v, el: t, w: 0 };
    });
    var humanVal = el("span", { class: "lb-hl-v" });
    var humanLabel = el("span", { class: "lb-hl-label" }, el("span", { class: "lb-hl-k", text: "Human" }), humanVal);
    var hModel = el("span", { class: "lb-h lb-h-model", text: "Model" });
    var head = el("div", { class: "lb-head", "aria-hidden": "true" },
      el("span", { class: "lb-h lb-h-rank", text: "#" }),
      hModel,
      el("span", { class: "lb-h lb-h-harness", text: "Harness" }),
      el("div", { class: "lb-scale" }, ticks.map(function (t) { return t.el; }), humanLabel));

    var overlay = el("div", { class: "lb-overlay", "aria-hidden": "true" },
      TICKS.map(function (v) {
        var g = el("span", { class: "lb-gl" + (v === 0 ? " is-base" : "") });
        g.style.setProperty("--x", v);
        return g;
      }),
      humanLine = el("span", { class: "lb-hline" }));

    var list = el("ol", { class: "lb-list", role: "list", "aria-describedby": ids.hint });

    rows.forEach(function (r) {
      var d = r.d;
      r.rankEl = el("span", { class: "lb-rank" });
      r.valEl = el("span", { class: "lb-val" });
      r.el = el("li", { class: "lb-row", tabindex: "-1", "data-harness": d.harness, "data-model": d.model },
        r.rankEl,
        el("span", { class: "lb-name" },
          el("span", { class: "lb-model", text: d.model }),
          el("span", { class: "lb-harness", text: d.harness })),
        el("span", { class: "lb-track", "aria-hidden": "true" },
          el("span", { class: "lb-clip" }, el("span", { class: "lb-bar" })),
          r.valEl));
      r.el.addEventListener("pointerenter", function (e) { showTip(r, e); });
      r.el.addEventListener("pointermove", function (e) { if (e.pointerType !== "touch" && active === r) api.tip.move(e); });
      r.el.addEventListener("pointerleave", function (e) { if (e.pointerType !== "touch") hideTip(r); });
      r.el.addEventListener("focus", function () {
        setRoving(r);
        /* a click or tap also focuses the row; its tooltip is already up at the pointer */
        if (!keyboardFocus(r.el)) return;
        showTip(r, r.valEl);
        /* focus() may scroll the row into view: re-anchor once layout settles */
        requestAnimationFrame(function () { if (active === r) api.tip.move(r.valEl); });
      });
      r.el.addEventListener("blur", function () { hideTip(r); });
      r.el.addEventListener("keydown", onRowKey);
      list.appendChild(r.el);
    });

    var desc = el("p", { class: "sr-only", id: ids.desc });
    var hint = el("p", {
      class: "sr-only", id: ids.hint,
      text: "Use the up and down arrow keys to move between agents; Home and End jump to the first and last agent."
    });
    var chart = el("div", { class: "lb-chart", role: "group", "aria-label": "Leaderboard", "aria-describedby": ids.desc },
      head, overlay, list);

    /* ---------- full results table (sortable, human reference pinned on top) ---------- */
    var COLS = [
      { key: "rank", label: "Rank", num: true, dir: "asc", title: "Overall rank" },
      { key: "model", label: "Model", text: true, dir: "asc" },
      { key: "harness", label: "Harness", text: true, dir: "asc" },
      { key: "AS", label: "AS", num: true, dir: "desc", score: true, title: "Agentic Search" },
      { key: "HA", label: "HA", num: true, dir: "desc", score: true, title: "Hallucination" },
      { key: "SU", label: "SU", num: true, dir: "desc", score: true, title: "Summarization" },
      { key: "CI", label: "CI", num: true, dir: "desc", score: true, title: "Circumstance Inference" },
      { key: "overall", label: "Overall", num: true, dir: "desc", score: true, title: "Unweighted mean of the four categories" },
      { key: "cost", label: "Cost (USD)", num: true, dir: "asc", title: "Cost of one full run of the benchmark" },
      { key: "steps", label: "Avg steps", num: true, dir: "asc", title: "Average trajectory steps per task" }
    ];
    var COLK = {};
    COLS.forEach(function (c) { COLK[c.key] = c; });
    var best = {};
    COLS.forEach(function (c) {
      if (!c.score) return;
      best[c.key] = Math.max.apply(null, rows.map(function (r) { return num(r.d[c.key]); }));
    });
    var tState = { key: "rank", dir: "asc" };
    var thEls = {};
    var headRow = el("tr");
    COLS.forEach(function (c) {
      var th = el("th", { scope: "col", class: c.num ? "n" : null },
        el("button", {
          type: "button", class: "lb-sort", title: c.title ? "Sort by " + c.title : "Sort by " + c.label,
          onclick: function () { sortTable(c.key); }
        }, el("span", { text: c.label }), el("span", { class: "lb-sort-i", "aria-hidden": "true" })));
      thEls[c.key] = th;
      headRow.appendChild(th);
    });
    var tbody = el("tbody");
    var table = el("table", { class: "dtable lb-dtable", "aria-describedby": ids.cap },
      el("thead", null, headRow), tbody);
    var tableNote = el("p", {
      class: "lb-table-note", id: ids.cap,
      text: "Pass rate (%), mean of " + RUNS + " runs; bold marks the best agent in each column. Cost is for one full " +
        "run of the benchmark and steps are averaged per task, both approximate (read from the paper's plots); " +
        "– = not traced. Select a column header to sort."
    });
    var tScroll = el("div", { class: "table-scroll lb-table-scroll", tabindex: "0", role: "region", "aria-label": "Full results table" }, table);
    tScroll.addEventListener("scroll", function () { tScroll.classList.toggle("is-scrolled", tScroll.scrollLeft > 1); }, { passive: true });
    var det = el("details", { class: "viz-table lb-table" },
      el("summary", { text: "Full results table (" + N + " agents)" }),
      tableNote,
      tScroll);

    var nCost = rows.filter(function (r) { return r.d.cost != null; }).length;
    var foot = el("div", { class: "viz-foot lb-foot" }, el("span", {
      text: "Mean of " + RUNS + " runs · Overall = unweighted mean of AS, HA, SU, CI · Cost and steps reported for the " +
        nCost + " agents whose token costs could be traced accurately."
    }));
    var live = el("p", { class: "sr-only", "aria-live": "polite" });

    var wrap = el("div", { class: "lb", "data-metric": state.metric },
      controls, legend, chart, desc, hint, det, foot, live);
    host.appendChild(wrap);

    /* ======================= behavior ======================= */
    function rowLabel(r) {
      var d = r.d, k = state.metric;
      return "Rank " + r.rank[k] + (r.tied[k] ? " (tied)" : "") + " by " + MET[k].name + ": " + d.model + ", " + d.harness +
        ", " + score(d[k]) + ". " +
        METRICS.filter(function (m) { return m.key !== k; }).map(function (m) { return m.name + " " + score(d[m.key]); }).join(", ") + ".";
    }

    function humanCount(k) {
      var hv = H[k];
      if (hv == null) return null;
      return rows.filter(function (r) { return num(r.d[k]) >= hv; }).length;
    }

    function describe() {
      var k = state.metric, top = ORDER[k][0], hv = H[k], n = humanCount(k);
      var leaders = ORDER[k].filter(function (r) { return num(r.d[k]) === num(top.d[k]); })
        .map(function (r) { return r.d.model + " (" + r.d.harness + ")"; });
      var s = "Agents ranked by " + MET[k].name + " pass rate. " +
        (leaders.length > 1
          ? leaders.slice(0, -1).join(", ") + " and " + leaders[leaders.length - 1] + " tie for the lead with " + score(top.d[k]) + "."
          : leaders[0] + " leads with " + score(top.d[k]) + ".");
      if (hv != null) {
        s += " Human researchers score " + asReported(hv) + "; " +
          (n === 0 ? "no agent reaches that." : n + " of " + N + " agents score at or above it.");
      }
      return s;
    }

    function setMetric(k) {
      if (!MET[k] || k === state.metric) return;
      state.metric = k;
      segBtns.forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-metric") === k)); });
      if (active) hideTip(active);
      apply(!api.reduceMotion);
      live.textContent = describe();
    }

    function setHarness(h) {
      if (h === state.harness) return;
      state.harness = h || null;
      chipBtns.forEach(function (b) { b.setAttribute("aria-pressed", String(b._h === state.harness)); });
      applyEmphasis();
      if (!h) { live.textContent = "No harness highlighted."; return; }
      var mine = ORDER[state.metric].filter(function (r) { return r.d.harness === h; });
      live.textContent = "Highlighting " + h + ": " + mine.length + (mine.length === 1 ? " agent" : " agents") +
        ", best ranked #" + mine[0].rank[state.metric] + " by " + MET[state.metric].name + ".";
    }

    function applyEmphasis() {
      var h = state.harness;
      rows.forEach(function (r) { r.el.classList.toggle("is-dim", !!h && r.d.harness !== h); });
      legOther.hidden = !h;
      renderTableBody();
    }

    var animTimer = 0;
    function apply(animate) {
      var k = state.metric;
      var first = null;
      if (animate) {
        first = rows.map(function (r) { return r.el.getBoundingClientRect().top; });
        rows.forEach(function (r) { r.el.style.transition = "none"; r.el.style.transform = ""; });
        wrap.classList.add("is-anim");
      }
      wrap.setAttribute("data-metric", k);
      wrap.style.setProperty("--lb-hv", H[k] != null ? H[k] : -1000);
      humanVal.textContent = asReported(H[k]);
      rows.forEach(function (r) {
        r.el.style.setProperty("--v", num(r.d[k]) > 0 ? r.d[k] : 0);
        r.valEl.textContent = score(r.d[k]);
        r.rankEl.textContent = String(r.rank[k]);
        r.el.setAttribute("aria-label", rowLabel(r));
      });
      reorder(ORDER[k]);
      list.setAttribute("aria-label", "Agents ranked by " + MET[k].name + " pass rate");
      legSw.setAttribute("data-cat", k === "overall" ? "overall" : k);
      legBarText.textContent = MET[k].name + " pass rate (%)";
      var n = humanCount(k);
      legNote.textContent = n == null ? "" : n === 0 ? "No agent reaches the human reference" :
        n + " of " + N + " agents " + (n === 1 ? "reaches" : "reach") + " the human reference";
      desc.textContent = describe();
      layoutScale();
      if (animate) flip(first);
    }

    /* move only the nodes that are out of place; keep keyboard focus if a focused row moves */
    function reorder(order) {
      var focused = document.activeElement;
      var cur = list.firstElementChild;
      order.forEach(function (r) {
        if (r.el === cur) cur = cur.nextElementSibling;
        else list.insertBefore(r.el, cur);
      });
      if (focused && list.contains(focused) && document.activeElement !== focused) focused.focus({ preventScroll: true });
    }

    function flip(first) {
      var moved = [];
      rows.forEach(function (r, i) {
        var dy = first[i] - r.el.getBoundingClientRect().top;
        if (Math.abs(dy) > 0.5) moved.push([r, dy]);
      });
      moved.forEach(function (p) { p[0].el.style.transform = "translateY(" + p[1].toFixed(1) + "px)"; });
      void list.offsetWidth; /* commit the inverted positions before playing */
      moved.forEach(function (p) {
        p[0].el.style.transition = "transform " + FLIP_MS + "ms var(--ease)";
        p[0].el.style.transform = "";
      });
      clearTimeout(animTimer);
      animTimer = setTimeout(function () {
        wrap.classList.remove("is-anim");
        rows.forEach(function (r) { r.el.style.transition = ""; });
      }, FLIP_MS + 80);
    }

    function layoutScale() {
      if (!geom.plotW) return;
      var hv = H[state.metric], has = hv != null;
      humanLabel.hidden = !has;
      humanLine.hidden = !has;
      var hw = has ? humanLabel.offsetWidth : 0;
      var left = 0;
      if (has) {
        var hx = (hv / 100) * geom.plotW;
        left = Math.round(Math.max(-2, Math.min(geom.trackW - hw, hx - hw / 2)));
        humanLabel.style.transform = "translateX(" + left + "px)";
      }
      /* one-tier head: hide ticks under the human label; two-tier head: hide ticks the line runs through */
      var sparse = geom.plotW < 170, hxLine = has ? (hv / 100) * geom.plotW : -1e3;
      ticks.forEach(function (t) {
        var tx = (t.v / 100) * geom.plotW;
        var hit = !has ? false : geom.twoTier ? Math.abs(tx - hxLine) < t.w / 2 + 3
          : tx + t.w / 2 + 8 > left && tx - t.w / 2 - 8 < left + hw;
        t.el.classList.toggle("is-hidden", (sparse && (t.v === 25 || t.v === 75)) || hit);
      });
    }

    /* ---------- tooltip + same-model highlight ---------- */
    var active = null;
    function setActive(r) {
      if (active === r) return;
      if (active) {
        active.el.classList.remove("is-active");
        active.sibs.forEach(function (s) { s.el.classList.remove("is-sib"); });
      }
      active = r || null;
      if (active) {
        active.el.classList.add("is-active");
        active.sibs.forEach(function (s) { s.el.classList.add("is-sib"); });
      }
    }
    function showTip(r, at) {
      setActive(r);
      api.tip.show(at, tipNode(r), r.el);
    }
    function hideTip(r) {
      api.tip.hide(r.el);
      if (active === r) setActive(null);
    }
    function tipNode(r) {
      var d = r.d, k = state.metric;
      var box = el("div", { class: "lb-tip" },
        el("div", { class: "tip-title", text: d.model }),
        el("div", { class: "tip-sub", text: d.harness }),
        el("div", { class: "lb-tip-rank" },
          el("span", { class: "lb-tip-rank-n", text: "Rank #" + r.rank[k] }),
          el("span", { class: "lb-tip-rank-l", text: (r.tied[k] ? " (tied)" : "") + " of " + N + " · " + MET[k].name })));
      var tr = el("div", { class: "tip-rows" });
      METRICS.forEach(function (m) {
        var key = el("span", { class: "k" });
        key.style.setProperty("--c", "var(" + COLOR_VAR[m.key] + ")");
        tr.appendChild(el("div", { class: "tip-row" + (m.key === k ? " lb-tip-sel" : "") },
          key, el("span", { class: "l", text: m.name }), el("span", { class: "v", text: score(d[m.key]) })));
      });
      box.appendChild(tr);
      if (r.sibs.length) {
        box.appendChild(el("div", { class: "lb-tip-sib" },
          el("span", { class: "lb-tip-sib-k", text: "Same model, other harness" + (r.sibs.length > 1 ? "es" : "") +
            " · " + MET[k].short }),
          r.sibs.map(function (s) {
            return el("span", { class: "lb-tip-sib-r" },
              el("span", { text: s.d.harness }), el("b", { text: score(s.d[k]) }));
          })));
      }
      var parts = [];
      if (d.cost != null) parts.push("Full-run cost " + fmt.usd(d.cost));
      if (d.steps != null) parts.push("Avg steps " + fmt.steps(d.steps));
      box.appendChild(el("div", { class: "tip-note", text: parts.length ? parts.join(" · ") : "Cost and steps not reported" }));
      return box;
    }
    document.addEventListener("pointerdown", function (e) {
      if (active && !active.el.contains(e.target)) setActive(null);
    }, true);
    window.addEventListener("scroll", function () {
      if (!active) return;
      if (document.activeElement === active.el) api.tip.move(active.valEl);
      else hideTip(active);
    }, { passive: true });

    /* ---------- keyboard: one tab stop for the list, arrows move between rows ---------- */
    function keyboardFocus(node) {
      try { return node.matches(":focus-visible"); } catch (err) { return true; }
    }
    var roving = null;
    function setRoving(r) {
      if (roving === r) return;
      if (roving) roving.el.tabIndex = -1;
      roving = r;
      r.el.tabIndex = 0;
    }
    setRoving(rows[0]);
    function onRowKey(e) {
      var cur = e.currentTarget, next = null, i;
      switch (e.key) {
        case "ArrowDown": next = cur.nextElementSibling; break;
        case "ArrowUp": next = cur.previousElementSibling; break;
        case "Home": next = list.firstElementChild; break;
        case "End": next = list.lastElementChild; break;
        case "PageDown": next = cur; for (i = 0; i < 10 && next.nextElementSibling; i++) next = next.nextElementSibling; break;
        case "PageUp": next = cur; for (i = 0; i < 10 && next.previousElementSibling; i++) next = next.previousElementSibling; break;
        case "Escape":
          if (active) { hideTip(active); e.preventDefault(); }
          return;
        default: return;
      }
      e.preventDefault();
      if (next && next !== cur) next.focus();
    }

    /* ---------- table ---------- */
    function sortTable(key) {
      if (tState.key === key) tState.dir = tState.dir === "asc" ? "desc" : "asc";
      else { tState.key = key; tState.dir = COLK[key].dir; }
      renderTableBody();
    }
    function cellText(c, d) {
      var v = d[c.key];
      if (c.key === "cost") return fmt.usd(v);
      if (c.key === "steps") return fmt.steps(v);
      if (c.score) return score(v);
      return v == null ? "–" : String(v);
    }
    function renderTableBody() {
      var c = COLK[tState.key], sign = tState.dir === "asc" ? 1 : -1;
      COLS.forEach(function (col) {
        if (col.key === c.key) thEls[col.key].setAttribute("aria-sort", tState.dir === "asc" ? "ascending" : "descending");
        else thEls[col.key].removeAttribute("aria-sort");
      });
      var sorted = rows.slice().sort(function (a, b) {
        var va = a.d[c.key], vb = b.d[c.key];
        var na = va == null, nb = vb == null;
        if (na || nb) return na && nb ? a.base - b.base : na ? 1 : -1; /* missing values always last */
        var res = c.text ? String(va).localeCompare(String(vb)) : va - vb;
        return sign * res || a.base - b.base;
      });
      api.clear(tbody);
      /* pinned human reference row */
      /* two cells (not a colspan) so the sticky Model column never covers this row's values */
      var ref = el("tr", { class: "is-ref" },
        el("td", { class: "n lb-td-rank", text: "–" }),
        el("th", { scope: "row", text: "Human researchers" }),
        el("td", { text: "with AI tools" }));
      COLS.slice(3).forEach(function (col) {
        ref.appendChild(el("td", { class: "n", text: col.score ? asReported(H[col.key]) : "–" }));
      });
      tbody.appendChild(ref);
      sorted.forEach(function (r) {
        var d = r.d;
        var tr = el("tr", { class: state.harness && d.harness === state.harness ? "is-em" : null });
        COLS.forEach(function (col) {
          var isBest = col.score && num(d[col.key]) === best[col.key];
          var cls = [col.num ? "n" : "", isBest ? "best" : "", col.key === "rank" ? "lb-td-rank" : ""].join(" ").trim();
          tr.appendChild(el(col.key === "model" ? "th" : "td", {
            scope: col.key === "model" ? "row" : null, class: cls || null, text: cellText(col, d)
          }));
        });
        tbody.appendChild(tr);
      });
    }
    renderTableBody();

    /* ---------- render: geometry for the current width (idempotent) ---------- */
    function render() {
      var W = chart.clientWidth;
      if (!W) return;
      var sans = api.css("--font-sans") || "sans-serif";
      var size = W < 400 ? "xs" : W < 600 ? "sm" : "lg";
      state.size = size;
      wrap.setAttribute("data-size", size);

      /* segmented control: full category names only where they fit on one line */
      wrap.setAttribute("data-seg", "full");
      var short = seg.offsetWidth > W;
      wrap.setAttribute("data-seg", short ? "short" : "full");
      segBtns.forEach(function (b, i) {
        var m = METRICS[i];
        if (m.key !== "overall") { if (short) b.title = m.name; else b.removeAttribute("title"); }
      });

      var stacked = size !== "lg";
      var fModel = (size === "xs" ? "500 12.5px " : size === "sm" ? "500 13px " : "500 14px ") + sans;
      var fHarn = (stacked ? "400 11.5px " : "400 13px ") + sans;
      var fVal = (size === "xs" ? "500 12px " : "500 12.5px ") + sans;
      var maxModel = 0, maxHarn = 0;
      rows.forEach(function (r) {
        maxModel = Math.max(maxModel, api.measureText(r.d.model, fModel));
        maxHarn = Math.max(maxHarn, api.measureText(r.d.harness, fHarn));
      });
      var padX = size === "lg" ? 10 : size === "sm" ? 8 : 4;
      var rankW = size === "lg" ? 28 : size === "sm" ? 22 : 18;
      var gap = size === "lg" ? 16 : size === "sm" ? 12 : 8;
      var cols, nameW;
      if (!stacked) {
        var mW = Math.ceil(Math.min(maxModel + 2, W * 0.27));
        var hW = Math.ceil(Math.min(maxHarn + 2, W * 0.15));
        cols = rankW + "px " + mW + "px " + hW + "px minmax(0, 1fr)";
        nameW = mW + gap + hW;
      } else {
        nameW = Math.ceil(Math.min(Math.max(maxModel, maxHarn) + 2, W * (size === "xs" ? 0.4 : 0.34)));
        cols = rankW + "px " + nameW + "px minmax(0, 1fr)";
      }
      var trackX = padX + rankW + gap + nameW + gap;
      var trackW = W - padX - trackX;
      /* the widest value label must fit past the longest bar; the "100" tick must fit too */
      var valW = api.measureText("00.00", fVal) + 8;
      var plotW = Math.floor(Math.min(trackW - 14, ((trackW - 4 - valW) * 100) / MAXV));
      plotW = Math.max(40, plotW);
      /* narrow plots put the human label on its own line above the ticks */
      var twoTier = plotW < 320;
      geom = { plotW: plotW, trackW: trackW, twoTier: twoTier };
      wrap.setAttribute("data-head", twoTier ? "two" : "one");

      /* control labels sit beside the controls when every control fits on one line, above them otherwise */
      var chipsW = (chipBtns.length - 1) * 6;
      chipBtns.forEach(function (b) { chipsW += b.offsetWidth; });
      wrap.setAttribute("data-ctl", 54 + 12 + Math.max(seg.offsetWidth, chipsW) <= W ? "inline" : "stacked");

      var tickFont = "400 12px " + sans;
      ticks.forEach(function (t) { t.w = api.measureText(String(t.v), tickFont); });

      wrap.style.setProperty("--lb-cols", cols);
      wrap.style.setProperty("--lb-gap", gap + "px");
      wrap.style.setProperty("--lb-pad-x", padX + "px");
      wrap.style.setProperty("--lb-track-x", trackX + "px");
      wrap.style.setProperty("--lb-plot-w", plotW + "px");
      hModel.textContent = stacked ? "Model / harness" : "Model";

      apply(false);
    }
    return render;
  });
})();
