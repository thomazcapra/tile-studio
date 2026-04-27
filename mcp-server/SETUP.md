# Setup: Tile Studio MCP + Companion Free Skills

This doc walks through wiring the **Tile Studio MCP server** plus the three free skills you picked into Claude Desktop / Cowork. Together they cover: native Tile Studio engine ops, Aseprite-driven generation, lightweight Claude-only sprite generation, and Gemini-powered raster gen feeding into the dedup pipeline.

## What you're installing

| Component | Type | What it does | Cost |
| --- | --- | --- | --- |
| **tile-studio-mcp** (this repo) | MCP server | Native engine for paint, dedup, autotile, quantize, export, .tstudio I/O | Free |
| **willibrandon/pixel-plugin** | Claude Code plugin | Drives Aseprite via natural language (animation, palettes, dithering) | Free, requires Aseprite |
| **thejacedev/pixel-art-gen** | Claude Code skill | Pure Claude pixel-art generation (no external deps) | Free |
| **seanlan-game-asset-design** | Claude Code plugin | Gemini image gen + asset pipeline + web UI | Free skill, paid Gemini |
| **Aseprite** | Editor | The actual pixel editor that pixel-plugin drives | $20 on Steam, or compile from MIT-licensed source for free |

You picked **Aseprite** as the cleanup editor — pixel-plugin will drive it for everything Tile Studio doesn't cover (interactive painting, dithering, GIF preview, etc.).

## Step 1 — Install Tile Studio MCP dependencies

```bash
cd C:\Users\thoma\Documents\Projects\tile-studio\mcp-server
npm install
npm run typecheck   # optional sanity check; should print nothing on success
```

Smoke-test that it boots and registers tools:

```bash
npm run inspect     # opens the MCP Inspector against this server
```

## Step 2 — Install the companion free Claude Code plugins

```bash
# willibrandon's pixel-plugin (Aseprite-driven)
claude plugin install github:willibrandon/pixel-plugin

# thejacedev's pixel-art-gen (Claude-only, no deps)
claude plugin install github:thejacedev/claude-code-skills --skill pixel-art-gen

# seanlan-game-asset-design (Gemini-powered)
pip install git+https://github.com/seanlan/GameAssetDesign.git
```

If `claude plugin install` doesn't recognize the source, fall back to manual installs by cloning the repos and pointing your Claude Code config at the local `.claude/skills/` paths.

## Step 3 — Get a free Aseprite

Two options. Pick one:

**Option A: pay $20 on Steam** — simplest, you also support the original author David Capello.

**Option B: compile from source** (free for personal use; the source is MIT-licensed, only redistribution of binaries is restricted):

```bash
git clone --recursive https://github.com/aseprite/aseprite.git
cd aseprite
# Follow the platform-specific build steps in INSTALL.md
```

Then put the resulting binary on your `PATH` so pixel-plugin can find it.

## Step 4 — Get your Gemini API key

You said you have a paid Gemini account. Generate a key at <https://aistudio.google.com/apikey> and stash it in an env var. Both `tile-studio-mcp` and `seanlan-game-asset-design` will read `GEMINI_API_KEY` (we also accept `GOOGLE_API_KEY` as a fallback).

```powershell
# Windows (persistent)
[Environment]::SetEnvironmentVariable("GEMINI_API_KEY", "your-key", "User")
```

## Step 5 — Wire everything into Claude Desktop / Cowork

Add this to `claude_desktop_config.json` (paths vary by OS — see Anthropic's docs):

```jsonc
{
  "mcpServers": {
    "tile-studio": {
      "command": "npx",
      "args": [
        "tsx",
        "C:\\Users\\thoma\\Documents\\Projects\\tile-studio\\mcp-server\\src\\index.ts"
      ],
      "env": {
        "GEMINI_API_KEY": "your-key-here"
      }
    },
    "pixel-plugin": {
      "command": "node",
      "args": ["C:\\Users\\thoma\\.claude\\plugins\\willibrandon-pixel-plugin\\dist\\index.js"]
    }
  }
}
```

The skills (`pixel-art-gen`, `seanlan-game-asset-design`) are picked up automatically once installed via `claude plugin install` — they don't need MCP server entries.

Restart Claude Desktop / Cowork. You should see ~32 `tile-studio_*` tools, plus the pixel-plugin tools, in the tool list.

## Step 6 — Sanity-check the whole stack

After restart, ask Claude something like:

> Use `gemini_to_tileset` with the prompt "16-color forest tileset, 16×16 pixel art, top-down view, grass dirt water stone tiles" to generate a tileset, save it as `nexus-survival/assets/forest.tstudio`, and export a Tiled .tmj into `nexus-survival/assets/maps/forest/`.

If that returns file paths, all four pieces are talking. If `gemini_to_tileset` errors out with "no API key", revisit Step 4.

## How the pieces work together

```
                   ┌─ Tile Studio MCP (this repo)
                   │     • paint primitives
                   │     • dedup, autotile, quantize
                   │     • .tstudio + Tiled/Phaser export
                   │
You ask Claude ──┼─ pixel-plugin (Aseprite)
                   │     • interactive cleanup, dithering, GIF
                   │     • complex palette work
                   │
                   ├─ pixel-art-gen (Claude only)
                   │     • lightweight quick sprites
                   │     • no deps, no API costs
                   │
                   └─ seanlan-game-asset-design + Gemini
                         • prompt → raster image
                         • feeds into Tile Studio MCP for dedup
```

Typical workflow for a new biome in nexus-survival:

1. **Generate** raster art via Gemini (`gemini_to_tileset`) — coarse, organic.
2. **Quantize + dedup** in Tile Studio MCP — produces a clean tileset.
3. **Polish** any rough tiles via pixel-plugin → Aseprite if needed.
4. **Export** Tiled `.tmj` and a Phaser-compatible sprite sheet straight into `nexus-survival/assets/`.
