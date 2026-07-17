# Agent Instructions — ostrid-converter

Public repo for the Ostrid Converter (import.ostrid.design): review-first
PDF/DXF/DWG → Ostrid conversion, built on Next.js. `bun` for tests, `biome`
for lint/format (`npm run check`).

## Changelog protocol — REQUIRED on every commit

Every commit message must end with changelog trailers. A `commit-msg` hook
(`.githooks/`, installed via `git config core.hooksPath .githooks` — runs
automatically on `npm install`) rejects commits that don't. This feeds the
public changelog at updates.ostrid.design — do not skip it, and do not use
`--no-verify`.

**Internal change** (refactors, CI, non-user-visible work, docs, tooling):

```
Changelog: skip
```

**User-visible change** — declare what ships, in the user's language:

```
Changelog-New: <something users can now do>            (repeatable)
Changelog-Improved: <something that works better>      (repeatable)
Changelog-Fixed: <something broken that now works>     (repeatable)
Changelog-Title: <catchy title for today's entry>      (optional but encouraged)
Changelog-Intro: <one-line intro for today's entry>    (optional)
```

Example:

```
Support DWG uploads

Changelog-New: The Ostrid Converter now accepts DWG drawings alongside PDF and DXF.
Changelog-Title: DWG drawings, welcome aboard
```

Notes must be public-safe and user-facing: outcomes, not internals — no file
names, dependency names, or security specifics. One sentence per trailer, on
a single line.

### How it works

The `post-commit` hook forwards these trailers to the changelog CMS in the
sibling **ostrid-web** checkout (`../ostrid-web`; override with
`OSTRID_WEB_DIR`), which renders and deploys updates.ostrid.design. If that
checkout is missing (e.g. an external contributor), the hook warns and skips —
notes are picked up later when the collector runs from ostrid-web, since it
scans this repo's git history.
