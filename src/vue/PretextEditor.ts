import { defineComponent, h, ref, onMounted, onBeforeUnmount, watch, reactive, type SetupContext, type PropType } from 'vue'
import { EditorController } from '../controller/EditorController'
import {
  DEFAULT_FONT_SIZE,
  DEFAULT_FONT_FAMILY,
  DEFAULT_TAB_SIZE,
} from '../core/renderer'
import type {
  EditorControllerState,
  PretextEditorHandle,
  IEditorBinding,
  ContextMenuBuiltins,
  ContextMenuItem,
} from '../controller/EditorController'
import type { SearchState, SearchActions } from '../core/search'

// Shared CSS — tsup bundles these into dist/vue/index.css
import '../styles/icons.css'

// Worker URL: '../highlight.worker.js' is correct relative to dist/vue/index.js (the bundle output)
const WORKER_URL = new URL('../highlight.worker.js', import.meta.url)
// Eagerly start the worker so WASM compiles in parallel with Vue initialization
const eagerWorker = typeof Worker !== 'undefined' ? new Worker(WORKER_URL, { type: 'module' }) : null
import '../styles/editor.css'
import '../styles/context-menu.css'
import '../styles/search-bar.css'

// ---- Search bar icon helpers (h()-based) ----

function IconSpan(icon: string) {
  return h('span', { class: `pteic pteic-${icon}` })
}

function IconBtn(
  props: { title: string; active?: boolean; disabled?: boolean; narrow?: boolean; onClick: () => void },
  children: any,
) {
  return h('button', {
    title: props.title,
    disabled: props.disabled,
    onClick: props.onClick,
    class: `pteic-btn${props.narrow ? ' pteic-btn--narrow' : ''}${props.active ? ' pteic-btn--active' : ''}`,
  }, children)
}

// ---- Component ----

