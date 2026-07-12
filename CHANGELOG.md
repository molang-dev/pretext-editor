# Changelog

All notable changes to `pretext-editor` are documented here.

---

## [0.6.2] — 2026-07-12

### Fixed
- **IME input no longer scrolls the editor to the top** — opening a CJK input method (Chinese, Japanese, Korean) no longer resets the scroll position to the beginning of the file.

---

## [0.6.1] — 2026-07-12

### Fixed
- **Multiple Vue editors on the same page now all highlight correctly** — the shared `eagerWorker` singleton caused the second instance to overwrite the first instance's worker message handler, leaving all but the last-mounted editor without syntax highlighting. Each instance now creates its own worker independently.

---

## [0.6.0] — 2026-07-12

### Added
- **`cursor-change` event** — React (`onCursorChange`), Vue (`cursor-change`), and Svelte (`cursor-change`) wrappers now emit `{ line: number; col: number }` on every cursor position change.
- **Status bar in all demos** — every demo (Vue, React, Svelte, Angular, Vanilla) now shows a bottom status bar with line/column, tab size, encoding, and current language.
- **Unified demo feature set** — React, Svelte, Angular, and Vanilla demos now match the Vue demo: 38 languages, 3 themes, font-size selector, Open File button with auto language detection, and word wrap toggle.

### Fixed
- **Language switch no longer flashes white** — syntax colours are preserved while the new grammar loads; tokens are replaced incrementally as the worker responds instead of clearing all at once.
- **Cursor resets blink on any position change** — clicking or moving the cursor always shows it immediately rather than holding the current blink phase.
- **Deleting the last line(s) immediately repaints** — the canvas now refreshes right away instead of waiting for a worker batch that never arrives when the deletion is at end-of-file.
- **`wordWrap` prop now works in React and Svelte wrappers** — the option was accepted but not forwarded to the controller.

---

## [0.5.0] — 2026-06-24

### Added
- **Search bar** — `Ctrl/Cmd+F` opens a VS Code-style search bar with match highlighting, result navigation (Enter / Shift+Enter), and match count display. The bar floats top-right and does not scroll with content.
- **Replace** — `Ctrl/Cmd+H` opens search with the replace row expanded. Supports single replace (`Enter`) and replace-all (`Ctrl+Alt+Enter`). Includes **Preserve Case** mode that mirrors the original match's case pattern (UPPER / lower / Title).
- **Search toggles** — Match Case (`Alt+C`), Match Whole Word (`Alt+W`), and Use Regex (`Alt+R`) toggles embedded in the find input. Invalid regex shows an inline error line instead of a popup.
- **Progressive async search** — search runs off the main thread in chunks so large files never freeze the UI.
- **`renderSearchBar` prop** — React and Vue wrappers accept an optional render function that receives `SearchState` + `SearchActions`, replacing the built-in search bar entirely.
- **SVG icon system** — 12 icons (chevron, arrows, close, case-sensitive, whole-word, regex, replace, replace-all, preserve-case, text-size, word-wrap) distributed as CSS `mask-image` references to `/icons/*.svg` files. No inline SVG payload in JavaScript bundles.
- **CSS class-based styling** — all inline styles replaced with prefixed CSS classes (`pteic-editor-*`, `pteic-sb-*`, `pteic-cm-*`, `pteic-btn-*`, `pteic-*`) across React, Vue, and Svelte components. CSS is bundled per framework entry (`dist/react/index.css`, `dist/vue/index.css`), and the Svelte component embeds its styles globally.
- **Vue SearchBar** — the Vue wrapper now ships a full built-in search bar (built with `h()` render functions), matching the React implementation.
- **Svelte SearchBar** — the Svelte wrapper includes a full built-in search bar in native Svelte template syntax, plus embedded `:global()` CSS for all editor chrome (icons, context menu, editor shell, search bar).
- **CSS exports** — `package.json` exports `./react/index.css` and `./vue/index.css`.
- **Angular + Vanilla demos with SearchBar** — Angular demo uses `EditorController` directly with a full HTML search bar template; vanilla demo builds a plain-DOM search bar wired to the controller.
- **`EditorController` search API** — `openSearch(query?)`, `closeSearch()`, `setSearchQuery(q)`, `searchNext()`, `searchPrev()`, `setSearchCaseSensitive(v)`, `setSearchWholeWord(v)`, `setSearchUseRegex(v)`, `toggleReplace()`, `setReplaceQuery(q)`, `setPreserveCase(v)`, `replace()`, `replaceAll()`.

### Changed
- **Vanilla demo now includes search bar and keyboard handling** — textarea forwards `keydown` events to `EditorController`; search bar is built with plain DOM and reflects live search state from `ctrl.getState().searchState`.
- **Svelte `tabindex` set to `-1`** on the editor container (`role="textbox"`) to satisfy accessibility linting without stealing focus from the hidden `<textarea>`.
- **Build script copies icons** — `onSuccess` hook copies `src/icons/*.svg` → `dist/icons/` and `src/core/search.ts` → `dist/core/`.

### Fixed
- **Ctrl+F in search input no longer opens browser search** — all framework search bar handlers intercept `Ctrl/Cmd+F` when the find/replace inputs are focused.
- **Svelte search input single-character replacement** — auto-focus+select now only fires when the search bar transitions from closed → open, not on every state change.
- **Focus returns to editor on Escape / close** — closing the search bar returns focus to the hidden `<textarea>` in React, Vue, Svelte, and vanilla.
- **Vanilla demo non-responsive keyboard** — container click handler now unconditionally focuses the textarea (instead of requiring `e.target === container`).
- **Vanilla demo icons** — build script syncs icon SVGs to the correct directory alongside CSS.

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
