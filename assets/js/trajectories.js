/* ==========================================================================
   trajectories.js — Failure trajectory explorer (mount: #traj-root)

   Five annotated failed runs from the paper's appendix. A WAI-ARIA tablist
   picks the run; each panel pairs a "case file" (query, the agent's answer
   and verdict, the reference answer, the failure analysis) with a step
   timeline that opens on the key steps (plus one step of context and the
   first three steps) and expands gap by gap, or all at once.

   Copy comes verbatim from window.SLACKBENCH.trajectories (generated from
   the paper's LaTeX). Text is inserted with textContent only: `code` and
   *emphasis* spans are tokenized into <code>/<em> nodes, and "Step 20"
   references in the analysis become buttons that open that step.
   Styles: assets/css/trajectories.css (prefix "tr-").
   ========================================================================== */
(function () {
  "use strict";
  if (!window.SBViz) return;

  var LEAD = 3;            // rows always shown at the top of a collapsed timeline
  var CONTEXT = 1;         // rows of context kept around each key step
  var CLAMP_CHARS = 560;   // answers longer than this start clamped, with a toggle
  var RANGE_RE = /^\s*(\d+)\s*(?:[–—-]\s*(\d+))?\s*$/;
  var REF_SRC = "\\b(Steps?)(\\s+)(\\d+(?:\\s*,\\s*(?:and\\s+)?\\d+|\\s+and\\s+\\d+)*)";

  /** "5–9" -> {a: 5, b: 9}; "20" -> {a: 20, b: 20}; anything else -> null */
  function parseRange(n) {
    var m = RANGE_RE.exec(String(n));
    if (!m) return null;
    var a = +m[1], b = m[2] ? +m[2] : a;
    return { a: a, b: Math.max(a, b) };
  }

  /** Split a string into plain text, `code`, and *emphasis* tokens (no HTML is ever parsed). */
  function tokenize(str) {
    var out = [], buf = "", i = 0, s = String(str == null ? "" : str);
    function flush() { if (buf) { out.push({ t: "text", v: buf }); buf = ""; } }
    while (i < s.length) {
      var c = s.charAt(i);
      if (c === "`") {
        var j = s.indexOf("`", i + 1);
        if (j > i + 1) { flush(); out.push({ t: "code", v: s.slice(i + 1, j) }); i = j + 1; continue; }
      } else if (c === "*") {
        var k = s.indexOf("*", i + 1);
        var inner = k > i + 1 ? s.slice(i + 1, k) : "";
        if (inner && inner.charAt(0) !== " " && inner.indexOf("`") < 0) {
          flush(); out.push({ t: "em", v: inner }); i = k + 1; continue;
        }
      }
      buf += c;
      i += 1;
    }
    flush();
    return out;
  }

  function stepsLabel(n) { return n + (n === 1 ? " step" : " steps"); }

  SBViz.register("traj-root", function setup(host, api) {
    var el = api.el, s = api.s;
    var items = (api.data && api.data.trajectories) || [];

    api.clear(host);
    host.classList.add("tr");
    if (!items.length) {
      host.appendChild(el("p", { class: "viz-error", text: "The trajectory examples could not be loaded." }));
      return function () {};
    }

    var CAT = {};
    api.CATS.forEach(function (c) { CAT[c.key] = c; });
    var ids = api.uid("tr");
    var sel = 0;
    var smooth = function () { return api.reduceMotion ? "auto" : "smooth"; };

    /* ---------- small builders ---------- */
    var ICON = {
      cross: "M4.75 4.75l6.5 6.5M11.25 4.75l-6.5 6.5",
      check: "M3.6 8.5l2.8 2.8 6-6.4",
      unfold: "M2.75 8h10.5M5.5 4.75L8 2.25l2.5 2.5M5.5 11.25L8 13.75l2.5-2.5",
      fold: "M2.75 8h10.5M5.5 2.25L8 4.75l2.5-2.5M5.5 13.75L8 11.25l2.5 2.5",
      down: "M4.5 6.25L8 9.75l3.5-3.5",
      up: "M4.5 9.75L8 6.25l3.5 3.5"
    };
    function icon(name, cls) {
      return s("svg", {
        viewBox: "0 0 16 16", width: 16, height: 16, fill: "none", stroke: "currentColor",
        "stroke-width": 1.8, "stroke-linecap": "round", "stroke-linejoin": "round",
        "aria-hidden": "true", focusable: "false", class: cls || null
      }, s("path", { d: ICON[name] }));
    }
    /** Replace a button's icon + label in place (keeps the node, so focus stays put). */
    function setButton(btn, iconName, label) {
      api.clear(btn);
      btn.appendChild(icon(iconName));
      btn.appendChild(el("span", { text: label }));
    }

    /** Append tokenized text to node; with refFor, "Step 20"-style references become buttons. */
    function rich(node, str, refFor) {
      tokenize(str).forEach(function (tk) {
        if (tk.t === "code") node.appendChild(el("code", { text: tk.v }));
        else if (tk.t === "em") node.appendChild(el("em", { text: tk.v }));
        else if (refFor) withRefs(node, tk.v, refFor);
        else node.appendChild(document.createTextNode(tk.v));
      });
      return node;
    }
    function withRefs(node, text, refFor) {
      var re = new RegExp(REF_SRC, "g"), last = 0, m;
      while ((m = re.exec(text))) {
        node.appendChild(document.createTextNode(text.slice(last, m.index) + m[1] + m[2]));
        var list = m[3], num = /\d+/g, k = 0, mm;
        while ((mm = num.exec(list))) {
          if (mm.index > k) node.appendChild(document.createTextNode(list.slice(k, mm.index)));
          node.appendChild(refFor(+mm[0], mm[0]));
          k = mm.index + mm[0].length;
        }
        if (k < list.length) node.appendChild(document.createTextNode(list.slice(k)));
        last = m.index + m[0].length;
      }
      if (last < text.length) node.appendChild(document.createTextNode(text.slice(last)));
    }

    function verdict(judge) {
      var j = String(judge || "");
      if (/below full credit/i.test(j) && !/\bFAIL\b/.test(j)) return "Below full credit";
      return "Judged incorrect";
    }

    /* ---------- per-example model ---------- */
    var models = items.map(function (t, k) {
      var rows = (t.steps || []).map(function (st, i) {
        var r = parseRange(st.n);
        return {
          i: i, n: String(st.n), text: String(st.text || ""), key: !!st.key,
          a: r ? r.a : NaN, b: r ? r.b : NaN, size: r ? r.b - r.a + 1 : 1
        };
      });
      var base = rows.map(function (r, i) { return i < LEAD; });
      rows.forEach(function (r, i) {
        if (!r.key) return;
        for (var j = Math.max(0, i - CONTEXT); j <= Math.min(rows.length - 1, i + CONTEXT); j++) base[j] = true;
      });
      var sum = rows.reduce(function (acc, r) { return acc + r.size; }, 0);
      var m = {
        t: t, k: k, rows: rows, base: base, total: t.stepCount || sum,
        hasRanges: rows.some(function (r) { return r.size > 1; }),
        all: false, shown: {}, built: false, expanded: false, clamps: [],
        tabId: ids + "-tab-" + k, panelId: ids + "-panel-" + k, listId: ids + "-list-" + k
      };
      m.baseAll = visibleRows(m).every(Boolean);
      return m;
    });

    /** Which rows are on screen: base set + revealed rows; a lone hidden row is shown (a gap row would be as tall). */
    function visibleRows(m) {
      var n = m.rows.length;
      var vis = m.rows.map(function (r, i) { return m.all || m.base[i] || !!m.shown[i]; });
      for (var i = 0; i < n; i++) {
        if (!vis[i] && (i === 0 || vis[i - 1]) && (i === n - 1 || vis[i + 1])) vis[i] = true;
      }
      return vis;
    }
    function rowFor(m, num) {
      for (var i = 0; i < m.rows.length; i++) if (num >= m.rows[i].a && num <= m.rows[i].b) return m.rows[i];
      return null;
    }
    function rowId(m, i) { return m.listId + "-" + i; }

    /* ---------- tabs ---------- */
    var tablist = el("div", { class: "tr-tabs", role: "tablist", "aria-label": "Annotated failure trajectories" });
    var panels = el("div", { class: "tr-panels" });
    models.forEach(function (m) {
      var t = m.t, cat = CAT[t.category] || { name: t.category };
      m.tab = el("button", {
        type: "button", role: "tab", id: m.tabId, class: "tr-tab",
        "aria-selected": "false", "aria-controls": m.panelId, tabindex: "-1",
        onclick: function () { select(m.k, false); }
      },
        el("span", { class: "tag tr-tab-cat", "data-cat": t.category },
          el("span", { class: "swatch", "aria-hidden": "true" }),
          el("span", { class: "tr-cat-full", text: cat.name }),
          /* key (AS/HA/SU/CI) replaces the name where five tab cards are too narrow for it */
          el("span", { class: "tr-cat-short", "aria-hidden": "true", text: t.category })),
        el("span", { class: "sr-only", text: ": " }),
        el("span", { class: "tr-tab-title", text: t.failureType }),
        el("span", { class: "sr-only", text: ". " }),
        el("span", { class: "tr-tab-meta" },
          t.title,
          el("span", { class: "tr-tab-dot", "aria-hidden": "true", text: "·" }),
          el("span", { class: "sr-only", text: ", " }),
          stepsLabel(m.total))
      );
      tablist.appendChild(m.tab);
      m.panel = el("div", { role: "tabpanel", id: m.panelId, class: "tr-panel", "aria-labelledby": m.tabId, hidden: true });
      panels.appendChild(m.panel);
    });
    tablist.addEventListener("keydown", function (e) {
      var n = models.length, cur = sel, next = null;
      for (var i = 0; i < n; i++) if (models[i].tab === document.activeElement) cur = i;
      if (e.key === "ArrowRight") next = (cur + 1) % n;
      else if (e.key === "ArrowLeft") next = (cur - 1 + n) % n;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = n - 1;
      if (next === null) return;
      e.preventDefault();
      select(next, true);
    });
    host.appendChild(tablist);
    host.appendChild(panels);

    /** Scroll the tab strip (narrow layouts) so tab k is fully visible. */
    function revealTab(k, instant) {
      var strip = tablist;
      if (strip.scrollWidth <= strip.clientWidth + 1) return;
      var cs = getComputedStyle(strip);
      var padL = parseFloat(cs.paddingLeft) || 0, padR = parseFloat(cs.paddingRight) || 0;
      var sr = strip.getBoundingClientRect(), tr = models[k].tab.getBoundingClientRect();
      if (tr.left >= sr.left + padL - 1 && tr.right <= sr.right - padR + 1) return;
      strip.scrollTo({ left: Math.max(0, strip.scrollLeft + (tr.left - sr.left) - padL), behavior: instant ? "auto" : smooth() });
    }

    function select(k, focus) {
      sel = k;
      models.forEach(function (m) {
        var on = m.k === k;
        m.tab.setAttribute("aria-selected", on ? "true" : "false");
        m.tab.tabIndex = on ? 0 : -1;
        m.panel.hidden = !on;
      });
      var m = models[k];
      if (!m.built) buildPanel(m);
      if (focus) m.tab.focus({ preventScroll: true });
      api.tip.hide();
      revealTab(k, false);
      setRailWidth(m);
      layoutPass();
    }

    /* ---------- panel: case file + timeline ---------- */
    function buildPanel(m) {
      var t = m.t;
      m.clamps = [];
      m.refDesc = ids + "-refdesc-" + m.k;

      m.caseInner = el("div", { class: "tr-case-inner" },
        el("section", { class: "tr-block" },
          el("h4", { class: "tr-label", text: "Query" }),
          el("blockquote", { class: "tr-query" }, rich(el("p"), t.query))),
        answerBox(m, true),
        answerBox(m, false),
        el("section", { class: "tr-block tr-why" },
          el("h4", { class: "tr-label", text: "Why it failed" }),
          rich(el("p", { class: "tr-analysis" }), t.analysis, function (num, txt) { return stepRef(m, num, txt); }),
          el("span", { id: m.refDesc, class: "sr-only", text: "Shows this step in the trajectory." }))
      );

      m.count = el("p", { class: "tr-tl-sub", "aria-live": "polite" });
      m.toggle = el("button", {
        type: "button", class: "tr-toggle", "aria-controls": m.listId,
        onclick: function () { toggleAll(m, false); }
      });
      m.head = el("div", { class: "tr-tl-head" },
        el("div", { class: "tr-tl-titles" },
          el("h4", { class: "tr-tl-title", text: "Trajectory" }),
          m.count),
        m.toggle);
      m.list = el("ol", { class: "tr-steps", id: m.listId, "aria-label": "Steps in the agent’s run" });
      m.footBtn = el("button", {
        type: "button", class: "tr-toggle", "aria-controls": m.listId,
        onclick: function () { toggleAll(m, true); }
      });
      setButton(m.footBtn, "fold", "Show key steps");
      m.foot = el("div", { class: "tr-tl-foot", hidden: true }, m.footBtn);
      m.tl = el("div", { class: "tr-tl" },
        m.head,
        m.hasRanges ? el("p", { class: "tr-tl-note", text: "Consecutive steps are grouped into ranges, as in the paper." }) : null,
        m.list,
        m.foot);

      m.grid = el("div", { class: "tr-grid" }, el("div", { class: "tr-case" }, m.caseInner), m.tl);
      api.clear(m.panel).appendChild(m.grid);
      m.built = true;
      renderList(m);
    }

    function answerBox(m, agent) {
      var t = m.t, text = String((agent ? t.finalAnswer : t.referenceAnswer) || "");
      var textId = ids + (agent ? "-ans-" : "-ref-") + m.k;
      var box = el("section", { class: "tr-ans " + (agent ? "is-agent" : "is-ref") },
        el("div", { class: "tr-ans-head" },
          el("span", { class: "tr-icon " + (agent ? "tr-icon--bad" : "tr-icon--good") }, icon(agent ? "cross" : "check")),
          el("h4", { class: "tr-label", text: agent ? "Agent’s final answer" : "Reference answer" }),
          agent ? el("span", { class: "tr-verdict", text: verdict(t.judge) }) : null),
        rich(el("p", { class: "tr-ans-text", id: textId }), text));

      if (text.length > CLAMP_CHARS) {
        var c = { text: box.querySelector(".tr-ans-text"), open: false, label: agent ? "Show full answer" : "Show full reference" };
        c.text.classList.add("tr-clamp");
        c.btn = el("button", {
          type: "button", class: "tr-more", "aria-expanded": "false", "aria-controls": textId,
          onclick: function () {
            c.open = !c.open;
            c.text.classList.toggle("tr-clamp", !c.open);
            c.btn.setAttribute("aria-expanded", c.open ? "true" : "false");
            setButton(c.btn, c.open ? "up" : "down", c.open ? "Show less" : c.label);
            layoutPass();
          }
        });
        setButton(c.btn, "down", c.label);
        box.appendChild(c.btn);
        m.clamps.push(c);
      }

      if (agent && t.judge) {
        var only = /^\s*`([^`]+)`\.?\s*$/.exec(t.judge);
        var judge = el("p", { class: "tr-judge" + (only ? " is-code" : "") },
          el("span", { class: "tr-judge-k", text: "Judge result" }), " ");
        if (only) judge.appendChild(el("code", { text: only[1] }));
        else rich(judge, t.judge);
        box.appendChild(judge);
      }
      return box;
    }

    function stepRef(m, num, txt) {
      var row = rowFor(m, num);
      if (!row) return document.createTextNode(txt);
      var follow = null;
      var b = el("button", {
        type: "button", class: "tr-ref", text: txt, "aria-describedby": m.refDesc,
        onclick: function () { api.tip.hide(); reveal(m, row.i); }
      });
      api.bindTip(b, function () {
        return el("div", { class: "tr-tip" },
          el("div", { class: "tip-title", text: (row.size > 1 ? "Steps " : "Step ") + row.n }),
          row.key ? el("div", { class: "tip-sub", text: "Key step" }) : null,
          rich(el("p", { class: "tr-tip-text" }), row.text),
          el("div", { class: "tip-note", text: "Click to show it in the trajectory" }));
      }, {
        /* keyboard focus may scroll the page after the tip is placed: keep it anchored while focused */
        onEnter: function (e) {
          if (!e || e.type !== "focus" || follow) return;
          var frame = 0;
          follow = function () {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(function () { if (document.activeElement === b) api.tip.move(b); });
          };
          follow();
          window.addEventListener("scroll", follow, { passive: true });
        },
        onLeave: function () {
          if (follow) { window.removeEventListener("scroll", follow); follow = null; }
        }
      });
      return b;
    }

    /* ---------- timeline rows ---------- */
    function stepRow(m, r) {
      return el("li", { class: "tr-step" + (r.key ? " is-key" : ""), id: rowId(m, r.i), tabindex: "-1" },
        el("div", { class: "tr-rail" },
          el("span", { class: "tr-badge" },
            el("span", { class: "sr-only", text: r.size > 1 ? "Steps " : "Step " }), r.n)),
        el("div", { class: "tr-body" },
          r.key ? el("span", { class: "tr-keytag", text: "Key step" }) : null,
          rich(el("p", { class: "tr-text" }), r.text)));
    }

    function gapRow(m, i0, i1) {
      var first = m.rows[i0], last = m.rows[i1], count = 0;
      for (var i = i0; i <= i1; i++) count += m.rows[i].size;
      var range = isNaN(first.a) || isNaN(last.b) ? first.n + "–" + last.n
        : first.a === last.b ? String(first.a) : first.a + "–" + last.b;
      var btn = el("button", {
        type: "button", class: "tr-gapbtn", "aria-controls": m.listId,
        "aria-label": "Show " + stepsLabel(count) + " (" + (count > 1 ? "steps " : "step ") + range + ")",
        onclick: function () { openGap(m, i0, i1); }
      },
        el("span", { class: "tr-gap-dots", "aria-hidden": "true", text: "···" }),
        el("span", { class: "tr-gap-count", text: stepsLabel(count) }),
        el("span", { class: "tr-gap-range", "aria-hidden": "true", text: range }),
        icon("down", "tr-gap-ico"));
      return el("li", { class: "tr-gap" },
        el("div", { class: "tr-rail", "aria-hidden": "true" }),
        el("div", { class: "tr-body" }, btn));
    }

    function renderList(m, fresh) {
      var vis = visibleRows(m), rows = m.rows, n = rows.length, shownSteps = 0, i = 0;
      api.clear(m.list);
      while (i < n) {
        if (vis[i]) {
          var li = stepRow(m, rows[i]);
          if (fresh && fresh[i] && !api.reduceMotion) li.classList.add("is-new");
          m.list.appendChild(li);
          shownSteps += rows[i].size;
          i += 1;
        } else {
          var j = i;
          while (j + 1 < n && !vis[j + 1]) j += 1;
          m.list.appendChild(gapRow(m, i, j));
          i = j + 1;
        }
      }
      m.expanded = vis.every(Boolean);
      m.toggle.hidden = m.baseAll;
      setButton(m.toggle, m.expanded ? "fold" : "unfold", m.expanded ? "Show key steps" : "Show all " + stepsLabel(m.total));
      m.count.textContent = m.expanded ? "All " + stepsLabel(m.total)
        : "Showing " + shownSteps + " of " + stepsLabel(m.total);
      m.foot.hidden = !(m.expanded && !m.baseAll && n > 12);
      setRailWidth(m);
    }

    /**
     * Rail column fits the widest step label ("110–112") in the badge's current font and padding
     * (so CSS breakpoints stay in charge), rounded to an even width so the hairline stays crisp.
     */
    function setRailWidth(m) {
      var badge = m.list && m.list.querySelector(".tr-badge");
      if (!badge) return;
      var cs = getComputedStyle(badge);
      var longest = m.rows.reduce(function (acc, r) { return r.n.length > acc.length ? r.n : acc; }, "");
      var chrome = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0) +
        (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.borderRightWidth) || 0);
      var w = Math.ceil(api.measureText(longest, cs.fontWeight + " " + cs.fontSize + " " + cs.fontFamily) + chrome);
      w = Math.max(28, w + (w % 2));
      m.list.style.setProperty("--tr-railw", w + "px");
    }

    /* ---------- interactions ---------- */
    /** Smoothly animate a list's height across a DOM change (skipped under reduced motion). */
    function animateHeight(node, mutate) {
      var h0 = node.isConnected ? node.getBoundingClientRect().height : 0; /* current, even mid-animation */
      if (node._trDone) node._trDone(); /* settle an animation still in flight */
      if (api.reduceMotion || !node.isConnected) { mutate(); return; }
      mutate();
      var h1 = node.getBoundingClientRect().height;
      if (Math.abs(h1 - h0) < 2) return;
      var timer = 0;
      var done = function () {
        clearTimeout(timer);
        node.removeEventListener("transitionend", onEnd);
        node.style.height = ""; node.style.overflow = ""; node.style.transition = "";
        node._trDone = null;
      };
      node._trDone = done;
      var onEnd = function (e) { if (e.target === node) done(); };
      node.style.overflow = "hidden";
      node.style.height = h0 + "px";
      void node.offsetHeight; /* commit the start height */
      node.style.transition = "height 300ms cubic-bezier(0.2, 0.7, 0.2, 1)";
      node.style.height = h1 + "px";
      node.addEventListener("transitionend", onEnd);
      timer = setTimeout(done, 480);
    }

    function openGap(m, i0, i1) {
      var fresh = {};
      for (var i = i0; i <= i1; i++) { m.shown[i] = true; fresh[i] = true; }
      animateHeight(m.list, function () { renderList(m, fresh); });
      var first = document.getElementById(rowId(m, i0));
      if (first) first.focus({ preventScroll: true });
      layoutPass();
    }

    function toggleAll(m, fromFoot) {
      var expand = !m.expanded;
      var mutate = function () { m.all = expand; if (!expand) m.shown = {}; renderList(m); };
      var scrolledPast = m.tl.getBoundingClientRect().top < headerH();
      if (!expand && scrolledPast) {
        /* collapsing from deep inside a long list: jump back to the top of the timeline
           ("instant", because "auto" would inherit the page's CSS smooth scrolling) */
        mutate();
        m.tl.scrollIntoView({ block: "start", behavior: "instant" });
      } else {
        animateHeight(m.list, mutate);
      }
      if (fromFoot) m.toggle.focus({ preventScroll: true }); /* the footer button is gone after collapsing */
      layoutPass();
    }

    function reveal(m, i) {
      if (!visibleRows(m)[i]) {
        var fresh = {};
        fresh[i] = true;
        m.shown[i] = true;
        renderList(m, fresh);
        layoutPass();
      }
      var li = document.getElementById(rowId(m, i));
      if (!li) return;
      li.scrollIntoView({ block: "center", behavior: smooth() });
      li.focus({ preventScroll: true });
      li.classList.remove("is-flash");
      void li.offsetWidth; /* restart the highlight */
      li.classList.add("is-flash");
      clearTimeout(li._trFlash);
      li._trFlash = setTimeout(function () { li.classList.remove("is-flash"); }, 2200);
    }

    /* ---------- layout checks (sticky case file, clamp toggles) ---------- */
    function headerH() { return parseFloat(api.css("--header-h")) || 61; }
    /**
     * Two-column layout: the case file stays in view beside a long timeline. If it fits the
     * viewport it pins below the header; if it is taller, it scrolls through and then pins by
     * its bottom edge (a negative sticky top), so no part of it is ever unreachable.
     */
    function layoutPass() {
      var m = models[sel];
      if (!m || !m.built || !m.panel.isConnected || m.panel.hidden) return;
      m.clamps.forEach(function (c) {
        c.btn.hidden = !c.open && c.text.scrollHeight <= c.text.clientHeight + 2;
      });
      var cols = getComputedStyle(m.grid).gridTemplateColumns.trim().split(/\s+/).length;
      var sticky = cols > 1;
      m.panel.classList.toggle("is-sticky", sticky);
      if (sticky) {
        var gap = 24, h = m.caseInner.getBoundingClientRect().height, top = headerH() + gap;
        if (top + h + gap > window.innerHeight) top = Math.round(window.innerHeight - h - gap);
        m.caseInner.style.top = top + "px";
      } else {
        m.caseInner.style.top = "";
      }
    }
    var raf = 0;
    window.addEventListener("resize", function () {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(layoutPass);
    });

    select(0, false);

    return function render() {
      models.forEach(function (m) { if (m.built) setRailWidth(m); });
      layoutPass();
      revealTab(sel, true);
    };
  });
})();