export const PretextEditor = defineComponent({
  name: 'PretextEditor',
  props: {
    value: { type: String, required: true },
    language: { type: String, default: undefined },
    fontSize: { type: Number, default: DEFAULT_FONT_SIZE },
    fontFamily: { type: String, default: DEFAULT_FONT_FAMILY },
    tabSize: { type: Number, default: DEFAULT_TAB_SIZE },
    binding: { type: Object as () => IEditorBinding | undefined, default: undefined },
    active: { type: Boolean, default: false },
    contextMenuItems: { type: Function as PropType<(builtins: ContextMenuBuiltins) => ContextMenuItem[]>, default: undefined },
    renderSearchBar: { type: Function as PropType<(state: SearchState, actions: SearchActions) => any>, default: undefined },
    theme: { type: String, default: 'dark-plus' },
    wordWrap: { type: Boolean, default: false },
  },
  emits: ['update:value', 'cursor-change'],
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
      renderSearchBar?: (state: SearchState, actions: SearchActions) => any
      theme: string
      wordWrap: boolean
    },
    { emit, expose }: SetupContext<{ 'update:value': (value: string) => void; 'cursor-change': (cursor: { line: number; col: number }) => void }>,
  ) {
    const containerRef = ref<HTMLDivElement>()
    const contentRef = ref<HTMLDivElement>()
    const canvasRef = ref<HTMLCanvasElement>()
    const textareaRef = ref<HTMLTextAreaElement>()
    const ctxMenuRef = ref<HTMLDivElement>()
    const findRef = ref<HTMLInputElement>()
    const replaceRef = ref<HTMLInputElement>()
    let ctrl: EditorController | null = null

    // Close context menu when clicking outside
    const onWindowPointerDown = (e: PointerEvent) => {
      if (ctxMenuRef.value && !ctxMenuRef.value.contains(e.target as Node)) {
        ctrl?.closeMenu()
      }
    }

    const state = reactive<EditorControllerState>({
      doc: { lines: [], cursor: { line: 0, col: 0 } },
      selAnchor: null,
      extraCursors: [],
      tokenLines: undefined,
      menuPos: null,
      menuItems: [],
      searchState: {
        query: '', caseSensitive: false, wholeWord: false, useRegex: false,
        matchCount: 0, currentIndex: -1, isOpen: false, regexError: null,
        showReplace: false, replaceQuery: '', preserveCase: false,
        focusToken: 0,
      },
    })

    const onStateChange = () => {
      const s = ctrl!.getState()
      Object.assign(state, s)
      emit('cursor-change', s.doc.cursor)
      // Focus find input when search bar opens
      if (s.searchState.isOpen && !state.searchState.isOpen === false) {
        // search was just opened — handled by the next tick watcher
      }
    }

    // ---- Search actions (delegate to controller) ----

    const searchActions: SearchActions = {
      setQuery: (q) => ctrl?.setSearchQuery(q),
      next: () => ctrl?.searchNext(),
      prev: () => ctrl?.searchPrev(),
      close: () => ctrl?.closeSearch(),
      setCaseSensitive: (v) => ctrl?.setSearchCaseSensitive(v),
      setWholeWord: (v) => ctrl?.setSearchWholeWord(v),
      setUseRegex: (v) => ctrl?.setSearchUseRegex(v),
      toggleReplace: () => ctrl?.toggleReplace(),
      setReplaceQuery: (q) => ctrl?.setReplaceQuery(q),
      setPreserveCase: (v) => ctrl?.setPreserveCase(v),
      replace: () => ctrl?.replace(),
      replaceAll: () => ctrl?.replaceAll(),
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
        worker: eagerWorker ?? undefined,
        workerUrl: WORKER_URL,
        theme: props.theme,
        wordWrap: props.wordWrap,
      })
      ctrl.mount(containerRef.value!, canvasRef.value!, textareaRef.value!, onStateChange, contentRef.value!)
      window.addEventListener('pointerdown', onWindowPointerDown, { capture: true })
    })

    onBeforeUnmount(() => {
      window.removeEventListener('pointerdown', onWindowPointerDown, { capture: true })
      ctrl?.destroy()
      ctrl = null
    })

    watch(() => props.value, (v: string) => ctrl?.setValue(v))
    watch([() => props.language, () => props.fontSize, () => props.fontFamily, () => props.tabSize, () => props.theme, () => props.wordWrap], () => {
      ctrl?.updateOptions({
        language: props.language,
        fontSize: props.fontSize,
        fontFamily: props.fontFamily,
        tabSize: props.tabSize,
        theme: props.theme,
        wordWrap: props.wordWrap,
      })
    })

    // Auto-focus find input when search opens, return focus when it closes
    watch(() => state.searchState.isOpen, (open, wasOpen) => {
      if (open) {
        requestAnimationFrame(() => {
          findRef.value?.focus()
          findRef.value?.select()
        })
      } else if (wasOpen) {
        textareaRef.value?.focus({ preventScroll: true })
      }
    })

    // Re-focus find input when Ctrl+F re-triggers while search is already open
    watch(() => state.searchState.focusToken, () => {
      if (state.searchState.isOpen) {
        requestAnimationFrame(() => {
          findRef.value?.focus()
          findRef.value?.select()
        })
      }
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

    // ---- Search bar keyboard handlers ----

    function handleFindKeyDown(e: KeyboardEvent) {
      // Block browser Ctrl+F / Cmd+F when search input is focused
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); return }
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        const k = e.key.toLowerCase()
        if (k === 'c') { e.preventDefault(); searchActions.setCaseSensitive(!state.searchState.caseSensitive); return }
        if (k === 'w') { e.preventDefault(); searchActions.setWholeWord(!state.searchState.wholeWord); return }
        if (k === 'r') { e.preventDefault(); searchActions.setUseRegex(!state.searchState.useRegex); return }
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        e.shiftKey ? searchActions.prev() : searchActions.next()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        searchActions.close()
        textareaRef.value?.focus({ preventScroll: true })
      }
      e.stopPropagation()
    }

    function handleReplaceKeyDown(e: KeyboardEvent) {
      // Block browser Ctrl+F / Cmd+F when search input is focused
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); return }
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        const k = e.key.toLowerCase()
        if (k === 'c') { e.preventDefault(); searchActions.setCaseSensitive(!state.searchState.caseSensitive); return }
        if (k === 'w') { e.preventDefault(); searchActions.setWholeWord(!state.searchState.wholeWord); return }
        if (k === 'r') { e.preventDefault(); searchActions.setUseRegex(!state.searchState.useRegex); return }
      }
      if ((e.ctrlKey || e.metaKey) && e.altKey && e.key === 'Enter') {
        e.preventDefault()
        searchActions.replaceAll()
      } else if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        searchActions.replace()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        searchActions.close()
        textareaRef.value?.focus({ preventScroll: true })
      }
      e.stopPropagation()
    }

    // ---- Render ----

    return () => {
      const ss = state.searchState
      const hasError = !!ss.regexError
      const noMatches = !!ss.query && !hasError && ss.matchCount === 0
      const countText = hasError
        ? ''
        : ss.matchCount === 0
          ? (ss.query ? 'No results' : '')
          : `${ss.currentIndex + 1} of ${ss.matchCount > 999 ? '999+' : ss.matchCount}`

      const children: any[] = [
        h('div', { ref: contentRef, class: 'pteic-editor-content' }, [
          h('canvas', { ref: canvasRef, class: 'pteic-editor-canvas' }),
        ]),
      ]

      // Context menu
      if (state.menuPos) {
        children.push(
          h('div', {
            ref: ctxMenuRef,
            class: 'pteic-cm',
            style: { left: state.menuPos.x + 'px', top: state.menuPos.y + 'px' },
          }, state.menuItems.map((item: ContextMenuItem) => {
            if (item.separator) {
              return h('div', { class: 'pteic-cm-separator' })
            }
            return h('div', {
              onClick: () => {
                if (!item.disabled) {
                  item.onClick()
                  ctrl?.closeMenu()
                }
              },
              key: item.label,
              class: `pteic-cm-item${item.disabled ? ' pteic-cm-item--disabled' : ''}`,
            }, item.label)
          })),
        )
      }

      // Hidden textarea
      children.push(
        h('textarea', {
          ref: textareaRef,
          rows: 1,
          class: 'pteic-editor-textarea',
          autocomplete: 'off',
          autocorrect: 'off',
          autocapitalize: 'off',
          spellcheck: 'false',
          onKeydown: onKeyDown,
          onCompositionstart: onCompositionStart,
          onCompositionend: onCompositionEnd,
        }),
      )

      // Search bar
      const searchNode = ss.isOpen
        ? (props.renderSearchBar
          ? props.renderSearchBar(ss, searchActions)
          : h('div', { class: 'pteic-sb' }, [
            // ---- Find row ----
            h('div', { class: 'pteic-sb-row' }, [
              IconBtn({
                title: ss.showReplace ? 'Collapse Replace' : 'Expand Replace',
                narrow: true,
                onClick: searchActions.toggleReplace,
              }, [
                IconSpan(`chevron-down${ss.showReplace ? '' : ' pteic-chevron-down--collapsed'}`),
              ]),

              h('div', { class: 'pteic-sb-input-wrap' }, [
                h('input', {
                  ref: findRef,
                  value: ss.query,
                  onInput: (e: Event) => searchActions.setQuery((e.target as HTMLInputElement).value),
                  onKeydown: handleFindKeyDown,
                  placeholder: 'Find',
                  title: ss.regexError ?? undefined,
                  class: `pteic-sb-input pteic-sb-find-input${noMatches ? ' pteic-sb-input--no-matches' : ''}${hasError ? ' pteic-sb-input--error' : ''}`,
                }),
                h('div', { class: 'pteic-sb-toggles' }, [
                  IconBtn({ title: 'Match Case (Alt+C)', active: ss.caseSensitive, onClick: () => searchActions.setCaseSensitive(!ss.caseSensitive) }, [IconSpan('case-sensitive')]),
                  IconBtn({ title: 'Match Whole Word (Alt+W)', active: ss.wholeWord, onClick: () => searchActions.setWholeWord(!ss.wholeWord) }, [IconSpan('whole-word')]),
                  IconBtn({ title: 'Use Regular Expression (Alt+R)', active: ss.useRegex, onClick: () => searchActions.setUseRegex(!ss.useRegex) }, [IconSpan('regex')]),
                ]),
              ]),

              h('span', { class: `pteic-sb-count${hasError || noMatches ? ' pteic-sb-count--error' : ''}` }, countText),

              h('div', { class: 'pteic-sb-btns' }, [
                IconBtn({ title: 'Previous Match (Shift+Enter)', disabled: ss.matchCount === 0, onClick: searchActions.prev }, [IconSpan('arrow-up')]),
                IconBtn({ title: 'Next Match (Enter)', disabled: ss.matchCount === 0, onClick: searchActions.next }, [IconSpan('arrow-down')]),
                IconBtn({ title: 'Close (Escape)', onClick: searchActions.close }, [IconSpan('close')]),
              ]),
            ]),

            // ---- Replace row ----
            ss.showReplace && h('div', { class: 'pteic-sb-row' }, [
              h('div', { class: 'pteic-sb-spacer' }),
              h('div', { class: 'pteic-sb-input-wrap' }, [
                h('input', {
                  ref: replaceRef,
                  value: ss.replaceQuery,
                  onInput: (e: Event) => searchActions.setReplaceQuery((e.target as HTMLInputElement).value),
                  onKeydown: handleReplaceKeyDown,
                  placeholder: 'Replace',
                  class: `pteic-sb-input pteic-sb-replace-input${noMatches ? ' pteic-sb-input--no-matches' : ''}`,
                }),
                h('div', { class: 'pteic-sb-overlay' }, [
                  IconBtn({
                    title: 'Preserve Case (AB)',
                    active: ss.preserveCase,
                    disabled: ss.useRegex,
                    onClick: () => searchActions.setPreserveCase(!ss.preserveCase),
                  }, [IconSpan('preserve-case')]),
                ]),
              ]),
              h('div', { class: 'pteic-sb-btns' }, [
                IconBtn({
                  title: 'Replace (Enter)',
                  disabled: ss.matchCount === 0 || !!ss.regexError,
                  onClick: searchActions.replace,
                }, [IconSpan('replace')]),
                IconBtn({
                  title: 'Replace All (Ctrl+Alt+Enter)',
                  disabled: ss.matchCount === 0 || !!ss.regexError,
                  onClick: searchActions.replaceAll,
                }, [IconSpan('replace-all')]),
              ]),
            ]),

            // ---- Regex error ----
            ss.regexError && h('div', { class: 'pteic-sb-error' }, ss.regexError),
          ]))
        : null

      return h('div', { class: 'pteic-editor-root' }, [
        h('div', {
          ref: containerRef,
          class: 'pteic-editor-scroll',
          onClick: onContainerClick,
        }, children),
        searchNode,
      ])
    }
  },
})
