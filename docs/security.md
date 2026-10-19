# Privacy and security

Cubicle Crew is a local viewer for your Claude Code sessions. This page lists everything it reads, writes and sends, so you (or your IT team) can check it without reading the code.

## What it reads

**Claude Code transcripts** – `~/.claude/projects/**/*.jsonl` (or `CLAUDE_PROJECTS_DIR`). Every line is parsed, but only these fields are used; the rest of the line is dropped right away:

| Field | Used for |
|---|---|
| `type` (`user` / `assistant`) | whether the line is your prompt or Claude's reply |
| `message.content[].type` | `tool_use`, `tool_result`, `text`, `thinking` – which state to show |
| `tool_use.name`, `tool_use.id` | the tool in the bubble (Bash, Edit…) and matching its result |
| `tool_use.input` – only the first of `file_path`, `command`, `pattern`, `description`, `url`, `query`, cut to 60 characters | the detail in the bubble |
| `tool_result.tool_use_id` | when the tool finished |
| `cwd` – only the folder name | the project label |
| `sessionId`, `isSidechain` | which session a sub-agent belongs to |

The text of your prompts, Claude's answers, thinking, file contents and tool output are never read into the app.

**Sub-agent metadata** – `subagents/agent-*.meta.json` next to the transcripts: `toolUseId`, `requestShape`, `description` (the task name shown on a sub-agent's label, cut to 80 characters).

**Codex sessions** – `~/.codex/sessions/**/rollout-*.jsonl` (or `$CODEX_HOME/sessions`; `CODEX=0` turns it off). Same idea as the Claude Code transcripts, only these fields are used: `session_meta.cwd` (folder name only) and the parent thread id of a sub-agent; `response_item` types `function_call` / `custom_tool_call` / `local_shell_call` (tool name, call id, and the command or patched file path cut to 60 characters), their `*_output` (only the call id), `message`/`reasoning` (only that one happened); `event_msg` `user_message` (only that you wrote something) and `token_count` (numbers only). Prompts, answers, reasoning and tool output are never read into the app.

**Gemini CLI sessions** – `~/.gemini/tmp/*/chats/**/*.jsonl` (or `GEMINI_DIR`; `GEMINI=0` turns it off). Used: the metadata line (`sessionId`, the first workspace folder name), message `type` (user / gemini), tool calls (id, name, status, and the first of `command`/`file_path`/`path`/`pattern`/`query`/`url`/`description` cut to 60 characters) and token counts. Message text, thoughts and tool results are never used. Other files in `~/.gemini/tmp` are skipped.

**OpenCode sessions** – the OpenCode database `~/.local/share/opencode/opencode.db` (or `$XDG_DATA_HOME/opencode`, `OPENCODE_DB`; `OPENCODE=0` turns it off), opened **read-only**. Once a second it reads the parts changed since the last look: part type, tool name, call id, status, the first of `filePath`/`path`/`command`/`pattern`/`description`/`url`/`query` cut to 60 characters, and token counts; from `session` the folder name, the parent session and the title (shown on a sub-agent's label). Message text and tool output are never used.

**Live sessions** – `~/.claude/sessions/<pid>.json` (or `CLAUDE_SESSIONS_DIR`): `pid`, `sessionId`, `cwd`, `status`, `waitingFor`. Used to know which sessions are open and when one waits for a permission prompt.

## What it writes

**Only if you turn on "Answer permission prompts here"** (the `?` panel): one hook entry in `~/.claude/settings.json` (or `CLAUDE_CONFIG_DIR`) – `hooks.PermissionRequest` → `{ "type": "http", "url": "http://127.0.0.1:<port>/api/hook/permission", "timeout": 60 }`. Before every change the old file is copied to `settings.cubicle-crew-backup.json` next to it; nothing else in the file is touched, and turning the option off removes the entry again. If the file isn't valid JSON, the app refuses to edit it. When Claude Code asks for a permission, it POSTs the request (tool name and input) to the app; the app keeps only the tool name and the first of `file_path`/`command`/`pattern`/`description`/`url`/`query` cut to 60 characters, shows it, and answers `allow`/`deny` – or nothing (the normal terminal question) if you don't answer within 45 s, answer in the terminal, or no window is open. The endpoint only accepts local requests without an `Origin`, so a web page can't fake one; the decision endpoint needs a local origin like the shop.

All in `~/.pixel-office/` (or `PIXEL_OFFICE_HOME`):

- `save.json` (+ `.bak`) – coins, bought decor, achievements, avatar, pet names. No session content.
- `save.lock` – which running copy counts coins (pid + port).
- `weather.json` – the city you picked and the last forecast.
- `update.json` – whether the update check is on, and the last version number GitHub returned.

The desktop app also keeps `settings.json` and `desktop.log` (start, window size, wake/sleep) in `%APPDATA%\pixel-office\`. Page settings (language, sound, Focus mode, session names) live in the app's own browser storage.

## What it sends over the network

**Nothing**, unless you turn on one of two optional things. Both are off until you do.

**Weather** (after you pick a city):

- while you search for a city: the text you typed and the language go to `geocoding-api.open-meteo.com`;
- every 20 minutes: the city's latitude and longitude go to `api.open-meteo.com`.

**Check for new versions** (`?` panel → Updates): once a day, one `GET https://api.github.com/repos/rezored/cubicle-crew/releases/latest` with no parameters and no cookies (User-Agent `cubicle-crew`). GitHub sees your IP address, as with any download. Only the version number and the release link are kept. The app never downloads or installs anything by itself – it shows a link.

There is no telemetry, no analytics, no account and no crash reporting. Removing the city (shop → Weather → Remove city) and unticking the update check stops all requests.

To check it yourself: open Resource Monitor (Windows) or run `netstat -ano` while the app runs; the only listening socket is `127.0.0.1:<port>`, and with no city and no update check there are no outgoing connections.

## The local server

- Listens on `127.0.0.1` only – not reachable from other machines.
- Every request and WebSocket must come from `localhost`: the `Host` header must be local and the `Origin` (if any) must be local. This blocks other websites and DNS rebinding.
- Buying, equipping and setting things needs a JSON `POST` from a local origin.
- `POST /api/event` (the open API for other agents, [api.md](api.md)) also needs JSON and no foreign `Origin`. It only adds coworkers to the office (in memory; their work counts in the stats and coins like any session) – it can't read anything or change settings, and hooks always get an empty answer.
- Static files are served only from the app's `public/` folder.

## On screen

The bubbles show commands and file names, which matters when you share your screen or stream. Turn on **Hide commands and paths** (the `?` button, or the tray menu): bubbles and tooltips then show only the tool name, and sub-agent labels show the project instead of the task. `?overlay` (for OBS) has it on by default.

## Things to know

- **Start with Windows** is on by default for the installed app. Turn it off in the tray menu; uninstalling removes the entry.
- The Windows installer is **not code-signed** yet, so SmartScreen warns on first run. You can build it yourself from this repository (`npm install && npm run dist`) and compare.
- The desktop app is Electron. Pages opened from the app open in your browser, not inside it.
