# Connect an AI assistant to the dev shell

`--mcp` lets an AI assistant such as Claude use TakeoffDesk's tools. These tools read quantities, add items and marks, look
at sheets, count symbols from a legend, count and measure on DWG/DXF files, and export. The permissions in
Settings › Assistants, the undo steps and the activity log apply to every call.

## 1. Start it

```sh
npm run mcp          # = node devshell/serve.mjs --mcp
```

Open http://127.0.0.1:8000/ in Chrome or Edge and **keep that tab open**: the assistant works through it. In the app,
open **Settings › TakeoffDesk › Assistants** and tick **Let AI assistants and scripts use TakeoffDesk**, then tick
**Edit**. Tick **Export** if you want CSV/XLSX.

The first start writes a token to `devshell/.mcp-token`. Git ignores this file, and the token stays the same until you
delete it. Don't share it.

## 2. Connect Claude

**Claude Code.** In PowerShell, from the clone:

```powershell
claude mcp add --transport http takeoffcraft http://127.0.0.1:8000/mcp --header "Authorization: Bearer $(Get-Content devshell\.mcp-token)"
```

(macOS/Linux: `$(cat devshell/.mcp-token)`.) Start `claude` and ask, for example, "What sheets are open in TakeoffDesk?"

**Claude Desktop.** Settings › Developer › Edit Config. Add the following to `claude_desktop_config.json` (use your
clone's path), then restart Claude Desktop:

```json
{
  "mcpServers": {
    "takeoffcraft": { "command": "node", "args": ["C:\\path\\to\\takeoffcraft\\devshell\\mcp-stdio.mjs"] }
  }
}
```

`mcp-stdio.mjs` reads the token itself. If you start the server with `--port`, pass the same `--port` to it as well.

## Measuring on PDFs: `sheet_image`

The assistant can't measure on a plan it can't see, so `sheet_image` sends it a picture of a sheet, or of a zoomed-in
region. On the picture:

- **A blue grid** is labelled in fractions of the page from its lower-left corner. These are the same numbers
  `marks_add` takes with `units: "fraction"`, so a point read off the picture can be marked directly.
- **Existing marks** are drawn in their items' colours, so the assistant can check its own work.

Zoom in for accuracy: a whole sheet at about 1600 px is too coarse for exact corners. Set the sheet's scale first. After
the assistant marks a sheet, check its marks against the dimensions printed on the drawing.

## How it works and what it allows

- The assistant connects to `/mcp`, which uses Streamable HTTP with JSON answers. The server passes each request to the
  open tab over a long poll. `mcp-shim.js` gives the tab a channel (`window.takeoffdeskBridge`) that the app's assistant
  dispatcher (`app/host.js`, `host.control`) listens on.
- **This computer only.** `--mcp` refuses any `--host` other than 127.0.0.1. Requests need the token. Requests with
  another site's `Origin` or `Host` header are refused.
- **You decide.** If assistants are off in Settings, every call is refused. A tool outside the ticked permissions is not
  offered. Every edit is one undo step labelled "Assistant: …". Settings › Assistants › Activity lists each call.
- The assistant works on what you have open in the tab; it cannot open or save files by path.
