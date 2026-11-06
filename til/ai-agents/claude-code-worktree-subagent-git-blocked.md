# Claude Code worktree 隔離的 subagent 跑 git 被擋

**日期：** 2026-10-13

## 問題

用 `isolation: worktree` 派 subagent（Claude Code 2.1.296）。subagent 在 worktree 裡跑 git，連續被拒，錯誤訊息像這樣：

> This agent is isolated in the worktree ..., but this command runs rtk with a git command among its operands ... Refusing to run it — a worktree-isolated agent's git operations must target its own worktree.

## 原因

- Claude Code 對 worktree 隔離的 agent 有內建保護：每個 git 指令都要能靜態確認「只作用在自己的 worktree」，確認不了就拒絕。
- 會被拒的形式：
  - `rtk git ...`：git 包在別的 launcher 裡，看不出在哪個目錄跑。
  - `cd $VAR && git ...`：目錄是執行時才算出來的。
  - 帶 glob 的指令：無法確認展開後不是 git。
- PreToolUse 的 `rtk hook claude` 會把 `git status` 改寫成 `rtk git status`，所以幾乎每個 git 指令都踩到第一種。

## 解法

- 派工 prompt 寫明：git 一律用 `/usr/bin/git`，在 worktree 目錄直接執行。
  - 指令開頭就是 git，保護看得懂。
  - 完整路徑不會被 rtk hook 改寫。
- 附帶的坑：有自動 commit 的 repo（例如 dotfiles 自動同步），會把 `.claude/worktrees/agent-*` 當成 gitlink（mode 160000）commit 進去。要把 `.claude/worktrees/` 加進 `.gitignore`。

## 關鍵洞察

- 這個保護擋的是「看不懂的指令」，不是 git 本身。把指令寫成最直白的形式就會放行。
- 任何會改寫指令的 PreToolUse hook（rtk、alias 包裝）都可能跟這種靜態檢查衝突。
