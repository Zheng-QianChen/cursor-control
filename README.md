# cursor-control

Drive Cursor desktop agents from ZCode **without touching the foreground UI**: monitor long-running agent sessions from the Cursor conversation database, auto-approve tracked agents' tool calls via Cursor hooks, send instructions / ask for progress, and inject follow-up messages as background stop-hook followups.

Read [中文文档](./README_CN.md)

## What it does

- **Background progress reads** — reads Cursor's `conversation-search.db` (read-only) and prints each tracked session's latest messages + updated timestamp. Zero UI when nothing needs attention.
- **Auto-approval** — when a tracked agent hits a tool-request (the `正在执行 … 目的 … 风险 …` card), it clicks **Run** automatically — unless the command deletes files without backup (`rm`/`del`/`unlink` with no `cp`/`mv`/backup), which is blocked and reported.
- **Background send** — switches to a session, types into the composer, presses Enter (never clicks a submit button), and restores the previously active session.
- **Stop-hook injection** — queue a message in `~/.cursor/hooks/pending/<conversation-uuid>.json`; when the agent finishes generating, the stop hook returns it as `followup_message` and Cursor submits it as the next user message. No UI, no focus steal.
- **Crash recovery guidance** — Cursor auto-updates can drop `--remote-debugging-port`; the skill documents the restore flow.

## Requirements

- Cursor running with `--remote-debugging-port` (default `9222`, env `CURSOR_CONTROL_PORT`).
- Node 22.5+ (native `node:sqlite`, `fetch`, `WebSocket`). Node 24 recommended.
- Optional hooks: install into `~/.cursor/hooks.json`.

## Install

1. Start Cursor with `--remote-debugging-port=9222`.
2. Point the plugin at your sessions:
   - `CURSOR_CONTROL_AGENTS="Si_potential_training,Al-Ce review"` (titles), and
   - `CURSOR_HOOKS_TARGETS` or `~/.cursor/hooks/targets.json` (conversation UUIDs) if you want hooks.
3. (Optional) Install hooks:

```bash
node cursor-hooks/install-cursor-hooks.mjs --targets "<conv-uuid-1>,<conv-uuid-2>"
node cursor-hooks/install-cursor-hooks.mjs --dry-run   # preview only
```

## Usage

```bash
# check all tracked sessions (zero-UI unless an approval needs clicking)
node scripts/cdp-drive.mjs --agents "Si_potential_training,Al-Ce review"

# manual status: busy/idle, approval buttons, session tail
node scripts/cdp-status.mjs "Al-Eu_potential_training" 12

# send a message to a session (restores previous active session afterwards)
node scripts/cdp-send.mjs "Al-Eu_potential_training" "本批 FP 跑完请报告收敛概率。"

# standalone approval handler (currently active session)
node scripts/cdp-approve.mjs
```

Everything user/machine-specific lives in `scripts/config.mjs` / env vars — keep the scripts portable.

## Safety

Automatic Run-click applies to normal tool calls only. A `rm`/`del`/`unlink` without a backup in the command context is **never** auto-approved; it is logged and reported instead.

## Layout

```text
cursor-control/
├── .zcode-plugin/plugin.json       # plugin manifest (ZCode recommended)
├── .claude-plugin/plugin.json      # Claude Code compatibility mirror
├── skills/cursor-control/SKILL.md  # the skill (trigger + usage)
├── scripts/                        # CDP + SQLite control scripts
│   ├── config.mjs                  # all machine-specific config
│   ├── cdp-common.mjs              # CDP client (discover/connect/evaluate)
│   ├── cdp-drive.mjs               # activity-driven monitor core
│   ├── cdp-status.mjs              # manual diagnostic
│   ├── cdp-send.mjs                # background message send
│   └── cdp-approve.mjs             # standalone approval handler
└── cursor-hooks/
    ├── approve.mjs                 # preToolUse/beforeShellExecution auto-approve hook
    ├── inject.mjs                  # stop-hook followup injection
    └── install-cursor-hooks.mjs    # installer (checks CDP, writes hooks.json + targets.json)
```

## License

MIT
