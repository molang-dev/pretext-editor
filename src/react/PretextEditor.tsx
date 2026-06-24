import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useReducer,
  useRef,
} from 'react'
import { ContextMenu } from './ContextMenu'
import { SearchBar } from './SearchBar'
import '../styles/editor.css'
import { EditorController } from '../controller/EditorController'
import type { EditorControllerState } from '../controller/EditorController'
import type { SearchState, SearchActions } from '../core/search'
import {
  PADDING_TOP,
  FONT_SIZE_TO_LINE_HEIGHT,
  DEFAULT_FONT_SIZE,
  DEFAULT_FONT_FAMILY,
  DEFAULT_TAB_SIZE,
} from '../core/renderer'

export type {
  ContextMenuItem,
  ContextMenuBuiltins,
  IEditorBinding,
  PretextEditorHandle,
} from '../controller/EditorController'
export type { SearchState, SearchActions } from '../core/search'

export interface PretextEditorProps {
  value: string
  onChange: (value: string) => void
  language?: string
  fontSize?: number
  fontFamily?: string
  tabSize?: number
  className?: string
  style?: React.CSSProperties
  binding?: import('../controller/EditorController').IEditorBinding
  active?: boolean
  contextMenuItems?: (
    builtins: import('../controller/EditorController').ContextMenuBuiltins,
  ) => import('../controller/EditorController').ContextMenuItem[]
  renderSearchBar?: (state: SearchState, actions: SearchActions) => React.ReactNode
}

export const PretextEditor = forwardRef<
  import('../controller/EditorController').PretextEditorHandle,
  PretextEditorProps
>(function PretextEditor(
  {
    value,
    onChange,
    language,
    fontSize = DEFAULT_FONT_SIZE,
    fontFamily = DEFAULT_FONT_FAMILY,
    tabSize = DEFAULT_TAB_SIZE,
    className,
    style,
    binding,
    active,
    contextMenuItems,
    renderSearchBar,
  }: PretextEditorProps,
  ref,
): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const ctrlRef = useRef<EditorController | null>(null)
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0)
  const stateRef = useRef<EditorControllerState | null>(null)

  const onStateChange = useCallback(() => {
    stateRef.current = ctrlRef.current!.getState()
    forceUpdate()
  }, [])

  // Mount controller
  // REVIEW: useEffect used because controller lifecycle (DOM mount + listeners) must run after render
  useEffect(() => {
    const ctrl = new EditorController({
      value,
      onChange,
      language,
      fontSize,
      fontFamily,
      tabSize,
      binding,
      active,
      contextMenuItems,
    })
    ctrl.mount(containerRef.current!, canvasRef.current!, textareaRef.current!, onStateChange)
    ctrlRef.current = ctrl
    return () => ctrl.destroy()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync props into controller
  useLayoutEffect(() => {
    ctrlRef.current?.updateOptions({ language, fontSize, fontFamily, tabSize, binding, active, contextMenuItems })
  }, [language, fontSize, fontFamily, tabSize, binding, active, contextMenuItems])

  useLayoutEffect(() => {
    ctrlRef.current?.setValue(value)
  }, [value])

  // Sync onChange callback (avoid stale closure)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  useEffect(() => {
    if (ctrlRef.current) ctrlRef.current.onChange = (v: string) => onChangeRef.current(v)
  }, [])

  useImperativeHandle(ref, () => ctrlRef.current?.getHandle() ?? ({} as any), [])

  const state = stateRef.current
  const lineHeight = FONT_SIZE_TO_LINE_HEIGHT(fontSize)
  const totalHeight = state ? Math.max(1, state.doc.lines.length) * lineHeight + PADDING_TOP * 2 : 0

  const searchActions: SearchActions = {
    setQuery: (q) => ctrlRef.current?.setSearchQuery(q),
    next: () => ctrlRef.current?.searchNext(),
    prev: () => ctrlRef.current?.searchPrev(),
    close: () => {
      ctrlRef.current?.closeSearch()
      textareaRef.current?.focus({ preventScroll: true })
    },
    setCaseSensitive: (v) => ctrlRef.current?.setSearchCaseSensitive(v),
    setWholeWord: (v) => ctrlRef.current?.setSearchWholeWord(v),
    setUseRegex: (v) => ctrlRef.current?.setSearchUseRegex(v),
    toggleReplace: () => ctrlRef.current?.toggleReplace(),
    setReplaceQuery: (q) => ctrlRef.current?.setReplaceQuery(q),
    setPreserveCase: (v) => ctrlRef.current?.setPreserveCase(v),
    replace: () => ctrlRef.current?.replace(),
    replaceAll: () => ctrlRef.current?.replaceAll(),
  }

  const searchNode = state?.searchState
    ? (renderSearchBar
        ? renderSearchBar(state.searchState, searchActions)
        : <SearchBar state={state.searchState} actions={searchActions} />)
    : null

  return (
    <div
      className={`pteic-editor-root${className ? ' ' + className : ''}`}
      style={style}
    >
      <div
        ref={containerRef}
        className="pteic-editor-scroll"
        onClick={(e) => {
          if (e.target === containerRef.current) textareaRef.current?.focus({ preventScroll: true })
        }}
      >
        <div className="pteic-editor-content" style={{ height: totalHeight }}>
          <canvas ref={canvasRef} className="pteic-editor-canvas" />
        </div>

        {state?.menuPos && (
          <ContextMenu
            x={state.menuPos.x}
            y={state.menuPos.y}
            items={state.menuItems}
            onClose={() => ctrlRef.current?.closeMenu()}
          />
        )}

        <textarea
          ref={textareaRef}
          rows={1}
          className="pteic-editor-textarea"
          onKeyDown={(e) => ctrlRef.current?.onKeyDown(e.nativeEvent)}
          onCompositionStart={() => ctrlRef.current?.onCompositionStart()}
          onCompositionEnd={(e) => ctrlRef.current?.onCompositionEnd(e.nativeEvent)}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />
      </div>

      {searchNode}
    </div>
  )
})
