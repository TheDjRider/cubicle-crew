# Roadmap

Next steps after the competitor review (Pixel Agents, Clawd on Desk, claude-office, pixtuoid… – 2026-10-18).
Ticked = done and merged.

## Now (no decision needed)
- [x] Codex and OpenCode sessions (2.3.0)
- [x] **Context gauge** – a stack of paper on every desk that grows with the agent's context window, turns
      yellow/red when it fills up, and goes into the bin when the conversation is compacted; numbers in the card
- [x] **Gemini CLI** sessions (`~/.gemini/tmp/*/chats/*.jsonl`, v0.64+ format; the old whole-file `.json` isn't read)
- [x] **Open API** (`POST /api/event`, docs/api.md): any agent/script; ready hook configs for Copilot CLI (http hooks) and Cursor – not yet tried with the real tools
- [ ] **GitHub Copilot CLI** sessions (files) (the most requested agent in Pixel Agents' issues) – *blocked*: the on-disk
      `~/.copilot/session-state/<id>/events.jsonl` format is undocumented; needs one real session file to build against
- [x] **Ended / crashed sessions** – a session that ends in the middle of a tool greys out with a small mark
      until you've seen it, instead of quietly walking out
- [x] Post drafts: Show HN, r/ClaudeAI, r/ChatGPTCoding (with the vertical video) – in out/posts/, not in the repo

- [x] **CPU / memory measured** (2026-10-19, Electron dev build, Windows over RDP, 60 s each): small waiting window
      1.6 % of one core, empty office 1.3 %, demo office 0.8–1.8 %, thin strip 0.7 %; 420–540 MB RAM across the
      4–5 Electron processes (mostly Chromium's baseline). The installed 2.5.1 while in use: 1.8 %, 517 MB.
- [x] **Check for new versions** – opt-in, once a day, GitHub `releases/latest`; dot on `?`, link in the panel and the tray
- [x] **Smaller screens** (2.8): compact room 356×208 (was 388×226), thin strip preselected on a single small screen in first-run setup, "Show only when needed" (hidden until an agent waits or a lead finishes)
- [x] **Approximate cost in $** – at Claude API prices per model (stats tab, project table, projector tooltip, CSV)
- [x] **Dangerous commands in red** – `rm -rf`, `git push --force`, `prod`, `terraform apply`… in the bubble, card and prompt bar

## Needs a decision
- [x] **Allow / Deny from the office** – opt-in hook (`?` panel), bar with Allow / Deny + Y / N, backup of
      `settings.json`, one-click removal. To check with a real session: is the terminal dialog shown while the
      hook waits? (if not, the terminal question appears only after 45 s – then shorten `HOLD_MS`)
- [x] Global hotkey for Allow / Deny in the desktop app – `Ctrl+Alt+Y` / `Ctrl+Alt+N` (Cmd+Alt on a Mac),
      registered only while a request is pending
- [ ] **Phone / LAN view** – read-only, off by default, PIN-protected. Opens a port to the local network.
- [ ] **More than two teams** – a second floor or a "command center" view when 3+ sessions work at once
      (the office is fixed by design today).
- [x] **npm** – `npx cubicle-crew` (published 2.9.0, 2026-10-19; npm staged publishing – a new version may need *Approve* on npmjs.com)
- [ ] **WinGet** – `rezored.CubicleCrew` PR microsoft/winget-pkgs#455788 (CLA signed, waiting for validation/review); later versions need an update PR
- [ ] **Homebrew cask** – not started (unsigned app: own tap rather than homebrew-cask)
