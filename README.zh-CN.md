<div align="center">

<img src="docs/media/logo.png" alt="Cubicle Crew" width="520">

### 你的 Claude Code 智能体，住在一间小小的像素风办公室里。

[English](README.md) · [日本語](README.ja.md) · **简体中文**

每个 Claude Code 会话都会变成一位坐在工位上的同事，**Codex**、**Gemini CLI** 和 **OpenCode** 的会话也一样。**Copilot CLI、Cursor 或任何脚本**也可以通过一个小型本地 API（[docs/api.md](docs/api.md)，英文）走进来。子智能体从门口进来，接过任务，坐到自己团队的位置上。有人需要你的时候，整间屋子都会提醒你。

[**🕹 在浏览器中试玩在线演示**](https://rezored.github.io/cubicle-crew/) · [**▶ 观看预告片**](https://rezored.github.io/cubicle-crew/media/trailer.mp4) · [**⬇ 下载**](https://github.com/rezored/cubicle-crew/releases/latest) · [快速开始](#快速开始) · [工作原理](#工作原理)

[![Mentioned in Awesome Claude Code](https://awesome.re/mentioned-badge.svg)](https://github.com/hesreallyhim/awesome-claude-code)

<a href="https://rezored.github.io/cubicle-crew/"><img src="docs/media/demo.gif" alt="Cubicle Crew 运行效果" width="860"></a>

</div>

> 应用界面目前只有英文和保加利亚文（还没有中文界面）。本 README 为翻译版，最新内容以 [英文版](README.md) 为准。

---

## 为什么做这个

Claude Code 同时跑好几个会话、把工作交给子智能体的时候效率最高。可是终端标签页一多就很难跟上：谁还在忙？谁卡在一个问题上？谁十分钟前就悄悄做完了？

Cubicle Crew 读取 Claude Code 本来就会写入 `~/.claude/projects` 的会话日志，把它们变成一个实时场景。你可以把它放在副屏上，也可以作为小部件固定在屏幕一角。

- **一眼看清所有状态。** 每个智能体的衬衫、显示器的光和名牌，都会变成它当前在做的事情对应的颜色。
- **看得见的任务委派。** 编排者会走过去把文件递给子智能体，地板上的虚线显示谁在为谁工作。
- **不会错过任何提问。** 等你回复的智能体（`AskUserQuestion`，或「Allow Bash?」权限提示）会挥手，名牌闪红并显示「Allow Bash?」。如果你正在看别的窗口，会响起一声小提示音，桌面应用还会发系统通知。
- **无需任何配置。** 不需要 API 密钥，也不用安装钩子。离线运行，只读取本地文件。

<p align="center">
  <img src="docs/media/states.png" alt="两个团队在工作，子智能体坐在共享工位或在休息区用笔记本工作" width="49%">
  <img src="docs/media/night.png" alt="夜晚的办公室，有街机、鱼缸和宠物" width="49%">
</p>

## 功能

| | |
|---|---|
| 🧑‍💻 **团队** | 两张带 ★ 名牌的主管工位共用一块地毯，下面是三张子智能体工位。任何子智能体都可以坐任何空工位；没有工位的就在沙发上用笔记本工作，等有空位再过去。每个团队有自己颜色的马克杯，主管和子智能体之间用线连起来。第三个会话会在休息区工作，直到有主管工位空出来。 |
| 🔌 **任何智能体，一个接口** | `POST http://127.0.0.1:4317/api/event`（仅限本地）可以把任何东西带进办公室：现成的 **GitHub Copilot CLI** 和 **Cursor** 钩子配置、任何带 Claude Code 风格钩子的智能体，或者用 `curl` / `npx cubicle-crew event tool_start --agent build --tool Bash --detail "npm test"` 的脚本。它们会分到工位、头顶显示当前工具的气泡、等你时变红、结束后离开。详见 [docs/api.md](docs/api.md)。 |
| 📄 **桌上的上下文** | 每张桌子上的一叠纸会随着智能体的上下文窗口变高，快满时贴上黄色、再到红色的便签，对话被压缩（compact）时纸会从桌上飞走。卡片上显示精确数字。支持 Claude Code、Codex 和 OpenCode。 |
| ✅ **在办公室里允许 / 拒绝** *（可选）* | 在 `?` 面板中打开 **Answer permission prompts here** 后，Claude Code 的「Allow …?」会出现在办公室底部的横条里，带 **Allow** 和 **Deny** 按钮（按键 `Y` / `N`；桌面应用中在任何窗口都可以用 `Ctrl+Alt+Y` / `Ctrl+Alt+N`）。它会在 `~/.claude/settings.json` 中添加一个钩子（并保留备份），关闭时再删掉。终端照常可用：如果 45 秒内没有在办公室里回答，或者你在终端里回答了，终端那边不会有任何变化。 |
| ⚠️ **危险命令标红** | 会递归删除、改写 git 历史或触碰生产环境的 shell 命令（`rm -rf`、`Remove-Item -Recurse -Force`、force push、`git reset --hard`、`terraform apply`、`kubectl delete`、`DROP TABLE`、`curl … \| sh`、任何带「prod」的命令）会在气泡、卡片、细条和允许/拒绝横条中显示红色 ⚠，让你批准之前多看一眼。 |
| 💥 **崩溃的会话** | 如果 Claude Code 会话在工具执行中途关闭（崩溃、终端被强制关闭），它的智能体不会悄悄离开：它会变成灰色留在座位上，显示「Session ended」气泡，直到你悬停或点击它。 |
| 🎨 **7 种状态** | `idle` · `thinking` · `typing` · `reading` · `running` · `delegating` · `waiting`。每种都有自己的姿势、显示器画面和粒子效果。 |
| 🛋️ **休息区** | 空闲的会话会去倒咖啡、在沙发上玩掌机、打瞌睡或者扔飞镖。休息区里最多有三只宠物：花色各异的猫，以及一只喜欢坐在休息者旁边的狗（比格、金毛、柯基、哈士奇、腊肠……）。悬停宠物可以看到名字，点击可以改名。 |
| 🌇 **真实的天空** | 高高的落地窗跟随你所在城市的时钟（或电脑时钟）变化：黎明、黄昏、夜晚。天黑后台灯、显示器和霓虹灯会发光，傍晚天花板的灯会亮起。门边的开关可以把灯关掉。 |
| 🌧️ **真实的天气** *（可选）* | 在商店的 **Weather** 标签里选择你的城市（或点击书架上方的小气象站），窗外就会显示外面的真实天气：云、顺着玻璃流下的雨、积在窗台上的雪、雾、闪电。阴天时房间会暗一些，气象站显示气温和降雨概率。数据每 20 分钟从 [Open-Meteo](https://open-meteo.com) 获取，只发送城市坐标。在你选择城市之前，应用完全不会访问互联网。 |
| 🪙 **金币与商店** | 工作中的智能体会赚金币。你可以用它们购买约 50 种装饰：地板、墙面、地毯、沙发、主管的王座、霓虹灯牌、鱼缸、街机、更多的猫、狗和各种犬种、九种猫的花色。还有 14 个成就。 |
| 🧍 **你的头像** | 为你自己的角色（办公室里第一位编排者）选择性别、发型、上衣（女性还可以选裙子、裤子或连衣裙）、肤色、发色和眼镜。其他人都是随机的。 |
| 🧘 **专注模式与隐私** | 一个开关（`?` 按钮或托盘菜单）就能关掉金币、商店、宠物、粒子效果和游戏，只显示谁在做什么、谁在等你。**Hide commands and paths** 让气泡只显示工具名，适合屏幕共享和直播。`?` 面板还解释了每种状态，每种状态除了颜色还有自己的圆点形状。点击编排者可以给它的会话起名字。 |
| ↗️ **跳转到终端** | 双击一个智能体（或者用它的卡片、细条、「正在等你」通知），运行这个会话的窗口就会切到最前面：Windows Terminal、VS Code、JetBrains、Terminal.app、iTerm。 |
| 📊 **你的统计** | 按状态统计的工作时间、智能体等你的时间、工具调用次数，以及从会话记录中读取的真实 token 用量，按天和项目汇总；还会按 Claude API 价格估算成本（按模型，含缓存读写。在 Pro/Max 订阅下并不按 token 付费，但能看出这些工作值多少钱）。支持 CSV/JSON 导出，只保存在你的电脑上。点击白板：一位主管会走过去举起遥控器，投影幕降下来展示今天的数据；再点一次显示最近 7 天和 30 天。点击智能体还能看到它最近的操作。 |
| 🎬 **分享** | 在 `?` 面板中可以截取清晰的 PNG 快照，或录制 10 秒的 MP4 短片。`?overlay` 提供一个干净的场景，可用作 OBS 浏览器源，命令和路径都会隐藏。 |
| 🎃 **季节装饰与宠物** | 秋天有南瓜，圣诞节有圣诞树，春天有郁金香，夏天有电风扇。只在当季出售，买了就永远是你的。点击宠物可以摸摸它。 |
| 🐧 **WSL、Docker、Cowork** | 在 Windows 上，应用也会监视正在运行的 WSL 发行版中的 `~/.claude/projects`。Docker 或虚拟机里的 Claude Code 也可以显示：把它的 `~/.claude` 挂载到一个文件夹并在设置中添加即可（[步骤](docs/docker.md)，英文）。Claude Desktop 中的 Cowork 任务会被自动发现。 |
| 🔔 **声音** | 智能体需要你时（提问或权限提示）会响起 8-bit 的「叮咚」，会话在工作一分钟以上后结束时会有一段简短的号角声。只在你看着别的窗口时播放，底部栏的铃铛（或托盘菜单）可以静音。在浏览器中，第一次点击页面之后才会有声音。 |
| 🖥️ **桌面小部件** | 一个无边框、始终置顶、位于任务栏托盘上方的 Windows 应用，带托盘菜单、`Ctrl+Alt+P`、通知和开机自启。 |
| 🧩 **可改造的美术** | 所有画面都是用代码画的，但你可以不改代码就换成自己的 PNG 角色表和图块集。 |

## 快速开始

需要 **Node.js 18+**。最快的方式，无需安装，直接在浏览器中打开：

```bash
npx cubicle-crew     # → http://localhost:4317   (--demo, --port 4400, --no-open)
```

或者从源码运行：

```bash
git clone https://github.com/rezored/cubicle-crew.git
cd cubicle-crew
npm install
npm start            # → http://localhost:4317
```

如果端口 `4317` 已被其他程序占用（它也是 OpenTelemetry Collector 的默认端口），服务器会改用 `4318`–`4320`，并在控制台打印实际使用的地址。请打开控制台里的 URL，而不是 `4317`。也可以用 `PORT=` 指定固定端口。

第一次打开时，会有一个简短的设置，问你办公室里养猫还是养狗（以及它的名字），以及你在哪个城市（用于时钟和天气）。两项都可以跳过，之后在商店里修改。

然后在任意位置启动一个 Claude Code 会话，它的同事就会从门口走进来。

没有正在运行的会话？同样的模拟就在 **[rezored.github.io/cubicle-crew](https://rezored.github.io/cubicle-crew/)** 在线运行（虚构的智能体，不安装也不读取任何东西）。本地还有更多：

| URL | 内容 |
|---|---|
| `/?demo` | 实时模拟：两个团队在委派任务，会话来来去去，所有状态 |
| `/?demo=showcase` | 静态展示：两个团队、两个排队中的会话，7 种状态同时出现（适合截图） |
| `/?demo&agents=1` | 只有一位编排者的模拟 |
| `/?time=22:30` | 伪造时钟，看看夜晚的办公室 |
| `/?debug` | FPS、布局信息和最近事件的日志 |
| `/?atlas=6` | 以 6 倍大小显示所有生成的角色精灵 |

环境变量：`PORT`（默认 `4317`）、`CLAUDE_PROJECTS_DIR`（默认 `~/.claude/projects`）、`CLAUDE_SESSIONS_DIR`、`PIXEL_OFFICE_HOME`（存档位置，默认 `~/.pixel-office`）。`npm run debug` 会打印每个解析出的事件，以及每个子智能体是如何关联到父会话的。

**操作：** 悬停角色查看详情，点击聚焦（聚光灯和信息卡片），`L` 切换图例，`B` 打开商店，`Esc` 取消聚焦。

**语言：** 英文或保加利亚文，跟随系统语言。切换方式：点击 HUD 中的 `EN`/`БГ`，在 URL 中加 `?lang=en` 或 `?lang=bg`，或在桌面应用的托盘菜单中选择。

## 桌面小部件（Windows）

**最简单：** 从 [最新发布](https://github.com/rezored/cubicle-crew/releases/latest) 下载 `CubicleCrew-Setup-<version>.exe` 并运行。

安装程序没有代码签名（Cubicle Crew 是一个免费的业余项目），所以第一次运行时 Windows 可能会显示 **「Windows 已保护你的电脑」**。点击 **更多信息**，再点 **仍要运行**。它和本仓库发布页里的文件是同一个，[docs/security.md](docs/security.md)（英文）列出了应用读取、写入和发送的所有内容。

从源码：

```bash
npm run desktop      # 从源码运行 Electron 应用
npm run dist         # 构建安装程序 → release/CubicleCrew-Setup-<version>.exe
```

小部件自带服务器，所以不需要浏览器，也不需要 `npm start`。它位于右下角托盘上方，始终显示在其他窗口之上。鼠标悬停时会出现拖动条，带有设置、置顶、点击穿透、隐藏和退出按钮。`Ctrl+Alt+P` 可以在任何地方显示或隐藏它。托盘菜单里有通知、声音、开机自启、演示模式和重置尺寸。

安装版默认随 Windows 启动。每次启动时如果还没有 Claude Code 会话，它会在托盘上方的小窗口里显示一个早晨的场景（端着咖啡的头像、睡在窗台上的宠物、真实时间的天空）等待；会话出现或者你点击它时，就会展开成完整的办公室；最后一个会话关闭一分钟后，它又会回到小窗口。两项都可以在托盘菜单中关闭：**Start with Windows** 和 **Small window until the first session**。

<p align="center">
  <img src="docs/media/morning.gif" alt="还没有会话时的早晨小窗口" width="450">
</p>

## 桌面小部件（macOS）

需要 macOS 13 Ventura 或更高版本。最简单的方式是 Homebrew：

```bash
brew install --cask rezored/tap/cubicle-crew
```

这样不需要下面的额外安全步骤（cask 会移除隔离标记）；用 `brew upgrade --cask cubicle-crew` 更新。

或者从 [最新发布](https://github.com/rezored/cubicle-crew/releases/latest) 下载 `CubicleCrew-<version>-mac.dmg`（同时支持 Apple Silicon 和 Intel），打开后把 **Cubicle Crew** 拖到「应用程序」。

应用还没有 Apple Developer ID 签名，所以从 `.dmg` 第一次启动需要多一步：右键点击应用 → **打开** → **打开**。在 macOS 15 及更高版本中：先打开一次，然后 **系统设置 → 隐私与安全性 → 仍要打开**。如果 macOS 提示应用「已损坏」，运行一次 `xattr -cr "/Applications/Cubicle Crew.app"`。

在 Mac 上，小部件位于菜单栏（没有 Dock 图标），打开在菜单栏下方的右上角，会跟随你切换桌面；除非你在菜单中勾选 **Start at login**，否则不会在登录时启动。`⌘⌥P` 显示或隐藏。通知、细条、专注模式和「跳转到终端」（Terminal、iTerm、VS Code……）与 Windows 上相同。

## 桌面小部件（Linux）

从 [最新发布](https://github.com/rezored/cubicle-crew/releases/latest) 下载 `CubicleCrew-<version>-linux.AppImage`，赋予执行权限（`chmod +x`）后运行。除了「跳转到终端」和登录时启动在 Linux 上暂不支持之外，其余都和 Windows 一样。托盘图标需要支持托盘的桌面环境（GNOME 上需要 AppIndicator 扩展）。

## 设置

所有设置都在窗口内的 **设置面板** 中：底部栏的 `?` 按钮、`?` 键、应用标题栏上的 ⚙ 按钮，或托盘菜单中的 **Settings and help…**。面板分为六个部分（Look、Alerts、Privacy & data、Window、Share、Help），每个选项都有一行说明。完整列表见 [英文版 README](README.md#settings)。

## 反馈

Cubicle Crew 是一个免费的业余项目，靠大家的反馈成长。想法和问题请发到 [GitHub Discussions](https://github.com/rezored/cubicle-crew/discussions)，bug 请提到 [Issues](https://github.com/rezored/cubicle-crew/issues)（用中文也可以）。`?` 面板里也有这两个链接。

如果 Cubicle Crew 帮你节省了时间，欢迎 [请我喝杯咖啡](https://buymeacoffee.com/rezored) ☕ ——无论如何它都会保持免费。

## 工作原理

所有东西都留在你的电脑上。[docs/security.md](docs/security.md)（英文）准确列出了应用读取、写入和发送的内容。

```
~/.claude/projects/**/*.jsonl  ──tail──▶  server.js  ──WebSocket──▶  浏览器 / Electron
~/.claude/sessions/<pid>.json  ──poll──▶     │                         │
~/.codex/sessions/**/*.jsonl   ──tail──▶     │
~/.gemini/tmp/*/chats/*.jsonl  ──tail──▶     │
opencode.db（只读）            ──poll──▶     │
                                         wallet.js                  canvas 场景
                                  (~/.pixel-office/save.json)     (vanilla ES modules)
```

- **服务器**（`server.js`）：轮询最近一小时内有改动的会话记录，把每一行转换成小事件（`tool_start`、`tool_end`、`say`、`user_prompt`）。它先通过 `subagents/agent-<id>.meta.json`，再通过会话 ID，最后通过时间推断，把子智能体关联到父会话。它还每秒读取 `~/.claude/sessions`，以了解哪些会话仍然打开、哪些在忙、哪些在等你。启动时不会重放旧的历史。
- **Codex、Gemini CLI 和 OpenCode**（`providers.js`）：Codex 的 rollout 文件和 Gemini CLI 的聊天日志会像 Claude Code 的会话记录一样被跟踪（Gemini 的子智能体会以子智能体的身份进来）；shell 命令被分为读取（`rg`、`cat`、`Get-Content`……）和运行，`apply_patch` 算作 typing。OpenCode 的 SQLite 数据库每秒以只读方式读取一次。它们的标签带有 `· Codex` / `· Gemini` / `· OpenCode`。它们没有实时会话文件，所以权限提示时还不会变红，「跳转到终端」也只支持 Claude Code。
- **工具 → 状态：** `Edit`/`Write` → typing，`Read`/`Grep`/`WebFetch` → reading，`Bash` → running，`Task`/`Agent` → delegating，`AskUserQuestion` → waiting。8 秒没有新记录 → idle，除非 Claude Code 仍报告该会话正忙（在思考或写很长的回复）。映射关系可以在 `public/rules.js` 中修改。
- **权限提示** 不会写入会话记录，但它在屏幕上显示期间，Claude Code 会把会话标记为 `waiting`（`waitingFor: "permission prompt"`）。最后启动工具的那个智能体会一直是红色，直到你回答；点击 Allow 的那一刻它就回去工作。
- **客户端**（`public/`）：不需要构建步骤的原生 ES 模块。场景画在低分辨率的 canvas 上，再按整数倍设备像素放大，所以在任何 DPI 下都清晰。所有文字都是叠在 canvas 上的 HTML。
- **金币：** 每 5 秒在服务器端结算：每位活跃的编排者每分钟约 1 枚，子智能体减半，完成任务另有奖励。即使开了多个 Cubicle Crew 窗口，也只有一个在计数。存档以原子方式写入，并保留备份。

## 和 Pixel Agents 有什么不同？

[Pixel Agents](https://github.com/pixel-agents-hq/pixel-agents) 是一个理念相似、非常棒的 VS Code 扩展。Cubicle Crew 走的是另一个方向：

- **独立运行。** 作为桌面小部件或在任何浏览器中运行，放在你用的任何编辑器或终端旁边，不需要 VS Code。
- **一个小小的放置游戏。** 你的智能体赚金币，你用它们买家具、宠物和装饰，还有成就和头像。
- **办公室会对你的整套环境做出反应。** 每个会话一个团队，两个以上会话工作时在休息区排队，昼夜天空跟随你的本地时钟。
- **零素材。** 每个精灵和每件家具都是用代码画的，不需要购买或下载任何东西，但你仍然可以放进自己的图块集。

## 许可证

[MIT](LICENSE) © Kalin Dimitrov

<sub>原名「Pixel Office」。与 Anthropic 无关。「Claude」和「Claude Code」是 Anthropic 的商标。</sub>
