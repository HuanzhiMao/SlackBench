/* ---------------------------------------------------------------------------
   Site configuration — the one place to edit links.
   Any link left as null renders as a disabled "Soon" button / label.
   Elements opt in with data-link="<key>" (and data-contact for the email).
   --------------------------------------------------------------------------- */
window.SLACKBENCH_CONFIG = {
  links: {
    paper: "https://openreview.net/forum?id=Nc9EWtWWx4",
    neurips: "https://neurips.cc/virtual/2026/poster/139475",
    arxiv: "https://arxiv.org/abs/2611.05512",
    code: null,     // e.g. "https://github.com/<org>/slackbench"
    dataset: "https://huggingface.co/datasets/HuanzhiMao/SlackBench",
    harbor: "https://github.com/harbor-framework/harbor"
  },
  contact: "huanzhimao@berkeley.edu",
  updated: "2026-11-11"
};
