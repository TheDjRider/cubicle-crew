# Claude Code in Docker (or a VM)

Cubicle Crew reads the files Claude Code writes on your computer: `~/.claude/projects` (transcripts) and `~/.claude/sessions` (which sessions are open, and when one waits for you). A container has its own file system, so by default the office can't see an agent running inside one.

The fix is one folder: mount Claude's config folder from the container to a folder on your computer, then add that folder in Cubicle Crew. There's nothing to install in the container and no network setup.

As a bonus, your Claude login is kept in that folder too, so you don't have to sign in again every time the container starts.

## 1. Mount the folder

Pick a folder on your computer, e.g. `C:\claude-docker` (Windows) or `~/claude-docker` (macOS/Linux), and mount it as Claude's config folder. Setting `CLAUDE_CONFIG_DIR` keeps everything (login included) in that one folder.

**docker run**

```bash
docker run -it --rm \
  -v C:\claude-docker:/home/node/.claude \
  -e CLAUDE_CONFIG_DIR=/home/node/.claude \
  -v "$PWD":/work -w /work \
  your-image claude
```

**docker-compose.yml**

```yaml
services:
  claude:
    image: your-image
    working_dir: /work
    environment:
      CLAUDE_CONFIG_DIR: /home/node/.claude
    volumes:
      - C:\claude-docker:/home/node/.claude
      - .:/work
    stdin_open: true
    tty: true
```

**Dev Containers** (`.devcontainer/devcontainer.json`)

```json
{
  "mounts": ["source=C:\\claude-docker,target=/home/node/.claude,type=bind"],
  "containerEnv": { "CLAUDE_CONFIG_DIR": "/home/node/.claude" }
}
```

Use the home folder of the user Claude runs as in your image (`/home/node` in the official Node images, `/root` if it runs as root).

Several containers can share the same folder. Each session shows up as its own person, named after its working folder inside the container (`/work` → `work`).

## 2. Add the folder in Cubicle Crew

Open the settings panel (`?`), go to **Privacy & data → More agent folders**, paste the path (`C:\claude-docker`) and click **Add**. In the desktop app you can also click **Choose…**. You can add the config folder or the `projects` folder inside it, either one works.

The row says *no transcripts yet* until the first session in the container writes something. Once it does, the agent walks in within a couple of seconds.

Without the panel (browser version, scripts): `CLAUDE_PROJECTS_EXTRA=C:\claude-docker\projects npm start`. Separate several folders with `;`.

## What works

| | Docker / VM |
|---|---|
| Who is working, tools, sub-agents, coins, stats | ✅ same as a local session |
| "Waiting for you" (permission prompts, questions) | ✅ from the session file in the mounted folder |
| Session leaves when you exit Claude | ✅ |
| Jump to the terminal | ❌ the process lives inside the container |
| Answer permission prompts from the office | ❌ the hook can't reach the app from inside the container |

**If the container is killed** (`docker kill`, a crash), Claude can't remove its session file, and that file has no heartbeat. So a session from a container counts as open only while it's fresh: up to 30 minutes after its last transcript line, or 3 hours while it's busy.

## Claude Desktop (Cowork)

Nothing to set up: Cowork tasks in Claude Desktop are Claude Code sessions too, each with its own folder. The app finds the ones from the last day by itself (Windows, macOS, Linux) and shows them as `<folder> · Cowork`. Chats in Claude Desktop run in the cloud and don't leave anything on your computer, so they can't be shown. `CLAUDE_COWORK=0` turns Cowork detection off.
