# Design Notes

## Syntax Highlighting via Web Worker (vscode-textmate)

- Replaced shiki with `vscode-textmate@9.3.2` + `vscode-oniguruma` for tokenization
- All tokenization runs in a dedicated Web Worker (`highlight.worker.js`), keeping the main thread unblocked
- WASM binary (`onig.wasm`, ~460 KB) bundled directly in `dist/` and loaded via relative URL — no base64 encoding
- Supports 45 languages with dark+ theme out of the box
- Progressive batch tokenization: yields results in [200, 400, 800, 1600, 2000…] line batches so large files render incrementally
- Stale tokenization requests are cancelled automatically when a newer edit arrives
- `workerUrl` option on `EditorController` lets framework wrappers supply the correct worker path

## Drag-to-Select Auto-Scroll

- When dragging to select text and the pointer approaches within 20px of the top or bottom edge of the editor, the viewport automatically scrolls
- Scroll speed is continuously proportional to the distance between the pointer and the edge trigger zone (linear); speed continues to increase as the pointer moves further past the editor boundary
- Hard cap at 50px/frame (~3000px/s at 60fps) to prevent runaway scrolling
- The selection head updates each frame using the stored pointer position, so the selection extends in real time as the viewport scrolls
- Scrolling stops immediately when the mouse button is released

## Horizontal Scroll

- Lines wider than the viewport create a horizontal scrollbar; the editor scrolls both axes independently
- The gutter (line numbers) stays fixed at the left edge while content scrolls horizontally
- Cursor is automatically scrolled into the visible horizontal range after every edit or navigation
- During drag-to-select, approaching within 20px of the left or right edge triggers edge-accelerated horizontal auto-scroll (same speed profile as vertical: proportional, capped at 50px/frame)
- Text rendering is viewport-aware: only characters within the visible horizontal range are drawn; spans entirely behind the gutter or past the right edge are skipped; half-characters at both boundaries are pixel-clipped via canvas clip region

## `readFromFile(file: File)` API

- New method on `EditorController` for loading a file from disk
- Progressively renders content in [200, 400, 800, 1600] line batches before tokenizing the full file
- File extension is used to auto-detect language
