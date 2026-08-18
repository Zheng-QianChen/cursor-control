---
name: cursor-control
description: "Drive Cursor desktop agents from ZCode without touching the foreground UI — read per-session progress from the Cursor conversation database, auto-approve tracked agents' tool calls via Cursor hooks, switch sessions and send messages over CDP, and inject follow-up messages as background stop-hook followups. Use for: monitoring/checking on long-running Cursor agents, approving pending Run tool-requests in specific conversations, sending instructions or asking progress to a named Cursor session, and crash-recovery restart of Cursor with --remote-debugging-port."
---

# Cursor agent control (background, headless)

Use this skill whenever the user asks you to check on, drive, or communicate with agents running inside the local Cursor desktop app, especially long-running training/automation agents. The whole point: **act without stealing focus or touching the foreground UI**.

Read this skill before doing Cursor-monitoring work. Prefer the scripts here over ad‑hoc CDP scraping.

## Requirements

- Cursor is running with `--remote-debugging-port` (default port 9222, override with env `CURSOR_CONTROL_PORT`).
- Node.js 22.5+ (native `node:sqlite` and `fetch`/`WebSocket`). Node 24 recommended.
- For hooks: `~/.cursor/hooks.json` registered (run the installer below).

## Scripts (in `scripts/` of this plugin; plugin root via `ZCODE_PLUGIN_ROOT`, fallback `CLAUDE_PLUGIN_ROOT`)

| Script | Purpose |
| --- | --- |
| `cdp-drive.mjs` | **Primary check.** Zero-UI: reads conversation table for each tracked session, prints per-session message tail + updated timestamp, auto-detects pending tool-requests and clicks **Run** (never destructive deletes). Only touches UI when an approval actually needs clicking. |
| `cdp-status.mjs [title] [lines]` | Manual diagnostic: busy/idle, approval buttons, switch session, last N lines of body text. |
| `cdp-send.mjs "<title>" "<message>"` | Switch to a session, type a message into the composer, press Enter to send, switch back to the previously active session. Never clicks a submit button. |
| `cdp-approve.mjs` | Standalone approval handler for the currently active session (same policy as cdp-drive's approval step). |

## Configuration

All user/machine-specific values live in `scripts/config.mjs`:

- `CURSOR_CONTROL_AGENTS` — comma-separated conversation **titles** to track (fallback: none). Used by `cdp-drive`/`cdp-send`.
- `CURSOR_CONTROL_PING_SESSION` — title of the liveness/`Availability check` session (default `Availability check`).
- `CURSOR_CONTROL_PORT` / `CURSOR_CONTROL_HOST` — CDP endpoint (default `127.0.0.1:9222`).
- `CURSOR_CONTROL_DB` — override path to `conversation-search.db` (auto-detected from APPDATA/XDG otherwise).
- `CURSOR_HOOKS_TARGETS` — comma-separated conversation **UUIDs** the hooks react to (else `~/.cursor/hooks/targets.json`).

**Do not edit scripts to change user data** — set env vars or `targets.json` instead.

## Workflow

### 1. Check on agents (default, zero-UI)

```bash
node scripts/cdp-drive.mjs --agents "Si_potential_training,Al-Ce review"
```

- Prints `[drive] <title>: messages=N updated=<ts>` per session plus approval needs.
- If a tracked session's tail looks like a pending tool-request (`正在执行…目的…风险…`), it switches to that session, finds the Run button, and clicks it — unless the command deletes files without backup (`rm`/`del`/`unlink` and no `cp`/`mv`/`backup` in context), which is **blocked and reported** instead.

### 2. Approval policy (safety)

Automatic Run-click is allowed for normal tool calls. **Never** auto-approve a command that deletes files without a backup. When the policy blocks, report to the user with the command context instead of clicking.

### 3. Send a message / ask progress

Use `cdp-send.mjs` only when there is a real reason (authorized instruction, overdue progress check, wake-up after long silence). Do not spam trackers.

```bash
node scripts/cdp-send.mjs "Al-Eu_potential_training" "进度如何?本次 FP 批跑完请报告收敛概率。"
```

The script restores the previously active session afterward. Verify the `verify:` line shows `hit:true`.

### 4. Background follow-up injection (stop hook)

The inject channel lets you queue a message that Cursor submits to a tracked agent automatically when it finishes generating — fully background, no UI.

1. Ensure hooks are installed (`cursor-hooks/install-cursor-hooks.mjs`).
2. Write a pending file: `~/.cursor/hooks/pending/<conversation-uuid>.json` with `{"message": "..."}`.
3. When the agent stops, the stop hook returns `followup_message` and Cursor posts it as the next user message; the hook consumes (deletes) the file so it fires once.

### 5. Crash recovery

If the CDP port is dead (`fetch http://127.0.0.1:9222/json/version` errors), Cursor may have auto-updated and lost `--remote-debugging-port`:

- Kill stray Cursor processes you can kill, then start Cursor with `--remote-debugging-port=9222`.
- Verify `GET /json` responds and sessions are readable again.

## Lifecycle / roles

- Keep the total monitoring loop bounded: status check → conditional approval → brief follow-up when a milestone is due → back to idle. Do not loop the UI click cycle unbounded; report instead (see `[drive]` output).
- The tracked agent sessions (Si/AlCe/AlEu) are long-running training agents; read-only progress scanning is free, so prefer scanning over messaging.
