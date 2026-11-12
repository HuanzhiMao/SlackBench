/* SlackBench — page behaviors: links from config, theme toggle, scroll-spy, header height,
   deep-link settling, figure lightbox (native <dialog>), BibTeX copy. */
(function () {
  "use strict";

  var root = document.documentElement;
  var CFG = window.SLACKBENCH_CONFIG || { links: {} };

  /* ---------- Links from config ---------- */
  function applyLinks() {
    var links = CFG.links || {};
    document.querySelectorAll("[data-link]").forEach(function (a) {
      var key = a.getAttribute("data-link");
      var url = links[key];
      if (url) {
        a.setAttribute("href", url);
        a.removeAttribute("aria-disabled");
        a.querySelectorAll("[data-soon]").forEach(function (s) { s.remove(); });
      } else if (key in links) {
        a.removeAttribute("href");
        a.setAttribute("aria-disabled", "true");
        a.removeAttribute("target");
      }
    });
    /* prose that only makes sense once a link exists */
    document.querySelectorAll("[data-link-text]").forEach(function (el) {
      var url = links[el.getAttribute("data-link-text")];
      if (url) {
        el.textContent = "";
        el.appendChild(document.createTextNode("The code is on "));
        var a = document.createElement("a");
        a.href = url; a.target = "_blank"; a.rel = "noopener"; a.textContent = "GitHub";
        el.appendChild(a);
        el.appendChild(document.createTextNode("."));
      }
    });
    if (CFG.contact) {
      document.querySelectorAll("[data-contact]").forEach(function (a) {
        a.href = "mailto:" + CFG.contact;
        a.textContent = CFG.contact;
      });
    }
    if (CFG.updated) {
      document.querySelectorAll("[data-updated]").forEach(function (t) {
        var d = new Date(CFG.updated + "T12:00:00");
        if (!isNaN(d)) {
          t.setAttribute("datetime", CFG.updated);
          t.textContent = d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
        }
      });
    }
  }

  /* ---------- Theme ---------- */
  var mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  function currentTheme() {
    var t = root.getAttribute("data-theme");
    if (t === "light" || t === "dark") return t;
    return mq && mq.matches ? "dark" : "light";
  }
  function syncThemeColor() {
    /* browser UI tint follows an explicit choice; otherwise the media-specific metas apply */
    if (!root.hasAttribute("data-theme")) return;
    var bg = getComputedStyle(root).getPropertyValue("--bg").trim();
    document.querySelectorAll('meta[name="theme-color"]').forEach(function (m) { m.setAttribute("content", bg); });
  }
  function announceTheme() {
    syncThemeColor();
    document.dispatchEvent(new CustomEvent("sb:themechange", { detail: { theme: currentTheme() } }));
  }
  function initTheme() {
    var btn = document.getElementById("theme-toggle");
    if (!btn) return;
    /* a toggle button keeps a fixed name; aria-pressed carries the state */
    var sync = function () { btn.setAttribute("aria-pressed", currentTheme() === "dark" ? "true" : "false"); };
    sync();
    syncThemeColor();
    btn.addEventListener("click", function () {
      var next = currentTheme() === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("sb-theme", next); } catch (e) {}
      sync();
      announceTheme();
    });
    if (mq) {
      var onChange = function () { if (!root.hasAttribute("data-theme")) { sync(); announceTheme(); } };
      if (mq.addEventListener) mq.addEventListener("change", onChange); else if (mq.addListener) mq.addListener(onChange);
    }
  }

  /* ---------- Header height → scroll padding ---------- */
  function syncHeader() {
    var h = document.querySelector(".topbar");
    if (!h) return;
    var set = function () { root.style.setProperty("--header-h", h.offsetHeight + "px"); };
    set();
    if (window.ResizeObserver) new ResizeObserver(set).observe(h);
    else window.addEventListener("resize", set);
  }

  /* ---------- Deep links: land on the target even though charts change heights after load ---------- */
  function initDeepLinks() {
    var userScrolled = false;
    var mark = function () { userScrolled = true; };
    ["wheel", "touchstart", "keydown", "pointerdown"].forEach(function (t) {
      window.addEventListener(t, mark, { passive: true, once: true });
    });
    var settle = function () {
      if (userScrolled || !location.hash || location.hash.length < 2) return;
      var target;
      try { target = document.getElementById(decodeURIComponent(location.hash.slice(1))); } catch (e) { return; }
      if (target) target.scrollIntoView({ block: "start", behavior: "instant" });
    };
    var mounted = false, fontsReady = !document.fonts;
    var maybe = function () { if (mounted && fontsReady) requestAnimationFrame(settle); };
    document.addEventListener("sb:mounted", function () { mounted = true; maybe(); }, { once: true });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { fontsReady = true; maybe(); });
    /* smooth in-page scrolling only after the initial fragment jump */
    window.addEventListener("load", function () {
      settle();
      requestAnimationFrame(function () { root.classList.add("is-ready"); });
    });
  }

  /* ---------- Scroll-spy for the section nav ---------- */
  function initScrollSpy() {
    var nav = document.querySelector(".secnav");
    if (!nav || !("IntersectionObserver" in window)) return;
    var links = Array.prototype.slice.call(nav.querySelectorAll('a[href^="#"]'));
    var map = {};
    links.forEach(function (a) {
      var sec = document.getElementById(a.getAttribute("href").slice(1));
      if (sec) map[sec.id] = a;
    });
    var visible = {};
    var setActive = function (id) {
      links.forEach(function (a) {
        var on = a === map[id];
        a.classList.toggle("is-active", on);
        if (on) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current");
      });
      var act = map[id];
      if (act && nav.scrollWidth > nav.clientWidth) {
        var l = act.offsetLeft - nav.offsetLeft, r = l + act.offsetWidth;
        if (l < nav.scrollLeft || r > nav.scrollLeft + nav.clientWidth) {
          nav.scrollTo({ left: Math.max(0, l - 24), behavior: "smooth" });
        }
      }
    };
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { visible[e.target.id] = e.isIntersecting; });
      var ids = Object.keys(map), current = null;
      for (var i = 0; i < ids.length; i++) if (visible[ids[i]]) { current = ids[i]; break; }
      setActive(current);
    }, { rootMargin: "-30% 0px -60% 0px", threshold: 0 });
    Object.keys(map).forEach(function (id) { io.observe(document.getElementById(id)); });
  }

  /* ---------- Figure lightbox: native modal <dialog> (inert page, focus trap, Escape) ---------- */
  function initLightbox() {
    var box = document.getElementById("lightbox");
    if (!box || typeof box.showModal !== "function") return;
    var img = box.querySelector("img");
    var trigger = null;
    var open = function (im, from) {
      trigger = from || null;
      var srcset = im.getAttribute("srcset") || "";
      var largest = srcset.split(",").map(function (s) { return s.trim().split(/\s+/)[0]; }).pop() || im.currentSrc || im.src;
      img.src = largest;
      img.alt = im.alt;
      box.showModal();
    };
    document.querySelectorAll(".figure").forEach(function (fig) {
      var im = fig.querySelector("img.zoomable");
      if (!im) return;
      var btn = fig.querySelector("[data-zoom]");
      im.addEventListener("click", function () { open(im, btn); });
      if (btn) btn.addEventListener("click", function () { open(im, btn); });
    });
    /* click anywhere (backdrop or image) closes; the close button is the keyboard path */
    box.addEventListener("click", function (e) {
      if (e.target === box || e.target === img) box.close();
    });
    box.querySelector("[data-close]").addEventListener("click", function () { box.close(); });
    box.addEventListener("close", function () {
      img.removeAttribute("src");
      if (trigger) trigger.focus();
    });
  }

  /* ---------- Copy BibTeX ---------- */
  function initCopy() {
    document.querySelectorAll("[data-copy]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var src = document.querySelector(btn.getAttribute("data-copy"));
        if (!src) return;
        var text = src.textContent;
        var label = btn.querySelector("span");
        var done = function () {
          btn.classList.add("is-done");
          if (label) label.textContent = "Copied";
          setTimeout(function () { btn.classList.remove("is-done"); if (label) label.textContent = "Copy"; }, 1800);
        };
        if (navigator.clipboard && window.isSecureContext) {
          navigator.clipboard.writeText(text).then(done, function () { fallback(text); done(); });
        } else { fallback(text); done(); }
      });
    });
    function fallback(text) {
      var ta = document.createElement("textarea");
      ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch (e) {}
      document.body.removeChild(ta);
    }
  }

  function init() {
    applyLinks();
    initTheme();
    syncHeader();
    initDeepLinks();
    initScrollSpy();
    initLightbox();
    initCopy();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
