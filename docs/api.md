# Open API: bring any agent into the office

Claude Code, Codex, Gemini CLI and OpenCode are read directly from their files. Anything else – another coding agent, a
build script, a long data job – can walk into the office through one local endpoint:

```
POST http://127.0.0.1:4317/api/event        Content-Type: application/json
```

- Only from this computer: the server listens on `127.0.0.1`, and a request from a web page (an `Origin` that isn't
  localhost) is refused. Nothing is stored except the usual stats and coins.
- The port is `4317`, or `4318`–`4320` when the desktop app had to pick another one (see the address in the `?` panel →
  Window → Open in browser).
- Each agent sits at a desk with a ★ label like `my-project · Cursor`, shows its current tool in the bubble, turns red
  when it waits for you, and walks out when it ends (or after an hour of silence).

## The simple format (scripts, curl)

```json
{ "agent": "nightly-etl", "label": "data-pipeline", "provider": "aider", "type": "tool_start", "tool": "Bash", "detail": "python load.py" }
```

| Field | |
|---|---|
| `agent` | any id for this session (letters, digits, `.:@-_`, up to 64) – the same id = the same coworker |
| `type` | `start` · `prompt` (a new request from you) · `thinking` · `tool_start` · `tool_end` · `activity` (what it just did – shown until the next one) · `waiting` (needs you; `reason: "permission"` or `"input"`) · `idle` (done, goes for a coffee) · `end` (leaves the office) |
| `label` | the project name on the desk |
| `provider` | shown after the name (`cursor` → “· Cursor”); without it there is no suffix |
| `tool`, `detail` | for `tool_start` / `activity`: `Bash`, `Read`, `Edit`, `Write`, `Grep`, `WebFetch`, `Task`… (other names are mapped: `shell` → Bash, `view` → Read…); the detail is cut to 60 characters, and risky commands get the red ⚠ |
| `id` | optional, to end a specific `tool_start` with `tool_end`; without it the last one ends |

```bash
curl -s -X POST -H "Content-Type: application/json" http://127.0.0.1:4317/api/event \
  -d '{"agent":"build-42","label":"shop","type":"tool_start","tool":"Bash","detail":"npm test"}'
```

```powershell
Invoke-RestMethod -Method Post -ContentType 'application/json' -Uri http://127.0.0.1:4317/api/event `
  -Body (@{ agent = 'build-42'; label = 'shop'; type = 'idle' } | ConvertTo-Json)
