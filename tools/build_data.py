#!/usr/bin/env python3
"""Regenerate assets/js/data.js from the SlackBench paper's LaTeX sources.

Usage:
    python3 tools/build_data.py /path/to/paper   # the Overleaf repo (contains tables/, images/, appendix/)

What it does
  * parses the results tables the charts use (tables/*.tex) and the channel names the hero uses
  * digitizes the two vector plots (images/cost_acc.pdf, images/steps_acc.pdf) to recover
    per-agent cost and trajectory length; each point is matched to its table row by its
    y-value (Overall accuracy) and marker shape (harness), and the script aborts if any
    recovered y-value disagrees with the table by more than 0.05 points
  * parses the failure trajectories in appendix/B.Failure_modes.tex
  * writes window.SLACKBENCH = {...} to assets/js/data.js

Facts that only appear in prose and that the charts read (human baseline, answer-first rates, ...)
live in STATIC near the end of this script, each annotated with the paper section it comes from.
Everything else on the page (category cards, failure modes, channel/tool tables, findings text) is
written directly in index.html and must be updated by hand. Requires PyMuPDF (pip install pymupdf).
"""
import json
import math
import os
import re
import sys

try:
    import fitz  # PyMuPDF
except ImportError:  # pragma: no cover
    sys.exit("PyMuPDF is required: pip install pymupdf")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "js", "data.js")

CATS = ["AS", "HA", "SU", "CI"]


# --------------------------------------------------------------------------------------
# LaTeX helpers
# --------------------------------------------------------------------------------------
def read(paper, rel):
    with open(os.path.join(paper, rel), encoding="utf-8") as f:
        return f.read()


def strip_comments(src):
    out = []
    for line in src.splitlines():
        if line.lstrip().startswith("%"):
            continue
        out.append(re.sub(r"(?<!\\)%.*", "", line))
    return "\n".join(out)


def tex_inline(t):
    """Convert a short LaTeX fragment (table cell / caption) to plain text."""
    t = t.replace("\\ldots", "…").replace("\\&", "&").replace("\\_", "_").replace("\\%", "%")
    t = re.sub(r"\\texttt\{([^{}]*)\}", r"\1", t)
    t = re.sub(r"\\(textbf|textit|emph)\{([^{}]*)\}", r"\2", t)
    t = t.replace("--", "–").replace("\\ ", " ").replace("vs.\\", "vs.").replace("~", " ")
    t = t.replace("{,}", ",")
    return " ".join(t.split())


def table_rows(src):
    """Yield lists of cells for each data row of a tabular (skips header/rules/comments)."""
    src = strip_comments(src)
    body = src.split("\\midrule", 1)[1] if "\\midrule" in src else src
    body = body.split("\\bottomrule", 1)[0]
    rows = []
    for raw in re.split(r"\\\\", body):
        raw = raw.replace("\\midrule", "").strip()
        raw = re.sub(r"^\[[^\]]*\]", "", raw).strip()
        if "&" not in raw:
            continue
        rows.append([c.strip() for c in re.split(r"(?<!\\)&", raw)])
    return rows


def num(x):
    x = x.strip().replace("{,}", "").replace(",", "").replace("\\%", "").rstrip("%").strip()
    if x in ("--", "-", "—", ""):
        return None
    return float(x)


def norm_model(m):
    m = " ".join(m.split())
    return m.replace("GPT-5.4-mini", "GPT-5.4-Mini")


# --------------------------------------------------------------------------------------
# Tables
# --------------------------------------------------------------------------------------
def parse_main(paper):
    rows = []
    for c in table_rows(read(paper, "tables/main_results.tex")):
        if len(c) != 7:
            continue
        h, m, *v = c
        v = [num(x) for x in v]
        rows.append(dict(harness=h, model=norm_model(m), AS=v[0], HA=v[1], SU=v[2], CI=v[3], overall=v[4]))
    assert len(rows) == 33, f"expected 33 main-table rows, got {len(rows)}"
    for r in rows:  # overall is the unweighted mean of the 4 categories (paper, Table caption)
        mean = sum(r[k] for k in CATS) / 4
        assert abs(mean - r["overall"]) < 0.011, (r, mean)
    return rows


