# Session analysis scripts

TypeScript scripts that analyse coding-agent sessions **through the
[agentsview](https://github.com/kenn-io/agentsview) CLI** (they never parse
Claude/Cursor session files directly). They answer questions like:

- How many (and which) sessions used the `rhdh-jira` skill?
- How many (and which) sessions reference a Jira ticket?
- How many (and which) sessions changed a Jira status or another field?
- How many (and which) sessions reference a GitHub issue / GitHub PR?
- How many (and which) sessions created a PR?

## Architecture: three layers

1. **Base filter** — the base session set comes from `agentsview session list`.
   All of agentsview's default filters (`--project`, `--machine`, `--agent`,
   `--git-branch`, `--date-from`/`--date-to`, `--min-messages`, …) are
   forwarded verbatim, so filtering behaves exactly like agentsview itself.
2. **Detectors** — each question is a *detector*: a pure function over a
   session's normalized tool calls and messages that returns evidence strings.
   Detectors with a `prefilter` regex first narrow candidates cheaply via
   `agentsview session search --regex`, then verify each candidate against its
   full content (`session tool-calls` + `session messages`). Use
   `--no-prefilter` to deep-scan every base session instead.
3. **Aggregate / list** — results are reported as absolute counts and
   percentages of the base set, plus the matching sessions with evidence for
   further investigation (human table, `--json`, or `--ids` for piping).

## Usage

```bash
# Everything, human-readable, across all sessions
npm run analyse:sessions

# Scope the base set (layer 1) like agentsview itself
npm run analyse:sessions -- --project rhdh --machine work-laptop --date-from 2026-07-01

# Only specific questions (layer 2)
npm run analyse:sessions -- --detect jira-reference --detect pr-created --project rhdh

# Skill usage for a specific skill, Jira detection scoped to project keys
npm run analyse:sessions -- --detect skill-usage --skill rhdh-jira --jira-project RHDH --jira-project RHIDP

# Machine-readable output, or bare ids for piping into further investigation
npm run analyse:sessions -- --json --detect pr-created > pr-sessions.json
npm run analyse:sessions -- --ids --detect jira-field-change | xargs -n1 agentsview session get
```

Run `npm run analyse:sessions -- --help` for the full flag reference.

### Detectors

| id | question | signals |
| -- | -------- | ------- |
| `skill-usage` | used the configured skill (`--skill`, default `rhdh-jira`) | Skill tool calls, `/skill-name` slash commands, `<command-name>` markers |
| `jira-reference` | references a Jira ticket | `KEY-123` patterns (stoplist for UTF-8/SHA-256/…, or scoped via `--jira-project`) |
| `jira-field-change` | changed a Jira status/field | mutating Jira MCP tool names, `jira` CLI mutations, mutating REST calls |
| `github-issue-reference` | references a GitHub issue | issue URLs, `gh issue …`, GitHub MCP issue tools |
| `github-pr-reference` | references a GitHub PR | PR URLs, `gh pr …`, GitHub MCP pull-request tools |
| `pr-created` | created a PR | `gh pr create`, `create_pull_request` tools; evidence includes the created PR URL when present |

### Connecting to agentsview

The scripts shell out to `agentsview` on the `PATH` (override with
`--agentsview-bin` or `$AGENTSVIEW_BIN`). `--server`, `--server-token-file`
and `--pg` are forwarded to every agentsview invocation.

## Extending

Add a new question by adding a `Detector` to
[`lib/detectors.ts`](lib/detectors.ts): an id, a description, an optional
`prefilter` regex for `session search`, and a pure `matches()` function —
plus a test in `lib/detectors.test.ts`. Nothing else needs to change.

## Caveats

- The agentsview JSON output shapes are not pinned by a published schema.
  All shape assumptions live in [`lib/normalize.ts`](lib/normalize.ts)
  (field spellings) and [`lib/agentsview.ts`](lib/agentsview.ts) (subcommands
  and flags) — adjust there if your agentsview version differs.
- `session messages` is paginated by agentsview; the scripts currently read a
  single page per session. Tool-call based detectors are unaffected
  (`session tool-calls` returns a flat list).
- Detector logic is fully unit tested (`npm test`), but end-to-end behaviour
  depends on a working `agentsview` installation with indexed sessions.
