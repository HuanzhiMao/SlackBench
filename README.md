# SlackBench project website

Project page for **SlackBench: Benchmarking Agents on Collaborative Projects Grounded in Real Code Repositories** (NeurIPS 2026, Evaluations & Datasets Track).

The site is plain HTML, CSS and JavaScript. There is no build step, and it loads nothing from third-party servers, since the fonts are self-hosted. It works on GitHub Pages as is.

## Preview locally

```bash
cd slackbench-website
python3 -m http.server 8000
# open http://localhost:8000
```

Opening `index.html` straight from disk also works.

## Deploy to GitHub Pages

1. Create a GitHub repository (for example `slackbench`) and push this folder's contents to `main`.
2. In the repository, open **Settings → Pages**. Under **Build and deployment**, choose **Deploy from a branch**, then `main` and `/ (root)`.
3. Within a minute or two the site is live at `https://<user-or-org>.github.io/<repo>/`.

`.nojekyll` makes GitHub serve the files as they are, without running Jekyll. `404.html` is a self-contained not-found page whose "Back" link works on project sites, `<name>.github.io` sites and custom domains.

**Before sharing the link**, make the social-card tags in `index.html` absolute. Link-preview crawlers (X, LinkedIn, Slack, …) ignore relative image URLs:

```html
<meta property="og:image" content="https://<user>.github.io/<repo>/assets/img/og.png">
<meta property="og:url" content="https://<user>.github.io/<repo>/">
<meta name="twitter:image" content="https://<user>.github.io/<repo>/assets/img/og.png">
<link rel="canonical" href="https://<user>.github.io/<repo>/">
```

For a custom domain, add a `CNAME` file containing the domain and configure DNS as described in GitHub's Pages docs.

## Edit links (arXiv, code, dataset)

Every external link is set in **`assets/js/config.js`**:

```js
links: {
  paper: "https://openreview.net/forum?id=Nc9EWtWWx4",
  neurips: "https://neurips.cc/virtual/2026/poster/139475",
  arxiv: "https://arxiv.org/abs/2611.05512",
  code: null,     // set to the GitHub repo URL
  dataset: "https://huggingface.co/datasets/HuanzhiMao/SlackBench",
  harbor: "https://github.com/harbor-framework/harbor"
},
contact: "huanzhimao@berkeley.edu",
updated: "2026-11-11"
```

A link left as `null` shows as a disabled **Soon** button. Setting it turns on every button, nav icon and footer link that points there.

## Update the numbers

All charts read from **`assets/js/data.js`**. Don't edit that file by hand; regenerate it from the paper's LaTeX sources (the Overleaf repo):

```bash
pip install pymupdf
python3 tools/build_data.py /path/to/slackbench-paper
```

The script:

- parses the results tables the charts use (main results, CLI vs. MCP, tool-call breakdown, reasoning effort, official MCP, judge agreement) and the channel names shown in the hero illustration;
- recovers each agent's **cost** and **average steps** by digitizing the vector plots `images/cost_acc.pdf` and `images/steps_acc.pdf`. It matches every point to its table row by y-value and marker shape, and aborts if a recovered y-value differs from the table by more than 0.05;
- parses the five failure trajectories in `appendix/B.Failure_modes.tex`;
- keeps the few chart inputs that appear only in prose (human baseline, answer-first rates, judge agreement, the average CLI gain) in a `STATIC` block near the end of the script, each labeled with its paper section, and checks the average CLI gain against the table.

**Prose maintained by hand in `index.html`:** the hero, the stats band, the leaderboard heading and notes, the category cards and task-mix bar, the environment section (pipeline, channel table, tool lists, evaluation setup), all findings text, the failure-mode cards, the FAQ, the BibTeX, and the meta/social descriptions. When results change, search `index.html` for the old values. Also check `tools/og.html`, then re-render the social card.

## Regenerate the social card and icons

`assets/img/og.png` (1200×630) is rendered from `tools/og.html`. The PNG favicons are rendered from `assets/img/favicon.svg`:

```bash
pip install playwright pillow && python3 -m playwright install chromium
python3 tools/render_og.py          # or: og | icons
```

## Project structure

```text
index.html                  the page (all prose lives here)
404.html                    not-found page (self-contained)
assets/css/site.css         fonts, design tokens (light + dark), layout, shared components and chart styles
assets/css/*.css            component styles (hero, leaderboard, cost, findings-a/b, trajectories)
assets/fonts/               Geist + Geist Mono (woff2, latin + latin-ext) and their license (OFL.txt)
assets/js/config.js         links and contact (edit me)
assets/js/data.js           generated chart data (do not edit; see above)
assets/js/site.js           links from config, theme toggle, scroll-spy, deep links, lightbox, BibTeX copy
assets/js/charts/core.js    small shared chart toolkit (scales, marks, tooltip, table twins, keyboard, lifecycle)
assets/js/charts/*.js       leaderboard, cost/steps scatter, findings charts
assets/js/hero.js           hero illustration
assets/js/trajectories.js   failure-trajectory explorer
assets/img/                 figures (WebP), social card, favicons
tools/build_data.py         regenerates assets/js/data.js from the paper sources
tools/og.html               source of the social card
tools/render_og.py          renders og.png and the PNG favicons
```

## Notes

- **Themes.** The page follows the OS light/dark setting, and the top-bar toggle overrides it (saved in `localStorage`). Chart colors come from CSS custom properties defined for both themes. The four category colors (AS blue, HA magenta, SU amber, CI violet) were checked for color-vision-deficiency separation in both themes.
- **Accessibility.** Every chart has a "Show data table" twin. Each chart is one Tab stop, and the arrow keys move between its marks. Keyboard focus shows the same tooltips as hover, and Escape dismisses them. Figures open in a modal dialog with a close button. The hero animation has a pause button and stops entirely under `prefers-reduced-motion`.
- **Without JavaScript.** All prose, tables and figures still render. The interactive charts are replaced by a pointer to the paper.
- **Fonts.** [Geist and Geist Mono](https://github.com/vercel/geist-font) are self-hosted under the SIL Open Font License (`assets/fonts/OFL.txt`). The GitHub mark icon comes from GitHub Octicons (MIT).
- **Design.** The layout takes ideas from [frontier-cs.org](https://frontier-cs.org/).
