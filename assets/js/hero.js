/* ===========================================================================
   hero.js — decorative hero illustration (mount: #hero-art, aria-hidden).

   A teammate asks a question. The agent (the moving dot) answers it by hopping
   across the workspace: it picks the right channel, reads a message that shares
   a commit, follows the commit into the repository, checks the meeting notes,
   and assembles the answer. Channel names come from window.SLACKBENCH.channels.

   Plain DOM + one small SVG overlay, no dependencies. Each hop is a cubic Bézier
   with fixed end tangents (down into the channel, across into the link, down
   into the commit and along its empty branch lane, across into the notes, down
   to the answer), so the trail runs through gaps and padding instead of across
   labels. The loop pauses off-screen and in hidden tabs; under
   prefers-reduced-motion a composed still frame is shown.
   Styles: assets/css/hero.css (ha-*).
   =========================================================================== */
(function () {
  "use strict";

  var host = document.getElementById("hero-art");
  if (!host || host.querySelector(".ha-stage")) return;

  var SVGNS = "http://www.w3.org/2000/svg";
  var D = window.SLACKBENCH || {};

  /* ---------- tiny DOM helpers (text always via text nodes) ---------- */
  function add(node, kids) {
    if (kids == null) return node;
    (Array.isArray(kids) ? kids : [kids]).forEach(function (k) {
      if (k == null || k === false) return;
      node.appendChild(typeof k === "string" ? document.createTextNode(k) : k);
    });
    return node;
  }
  function h(tag, cls, kids) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    return add(n, kids);
  }
  function sv(tag, attrs) {
    var n = document.createElementNS(SVGNS, tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    return n;
  }
  function icon(paths) {
    var s = sv("svg", { viewBox: "0 0 16 16", "class": "ha-ico", "aria-hidden": "true", focusable: "false" });
    paths.forEach(function (d) { s.appendChild(sv("path", { d: d })); });
    return s;
  }
  function sk(width, cls) {
    var n = h("i", "ha-sk" + (cls ? " " + cls : ""));
    n.style.width = width;
    return n;
  }
  function av(initials, cat, cls) {
    var n = h("span", "ha-av" + (cls ? " " + cls : ""), initials || null);
    if (cat) n.setAttribute("data-cat", cat);
    return n;
  }

  var I = {
    check: ["M3.8 8.4l2.7 2.7 5.7-5.9"],
    commit: ["M5.4 8a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0-5.2 0", "M1.6 8h3.8M10.6 8h3.8"],
    doc: ["M4 1.8h5.2l3.3 3.3v9.1H4z", "M9.2 1.8v3.3h3.3", "M6.2 8.6h4.2M6.2 11.2h2.8"],
    file: ["M4 1.8h5.2l3.3 3.3v9.1H4z", "M9.2 1.8v3.3h3.3"],
    branch: ["M5 4.6v6.8", "M11 6.4c0 2.5-2.2 3.1-6 3.9", "M3.6 3.4a1.4 1.4 0 1 0 2.8 0a1.4 1.4 0 1 0-2.8 0",
      "M3.6 12.6a1.4 1.4 0 1 0 2.8 0a1.4 1.4 0 1 0-2.8 0", "M9.6 5a1.4 1.4 0 1 0 2.8 0a1.4 1.4 0 1 0-2.8 0"]
  };

  /* ---------- channel names (the paper's channel table) ---------- */
  var WANT = ["bfcl-thousand-tools", "paper-scraper-project", "research-ideagen", "tool-bench-langvar", "tool-bench-langvar-dev"];
  var have = (D.channels || []).map(function (c) { return c && c.name; }).filter(Boolean);
  var channels = WANT.filter(function (n) { return have.indexOf(n) !== -1; });
  if (channels.length < 4) channels = have.length >= 4 ? have.slice(0, 5) : WANT;
  var target = channels.indexOf("tool-bench-langvar") !== -1 ? "tool-bench-langvar" : channels[3];

  /* ---------- chat ---------- */
  var side = h("div", "ha-side", h("div", "ha-label", "Channels"));
  var chRow = null, chSock = null;
  channels.forEach(function (name) {
    var sock = h("i", "ha-sock");
    var row = h("div", "ha-ch", [h("span", "ha-hash", "#"), h("span", "ha-ch-name", name), sock]);
    if (name === target) { chRow = row; chSock = sock; }
    side.appendChild(row);
  });
  add(side, [
    h("div", "ha-label ha-label--dm", "Direct messages"),
    h("div", "ha-dm", [av("", null, "ha-av--dot"), sk("54%")]),
    h("div", "ha-dm", [av("", "CI", "ha-av--dot"), sk("42%")])
  ]);

  function message(initials, cat, isAgent, lines, extra, cls) {
    var body = h("div", "ha-body", h("div", "ha-meta", [
      sk(isAgent ? "34px" : "46px", "ha-sk--name"),
      isAgent ? h("span", "ha-badge", "AI") : null,
      sk("16px", "ha-sk--time")
    ]));
    lines.forEach(function (w) { body.appendChild(sk(w)); });
    add(body, extra);
    return h("div", "ha-msg" + (cls ? " " + cls : ""), [av(initials, cat), body]);
  }
  var chipPin = h("i", "ha-pin");
  var commitChip = h("span", "ha-link ha-link--commit", [chipPin, icon(I.commit), h("span", "ha-mono", "a3f9e1c")]);
  var msg1 = message("MR", "HA", false, ["84%"], h("span", "ha-link", [icon(I.doc), h("span", null, "Meeting notes")]));
  var msg2 = message("SK", "SU", false, ["90%", "58%"], null, "ha-msg--extra");
  var msg3 = message("LT", "CI", true, ["70%"], commitChip);
  var chat = h("div", "ha-panel ha-chat", [
    side,
    h("div", "ha-main", [
      h("div", "ha-main-h", [
        h("span", "ha-hash", "#"), h("span", "ha-main-name", target),
        h("span", "ha-members", [av("", "HA", "ha-av--xs"), av("", "SU", "ha-av--xs"), av("", "CI", "ha-av--xs")])
      ]),
      msg1, msg2, msg3
    ])
  ]);

  /* ---------- repository: newest first; the branch head is the commit shared in chat ---------- */
  var HASHES = ["a3f9e1c", "e40b9d7", "7b2d0e4"];
  var ROW = 22, X0 = 7, X1 = 19, GH = ROW * HASHES.length;
  function cy(i) { return ROW * i + ROW / 2; }
  var graph = sv("svg", { "class": "ha-graph", width: 26, height: GH, viewBox: "0 0 26 " + GH, "aria-hidden": "true", focusable: "false" });
  graph.appendChild(sv("path", { "class": "ha-g-main", d: "M" + X0 + "," + cy(1) + "V" + (GH + 5) }));
  graph.appendChild(sv("path", {
    "class": "ha-g-feat",
    d: "M" + X1 + "," + cy(0) + "C" + X1 + "," + (cy(0) + 12) + " " + X0 + "," + (cy(1) - 12) + " " + X0 + "," + cy(1)
  }));
  var gdots = [[X1, 0, "feat"], [X0, 1, "main"], [X0, 2, "main"]].map(function (g) {
    return graph.appendChild(sv("circle", { "class": "ha-g-dot ha-g-dot--" + g[2], cx: g[0], cy: cy(g[1]), r: 4 }));
  });
  var commitDot = gdots[0];
  var commitRows = HASHES.map(function (hash, i) {
    return h("div", "ha-commit", [h("span", "ha-mono ha-hashid", hash), sk(["64%", "48%", "56%"][i])]);
  });
  var foot = h("div", "ha-foot", [
    icon(I.file), h("span", "ha-mono", "TODO.md"),
    h("span", "ha-foot-branch", [icon(I.branch), h("span", "ha-mono", "main")])
  ]);
  var repo = h("div", "ha-panel ha-repo", [h("div", "ha-log", [graph].concat(commitRows)), foot]);

  /* ---------- meeting notes: open action items are the "remaining TODOs" ---------- */
  function task(box, width, cat, checked, pin) {
    return h("div", "ha-task" + (checked ? " is-checked" : ""), [pin, box, sk(width), av("", cat, "ha-av--dot")]);
  }
  var taskPin = h("i", "ha-pin");
  var task2 = task(h("i", "ha-box"), "56%", "HA");
  var task3 = task(h("i", "ha-box"), "48%", "SU", false, taskPin);
  var doc = h("div", "ha-panel ha-doc", [
    h("div", "ha-ph", [icon(I.doc), h("span", "ha-ph-title", "Meeting notes")]),
    h("div", "ha-page", [
      sk("58%", "ha-sk--title"),
      /* CSS shows as many lines as the layout has room for */
      h("div", "ha-para", ["94%", "80%", "88%", "52%", "92%", "84%", "90%", "76%", "40%", "86%", "92%", "70%", "88%", "48%"]
        .map(function (w) { return sk(w); })),
      h("div", "ha-label", "Action items"),
      task(h("i", "ha-box", icon(I.check)), "62%", "CI", true), task2, task3
    ])
  ]);

  /* ---------- question and answer ---------- */
  var qPort = h("i", "ha-port");
  var q = h("div", "ha-chip ha-q", [h("span", "ha-q-mark", "?"), h("span", "ha-txt", "Who owns the remaining TODOs?"), qPort]);
  var aCheck = h("span", "ha-check", icon(I.check));
  var a = h("div", "ha-chip ha-a", [aCheck, h("span", "ha-txt", "Answer"), h("span", "ha-owners", [av("MR", "HA"), av("SK", "SU")])]);

  /* ---------- overlay: trail + landing ripple, and the agent itself ---------- */
  var svg = sv("svg", { "class": "ha-trace", "aria-hidden": "true", focusable: "false" });
  var trailG = sv("g", {});
  var casing = sv("path", { "class": "ha-trail-case" });
  var trail = sv("path", { "class": "ha-trail" });
  var ripple = sv("circle", { "class": "ha-ripple", cx: 0, cy: 0, r: 0 });
  trailG.appendChild(casing); trailG.appendChild(trail);
  svg.appendChild(trailG); svg.appendChild(ripple);
  var agent = h("i", "ha-agent");

  var stage = h("div", "ha-stage", [h("div", "ha-backdrop"), chat, repo, doc, svg, q, a, agent]);
  host.appendChild(stage);
  host.classList.add("ha-on");

  /* waypoints: where the agent lands (sock) and what lights up (els) */
  var steps = [
    { sock: qPort, els: [q] },
    { sock: chSock, els: [chRow] },
    { sock: chipPin, els: [msg3, commitChip] },
    { sock: commitDot, els: [commitRows[0], commitDot, foot] },
    { sock: taskPin, els: [task2, task3] },
    { sock: aCheck, els: [a] }
  ];

  /* ---------- the path ----------
     Each hop is one or more cubic Bézier pieces. A piece leaves its start along "out"
     and arrives along "in"; k1/k2 scale the two handles by the piece's span along
     those directions, so the shapes hold at every width. */
  var DOWN = [0, 1], RIGHT = [1, 0];
  function piece(A, B, out, inn, k1, k2) {
    var dx = B.x - A.x, dy = B.y - A.y;
    var h1 = Math.max(8, k1 * Math.abs(dx * out[0] + dy * out[1]));
    var h2 = Math.max(8, k2 * Math.abs(dx * inn[0] + dy * inn[1]));
    var c1 = { x: A.x + out[0] * h1, y: A.y + out[1] * h1 };
    var c2 = { x: B.x - inn[0] * h2, y: B.y - inn[1] * h2 };
    /* length ≈ mean of chord and control polygon (plenty for pacing) */
    var chord = dist(A, B), poly = dist(A, c1) + dist(c1, c2) + dist(c2, B);
    return { a: A, c1: c1, c2: c2, b: B, len: (chord + poly) / 2 || 1 };
  }
  function dist(p, p2) { var x = p2.x - p.x, y = p2.y - p.y; return Math.sqrt(x * x + y * y); }

  /* ---------- timeline (seconds) ---------- */
  var LEAD = 0.6, DWELL = 0.55, HOLD = 2.4, FADE = 0.6, RIPPLE = 0.7;
  var pts = [], hops = [], tArrive = [], tLeave = [], total = 1;

  function center(el, sr) {
    var r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2 - sr.left, y: r.top + r.height / 2 - sr.top };
  }
  /** Align the drawing (question port over the channel; the notes' open item just below
      the repository; the answer under the notes), then measure the waypoints and build
      the hops. CSS already places everything; this only absorbs font-metric drift. */
  var ORIGIN = { left: 0, top: 0 };
  function measure() {
    var sr = stage.getBoundingClientRect();
    if (sr.width < 1 || sr.height < 1) return false;

    doc.style.top = ""; a.style.top = "";
    var below = repo.getBoundingClientRect().bottom;
    doc.style.top = Math.round(doc.offsetTop + below + 14 - center(taskPin, ORIGIN).y) + "px";
    a.style.top = Math.round(doc.offsetTop + doc.offsetHeight + 14) + "px";
    qPort.style.left = Math.round(center(chSock, q.getBoundingClientRect()).x - 1) + "px"; /* -1: chip border */

    svg.setAttribute("width", sr.width); svg.setAttribute("height", sr.height);
    svg.setAttribute("viewBox", "0 0 " + sr.width + " " + sr.height);
    var P = pts = steps.map(function (s) { return center(s.sock, sr); });
    var lane = { x: P[3].x, y: below - sr.top + 8 }; /* just under the repository, on the branch lane */

    hops = [
      [piece(P[0], P[1], DOWN, DOWN, 0.45, 0.45)],                                   /* question → channel */
      [piece(P[1], P[2], DOWN, RIGHT, 0.9, 0.7)],                                    /* channel → commit link */
      [piece(P[2], P[3], DOWN, DOWN, 0.9, 0.9)],                                     /* link → commit, via the gap */
      [piece(P[3], lane, DOWN, DOWN, 0.4, 0.4), piece(lane, P[4], DOWN, RIGHT, 1, 0.5)], /* down the lane → notes */
      [piece(P[4], P[5], DOWN, DOWN, 0.5, 0.5)]                                      /* notes → answer */
    ];
    tArrive = [0]; tLeave = [];
    var t = LEAD;
    hops.forEach(function (hop, i) {
      hop.len = hop.reduce(function (n, pc) { return n + pc.len; }, 0);
      hop.t0 = t;
      hop.dur = Math.max(0.6, Math.min(1.15, 0.4 + hop.len / 440));
      tLeave.push(t);
      t += hop.dur;
      tArrive.push(t);
      if (i < hops.length - 1) t += DWELL;
    });
    tLeave.push(Infinity);
    total = t + HOLD + FADE;
    return true;
  }

  function r1(n) { return Math.round(n * 10) / 10; }
  function lerp(p, p2, u) { return { x: p.x + (p2.x - p.x) * u, y: p.y + (p2.y - p.y) * u }; }
  function curve(c1, c2, p) {
    return "C" + r1(c1.x) + "," + r1(c1.y) + " " + r1(c2.x) + "," + r1(c2.y) + " " + r1(p.x) + "," + r1(p.y);
  }
  function ease(u) { return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; }

  var lastKey = "";
  /** Draw the frame at time t. still = the composed frame for reduced motion. */
  function draw(t, still) {
    if (!hops.length) return;
    var d = "M" + r1(pts[0].x) + "," + r1(pts[0].y), pos = pts[0];
    outer:
    for (var i = 0; i < hops.length; i++) {
      var hop = hops[i], j;
      if (t >= hop.t0 + hop.dur) {
        for (j = 0; j < hop.length; j++) d += curve(hop[j].c1, hop[j].c2, hop[j].b);
        pos = hop[hop.length - 1].b;
        continue;
      }
      if (t <= hop.t0) break;
      /* walk the pieces to the eased distance; split the current one (de Casteljau) */
      var left = ease((t - hop.t0) / hop.dur) * hop.len;
      for (j = 0; j < hop.length; j++) {
        var pc = hop[j];
        if (left >= pc.len) { d += curve(pc.c1, pc.c2, pc.b); pos = pc.b; left -= pc.len; continue; }
        var u = left / pc.len;
        var p01 = lerp(pc.a, pc.c1, u), p12 = lerp(pc.c1, pc.c2, u), p23 = lerp(pc.c2, pc.b, u);
        var p012 = lerp(p01, p12, u), p123 = lerp(p12, p23, u);
        pos = lerp(p012, p123, u);
        d += curve(p01, p012, pos);
        break outer;
      }
      break;
    }
    trail.setAttribute("d", d);
    casing.setAttribute("d", d);

    var fadeAt = total - FADE;
    var fade = t > fadeAt ? Math.min(1, (t - fadeAt) / FADE) : 0;
    trailG.style.opacity = String(1 - fade);

    var end = tArrive[tArrive.length - 1];
    var op = still ? 0 : t < 0.25 ? t / 0.25 : t > end ? Math.max(0, 1 - (t - end) / 0.35) : 1;
    agent.style.opacity = String(op);
    agent.style.transform = "translate(" + r1(pos.x) + "px," + r1(pos.y) + "px)";

    var rk = -1, rp = 0;
    if (!still) {
      for (var w = 1; w < tArrive.length; w++) {
        var since = t - tArrive[w];
        if (since >= 0 && since < RIPPLE) { rk = w; rp = since / RIPPLE; }
      }
    }
    if (rk > 0) {
      ripple.setAttribute("cx", r1(pts[rk].x)); ripple.setAttribute("cy", r1(pts[rk].y));
      ripple.setAttribute("r", r1(6 + 14 * rp));
      ripple.style.opacity = String(0.6 * (1 - rp));
    } else ripple.style.opacity = "0";

    /* per waypoint: 0 idle · 1 the agent is here · 2 visited */
    var key = "";
    for (var k = 0; k < steps.length; k++) key += fade > 0 || t < tArrive[k] ? "0" : t < tLeave[k] ? "1" : "2";
    if (key !== lastKey) {
      lastKey = key;
      steps.forEach(function (st, n) {
        var c = key.charAt(n);
        st.els.forEach(function (el) {
          el.classList.toggle("is-on", c === "1");
          el.classList.toggle("is-done", c === "2");
        });
      });
    }
  }

  /* ---------- playback ---------- */
  var mq = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  function reduced() { return !!(mq && mq.matches); }
  var running = false, raf = 0, prev = 0, clock = 0, inView = !("IntersectionObserver" in window);
  var userPaused = false; /* WCAG 2.2.2: the visitor can stop the loop (button #hero-motion) */

  function frame(now) {
    if (!running) return;
    var dt = prev ? Math.min(0.1, (now - prev) / 1000) : 0;
    prev = now;
    clock += dt;
    if (clock >= total) { clock %= total; measure(); }
    draw(clock, false);
    raf = requestAnimationFrame(frame);
  }
  function play() {
    if (running || userPaused || reduced() || !inView || document.hidden || !hops.length) return;
    running = true; prev = 0;
    raf = requestAnimationFrame(frame);
  }
  function pause() { running = false; cancelAnimationFrame(raf); }
  function still() { pause(); draw(tArrive[tArrive.length - 1] + 0.6, true); }
  function refresh() {
    if (!measure()) return;
    if (reduced()) still();
    else { draw(clock, false); play(); }
  }

  if (!inView) {
    new IntersectionObserver(function (entries) {
      inView = entries[entries.length - 1].isIntersecting;
      if (inView) play(); else pause();
    }, { threshold: 0.05 }).observe(stage);
  }
  document.addEventListener("visibilitychange", function () { if (document.hidden) pause(); else play(); });
  var motionBtn = document.getElementById("hero-motion");
  function syncMotionBtn() { if (motionBtn) motionBtn.hidden = reduced(); }
  if (motionBtn) {
    syncMotionBtn();
    motionBtn.addEventListener("click", function () {
      userPaused = !userPaused;
      motionBtn.setAttribute("aria-pressed", userPaused ? "true" : "false");
      if (userPaused) pause(); else play();
    });
  }
  if (mq) {
    var onMotion = function () { syncMotionBtn(); if (reduced()) still(); else { clock = 0; draw(0, false); play(); } };
    if (mq.addEventListener) mq.addEventListener("change", onMotion); else if (mq.addListener) mq.addListener(onMotion);
  }
  if (window.ResizeObserver) new ResizeObserver(refresh).observe(stage);
  else window.addEventListener("resize", refresh);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(refresh);
  refresh();
})();