def parse_ablation(paper, rel, key):
    out = []
    for c in table_rows(read(paper, rel)):
        if len(c) != 8:
            continue
        h, m, a, *v = c
        v = [num(x) for x in v]
        out.append(dict(harness=h, model=norm_model(m), **{key: a.strip()}, AS=v[0], HA=v[1], SU=v[2], CI=v[3], overall=v[4]))
    return out


def parse_cli_vs_mcp(paper):
    rows = parse_ablation(paper, "tables/no_mcp_ablation.tex", "access")
    pairs = []
    for i in range(0, len(rows), 2):
        a, b = rows[i], rows[i + 1]
        cli, mcp = (a, b) if a["access"] == "CLI" else (b, a)
        assert cli["model"] == mcp["model"]
        pick = lambda r: {k: r[k] for k in CATS + ["overall"]}
        pairs.append(dict(harness=cli["harness"], model=cli["model"], cli=pick(cli), mcp=pick(mcp)))
    return pairs


def parse_effort(paper):
    rows = parse_ablation(paper, "tables/reasoning_effort_ablation.tex", "effort")
    groups = {}
    for r in rows:
        k = (r["harness"], r["model"])
        groups.setdefault(k, {})[r["effort"].lower()] = {c: r[c] for c in CATS + ["overall"]}
    return [dict(harness=h, model=m, **lv) for (h, m), lv in groups.items()]


def parse_official_mcp(paper):
    out = {}
    for c in table_rows(read(paper, "tables/vs_official_mcp.tex")):
        if len(c) != 5:
            continue
        h, m, access, a, ha = c
        key = (h, norm_model(m))
        out.setdefault(key, {})["ours" if access.strip() == "Ours" else "official"] = dict(AS=num(a), HA=num(ha))
    return [dict(harness=h, model=m, **v) for (h, m), v in out.items()]


def parse_tool_calls(paper):
    cats = []
    for c in table_rows(read(paper, "tables/cli_vs_mcp_tool_details.tex")):
        if len(c) != 5:
            continue
        label = tex_inline(c[0])
        short = label.split(" (")[0]
        detail = label[len(short):].strip(" ()")
        cats.append(dict(label=short, detail=detail, cli=num(c[1]), cliPct=num(c[2]), mcp=num(c[3]), mcpPct=num(c[4])))
    return cats


def parse_judge(paper):
    src = read(paper, "tables/judge_agreement.tex")
    rows = table_rows(src)
    judges = [r[0].strip() for r in rows]
    matrix = [[num(x) for x in r[1:]] for r in rows]
    return dict(judges=judges, matrix=matrix)


def parse_channels(paper):
    out = []
    for c in table_rows(read(paper, "tables/channel_summary.tex")):
        if len(c) == 2:
            name = tex_inline(c[0])
            # the table truncates this name; appendix B gives it in full
            name = name.replace("cognitive-foundations…", "cognitive-foundations-for-reasoning-paper-extension")
            out.append(dict(name=name, desc=tex_inline(c[1])))
    return out


# --------------------------------------------------------------------------------------
# Plot digitization (cost / steps)
# --------------------------------------------------------------------------------------
SHAPE_HARNESS = {"circle": "Claude Code", "square": "Codex CLI", "tri_up": "OpenHands", "tri_down": "Terminus-2"}


