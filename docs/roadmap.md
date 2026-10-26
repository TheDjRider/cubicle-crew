# Roadmap

Next steps after the competitor review (Pixel Agents, Clawd on Desk, claude-office, pixtuoid… – 2026-10-18).
Ticked = done and merged.

## Now (no decision needed)
- [x] Codex and OpenCode sessions (2.3.0)
- [x] **OpenCode v2** – the new `session_message` / `session_v2` database (v2.1.x stopped writing the old tables), live busy/waiting/idle status, and idle sessions capped to the open `opencode` terminals (the DB has no "closed" flag)
- [x] **Model name** on the card and tooltip (Claude, OpenCode, Codex when it reports one) and the **shredder** compaction beat (papers fly to the shredder; OpenCode's `compaction` row is detected directly)
- [x] **Context gauge** – a stack of paper on every desk that grows with the agent's context window, turns
      yellow/red when it fills up, and goes into the bin when the conversation is compacted; numbers in the card
- [x] **Gemini CLI** sessions (`~/.gemini/tmp/*/chats/*.jsonl`, v0.64+ format; the old whole-file `.json` isn't read)
- [x] **Open API** (`POST /api/event`, docs/api.md): any agent/script; ready hook configs for Copilot CLI (http hooks) and Cursor – not yet tried with the real tools
- [ ] **GitHub Copilot CLI** sessions (files) (the most requested agent in Pixel Agents' issues) – *blocked*: the on-disk
      `~/.copilot/session-state/<id>/events.jsonl` format is undocumented; needs one real session file to build against
      (checked 2026-10-19: the only local session is from March, without `events.jsonl`)
- [x] **Ended / crashed sessions** – a session that ends in the middle of a tool greys out with a small mark
      until you've seen it, instead of quietly walking out
- [x] Post drafts: Show HN, r/ClaudeAI, r/ChatGPTCoding (with the vertical video) – in out/posts/, not in the repo

- [x] **CPU / memory measured** (2026-10-19, Electron dev build, Windows over RDP, 60 s each): small waiting window
      1.6 % of one core, empty office 1.3 %, demo office 0.8–1.8 %, thin strip 0.7 %; 420–540 MB RAM across the
      4–5 Electron processes (mostly Chromium's baseline). The installed 2.5.1 while in use: 1.8 %, 517 MB.
- [x] **Check for new versions** – opt-in, every 6 hours + "Check now", GitHub `releases/latest`; dot on `?`, link in the panel and the tray
- [x] **Smaller screens** (2.8): compact room 356×208 (was 388×226), thin strip preselected on a single small screen in first-run setup, "Show only when needed" (hidden until an agent waits or a lead finishes)
- [x] **Approximate cost in $** – at Claude API prices per model (stats tab, project table, projector tooltip, CSV)
- [x] **Dangerous commands in red** – `rm -rf`, `git push --force`, `prod`, `terraform apply`… in the bubble, card and prompt bar
- [x] **Bueno** (2.11) – first contributor dog, the free dog for new dog offices; beagle owners get a one-time note
- [x] **Roomier shop** (2.12) – tall panel on the left, the office next to it (whole-room preview), bigger thumbnails, stats without scrolling
- [x] **Contributor pets** (2.12) – `by` field, own grid in Pets, "by @user" in the shop and tooltip, fixed name; how-to in CONTRIBUTING.md
- [x] Generic waiting text (2.12.1) – "Waiting for the first agent…" instead of naming Claude Code

## Needs a decision
- [x] **Allow / Deny from the office** – opt-in hook (`?` panel), bar with Allow / Deny + Y / N, backup of
      `settings.json`, one-click removal. To check with a real session: is the terminal dialog shown while the
      hook waits? (if not, the terminal question appears only after 45 s – then shorten `HOLD_MS`)
- [x] Global hotkey for Allow / Deny in the desktop app – `Ctrl+Alt+Y` / `Ctrl+Alt+N` (Cmd+Alt on a Mac),
      registered only while a request is pending
- [x] **Phone / LAN view** – read-only, off by default, PIN-protected (`lan.js`, port 4327 → 4328–4330 → any). The server strips commands, paths, task and session names; see docs/security.md
- [x] **More than two teams** – hot desks: a 3rd+ working session takes a free sub-agent desk with its own mug colour
      (up to 5 teams; moves to a lead desk when one frees up and a sub-agent needs a desk). A second floor only if
      people really run 6+ sessions.
- [x] **npm** – `npx cubicle-crew` (published 2.9.0, 2026-10-19; npm staged publishing – a new version may need *Approve* on npmjs.com)
- [ ] **WinGet** – `rezored.CubicleCrew` PR microsoft/winget-pkgs#455788 (CLA signed, waiting for validation/review); later versions need an update PR
- [x] **Homebrew cask** – own tap `rezored/homebrew-tap`: `brew install --cask rezored/tap/cubicle-crew` (removes the quarantine flag; CI on macos-14 audits and installs it). New version = bump `version` + `sha256` in `Casks/cubicle-crew.rb`
