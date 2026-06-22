# Changelog

All notable changes to `pretext-editor` are documented here.

---

## [0.4.0] — 2026-06-19

### Added
- **Multi-cursor — select next / all occurrences**
  - `Ctrl/⌘ + D` — first press selects the word under cursor; each subsequent press adds the next occurrence as an extra cursor with selection (wraps around, skips already-selected matches)
  - `Ctrl/⌘ + Shift + L` — selects every occurrence of the current word or selection at once; primary cursor lands on the first match, all others become extra cursors
- **Multi-cursor — keyboard**
  - `Ctrl + Alt + ↑ / ↓` — add cursor on the line above / below the topmost / bottommost existing cursor; press repeatedly to keep extending
- **Column (box) selection**
  - `Alt + Shift + Click` — create a column selection from the primary cursor to the click position; one cursor per line in the range, each with a horizontal selection
  - `Alt + Shift + Drag` — extend the column selection as the pointer moves

### Fixed
- **Cursor blinking** — all cursors (primary and extra) now blink at 530 ms. The cursor is always shown immediately after any keystroke or mouse action, then continues blinking from that point.
- **Single click resets to single-cursor mode** — any click without `Alt` (including `Shift+Click`, double-click, triple-click) clears all extra cursors and column selections.
- **Current-line background hidden when selection is active** — matches VS Code behaviour; the highlight is only drawn when the cursor is collapsed (no selection). Triple-click line-select no longer incorrectly highlights the line the cursor lands on.
- **`Ctrl + Alt + ↑ / ↓` continuous extension** — pressing repeatedly now keeps adding cursors further above / below instead of stopping at the second line.

---

## [0.3.1] — 2026-06-18

### Added
- **Multi-line indent / dedent** — `Tab` / `Shift+Tab` with a multi-line selection indents or dedents all selected lines simultaneously; tokenisation patch applied synchronously to prevent a stale-highlight flash.
- **Multi-cursor — Alt+Click** — `Alt + Click` toggles an extra cursor at the click position; all editing operations (type, backspace, delete, enter, tab) execute at every cursor simultaneously via text-offset arithmetic.
- **Full VS Code / Monaco keyboard shortcut set**
  - Navigation: `Ctrl+←/→` (word), `Ctrl+Home/End` (file), `Page Up/Down`
  - Editing: `Ctrl+Backspace/Delete` (delete word), `Ctrl+Enter` / `Ctrl+Shift+Enter` (insert line below / above), `Ctrl+Shift+K` (delete line), `Alt+↑/↓` (move lines), `Alt+Shift+↑/↓` (copy lines), `Ctrl+/` (toggle line comment)
  - Selection: `Ctrl+L` (select line), `Ctrl+X` without selection (cut line)
  - Mouse: double-click (select word), triple-click (select line)
- **Escape** — clears all extra cursors and returns to single-cursor mode.

### Fixed
- **Monaco-style stale token extension** — when `useDeferredValue` tokenisation lags behind rapid typing, the renderer extends the last span's colour instead of falling back to the default foreground colour, eliminating the white flash.

---

## [0.3.0] — 2026-06-17

### Changed
- README rewrite — documented installation, props, imperative handle API, and keyboard shortcut table.

---

## [0.2.0] — 2026-06-17

### Fixed
- `DEFAULT_FONT_FAMILY` corrected to the full monospace fallback stack (`Menlo, Monaco, "Courier New", monospace`).
- `fontSize` and `fontFamily` are now component-level defaults (14 px / full stack) instead of being hardcoded only in the renderer.

---

## [0.1.0] — 2026-06-15

### Added
- Canvas 2D virtual rendering — only visible lines are drawn; O(visible lines) cost regardless of file size.
- Core text model: `Doc = { lines: string[]; cursor: Cursor }`, functional document operations.
- Basic editing: insert characters, backspace, delete, newline, undo / redo.
- Mouse: click to place cursor, drag to select, `Shift+Click` to extend selection.
- Clipboard: `Ctrl+C` copy, `Ctrl+X` cut, `Ctrl+V` paste.
- Monaco-style indent guides — bracket-pair active guide highlight, auto-detected indent unit per file.
- `tabSize`, `fontSize`, `fontFamily` props; `PretextEditorHandle` ref with `getTopLine()` / `scrollToLine()`.
- Hidden `<textarea>` captures keyboard events and IME composition.
