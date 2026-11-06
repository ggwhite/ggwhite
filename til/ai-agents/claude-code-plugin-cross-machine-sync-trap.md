# Claude Code plugin 跨機同步：設定會同步，binary 不會

**日期：** 2026-09-05

## 問題

另一台電腦每跑一次 Bash 指令就噴一行 hook error，洗滿整個畫面：

```
PreToolUse:Bash hook error
Failed with non-blocking status code: /bin/sh: headroom: command not found
```

同時還有 `dial tcp 127.0.0.1:8767: connect: connection refused`。

`which headroom` 找不到，但完全不記得裝過這個東西。

## 原因

三個獨立事實疊起來造成的：

1. `~/.claude/settings.json` symlink 到 dotfiles，跨機共用。在 A 機啟用 plugin 時，會寫進共用檔：

```json
"enabledPlugins": { "headroom@headroom-marketplace": true },
"extraKnownMarketplaces": {
  "headroom-marketplace": { "source": { "source": "github", "repo": "chopratejas/headroom" } }
}
```

2. B 機 `git pull` 後，Claude Code 讀到 `enabledPlugins`，**自動**去 clone marketplace 並安裝 plugin，連帶註冊 plugin 自帶的 hooks：

```json
"PreToolUse": [{ "matcher": "Bash|PowerShell",
  "hooks": [{ "type": "command", "command": "headroom init hook ensure" }] }]
```

3. 但 plugin 只是一包設定與 hook 定義，它依賴的**外部 CLI binary 不在 plugin 裡**，也不會跟著 dotfiles 同步。B 機從來沒裝過那支 CLI，hook 於是每次觸發都 `command not found`。

關鍵在於 `installed_plugins.json` **不是** symlink，是各機獨立的本機檔——所以「已安裝狀態」兩台各自為政，但「啟用意圖」透過 settings.json 共享，兩者對不起來就會漏。

`matcher: "Bash"` 讓它每一個 Bash 呼叫都觸發一次，所以是洗版而不是只噴一次。

## 解法

先確認來源，再決定裝或拆。

查是誰註冊的 hook：

```bash
grep -rn "<指令名>" ~/.claude/settings.json ~/.claude/plugins/*/*/*/hooks/hooks.json
cat ~/.claude/plugins/installed_plugins.json      # 何時裝的、裝在哪
cd ~/dotfiles && git log -S"<plugin名>" -- claude/settings.json
```

判斷有沒有真的在用（比「有沒有裝」更重要）：

```bash
ls ~/.headroom ~/.cache/<name> ~/Library/Application\ Support/<name>   # 有無執行痕跡
grep -rn "ANTHROPIC_BASE_URL\|<port>" ~/dotfiles/                      # 有無實際接上的路由設定
```

我這次查完發現：dotfiles 裡只有 `enabledPlugins`，**完全沒有任何路由設定**，也沒有任何執行痕跡——代表當初在 A 機只是點了啟用試看看，從沒真的用起來。於是整組拆掉：

```bash
uv tool uninstall <pkg>                              # 若有裝 binary
claude plugin uninstall <plugin>@<marketplace>
claude plugin marketplace remove <marketplace>
rm -rf ~/.claude/plugins/cache/<marketplace>         # 帶 .orphaned_at 的孤兒目錄
# 最後把 enabledPlugins / extraKnownMarketplaces 兩段從 dotfiles 的 settings.json 移除
```

## 關鍵洞察

**Claude Code plugin 的「啟用意圖」會跨機同步，「執行環境」不會。** 只要 settings.json 進了 dotfiles，在任何一台點啟用就等於幫所有機器都打開，但 plugin 依賴的 binary、服務、API key 都是各機自理。plugin hook 用 `matcher: "Bash"` 這種高頻 matcher 時，缺件就會變成每個指令噴一次的洗版。

推論：**共用的 settings.json 只適合放「到處都成立」的設定**。任何依賴本機環境的東西（需要額外裝 binary 的 plugin、機器專屬路徑）該放各機的 `~/.claude/settings.local.json`，那個檔不進 git。

另一個順手學到的：判斷一個工具「有沒有在用」，不要只看有沒有裝。看它的**狀態目錄和實際路由設定**——目錄不存在、savings 是 0、沒有任何 BASE_URL 指過去，那就是裝了沒接上，可以放心拆。
