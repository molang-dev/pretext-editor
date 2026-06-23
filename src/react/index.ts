// React entry — exports the PretextEditor React component
export { PretextEditor } from './PretextEditor'
export type { PretextEditorProps, PretextEditorHandle, IEditorBinding, ContextMenuItem, ContextMenuBuiltins, SearchState, SearchActions } from './PretextEditor'
export { SearchBar } from './SearchBar'
// Re-export core for convenience
export { EditorController } from '../controller/EditorController'
export type { EditorControllerState, EditorControllerOptions, CursorSlot } from '../controller/EditorController'
export {
  fromString, toString, insert,
  deleteBackward, deleteForward, deleteWordBackward, deleteWordForward,
  moveCursor, moveToLineStart, moveToLineEnd, moveToFileStart, moveToFileEnd,
  moveWordLeft, moveWordRight,
  getSelectedText, deleteSelectedText, isCollapsed, normalizeSelection,
  deleteLine, moveLines, copyLines,
  insertLineBelow, insertLineAbove,
  toggleLineComment, findNextOccurrence, findAllOccurrences,
  selectCurrentLine, selectWordAtCursor,
} from '../core/document'
export type { Doc, Cursor, Selection } from '../core/document'
export { extToLang } from '../core/tokenizer'
export { FONT_SIZE_TO_LINE_HEIGHT, DEFAULT_FONT_SIZE, DEFAULT_FONT_FAMILY, DEFAULT_TAB_SIZE, PADDING_LEFT, PADDING_TOP } from '../core/renderer'
export type { TokenSpan, TokenizedLine } from '../core/renderer'
