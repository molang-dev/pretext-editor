// CSS side-effect imports — consumer bundlers pick these up automatically
import '../styles/icons.css'
import '../styles/editor.css'
import '../styles/context-menu.css'
import '../styles/search-bar.css'

export { PretextEditor } from './PretextEditor'
export type { PretextEditorProps, ContextMenuItem, ContextMenuBuiltins, IEditorBinding, PretextEditorHandle } from '../controller/EditorController'
export type { SearchState, SearchActions } from '../core/search'
