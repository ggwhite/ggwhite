# npx skills 相對路徑 symlink 在 symlink 目錄下失效

**日期：** 2026-09-30

## 問題

跑 `npx skills check` 後，Claude Code 讀不到 hyperframes 系列、media-use、herdr、share-html 等 skill。`~/.claude/skills/` 下這些項目全部變成壞掉的 symlink，例如 `hyperframes-core -> ../../.agents/skills/hyperframes-core`。

## 原因

- `npx skills check` 不是唯讀檢查。它會先問 Update scope（預設 Both），然後直接更新 global skill，最後才印出「All global skills are up to date」。
- 更新時，它把 `~/.claude/skills/<name>` 換成相對路徑 symlink `../../.agents/skills/<name>`。這是以 `~/.claude/skills` 為基準算出來的路徑。
- 但 `~/.claude/skills` 本身是 symlink，指向 `~/dotfiles/claude/skills`。系統會從實際所在的目錄解析相對路徑，所以結果變成 `~/dotfiles/.agents/skills/<name>`，這個路徑不存在。
- 上游已經移除的 skill（例如 hyperframes 的 gsap、website-to-hyperframes、hyperframes-media）會被一起刪掉。

## 解法

把相對路徑改成絕對路徑：

```bash
cd ~/dotfiles/claude/skills
for s in $(find . -maxdepth 1 -type l ! -exec test -e {} \; -print | sed 's#./##'); do
  [ -d "$HOME/.agents/skills/$s" ] && ln -sfn "$HOME/.agents/skills/$s" "$s"
done
```

找出還是壞掉的 symlink：`for s in *; do [ -L "$s" ] && [ ! -e "$s" ] && echo "$s"; done`

## 關鍵洞察

- 相對路徑 symlink 的解析基準是 symlink 檔案「實際所在」的目錄，不是你走進來的那條路徑。只要上層目錄本身是 symlink，相對路徑就可能指錯位置。
- 要唯讀檢查 skill 版本，NEVER 用 `npx skills check`。改看 `~/.agents/.skill-lock.json`，再用 `gh api` 比對上游 commit。
- 每次跑完 `npx skills update`／`check`，都要重新掃一次 `~/.claude/skills` 裡有沒有壞掉的 symlink。
