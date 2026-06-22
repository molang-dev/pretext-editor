import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react'
import { ContextMenu } from './ContextMenu'
import { EditorController } from '../controller/EditorController'
import type { EditorControllerState } from '../controller/EditorController'
import type { TokenizedLine } from '../core/renderer'
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

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        position: 'relative',
        overflow: 'auto',
        height: '100%',
        width: '100%',
        outline: 'none',
        cursor: 'text',
        ...style,
      }}
      onClick={(e) => {
        if (e.target === containerRef.current) textareaRef.current?.focus({ preventScroll: true })
      }}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <canvas
          ref={canvasRef}
          style={{ position: 'sticky', top: 0, display: 'block', width: '100%' }}
        />
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
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: 1,
          height: 1,
          opacity: 0,
          overflow: 'hidden',
          resize: 'none',
          border: 'none',
          outline: 'none',
          padding: 0,
          pointerEvents: 'none',
        }}
        onKeyDown={(e) => ctrlRef.current?.onKeyDown(e.nativeEvent)}
        onCompositionStart={() => ctrlRef.current?.onCompositionStart()}
        onCompositionEnd={(e) => ctrlRef.current?.onCompositionEnd(e.nativeEvent)}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
      />
    </div>
  )
})