def _shape(g):
    kinds = "".join(it[0] for it in g["items"])
    if kinds.startswith("c"):
        return "circle"
    if kinds == "re":
        return "square"
    if kinds == "llll":
        return "diamond"
    if kinds == "lll":
        verts = set()
        for it in g["items"]:
            verts.add((round(it[1].x, 2), round(it[1].y, 2)))
            verts.add((round(it[2].x, 2), round(it[2].y, 2)))
        cy = (g["rect"].y0 + g["rect"].y1) / 2
        return "tri_up" if sum(1 for _, y in verts if y < cy) == 1 else "tri_down"
    return "other"


def _fit(pairs, logx=False):
    xs = [math.log10(v) if logx else v for v, _ in pairs]
    ys = [p for _, p in pairs]
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    a = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sum((x - mx) ** 2 for x in xs)
    return a, my - a * mx


def digitize(pdf, logx, rows):
    page = fitz.open(pdf)[0]
    spans = []
    for b in page.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            for s in l["spans"]:
                x0, y0, x1, y1 = s["bbox"]
                spans.append((s["text"].strip(), (x0 + x1) / 2, (y0 + y1) / 2))
    xt, yt = [], []
    for g in page.get_drawings():
        r = g["rect"]
        if len(g["items"]) == 1 and g["items"][0][0] == "l":
            if abs(r.width) < 0.01 and 2.5 < r.height < 3.6:
                xt.append(r.x0)
            if abs(r.height) < 0.01 and 2.5 < r.width < 3.6:
                yt.append(r.y0)
    ylab = [(float(t), yc) for t, xc, yc in spans if re.fullmatch(r"\d+", t) and xc < 30]
    ycal = [(v, min(yt, key=lambda p: abs(p - yc))) for v, yc in ylab]
    if logx:
        xlab = [(float(t.strip("$")), xc) for t, xc, yc in spans if re.fullmatch(r"\$\d+", t)]
    else:
        xlab = [(float(t), xc) for t, xc, yc in spans if re.fullmatch(r"\d+", t) and yc > 275]
    xcal = [(v, min(xt, key=lambda p: abs(p - xc))) for v, xc in xlab]
    ay, by = _fit(ycal)
    ax, bx = _fit(xcal, logx)
    pts = []
    for g in page.get_drawings():
        if g["type"] != "fs" or g.get("width") is None or abs(g["width"] - 0.5) > 0.01:
            continue  # data markers use linewidth 0.5 (legend markers use 1.0)
        r = g["rect"]
        if not (3.5 < r.width < 7 and 3.5 < r.height < 7):
            continue
        cx, cy = (r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2
        x = (cx - bx) / ax
        pts.append(dict(shape=_shape(g), y=(cy - by) / ay, x=10 ** x if logx else x, fill=g["fill"]))
    used, out = set(), {}
    for p in sorted(pts, key=lambda d: -d["y"]):
        want = SHAPE_HARNESS.get(p["shape"])
        cands = sorted(
            (abs(r["overall"] - p["y"]), i)
            for i, r in enumerate(rows)
            if i not in used and ((want and r["harness"] == want) or (not want and r["harness"] not in SHAPE_HARNESS.values()))
        )
        d, i = cands[0]
        if d > 0.05:
            sys.exit(f"digitization mismatch in {pdf}: y={p['y']:.3f} closest row {rows[i]} (Δ={d:.3f})")
        used.add(i)
        blue = p["fill"][2] > 0.8 and p["fill"][0] < 0.2
        out[i] = dict(x=p["x"], highlighted=blue)
    return out


# --------------------------------------------------------------------------------------
# Failure trajectories (appendix B)
# --------------------------------------------------------------------------------------
def _clean(t):
    t = re.sub(r"-\s*\n\s*", "-", t)
    t = t.replace("\\\\", "\n")
    t = re.sub(r"\$\\tau\^\{?2\}?\$", "τ²", t)
    t = re.sub(r"\$\\rightarrow\$", "→", t)
    codes = []

    def stash(m):
        inner = m.group(1)
        for a, b in (("\\_", "_"), ("\\&", "&"), ("\\%", "%"), ("\\$", "$"), ("\\#", "#")):
            inner = inner.replace(a, b)
        codes.append(inner)
        return f"\x00{len(codes) - 1}\x00"

    t = re.sub(r"\\texttt\{((?:[^{}]|\{[^{}]*\})*)\}", stash, t)
    for _ in range(2):
        t = re.sub(r"\\(emph|textit)\{((?:[^{}]|\{[^{}]*\})*)\}", lambda m: "*" + m.group(2) + "*", t)
        t = re.sub(r"\\(textbf|text)\{((?:[^{}]|\{[^{}]*\})*)\}", lambda m: m.group(2), t)
    t = t.replace("``", "“").replace("''", "”").replace("---", "—").replace("--", "–")
    for a, b in (("\\_", "_"), ("\\&", "&"), ("\\%", "%"), ("\\$", "$"), ("\\#", "#"), ("~", " "), ("\\ldots", "…"), ("\\,", " "), ("\\ ", " ")):
        t = t.replace(a, b)
    t = re.sub(r"\x00(\d+)\x00", lambda m: "`" + codes[int(m.group(1))] + "`", t)
    return " ".join(t.split())


def _verbatim(block, label):
    m = re.search(r"\\textbf\{" + re.escape(label) + r"\.\}\s*\\begin\{verbatim\}(.*?)\\end\{verbatim\}", block, re.S)
    if not m:
        return None
    text = "\n".join(l.strip() for l in m.group(1).strip("\n").splitlines())
    text = re.sub(r"(?<!\n)\n(?!\n)", " ", text)
    text = re.sub(r"\$\\tau\^\{?2\}?\$", "τ²", text)
    return text.strip()


TRAJ_CATEGORY = {  # from the commented-out subsection titles in appendix B
    "insufficient_search": "AS",
    "lack_verify": "AS",
    "false_premise": "HA",
    "polished_narrative": "SU",
    "premature_closure": "CI",
}
KEY_PATTERNS = re.compile(r"key retrieval|key early message|key message|key channel|critical|notices the contradiction|^Instead of|^Despite|commits to", re.I)


def parse_trajectories(paper):
    src = strip_comments(read(paper, "appendix/B.Failure_modes.tex"))
    parts = re.split(r"\\subsection\{(Example \d+)\}", src)
    out = []
    for i in range(1, len(parts), 2):
        title, body = parts[i], parts[i + 1]
        lab = re.search(r"\\label\{appendix:failure_modes:([^}]*)\}", body).group(1)
        ex = dict(id=lab, title=title, category=TRAJ_CATEGORY.get(lab))
        ex["query"] = _verbatim(body, "Query")
        ex["finalAnswer"] = _verbatim(body, "Final answer")
        ex["referenceAnswer"] = _verbatim(body, "Reference answer")
        m = re.search(r"\\textbf\{Judge result\.\}(.*?)(?=\n\s*\n|\{\\footnotesize|\\begin\{enumerate\})", body, re.S)
        ex["judge"] = _clean(m.group(1)) if m else None
        steps = re.findall(r"\\item\[\\textbf\{(?:Steps? )?(\d+(?:--\d+)?)\.\}\]\s*(.*?)(?=\\item\[|\\end\{enumerate\})", body, re.S)
        m = re.search(r"\\textbf\{Failure analysis\.\}(.*)", body, re.S)
        ex["analysis"] = _clean(m.group(1)) if m else None
        mode = re.search(r"\*([^*]+)\*", ex["analysis"] or "")
        ex["failureType"] = (mode.group(1)[0].upper() + mode.group(1)[1:]) if mode else None
        # steps the analysis explicitly cites ("Steps 20, 53, and 71", "Step 20")
        cited = set()
        for grp in re.findall(r"Steps? ((?:\d+(?:, | and |, and )?)+)", ex["analysis"] or ""):
            cited |= {int(n) for n in re.findall(r"\d+", grp)}
        ex["steps"] = []
        for n, t in steps:
            lo, hi = (int(n.split("--")[0]), int(n.split("--")[-1]))
            text = _clean(t)
            key = bool(KEY_PATTERNS.search(text)) or any(lo <= c <= hi for c in cited)
            ex["steps"].append(dict(n=n.replace("--", "–"), text=text, key=key))
        ex["steps"][-1]["key"] = True  # the final answer
        ex["stepCount"] = int(steps[-1][0].split("--")[-1])
        out.append(ex)
    assert len(out) == 5
    return out


# --------------------------------------------------------------------------------------
# Prose-only facts (kept in sync with the paper by hand)
# --------------------------------------------------------------------------------------
STATIC = {
    # Section 6.5 (human performance)
    "human": {"AS": 91, "HA": 90, "SU": 82, "CI": 75, "overall": 84.5, "ci95": [77.0, 92.0], "annotators": 3},
    # Section 5 (three runs per agent) and Section 3.2 (140 queries)
    "stats": {"tasks": 140, "runs": 3},
    # Section 5 (false-premise answer-first pattern on HA tasks)
    "answerFirst": [
        {"model": "GPT 6 Astra", "harness": "Codex CLI", "pct": 25},
        {"model": "GPT 6.1 Sol", "harness": "Codex CLI", "pct": 21},
        {"model": "Claude Opus 5.5", "harness": "Claude Code", "pct": 8},
        {"model": "Muse Wonder", "harness": "Claude Code", "pct": 6},
    ],
    # Section 6.6
    "judge": {"model": "GPT-5.4", "humanAgreement": 95.8, "reviewedJudgments": 264},
    # Section 5 (CLI vs MCP: "improves pass rates by an average of 7.85%")
    "cli": {"avgGain": 7.85},
}


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    paper = sys.argv[1]
    rows = parse_main(paper)
    cost = digitize(os.path.join(paper, "images/cost_acc.pdf"), True, rows)
    steps = digitize(os.path.join(paper, "images/steps_acc.pdf"), False, rows)
    for i, r in enumerate(rows):
        r["rank"] = i + 1
        r["cost"] = round(cost[i]["x"], 2) if i in cost else None
        r["costPareto"] = bool(cost[i]["highlighted"]) if i in cost else False
        r["steps"] = round(steps[i]["x"], 2) if i in steps else None
    data = dict(STATIC)
    data["results"] = rows
    data["cliVsMcp"] = parse_cli_vs_mcp(paper)
    data["toolCalls"] = parse_tool_calls(paper)
    data["effort"] = parse_effort(paper)
    data["officialMcp"] = parse_official_mcp(paper)
    data["judge"].update(parse_judge(paper))
    data["channels"] = parse_channels(paper)  # channel names feed the hero illustration
    data["trajectories"] = parse_trajectories(paper)
    # sanity check: the CLI-vs-MCP average gain quoted in the prose matches the table
    gains = [p["cli"]["overall"] - p["mcp"]["overall"] for p in data["cliVsMcp"]]
    assert abs(sum(gains) / len(gains) - data["cli"]["avgGain"]) < 0.005, gains

    js = (
        "/* Generated by tools/build_data.py from the SlackBench paper sources. Do not edit by hand;\n"
        "   edit the paper (or STATIC in the script) and re-run: python3 tools/build_data.py <paper-dir> */\n"
        "window.SLACKBENCH = " + json.dumps(data, indent=1, ensure_ascii=False) + ";\n"
    )
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(js)
    print(f"wrote {os.path.relpath(OUT, ROOT)}: {len(rows)} results, "
          f"{sum(1 for r in rows if r['cost'] is not None)} with cost, "
          f"{sum(1 for r in rows if r['steps'] is not None)} with steps, "
          f"{len(data['trajectories'])} trajectories")


if __name__ == "__main__":
    main()
