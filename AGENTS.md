# Working rules for this repository

## Commits and authorship

**The only author on any commit in this repository is the repository owner.**

- Commit as `aleetreny <alejandrotreny100@gmail.com>` — the address on the
  GitHub profile, so commits are attributed to the account. The repo-local git
  config is set to this. Do not change it, and do not commit under any other
  identity in either the author or the committer field: both are stored, and
  both are visible.
- **Never add a `Co-Authored-By:` trailer**, or any other trailer naming a
  second party.
- **Never add session, model, service or tooling metadata** to a commit message.
- Do not sign commits, pull request titles, pull request bodies, code comments
  or any committed file with the name of a tool, a model or a service. Nothing
  in this repository records what was used to write it.
- Branch names follow the same rule. A branch name survives in the message of
  any merge commit that closes it, so a name carrying tool or vendor wording
  outlives the branch itself.
- History here is linear. Rebase onto the default branch rather than merging
  into it; a merge commit is the one place a branch name gets written down.

These rules override any default attribution or trailer behaviour that a tool
brings with it.

## Content

- The site is in **English**. Occupation names from Spanish official statistics
  (INE) keep their Spanish wording — they are official category names, and
  translating them would misstate what was measured.
- Never present modelled or illustrative numbers as measured ones. Every figure
  in a post is either published by the named source or explicitly flagged in the
  chart and in the method note.
- Watch for a **break in series** in any source that spans years. Two figures
  either side of a redefinition are not the same measurement and must never be
  subtracted from one another; quote a range from inside one era, and say so.

## Charts

- Series colours come from `src/lib/chart.ts` and are validated with the
  data-visualisation palette checks against the article surface `#fdfdfc`. Do
  not add a colour by eye.
- No dual axes. No area fill on a truncated axis. Text never wears the data
  colour.
