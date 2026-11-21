# Connect an AI assistant to the dev shell

CadCraft Studio's **Connect an assistant** gives an assistant TakeoffCraft's tools. These tools read quantities, add
items and marks, count symbols from a legend, count and measure on DWG/DXF files, and export. `--mcp` gives the dev shell
the same connection, so you can use a clone without Studio. The tools, the permissions in Settings › Assistants, the
undo steps and the activity log all work as they do in Studio.

## 1. Start it

```sh
npm run mcp          # = node devshell/serve.mjs --mcp
```

Open http://127.0.0.1:8000/ in Chrome or Edge and **keep that tab open**: the assistant works through it. In the app,
open **Settings › TakeoffCraft › Assistants** and tick **Let AI assistants and scripts use TakeoffCraft**, then tick
**Edit**. Tick **Export** if you want CSV/XLSX.

The first start writes a token to `devshell/.mcp-token`. Git ignores this file, and the token stays the same until you
delete it. Don't share it.

## 2. Connect Claude

**Claude Code.** In PowerShell, from the clone:

```powershell
claude mcp add --transport http takeoffcraft http://127.0.0.1:8000/mcp --header "Authorization: Bearer $(Get-Content devshell\.mcp-token)"
```

(macOS/Linux: `$(cat devshell/.mcp-token)`.) Start `claude` and ask, for example, "What sheets are open in TakeoffCraft?"

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

## How it works and what it allows

- The assistant connects to `/mcp`, which uses Streamable HTTP with JSON answers. The server passes each request to the
  open tab over a long poll. A stand-in for Studio's window channel (`mcp-shim.js`) puts the request in front of the same
  dispatcher Studio uses (`app/host.js`, `host.control`).
- **This computer only.** `--mcp` refuses any `--host` other than 127.0.0.1. Requests need the token. Requests with
  another site's `Origin` or `Host` header are refused.
- **You decide.** If assistants are off in Settings, every call is refused. A tool outside the ticked permissions is not
  offered. Every edit is one undo step labelled "Assistant: …". Settings › Assistants › Activity lists each call.
- File paths (`files_list`, opening files by path) need Studio. In the dev shell, the assistant works on what you have
  open in the tab.
