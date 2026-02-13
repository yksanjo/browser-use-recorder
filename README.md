# 🔴 Browser Use Recorder

Record browser interactions and auto-generate automation code for Playwright, Puppeteer, or Python — with AI decision points and MCP server export.

## Architecture

```
┌─────────────────────┐     WebSocket      ┌──────────────────┐
│  Chrome Extension    │ ──────────────────→│  Recorder Server │
│  (content.js)        │   events stream    │  (server.js)     │
│  - clicks            │                    │  - stores events │
│  - form fills        │                    │  - HTTP API      │
│  - navigation        │                    └────────┬─────────┘
│  - AI decisions      │                             │
└─────────────────────┘                    ┌─────────┴─────────┐
                                           │                   │
                                    ┌──────┴──────┐    ┌───────┴───────┐
                                    │ Code Gen    │    │ MCP Exporter  │
                                    │             │    │               │
                                    │ - Playwright│    │ - package.json│
                                    │ - Puppeteer │    │ - index.js    │
                                    │ - Python    │    │ - tools       │
                                    │ - TypeScript│    │ - resources   │
                                    └─────────────┘    └───────────────┘
```

## Quick Start

### 1. Install

```bash
cd browser-use-recorder
npm install
```

### 2. Start Recording

```bash
# Start the recorder server
npm start
# or
node src/cli.js record
```

### 3. Load Chrome Extension

1. Open Chrome → `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked" → select the `extension/` folder
4. Click the extension icon → "Start Recording"
5. Browse normally — all interactions are captured

### 4. Generate Code

When you stop recording (Ctrl+C), code is auto-generated. Or manually:

```bash
# From a session file
node src/cli.js generate output/session_xxx.json

# Specify framework and language
node src/cli.js generate session.json -f puppeteer -l typescript -o my-test.ts

# Python output
node src/cli.js generate session.json -l python -o automation.py
```

### 5. Add AI Decision Points

During recording, use the extension popup or CLI:

```bash
# Via CLI (while recorder is running)
node src/cli.js add-decision \
  -c "price > 100" \
  --if-true "skip" \
  --if-false 'click "Buy Now"' \
  -s ".price-tag" \
  -d "Skip expensive items"
```

Or via HTTP API:
```bash
curl -X POST http://localhost:3456/decision \
  -H "Content-Type: application/json" \
  -d '{"condition": "price > 100", "ifTrue": "skip", "ifFalse": "click Buy Now", "targetSelector": ".price"}'
```

### 6. Export as MCP Server

```bash
node src/cli.js export-mcp output/session_xxx.json \
  -n "my-shopping-bot" \
  -t "run_shopping_automation"
```

This creates a complete MCP server with:
- `index.js` — MCP server with stdio transport
- `automation.js` — Standalone automation script
- `recording.json` — Raw event data
- `package.json` — Dependencies
- `README.md` — Usage instructions

## CLI Commands

| Command | Description |
|---------|-------------|
| `record` | Start recorder server, wait for browser |
| `generate <file>` | Generate code from session file |
| `export-mcp <file>` | Export session as MCP server |
| `add-decision` | Add AI decision point to running session |
| `info <file>` | Show session information |

## Code Generation Options

| Option | Values | Default |
|--------|--------|---------|
| `--framework` | `playwright`, `puppeteer` | `playwright` |
| `--language` | `javascript`, `typescript`, `python` | `javascript` |
| `--no-comments` | Remove comments | comments on |
| `--no-waits` | Remove wait statements | waits on |
| `--headless` | Headless browser mode | `true` |
| `--test-name` | Function name | `recorded_automation` |

## AI Decision Points

Decision points let you add conditional logic to your automation:

```
🤖 if (price > $100) → skip item
🤖 if (page contains "Out of Stock") → go to next page
🤖 if (rating >= 4.5) → click "Add to Cart"
```

Supported condition patterns:
- **Numeric comparison**: `price > 100`, `count <= 5`
- **Text contains**: `contains "Sale"`, `includes "Free Shipping"`
- **Text equals**: `is "In Stock"`, `equals "Available"`

## HTTP API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/status` | GET | Server status |
| `/events` | GET | All recorded events |
| `/generate` | POST | Generate code (body: `{framework, language}`) |
| `/decision` | POST | Add AI decision point |
| `/export-mcp` | POST | Export as MCP server |
| `/clear` | POST | Clear all events |

## Generated MCP Server

The exported MCP server provides:

### Tools
- `run_browser_automation` — Execute the recorded automation
  - `headless`: Run headless (default: true)
  - `baseUrl`: Override starting URL
  - `variables`: Override form input values
  - `timeout`: Max execution time
- `get_recording_info` — Get recording metadata
- `get_decision_points` — List AI decision points

### Resources
- `recording://events` — Raw event data
- `recording://code` — Generated automation code

## Example Output

### Playwright (JavaScript)
```javascript
const { chromium } = require('playwright');

async function recorded_automation() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();

  await page.goto('https://example.com');

  // Click on button "Sign In"
  await page.getByRole('button', { name: 'Sign In' }).click();

  // Type "user@example.com" into input
  await page.getByPlaceholder('Email').fill('user@example.com');

  // 🤖 AI Decision Point: Check if price is within budget
  {
    const targetEl = await page.$('.price');
    const targetText = targetEl ? await targetEl.textContent() : '';
    const conditionMet = (() => {
      const text = targetText;
      const num = parseFloat(text.replace(/[^0-9.]/g, ''));
      return num > 100;
    })();
    if (conditionMet) {
      console.log('✅ Condition met: price > 100');
      return; // Skip remaining steps
    }
  }

  await browser.close();
}

recorded_automation().catch(console.error);
```

## License

MIT
