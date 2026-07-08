# STATUS.md Logging Protocol

## Purpose

Cross-session memory for the dev agent team. Every agent session ends with an
append-only entry. Agents read recent entries before starting work so the
team "remembers" what broke, what's flaky, and what's still open — instead of
every session starting cold.

## Rules

- **Append only.** Never edit or delete a prior entry.
- Keep the most recent ~5 entries inline in `STATUS.md`; move older entries to
  `docs/status-archive/YYYY-MM.md` to avoid bloating every agent's context
  window.
- Every dev agent (architect, implementer, reviewer) writes an entry at the
  end of its session, even if "nothing broke."
- The reviewer agent must read the last N entries before starting any review.
- The aggregate pattern agent (production side) writes to
  `architecture-notes.md`, a sibling file — keep production-feedback findings
  separate from dev-session logs so each stays scannable for its own audience.

## Entry template

```markdown
## Session YYYY-MM-DD-HH:MM — <role> (<branch/worktree>)

**Scope:** one line, what this session set out to do
**Changed:** files touched, deps added
**Broke / flaky:** anything that failed, even if fixed — future sessions
  benefit from knowing it was fragile
**Dependency notes:** anything a future agent needs to know to avoid
  re-discovering the same gotcha (build requirements, license constraints,
  API quirks)
**Human feedback received:** anything the maintainer said this session that
  should inform future decisions
**Open questions for next session:** unresolved decisions, explicitly framed
  as questions
**Confidence:** high / medium / low, and why
```

## architecture-notes.md entry template (aggregate pattern agent)

```markdown
## Finding YYYY-MM-DD — <area, e.g. "tagging naming mismatch">

**Pattern observed:** what recurred, with instance count
**Evidence:** which HITLEvent/naming-feedback records, or STATUS.md entries,
  support this
**Suggested fix:** prompt edit / taxonomy edit / code change — be specific
**Confidence:** high / medium / low
**Status:** proposed (dev agent should update to `actioned` or `rejected`
  once addressed, with a one-line reason)
```
