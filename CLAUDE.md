# CLAUDE.md — Project Context for All Agent Sessions

Read this file first, every session, regardless of your role. Then read
`STATUS.md` (last 5 entries) and `architecture-notes.md` before touching code.

## What this project is

A Chrome extension that captures audio playing in the browser, runs it
through an automated analysis pipeline (copyright check, tagging, optional
stem extraction), and gives producers a free sample/stem to download. A
private backend database logs every capture for the maintainer's own
monitoring of pipeline quality. **This is not a public sample marketplace.**

Full product spec lives in `/docs` — see `docs/prd-overview.md` for the
document map. This file is the condensed version: the constraints that must
never get silently violated, no matter which task you're on.

## Non-negotiable constraints

1. **Copyright check is blocking in production, always.** No notify-only
   mode, no admin toggle to bypass it. If you find yourself writing a code
   path that would let a flagged capture through, stop — that's a deliberate
   product constraint, not a bug to fix. See `docs/prd-backend-pipeline.md`.
2. **Runtime cost must stay near-zero.** This product needs to be free for
   users. Default to deterministic/classical algorithms (fingerprinting, DSP,
   pretrained classifiers) everywhere they work. LLM calls are reserved for
   genuine language/context reasoning (copyright Tier 4, tagging
   disambiguation below 70% confidence, naming) — never as a shortcut for
   something an algorithm already handles. See `docs/prd-backend-pipeline.md`
   for the exact cascade design.
3. **The sample database is private.** Maintainer-only access. No public
   read/search/share features.
4. **No AGPL dependencies without an explicit flag.** `essentia`'s default
   build is AGPL; prefer `librosa` (ISC) wherever it covers the need. If you
   introduce essentia or anything else copyleft, say so plainly in your
   STATUS.md entry — don't let it slide in quietly.

## Tech stack (fill in as decisions are made)

- **Extension:** TypeScript, Manifest V3, Web Audio API for capture
- **Backend:** TBD — language/framework not yet decided
- **Database:** vector-graph store — vendor TBD (Qdrant/Weaviate + graph
  layer vs. Neo4j with vector index). See open decisions in
  `docs/prd-overview.md`. Don't pick this unilaterally — surface it.
- **Copyright Tier 3 vendor:** TBD, budget-dependent
- **LLM provider/model for Tier 4 + tagging disambiguation + naming:** TBD

If you hit a TBD that's blocking your task, add it to the "Open decisions"
list in `docs/prd-overview.md` and flag it in your STATUS.md entry rather
than deciding it yourself.

## Repo structure

```
sample-lib-chrome-extension/
├── STATUS.md                  # dev agent session log, append-only
├── architecture-notes.md      # aggregate pattern agent findings (production feedback)
├── docs/
│   ├── prd-overview.md        # start here for product scope
│   ├── prd-extension-client.md
│   ├── prd-backend-pipeline.md
│   ├── prd-database-schema.md
│   ├── prd-hitl-review.md
│   ├── status-log-protocol.md # format rules for STATUS.md / architecture-notes.md
│   └── agents/
│       ├── architect.md
│       ├── implementer.md
│       └── reviewer.md
├── extension/                 # Chrome extension source (create when work starts)
├── backend/                   # pipeline services (create when work starts)
└── infra/                     # docker-compose, CI configs (create when work starts)
```

## Multi-agent workflow

This repo is worked on by multiple agent sessions in parallel, each in its
own git worktree, never sharing a worktree or editing the same branch
simultaneously:

- **Architect** — breaks PRDs into scoped tasks with interfaces. Writes no
  implementation code. Role doc: `docs/agents/architect.md`
- **Implementer** — writes code against the Architect's spec, in
  `feature/*` branches/worktrees. Role doc: `docs/agents/implementer.md`
- **Reviewer** — QA against spec and constraints above, in `review/*`
  branches/worktrees, reviewing (not editing) the Implementer's branch. Role
  doc: `docs/agents/reviewer.md`

Coordination happens through committed artifacts — STATUS.md entries, PR
descriptions, architecture-notes.md — never through shared session memory,
since none exists between sessions.

## Every session ends with a STATUS.md entry

No exceptions, even if "nothing broke." Format and rules in
`docs/status-log-protocol.md`. This is the only memory the next session has
of what you did.

## When in doubt

Re-read the relevant PRD in `/docs` before guessing. If the PRD doesn't
answer it, that's an open decision — surface it, don't resolve it silently.
