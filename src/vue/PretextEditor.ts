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
  KeyBinding,
  CommandId,
} from '../controller/EditorController'
import type { SearchState, SearchActions } from '../core/search'

// Shared CSS — tsup bundles these into dist/vue/index.css
import '../styles/icons.css'

import '../styles/editor.css'
import '../styles/context-menu.css'
import '../styles/search-bar.css'

// ---- Search bar icon helpers (h()-based) ----

function IconSpan(icon: string) {
  return h('span', { class: `icon icon-${icon}` })
}

function IconBtn(
  props: { title: string; active?: boolean; disabled?: boolean; narrow?: boolean; onClick: () => void },
  children: any,
) {
  return h('button', {
    title: props.title,
    disabled: props.disabled,
    onClick: props.onClick,
    class: `button${props.narrow ? ' button--narrow' : ''}${props.active ? ' button--active' : ''}`,
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
    keymap: { type: Object as PropType<Partial<Record<CommandId, KeyBinding>>>, default: undefined },
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
      keymap?: Partial<Record<CommandId, KeyBinding>>
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

    let lastEmittedValue = props.value

    const onStateChange = () => {
      const s = ctrl!.getState()
      Object.assign(state, s)
      emit('cursor-change', s.doc.cursor)
      const newValue = s.doc.lines.join('\n')
      if (newValue !== lastEmittedValue) {
        lastEmittedValue = newValue
        emit('update:value', newValue)
      }
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
        language: props.language,
        fontSize: props.fontSize,
        fontFamily: props.fontFamily,
        tabSize: props.tabSize,
        binding: props.binding,
        active: props.active,
        contextMenuItems: props.contextMenuItems as any,
        theme: props.theme,
        wordWrap: props.wordWrap,
        keymap: props.keymap,
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
    watch([() => props.language, () => props.fontSize, () => props.fontFamily, () => props.tabSize, () => props.theme, () => props.wordWrap, () => props.keymap], () => {
      ctrl?.updateOptions({
        language: props.language,
        fontSize: props.fontSize,
        fontFamily: props.fontFamily,
        tabSize: props.tabSize,
        theme: props.theme,
        wordWrap: props.wordWrap,
        keymap: props.keymap,
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
        h('div', { ref: contentRef, class: 'editor-content' }, [
          h('canvas', { ref: canvasRef, class: 'editor-canvas' }),
        ]),
      ]

      // Context menu
      if (state.menuPos) {
        children.push(
          h('div', {
            ref: ctxMenuRef,
            class: 'contextmenu',
            style: { left: state.menuPos.x + 'px', top: state.menuPos.y + 'px' },
          }, state.menuItems.map((item: ContextMenuItem) => {
            if (item.separator) {
              return h('div', { class: 'contextmenu-separator' })
            }
            return h('div', {
              onClick: () => {
                if (!item.disabled) {
                  item.onClick()
                  ctrl?.closeMenu()
                }
              },
              key: item.label,
              class: `contextmenu-item${item.disabled ? ' contextmenu-item--disabled' : ''}`,
            }, item.label)
          })),
        )
      }

      // Hidden textarea
      children.push(
        h('textarea', {
          ref: textareaRef,
          rows: 1,
          class: 'editor-textarea',
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
          : h('div', { class: 'searchbar' }, [
            // ---- Find row ----
            h('div', { class: 'searchbar-row' }, [
              IconBtn({
                title: ss.showReplace ? 'Collapse Replace' : 'Expand Replace',
                narrow: true,
                onClick: searchActions.toggleReplace,
              }, [
                h('span', { class: `icon icon-chevrondown${ss.showReplace ? '' : ' icon-chevrondown--collapsed'}` }),
              ]),

              h('div', { class: 'searchbar-inputwrap' }, [
                h('input', {
                  ref: findRef,
                  value: ss.query,
                  onInput: (e: Event) => searchActions.setQuery((e.target as HTMLInputElement).value),
                  onKeydown: handleFindKeyDown,
                  placeholder: 'Find',
                  title: ss.regexError ?? undefined,
                  class: `searchbar-input searchbar-findinput${noMatches ? ' searchbar-input--nomatches' : ''}${hasError ? ' searchbar-input--error' : ''}`,
                }),
                h('div', { class: 'searchbar-toggles' }, [
                  IconBtn({ title: 'Match Case (Alt+C)', active: ss.caseSensitive, onClick: () => searchActions.setCaseSensitive(!ss.caseSensitive) }, [IconSpan('casesensitive')]),
                  IconBtn({ title: 'Match Whole Word (Alt+W)', active: ss.wholeWord, onClick: () => searchActions.setWholeWord(!ss.wholeWord) }, [IconSpan('wholeword')]),
                  IconBtn({ title: 'Use Regular Expression (Alt+R)', active: ss.useRegex, onClick: () => searchActions.setUseRegex(!ss.useRegex) }, [IconSpan('regex')]),
                ]),
              ]),

              h('span', { class: `searchbar-count${hasError || noMatches ? ' searchbar-count--error' : ''}` }, countText),

              h('div', { class: 'searchbar-buttons' }, [
                IconBtn({ title: 'Previous Match (Shift+Enter)', disabled: ss.matchCount === 0, onClick: searchActions.prev }, [IconSpan('arrowup')]),
                IconBtn({ title: 'Next Match (Enter)', disabled: ss.matchCount === 0, onClick: searchActions.next }, [IconSpan('arrowdown')]),
                IconBtn({ title: 'Close (Escape)', onClick: searchActions.close }, [IconSpan('close')]),
              ]),
            ]),

            // ---- Replace row ----
            ss.showReplace && h('div', { class: 'searchbar-row' }, [
              h('div', { class: 'searchbar-spacer' }),
              h('div', { class: 'searchbar-inputwrap' }, [
                h('input', {
                  ref: replaceRef,
                  value: ss.replaceQuery,
                  onInput: (e: Event) => searchActions.setReplaceQuery((e.target as HTMLInputElement).value),
                  onKeydown: handleReplaceKeyDown,
                  placeholder: 'Replace',
                  class: `searchbar-input searchbar-replaceinput${noMatches ? ' searchbar-input--nomatches' : ''}`,
                }),
                h('div', { class: 'searchbar-overlay' }, [
                  IconBtn({
                    title: 'Preserve Case (AB)',
                    active: ss.preserveCase,
                    disabled: ss.useRegex,
                    onClick: () => searchActions.setPreserveCase(!ss.preserveCase),
                  }, [IconSpan('preservecase')]),
                ]),
              ]),
              h('div', { class: 'searchbar-buttons' }, [
                IconBtn({
                  title: 'Replace (Enter)',
                  disabled: ss.matchCount === 0 || !!ss.regexError,
                  onClick: searchActions.replace,
                }, [IconSpan('replace')]),
                IconBtn({
                  title: 'Replace All (Ctrl+Alt+Enter)',
                  disabled: ss.matchCount === 0 || !!ss.regexError,
                  onClick: searchActions.replaceAll,
                }, [IconSpan('replaceall')]),
              ]),
            ]),

            // ---- Regex error ----
            ss.regexError && h('div', { class: 'searchbar-error' }, ss.regexError),
          ]))
        : null

      return h('div', { class: 'pretext-editor' }, [
        h('div', {
          ref: containerRef,
          class: 'editor-scroll',
          onClick: onContainerClick,
        }, children),
        searchNode,
      ])
    }
  },
})
