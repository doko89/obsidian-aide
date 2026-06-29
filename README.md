# Aide

AI writing assistant for Obsidian. OpenAI-compatible, streaming, tool calling.

## Features

- **Slash trigger** — type `/` (or `\`) to open a floating prompt
- **Inline actions** — improve, shorten, summarize, translate, fix grammar, and more
- **Custom prompt** — type any question or instruction in the input bar
- **Streaming** — response appears character by character in real-time
- **Web search** — AI can search Google, Brave, or a custom API for current info
- **Web fetch** — AI can read any URL and summarize its content
- **SVG generation** — AI can create diagrams and charts, save to `assets/`, and insert `![](...)` into your note
- **Reasoning effort** — supports OpenAI o-series `reasoning_effort` (low/medium/high)
- **Multi-provider** — works with any OpenAI-compatible API (OpenAI, Anthropic via proxy, local Ollama, etc.)

## Installation

### From Obsidian Community Plugins

Search **Aide** in Settings → Community plugins → Browse.

### Manual

1. Download `main.js`, `manifest.json`, `styles.css` from [releases](https://github.com/doko89/obsidian-aide/releases)
2. Copy to `<vault>/.obsidian/plugins/aide/`
3. Enable in Settings → Community plugins

## Usage

1. Open any note and type `/` (or backslash, configurable)
2. Select an action from the list, or type a custom prompt and press Enter
3. Watch the AI generate or edit your text in real-time

## Configuration

| Setting | Description |
|---|---|
| API Base URL | OpenAI-compatible endpoint |
| Model | Model identifier (e.g. `gpt-4o-mini`, `o3-mini`, `claude-3-opus`) |
| Max tokens | Response length limit |
| Temperature | Randomness (0 = deterministic, 2 = very random) |
| Reasoning effort | o-series only — how long the model thinks |
| Web search | Enable Google/Brave/Custom search via tool calling |
| SVG assets folder | Folder (relative to vault root) for generated SVGs |

## Development

```bash
git clone https://github.com/doko89/obsidian-aide.git
cd obsidian-aide
npm install
npm run dev    # watch mode
npm run build  # production build
```

## License

MIT
