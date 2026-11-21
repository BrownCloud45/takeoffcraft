---
title: Use TakeoffDesk with an AI assistant
summary: Let your own AI assistant or script read the takeoff's quantities and estimate, add items and marks, count and measure on a DWG or DXF, and export: permissions, connecting through the dev server, and the activity log.
section: tasks
order: 118
keywords: ai, assistant, agent, mcp, model context protocol, script, automation, quantities, estimate, permissions, disconnect, activity
---

## What you will learn

How to let an AI assistant (or a script you wrote) work with TakeoffDesk, and how to decide what it is allowed to touch.

TakeoffDesk has **no AI of its own** and sends nothing anywhere. You bring the assistant: any program that speaks the Model Context Protocol (MCP). TakeoffDesk only gives it tools, and you choose which.

## Turn it on

1. Open {{ui:Settings}} (the gear in the app bar, or {{key:Mod+,}}) and go to the {{ui:TakeoffDesk}} tab.
2. Under {{ui:Assistants}}, tick **Let AI assistants and scripts use TakeoffDesk**. It is off until you do.
3. Choose what it may do: **Read** is ticked to start with; tick **Edit**, **Save** or **Export** only when you need them.

Tools outside the permissions you ticked are not offered to the assistant, and if it asks for one anyway, TakeoffDesk refuses and writes it in the activity log. Turning the switch off ends every connection at once; {{ui:Reset TakeoffDesk settings}} turns it off too.

## Connect your assistant

Assistants connect through the dev server on your computer. Start TakeoffDesk with `npm run mcp` instead of `npm start`: the server then also answers assistants at `http://127.0.0.1:8000/mcp`, only from this computer, with the token it keeps in `devshell/.mcp-token`. Keep the TakeoffDesk tab open: the assistant works through it. `devshell/MCP.md` has the exact settings for Claude Code and Claude Desktop. Never share the token.

:::note
Started with `npm start`, the server takes no assistants, and the switch has no effect.
:::

## You stay in charge

- **Every change is one undo step**, labelled with the assistant's name for it (for example "Assistant: …"). {{key:Mod+Z}} takes back the assistant's last change as a whole.
- **You know when one is connected.** A button in the app bar names the assistant while it is connected; click it to see what it may do, or to **Disconnect** it.
- **Activity.** {{ui:Settings}} › {{ui:TakeoffDesk}} › {{ui:Assistants}} › {{ui:Activity}} lists every call: when, which tool, done or refused. {{ui:Save the log}} keeps a copy.

## What an assistant can ask for

| Tool | Permission | What it does |
|---|---|---|
| `app_info`, `sheets_list` | Read | The takeoff open, its PDFs and sheets, each sheet's scale and marks |
| `sheet_image` | Read | A picture of a sheet, or a zoomed-in part of it, with a grid in the numbers `marks_add` takes and the marks already there, so the assistant can see where to measure on a PDF |
| `items_list` | Read | The items with their units, rates and assembly formulas |
| `takeoff_quantities` | Read | Quantities per item or per sheet; marks on sheets with no scale are listed, never counted as zero |
| `takeoff_estimate` | Read | The priced estimate as TakeoffDesk computes it, with its totals |
| `takeoff_export` | Export | TakeoffDesk's own CSV or XLSX export |
| `items_add` | Edit | Adds items with their units, rates and waste |
| `marks_add` | Edit | Measures runs, areas and counts on a sheet. Lengths and areas only on a sheet with a scale, never on an unscaled one |
| `cad_sheets`, `cad_catalog`, `cad_count` | Read | On a DWG or DXF you opened: its sheets and their scales, what can be counted (blocks, layers and types, texts), and exact counts, as {{ui:CAD count}} makes them ([Count from a drawing](topic:count-from-a-drawing)) |
| `cad_count_add` | Edit | Counts in the drawing and puts a count mark on each object found, in one step; counting again adds only what is new |
| `cad_measure` | Edit | Measures a linear or an area item from the drawing's own lines, arcs, polylines and hatches, as {{ui:Measure drawing}} does ([Measure from a drawing](topic:measure-from-a-drawing)); only on a sheet with a scale |
| `usd_export` | Export | A scaled sheet's measured runs, areas and counts as a 3D check model in USD (`.usdz`, `.usda` or `.usdc`), as {{ui:USD package (.usdz)}} in the 3D check view writes it ([Export the 3D check view as USD](topic:usd)) |

With **Edit** ticked, an assistant adds items and marks (each call one undo step); it cannot move, change or delete marks that are already there.

## If something doesn't work

- **The assistant sees no TakeoffDesk tools:** check that the switch is on in this window, and that the server was started with `npm run mcp`.
- **"needs the export permission":** tick **Export** under {{ui:Assistants}}, then ask again.
- **"401" or "token" errors:** the token changed (`devshell/.mcp-token` was deleted and made again). Copy the new one into the assistant's settings.

## See also

- [Recipes for AI assistants](common:assistants-recipes): worked examples, each with the tools it calls.
