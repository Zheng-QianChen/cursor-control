# cursor-control

通过 CDP 与 SQLite 从 ZCode **无感驱动 Cursor 桌面端 agent**：后台读取长驻 agent 会话进度、经 Cursor hooks 自动批放被跟踪 agent 的工具调用、发送指令/询问进度，以及以 stop-hook followup 形式后台注入消息。全程不碰前台界面、不抢焦点。

## 功能

- **后台读进度** — 只读打开 Cursor 的 `conversation-search.db`，打印每个被跟踪会话的最新消息与更新时间。无需关注时零 UI 干扰。
- **自动批放** — 检测到被跟踪 agent 发出工具请求（`正在执行 … 目的 … 风险 …` 卡片）时自动点 **Run**——除非命令含"无备份删除"（`rm`/`del`/`unlink` 且无 `cp`/`mv`/备份），此类一律拦下并报告。
- **后台发送** — 切到目标会话、在输入框输入、按 Enter（绝不点提交按钮）、发完切回原会话。
- **stop-hook 注入** — 在 `~/.cursor/hooks/pending/<会话UUID>.json` 放入待发消息；agent 结束生成时 stop hook 将其作为 `followup_message` 返回，Cursor 自动把它提交为下一条用户消息。完全后台，无 UI。
- **崩溃恢复** — Cursor 自动更新可能丢掉 `--remote-debugging-port`，skill 内附恢复流程。

## 环境要求

- Cursor 以 `--remote-debugging-port` 启动（默认 `9222`，环境变量 `CURSOR_CONTROL_PORT` 可改）。
- Node 22.5+（原生 `node:sqlite`、`fetch`、`WebSocket`），建议 Node 24。
- hooks 为可选；如需安装，写入 `~/.cursor/hooks.json`。

## 安装

1. 以 `--remote-debugging-port=9222` 启动 Cursor。
2. 指向你的会话：
   - `CURSOR_CONTROL_AGENTS="Si_potential_training,Al-Ce review"`（会话标题），以及
   - 需要 hooks 时配置 `CURSOR_HOOKS_TARGETS` 或 `~/.cursor/hooks/targets.json`（会话 UUID）。
3. （可选）安装 hooks：

```bash
node cursor-hooks/install-cursor-hooks.mjs --targets "<会话UUID-1>,<会话UUID-2>"
node cursor-hooks/install-cursor-hooks.mjs --dry-run   # 仅预览
```

## 用法

```bash
# 检查所有被跟踪会话（除非需要点审批，否则零 UI）
node scripts/cdp-drive.mjs --agents "Si_potential_training,Al-Ce review"

# 手动诊断：busy/idle、审批按钮、会话尾部
node scripts/cdp-status.mjs "Al-Eu_potential_training" 12

# 向某会话发消息（发完自动切回原会话）
node scripts/cdp-send.mjs "Al-Eu_potential_training" "本批 FP 跑完请报告收敛概率。"

# 独立审批处理（当前活动会话）
node scripts/cdp-approve.mjs
```

所有机器/用户相关配置集中在 `scripts/config.mjs` / 环境变量，脚本本身保持可移植。

## 安全

自动批放仅针对普通工具调用。命令内容出现"无备份删除"（`rm`/`del`/`unlink` 且无备份）时**绝不**自动批放，会记录并报告。

## 目录结构

```text
cursor-control/
├── .zcode-plugin/plugin.json       # 插件清单（ZCode 推荐路径）
├── .claude-plugin/plugin.json      # Claude Code 兼容镜像
├── skills/cursor-control/SKILL.md  # skill（触发与用法）
├── scripts/                        # CDP + SQLite 控制脚本
│   ├── config.mjs                  # 全部机器相关配置
│   ├── cdp-common.mjs              # CDP 客户端（发现/连接/执行）
│   ├── cdp-drive.mjs               # 动静驱动监控核心
│   ├── cdp-status.mjs              # 手动诊断
│   ├── cdp-send.mjs                # 后台发消息
│   └── cdp-approve.mjs             # 独立审批处理
└── cursor-hooks/
    ├── approve.mjs                 # preToolUse/beforeShellExecution 自动审批 hook
    ├── inject.mjs                  # stop-hook 消息注入
    └── install-cursor-hooks.mjs    # 安装器（检测 CDP、写 hooks.json 与 targets.json）
```

## License

MIT
