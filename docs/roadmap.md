# Roadmap

Next steps after the competitor review (Pixel Agents, Clawd on Desk, claude-office, pixtuoid… – 2026-10-18).
Ticked = done and merged.

## Now (no decision needed)
- [x] Codex and OpenCode sessions (2.3.0)
- [x] **Context gauge** – a stack of paper on every desk that grows with the agent's context window, turns
      yellow/red when it fills up, and goes into the bin when the conversation is compacted; numbers in the card
- [x] **Gemini CLI** sessions (`~/.gemini/tmp/*/chats/*.jsonl`, v0.64+ format; the old whole-file `.json` isn't read)
- [ ] **GitHub Copilot CLI** sessions (the most requested agent in Pixel Agents' issues) – *blocked*: the on-disk
      `~/.copilot/session-state/<id>/events.jsonl` format is undocumented; needs one real session file to build against
- [x] **Ended / crashed sessions** – a session that ends in the middle of a tool greys out with a small mark
      until you've seen it, instead of quietly walking out
- [x] Post drafts: Show HN, r/ClaudeAI, r/ChatGPTCoding (with the vertical video) – in out/posts/, not in the repo

## Needs a decision
- [ ] **Allow / Deny from the office** (button in the card + hotkey). Needs a Claude Code hook – opt-in, with
      consent, a backup of `settings.json` and a one-click removal.
- [ ] **Phone / LAN view** – read-only, off by default, PIN-protected. Opens a port to the local network.
- [ ] **More than two teams** – a second floor or a "command center" view when 3+ sessions work at once
      (the office is fixed by design today).
- [ ] **Package managers** – WinGet, Homebrew cask, `npx cubicle-crew` (publishing under your accounts).
