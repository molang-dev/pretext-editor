import { defineComponent, h, ref, onMounted, onBeforeUnmount, watch, reactive, computed, type SetupContext } from 'vue'
import { EditorController } from '../controller/EditorController'
import {
  FONT_SIZE_TO_LINE_HEIGHT,
  DEFAULT_FONT_SIZE,
  DEFAULT_FONT_FAMILY,
  DEFAULT_TAB_SIZE,
} from '../core/renderer'
import type { EditorControllerState, PretextEditorHandle, IEditorBinding, ContextMenuBuiltins, ContextMenuItem } from '../controller/EditorController'

const ctxMenuStyle: Record<string, string> = {
  position: 'fixed',
  background: '#252526',
  border: '1px solid #454545',
  borderRadius: '8px',
  padding: '4px 0',
  zIndex: '9999',
  minWidth: '160px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
  userSelect: 'none',
}

export const PretextEditor = defineComponent({
  name: 'PretextEditor',
  props: {
    value: { type: String, required: true },
    language: { type: String, default: undefined },
    fontSize: { type: Number, default: DEFAULT_FONT_SIZE },
    fontFamily: { type: String, default: DEFAULT_FONT_FAMILY },
    tabSize: { type: Number, default: DEFAULT_TAB_SIZE },
    binding: { type: Object as () => import('../controller/EditorController').IEditorBinding | undefined, default: undefined },
    active: { type: Boolean, default: false },
    contextMenuItems: { type: Function, default: undefined },
  },
  emits: ['update:value'],
  setup(
    props: {
      value: string
      language?: string
      fontSize: number
      fontFamily: string
      tabSize: number
      binding?: IEditorBinding
      active: boolean
      contextMenuItems?: (builtins: ContextMenuBuiltins) => ContextMenuItem[]
    },
    { emit, expose }: SetupContext<{ 'update:value': (value: string) => void }>,
  ) {
    const containerRef = ref<HTMLDivElement>()
    const canvasRef = ref<HTMLCanvasElement>()
    const textareaRef = ref<HTMLTextAreaElement>()
    let ctrl: EditorController | null = null

    const state = reactive<EditorControllerState>({
      doc: { lines: [], cursor: { line: 0, col: 0 } },
      selAnchor: null,
      extraCursors: [],
      tokenLines: undefined,
      menuPos: null,
      menuItems: [],
      searchState: { query: '', caseSensitive: false, wholeWord: false, useRegex: false, matchCount: 0, currentIndex: -1, isOpen: false, regexError: null, showReplace: false, replaceQuery: '', preserveCase: false },
    })

    const lineHeight = computed(() => FONT_SIZE_TO_LINE_HEIGHT(props.fontSize))
    const totalHeight = computed(() => Math.max(1, state.doc.lines.length) * lineHeight.value + 16)

    const onStateChange = () => {
      const s = ctrl!.getState()
      Object.assign(state, s)
    }

    onMounted(() => {
      ctrl = new EditorController({
        value: props.value,
        onChange: (v) => emit('update:value', v),
        language: props.language,
        fontSize: props.fontSize,
        fontFamily: props.fontFamily,
        tabSize: props.tabSize,
        binding: props.binding,
        active: props.active,
        contextMenuItems: props.contextMenuItems as any,
      })
      ctrl.mount(containerRef.value!, canvasRef.value!, textareaRef.value!, onStateChange)
    })

    onBeforeUnmount(() => {
      ctrl?.destroy()
      ctrl = null
    })

    watch(() => props.value, (v: string) => ctrl?.setValue(v))
    watch([() => props.language, () => props.fontSize, () => props.fontFamily, () => props.tabSize], () => {
      ctrl?.updateOptions({ language: props.language, fontSize: props.fontSize, fontFamily: props.fontFamily, tabSize: props.tabSize })
    })

    const onKeyDown = (e: KeyboardEvent) => ctrl?.onKeyDown(e)
    const onCompositionStart = () => ctrl?.onCompositionStart()
    const onCompositionEnd = (e: CompositionEvent) => ctrl?.onCompositionEnd(e)
    const onContainerClick = (e: MouseEvent) => {
      if (e.target === containerRef.value) textareaRef.value?.focus({ preventScroll: true })
    }

    expose({
      getTopLine: () => ctrl?.getHandle().getTopLine() ?? 0,
      scrollToLine: (line: number) => ctrl?.getHandle().scrollToLine(line),
      getVisibleLines: () => ctrl?.getHandle().getVisibleLines() ?? { from: 0, to: 0 },
    } satisfies PretextEditorHandle)

    return () => {
      const children: any[] = [
        h('div', {
          style: { height: totalHeight.value + 'px', position: 'relative' },
        }, [
          h('canvas', {
            ref: canvasRef,
            style: { position: 'sticky', top: '0', display: 'block', width: '100%' },
          }),
        ]),
      ]

      // Context menu
      if (state.menuPos) {
        children.push(
          h('div', {
            style: {
              ...ctxMenuStyle,
              left: state.menuPos.x + 'px',
              top: state.menuPos.y + 'px',
            },
          }, state.menuItems.map((item: ContextMenuItem) => {
            if (item.separator) {
              return h('div', {
                style: { height: '1px', background: '#454545', margin: '4px 0' },
              })
            }
            return h('div', {
              onClick: () => {
                if (!item.disabled) {
                  item.onClick()
                  ctrl?.closeMenu()
                }
              },
              key: item.label,
              style: {
                padding: '5px 20px',
                fontSize: '13px',
                color: item.disabled ? '#5a5a5a' : '#cccccc',
                cursor: item.disabled ? 'default' : 'pointer',
                background: 'transparent',
              },
            }, item.label)
          })),
        )
      }

      // Hidden textarea
      children.push(
        h('textarea', {
          ref: textareaRef,
          rows: 1,
          style: {
            position: 'absolute', top: '0', left: '0', width: '1px', height: '1px',
            opacity: '0', overflow: 'hidden', resize: 'none', border: 'none',
            outline: 'none', padding: '0', pointerEvents: 'none',
          },
          autocomplete: 'off',
          autocorrect: 'off',
          autocapitalize: 'off',
          spellcheck: 'false',
          onKeydown: onKeyDown,
          onCompositionstart: onCompositionStart,
          onCompositionend: onCompositionEnd,
        }),
      )

      return h('div', {
        ref: containerRef,
        style: {
          position: 'relative', overflow: 'auto', height: '100%', width: '100%',
          outline: 'none', cursor: 'text',
        },
        onClick: onContainerClick,
      }, children)
    }
  },
})
