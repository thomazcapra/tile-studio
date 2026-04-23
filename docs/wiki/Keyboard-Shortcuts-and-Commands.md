# Keyboard Shortcuts and Commands

This page documents the default keyboard controls and how shortcut customization works.

## Shortcut System Overview

Tile Studio has a real shortcut registry rather than a few hard-coded keys. Most actions in the app can be rebound from `Edit -> Preferences -> Shortcuts`.

Shortcuts are grouped into these categories:

- file
- edit
- view
- tool
- selection
- frame
- tilemap

Some keys are still intentionally context-sensitive. The biggest examples are the arrow keys, which can navigate frames or nudge selected content depending on what is active.

## Command Palette

Press `Ctrl+K` to open the command palette.

The command palette lets you:

- search actions by name
- browse actions grouped by section
- execute menu-like actions without leaving the keyboard

It includes commands from file, edit, select, view, sprite, layer, frame, and tool workflows.

## Default File Shortcuts

- `Ctrl+S` save project
- `Ctrl+Shift+O` open project
- `Ctrl+Shift+E` open export dialog
- `Ctrl+K` open command palette

`Ctrl+N` is intentionally left unbound by default because browsers typically reserve it for opening a new window.

## Default Edit and Selection Shortcuts

- `Ctrl+Z` undo
- `Ctrl+Shift+Z` redo
- `Ctrl+A` select all
- `Ctrl+D` deselect
- `Ctrl+Shift+I` invert selection
- `Ctrl+X` cut
- `Ctrl+C` copy
- `Ctrl+V` paste
- `Delete` delete selection contents

## Default Tool Shortcuts

- `B` pencil
- `E` eraser
- `G` fill
- `I` eyedropper
- `L` line
- `U` rectangle
- `Shift+U` filled rectangle
- `D` gradient
- `T` text
- `S` slice
- `M` rectangle select
- `Shift+M` ellipse select
- `Q` lasso
- `W` magic wand

## Default Brush and Color Shortcuts

- `[` smaller brush
- `]` larger brush
- `X` swap primary and secondary colors
- `P` toggle pixel-perfect mode

## Default View Shortcuts

- `0` fit to window
- `1` zoom to 100%
- `2` zoom to 200%
- `4` zoom to 400%
- `+` zoom in
- `-` zoom out
- `O` toggle onion skin
- `N` toggle tile numbers
- `Tab` toggle distraction-free mode

## Frame and Playback Shortcuts

- `Space` play or pause
- `ArrowLeft` previous frame when no selection or tile region is active
- `ArrowRight` next frame when no selection or tile region is active

## Tilemap Shortcuts

These only matter when working in tilemap mode:

- `F` toggle horizontal flip on the tile brush
- `V` toggle vertical flip on the tile brush
- `R` toggle diagonal flip on the tile brush

## Context-Sensitive Keys

Some keys change meaning based on editor state.

### Arrow keys

Arrow keys behave in this order of priority:

1. If a raster selection exists, they nudge the selection contents.
2. If a tilemap region exists, they nudge the tile region.
3. Otherwise they navigate frames.

Holding `Shift` increases nudge distance.

### Escape

`Escape` clears an active raster selection or tile region instead of acting like a generic cancel command.

## Rebinding Shortcuts

Open `Edit -> Preferences -> Shortcuts` to edit bindings.

The shortcut editor supports:

- filtering the action list
- capturing a new key combo
- clearing a binding with `Backspace` or `Delete`
- canceling capture with `Escape`
- resetting one action to default
- resetting the whole shortcut map

If you assign a combo that another action is already using, the previous action is cleared so the new one becomes the owner of that shortcut.

## Shortcuts vs Hard-Coded Behavior

Most actions are part of the editable shortcut registry. Some interaction rules remain hard-coded because they depend on context:

- arrow-key nudging
- arrow-key frame stepping
- selection and tile-region clearing with `Escape`

That split is intentional and keeps the shortcut model predictable.
