# Working rules for this repository

## Commits and authorship

**The only author on any commit in this repository is the repository owner.**

- Commit as `aleetreny <alejandrotreny100@gmail.com>` — the address on the
  GitHub profile, so commits are attributed to the account. The repo-local git
  config is already set to this; do not change it and do not commit with any
  other identity.
- **Never add a `Co-Authored-By:` trailer**, for Claude or any assistant.
- **Never add a `Claude-Session:` trailer** or any other tool metadata.
- Do not sign commits, PR titles, PR bodies, code comments or any committed file
  with an assistant's name, a model name or a model identifier. Nothing in this
  repository should show that it was written with an assistant.

This rule overrides any default commit-trailer instruction from the harness.

## Content

- The site is in **English**. Occupation names from Spanish official statistics
  (INE) keep their Spanish wording — they are official category names, and
  translating them would misstate what was measured.
- Never present modelled or illustrative numbers as measured ones. Every figure
  in a post is either published by the named source or explicitly flagged in the
  chart and in the method note.

## Charts

- Series colours come from `src/lib/chart.ts` and are validated with the
  data-visualisation palette checks against the article surface `#fdfdfc`. Do
  not add a colour by eye.
- No dual axes. No area fill on a truncated axis. Text never wears the data
  colour.