```

Or with the npm package (finds the running office on 4317–4320 by itself):

```bash
npx cubicle-crew event tool_start --agent build-42 --label shop --tool Bash --detail "npm test"
npx cubicle-crew event idle --agent build-42
```

## Hook payloads (Copilot CLI, Cursor, …)

The same endpoint also understands the JSON that agent hooks send (`hook_event_name`, `session_id` /
`sessionId` / `conversation_id`, `cwd` / `workspace_roots`, `tool_name` + `tool_input`). Add `?from=<name>` so the
label says which agent it is. Unknown events are ignored, and hooks always get an empty `{}` back – the office never
allows or denies anything for them.

> These two configs follow the agents' official hook docs, but haven't been tried with a real Copilot CLI or Cursor
> yet. If something doesn't show up, run the office with `npm run debug` and open an issue with what it printed.

### GitHub Copilot CLI

Copilot CLI can call a URL directly. Save as `~/.copilot/hooks/cubicle-crew.json` (or `.github/hooks/` in a repo).
The PascalCase event names make Copilot send the format that includes `hook_event_name`:

```json
{
  "version": 1,
  "hooks": {
    "SessionStart":      [{ "type": "http", "url": "http://127.0.0.1:4317/api/event?from=copilot", "timeoutSec": 3 }],
    "UserPromptSubmit":  [{ "type": "http", "url": "http://127.0.0.1:4317/api/event?from=copilot", "timeoutSec": 3 }],
    "PreToolUse":        [{ "type": "http", "url": "http://127.0.0.1:4317/api/event?from=copilot", "timeoutSec": 3 }],
    "PostToolUse":       [{ "type": "http", "url": "http://127.0.0.1:4317/api/event?from=copilot", "timeoutSec": 3 }],
    "PermissionRequest": [{ "type": "http", "url": "http://127.0.0.1:4317/api/event?from=copilot", "timeoutSec": 3 }],
    "Stop":              [{ "type": "http", "url": "http://127.0.0.1:4317/api/event?from=copilot", "timeoutSec": 3 }],
    "SessionEnd":        [{ "type": "http", "url": "http://127.0.0.1:4317/api/event?from=copilot", "timeoutSec": 3 }]
  }
}
```

If you use camelCase names (`preToolUse`…), add the event to the URL, e.g. `…/api/event?from=copilot&event=preToolUse`,
because that format doesn't name the event.

### Cursor

Cursor runs a command for each hook and passes the JSON on stdin; `curl` forwards it. Save as `~/.cursor/hooks.json`
(on Windows write `curl.exe` – in Windows PowerShell plain `curl` is a different command). Only the events that report
what already happened are used, so nothing waits for the office:

```json
{
  "version": 1,
  "hooks": {
    "sessionStart":        [{ "command": "curl -s -m 2 -X POST -H \"Content-Type: application/json\" --data-binary @- \"http://127.0.0.1:4317/api/event?from=cursor\"" }],
    "afterShellExecution": [{ "command": "curl -s -m 2 -X POST -H \"Content-Type: application/json\" --data-binary @- \"http://127.0.0.1:4317/api/event?from=cursor\"" }],
    "afterFileEdit":       [{ "command": "curl -s -m 2 -X POST -H \"Content-Type: application/json\" --data-binary @- \"http://127.0.0.1:4317/api/event?from=cursor\"" }],
    "afterAgentThought":   [{ "command": "curl -s -m 2 -X POST -H \"Content-Type: application/json\" --data-binary @- \"http://127.0.0.1:4317/api/event?from=cursor\"" }],
    "stop":                [{ "command": "curl -s -m 2 -X POST -H \"Content-Type: application/json\" --data-binary @- \"http://127.0.0.1:4317/api/event?from=cursor\"" }],
    "sessionEnd":          [{ "command": "curl -s -m 2 -X POST -H \"Content-Type: application/json\" --data-binary @- \"http://127.0.0.1:4317/api/event?from=cursor\"" }]
  }
}
```

### Anything else with Claude-Code-style hooks

Many agents copy Claude Code's hook format (`hook_event_name`, `session_id`, `tool_name`, `tool_input`). Point their
command or HTTP hook at `http://127.0.0.1:4317/api/event?from=<agent>` the same way. Don't add it to Claude Code itself
– Claude Code is already read from its transcripts, so it would show up twice.

## What the page receives (WebSocket)

The office page gets the same events over WebSocket. The contract only ever grows by optional fields, so older clients keep working:

| Field / type | |
|---|---|
| `model` (optional on events) | the raw model id (`claude-sonnet-4-5-20250929`); the page shortens it (`shortModel()`) and shows it on the card and tooltip only when known. Sent for Claude Code, OpenCode and Codex (if its payload has one); the native format above has no `model` field |
| `ctx`, `ctxMax` (optional on events) | context size and window in tokens, tracked by the server and sent with the agent's next event when they changed |
| `type: "compact"` | `{ agent, type: "compact", ts }` – the conversation was compacted (OpenCode reports it directly; for Claude Code and Codex the page notices `ctx` dropping below 60 %). Papers fly to the shredder |
| `sessions` list | entries `{ agent, label, status, waitingFor?, name?, provider?, model? }` – OpenCode sessions come with `status` `busy` / `idle` / `waiting` read from its database (`waiting` while a `question` is open) |

## How events map

| Hook event | Office |
|---|---|
| `SessionStart` / `sessionStart` | comes in |
| `UserPromptSubmit` / `beforeSubmitPrompt` | new request (thinking) |
| `PreToolUse` → `PostToolUse` | the tool in the bubble while it runs (state colour from the tool) |
| `afterShellExecution`, `afterFileEdit`, `beforeReadFile`, `PostToolUse` without a `Pre` | shown as the current action until the next one |
| `afterAgentThought` | thinking |
| `PermissionRequest`, `Notification` | **waiting for you** (red, bell, notification) |
| `Stop` / `agentStop` / `stop` | done – idle |
| `SessionEnd` | walks out |
