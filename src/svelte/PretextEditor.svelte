<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher, tick } from 'svelte';
  import { EditorController } from '../controller/EditorController';
  import {
    DEFAULT_FONT_SIZE,
    DEFAULT_FONT_FAMILY,
    DEFAULT_TAB_SIZE,
  } from '../core/renderer';
  import type { EditorControllerState, IEditorBinding, ContextMenuBuiltins, ContextMenuItem, PretextEditorHandle } from '../controller/EditorController';
  import type { SearchState, SearchActions } from '../core/search';

  const WORKER_URL = new URL('../highlight.worker.js', import.meta.url)

  // Props
  export let value: string = '';
  export let language: string | undefined = undefined;
  export let fontSize: number = DEFAULT_FONT_SIZE;
  export let fontFamily: string = DEFAULT_FONT_FAMILY;
  export let tabSize: number = DEFAULT_TAB_SIZE;
  export let binding: IEditorBinding | undefined = undefined;
  export let active: boolean = false;
  export let theme: string = 'dark-plus';
  export let contextMenuItems:
    | ((builtins: ContextMenuBuiltins) => ContextMenuItem[])
    | undefined = undefined;

  const dispatch = createEventDispatcher<{ change: string }>();

  // DOM refs
  let containerEl: HTMLDivElement;
  let contentEl: HTMLDivElement;
  let canvasEl: HTMLCanvasElement;
  let textareaEl: HTMLTextAreaElement;
  let ctxMenuEl: HTMLDivElement;
  let findInputEl: HTMLInputElement;
  let replaceInputEl: HTMLInputElement;

  // Local state
  let menuPos: { x: number; y: number } | null = null;
  let resolvedMenuItems: ContextMenuItem[] = [];

  // Search state
  let searchState: SearchState = {
    query: '', caseSensitive: false, wholeWord: false, useRegex: false,
    matchCount: 0, currentIndex: -1, isOpen: false, regexError: null,
    showReplace: false, replaceQuery: '', preserveCase: false,
    focusToken: 0,
  };

  // Search derived values
  $: hasError = !!searchState.regexError;
  $: noMatches = !!searchState.query && !hasError && searchState.matchCount === 0;
  $: countText = hasError
    ? ''
    : searchState.matchCount === 0
      ? (searchState.query ? 'No results' : '')
      : `${searchState.currentIndex + 1} of ${searchState.matchCount > 999 ? '999+' : searchState.matchCount}`;

  let ctrl: EditorController;

  let prevSearchOpen = false;
  let prevFocusToken = 0;

  const onStateChange = () => {
    const s = ctrl.getState();
    menuPos = s.menuPos;
    resolvedMenuItems = s.menuItems;
    searchState = s.searchState;

    // Auto-focus find input when search first opens, or when Ctrl+F re-triggers
    if (s.searchState.isOpen && (!prevSearchOpen || s.searchState.focusToken !== prevFocusToken)) {
      tick().then(() => {
        findInputEl?.focus();
        findInputEl?.select();
      });
    }
    // Return focus to editor when search closes
    if (!s.searchState.isOpen && prevSearchOpen) {
      textareaEl?.focus({ preventScroll: true });
    }
    prevSearchOpen = s.searchState.isOpen;
    prevFocusToken = s.searchState.focusToken;
  };

  // Search actions
  const searchActions: SearchActions = {
    setQuery: (q) => ctrl.setSearchQuery(q),
    next: () => ctrl.searchNext(),
    prev: () => ctrl.searchPrev(),
    close: () => ctrl.closeSearch(),
    setCaseSensitive: (v) => ctrl.setSearchCaseSensitive(v),
    setWholeWord: (v) => ctrl.setSearchWholeWord(v),
    setUseRegex: (v) => ctrl.setSearchUseRegex(v),
    toggleReplace: () => ctrl.toggleReplace(),
    setReplaceQuery: (q) => ctrl.setReplaceQuery(q),
    setPreserveCase: (v) => ctrl.setPreserveCase(v),
    replace: () => ctrl.replace(),
    replaceAll: () => ctrl.replaceAll(),
  };

  function onWindowPointerDown(e: PointerEvent) {
    if (ctxMenuEl && !ctxMenuEl.contains(e.target as Node)) {
      ctrl?.closeMenu();
    }
  }

  onMount(() => {
    ctrl = new EditorController({
      value,
      onChange: (v) => {
        dispatch('change', v);
      },
      language,
      fontSize,
      fontFamily,
      tabSize,
      binding,
      active,
      contextMenuItems,
      workerUrl: WORKER_URL,
      theme,
    });
    ctrl.mount(containerEl, canvasEl, textareaEl, onStateChange, contentEl);
    window.addEventListener('pointerdown', onWindowPointerDown, { capture: true });
  });

  onDestroy(() => {
    window.removeEventListener('pointerdown', onWindowPointerDown, { capture: true });
    ctrl?.destroy();
  });

  // React to prop changes
  $: if (ctrl) {
    ctrl.setValue(value);
  }
  $: if (ctrl) {
    ctrl.updateOptions({ language, fontSize, fontFamily, tabSize, binding, active, contextMenuItems, theme });
  }

  // Expose handle methods
  export function getTopLine(): number {
    return ctrl?.getHandle().getTopLine() ?? 0;
  }
  export function scrollToLine(line: number): void {
    ctrl?.getHandle().scrollToLine(line);
  }
  export function getVisibleLines(): { from: number; to: number } {
    return ctrl?.getHandle().getVisibleLines() ?? { from: 0, to: 0 };
  }

  function onContainerClick(_e: MouseEvent) {
    textareaEl?.focus({ preventScroll: true });
  }

  function onContainerKeyDown(e: KeyboardEvent) {
    // Forward to controller in case the container div receives focus
    ctrl?.onKeyDown(e);
  }

  function onKeyDown(e: KeyboardEvent) {
    ctrl?.onKeyDown(e);
  }

  function onCompositionStart() {
    ctrl?.onCompositionStart();
  }

  function onCompositionEnd(e: CompositionEvent) {
    ctrl?.onCompositionEnd(e);
  }

  function getInputValue(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  function onMenuItemClick(item: ContextMenuItem) {
    if (!item.disabled) {
      item.onClick();
      ctrl?.closeMenu();
    }
  }

  // Search bar keyboard handlers
  function handleFindKeyDown(e: KeyboardEvent) {
    // Block browser Ctrl+F / Cmd+F when search input is focused
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); return }
    if (e.altKey && !e.ctrlKey && !e.metaKey) {
      const k = e.key.toLowerCase();
      if (k === 'c') { e.preventDefault(); searchActions.setCaseSensitive(!searchState.caseSensitive); return }
      if (k === 'w') { e.preventDefault(); searchActions.setWholeWord(!searchState.wholeWord); return }
      if (k === 'r') { e.preventDefault(); searchActions.setUseRegex(!searchState.useRegex); return }
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      e.shiftKey ? searchActions.prev() : searchActions.next();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      searchActions.close();
      textareaEl?.focus({ preventScroll: true });
    }
    e.stopPropagation();
  }

  function handleReplaceKeyDown(e: KeyboardEvent) {
    // Block browser Ctrl+F / Cmd+F when search input is focused
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); return }
    if (e.altKey && !e.ctrlKey && !e.metaKey) {
      const k = e.key.toLowerCase();
      if (k === 'c') { e.preventDefault(); searchActions.setCaseSensitive(!searchState.caseSensitive); return }
      if (k === 'w') { e.preventDefault(); searchActions.setWholeWord(!searchState.wholeWord); return }
      if (k === 'r') { e.preventDefault(); searchActions.setUseRegex(!searchState.useRegex); return }
    }
    if ((e.ctrlKey || e.metaKey) && e.altKey && e.key === 'Enter') {
      e.preventDefault();
      searchActions.replaceAll();
    } else if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      searchActions.replace();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      searchActions.close();
      textareaEl?.focus({ preventScroll: true });
    }
    e.stopPropagation();
  }
</script>

<div class="pteic-editor-root">
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div
    bind:this={containerEl}
    class="pteic-editor-scroll"
    role="textbox"
    tabindex="-1"
    on:click={onContainerClick}
    on:keydown={onContainerKeyDown}
  >
    <div class="pteic-editor-content" bind:this={contentEl}>
      <canvas
        bind:this={canvasEl}
        class="pteic-editor-canvas"
      />
    </div>

    {#if menuPos}
      <div
        bind:this={ctxMenuEl}
        class="pteic-cm"
        style="left:{menuPos.x}px; top:{menuPos.y}px"
      >
        {#each resolvedMenuItems as item}
          {#if item.separator}
            <div class="pteic-cm-separator" />
          {:else}
            <button
              class="pteic-cm-item"
              class:pteic-cm-item--disabled={item.disabled}
              disabled={item.disabled}
              on:click={() => onMenuItemClick(item)}
            >
              {item.label}
            </button>
          {/if}
        {/each}
      </div>
    {/if}

    <textarea
      bind:this={textareaEl}
      rows="1"
      class="pteic-editor-textarea"
      autocomplete="off"
      autocorrect="off"
      autocapitalize="off"
      spellcheck="false"
      on:keydown={onKeyDown}
      on:compositionstart={onCompositionStart}
      on:compositionend={onCompositionEnd}
    />
  </div>

  <!-- Search bar -->
  {#if searchState.isOpen}
    <div class="pteic-sb">
      <!-- Find row -->
      <div class="pteic-sb-row">
        <button
          class="pteic-btn pteic-btn--narrow"
          title={searchState.showReplace ? 'Collapse Replace' : 'Expand Replace'}
          on:click={searchActions.toggleReplace}
        >
          <span class="pteic pteic-chevron-down" class:pteic-chevron-down--collapsed={!searchState.showReplace} />
        </button>

        <div class="pteic-sb-input-wrap">
          <input
            bind:this={findInputEl}
            value={searchState.query}
            on:input={(e) => searchActions.setQuery(getInputValue(e))}
            on:keydown={handleFindKeyDown}
            placeholder="Find"
            title={searchState.regexError ?? undefined}
            class="pteic-sb-input pteic-sb-find-input"
            class:pteic-sb-input--no-matches={noMatches}
            class:pteic-sb-input--error={hasError}
          />
          <div class="pteic-sb-toggles">
            <button
              class="pteic-btn"
              class:pteic-btn--active={searchState.caseSensitive}
              title="Match Case (Alt+C)"
              on:click={() => searchActions.setCaseSensitive(!searchState.caseSensitive)}
            >
              <span class="pteic pteic-case-sensitive" />
            </button>
            <button
              class="pteic-btn"
              class:pteic-btn--active={searchState.wholeWord}
              title="Match Whole Word (Alt+W)"
              on:click={() => searchActions.setWholeWord(!searchState.wholeWord)}
            >
              <span class="pteic pteic-whole-word" />
            </button>
            <button
              class="pteic-btn"
              class:pteic-btn--active={searchState.useRegex}
              title="Use Regular Expression (Alt+R)"
              on:click={() => searchActions.setUseRegex(!searchState.useRegex)}
            >
              <span class="pteic pteic-regex" />
            </button>
          </div>
        </div>

        <span class="pteic-sb-count" class:pteic-sb-count--error={hasError || noMatches}>
          {countText}
        </span>

        <div class="pteic-sb-btns">
          <button
            class="pteic-btn"
            title="Previous Match (Shift+Enter)"
            disabled={searchState.matchCount === 0}
            on:click={searchActions.prev}
          >
            <span class="pteic pteic-arrow-up" />
          </button>
          <button
            class="pteic-btn"
            title="Next Match (Enter)"
            disabled={searchState.matchCount === 0}
            on:click={searchActions.next}
          >
            <span class="pteic pteic-arrow-down" />
          </button>
          <button
            class="pteic-btn"
            title="Close (Escape)"
            on:click={searchActions.close}
          >
            <span class="pteic pteic-close" />
          </button>
        </div>
      </div>

      <!-- Replace row -->
      {#if searchState.showReplace}
        <div class="pteic-sb-row">
          <div class="pteic-sb-spacer" />

          <div class="pteic-sb-input-wrap">
            <input
              bind:this={replaceInputEl}
              value={searchState.replaceQuery}
              on:input={(e) => searchActions.setReplaceQuery(getInputValue(e))}
              on:keydown={handleReplaceKeyDown}
              placeholder="Replace"
              class="pteic-sb-input pteic-sb-replace-input"
              class:pteic-sb-input--no-matches={noMatches}
            />
            <div class="pteic-sb-overlay">
              <button
                class="pteic-btn"
                class:pteic-btn--active={searchState.preserveCase}
                title="Preserve Case (AB)"
                disabled={searchState.useRegex}
                on:click={() => searchActions.setPreserveCase(!searchState.preserveCase)}
              >
                <span class="pteic pteic-preserve-case" />
              </button>
            </div>
          </div>

          <div class="pteic-sb-btns">
            <button
              class="pteic-btn"
              title="Replace (Enter)"
              disabled={searchState.matchCount === 0 || !!searchState.regexError}
              on:click={searchActions.replace}
            >
              <span class="pteic pteic-replace" />
            </button>
            <button
              class="pteic-btn"
              title="Replace All (Ctrl+Alt+Enter)"
              disabled={searchState.matchCount === 0 || !!searchState.regexError}
              on:click={searchActions.replaceAll}
            >
              <span class="pteic pteic-replace-all" />
            </button>
          </div>
        </div>
      {/if}

      <!-- Regex error -->
      {#if searchState.regexError}
        <div class="pteic-sb-error">{searchState.regexError}</div>
      {/if}
    </div>
  {/if}
</div>

<style>
  /* ── Icons (global) ── */
  :global(.pteic) {
    display: inline-block;
    flex: 0 0 auto;
    width: 16px;
    height: 16px;
    pointer-events: none;
    background-color: var(--pteic-color, currentColor);
    background-position: center;
    background-repeat: no-repeat;
    background-size: contain;
    -webkit-mask-position: center;
    -webkit-mask-repeat: no-repeat;
    -webkit-mask-size: contain;
    mask-position: center;
    mask-repeat: no-repeat;
    mask-size: contain;
  }
  :global(.pteic.pteic-arrow-down) {
    -webkit-mask-image: url('../icons/arrow-down.svg');
    mask-image: url('../icons/arrow-down.svg');
  }
  :global(.pteic.pteic-arrow-up) {
    -webkit-mask-image: url('../icons/arrow-up.svg');
    mask-image: url('../icons/arrow-up.svg');
  }
  :global(.pteic.pteic-case-sensitive) {
    -webkit-mask-image: url('../icons/case-sensitive.svg');
    mask-image: url('../icons/case-sensitive.svg');
  }
  :global(.pteic.pteic-chevron-down) {
    -webkit-mask-image: url('../icons/chevron-down.svg');
    mask-image: url('../icons/chevron-down.svg');
  }
  :global(.pteic.pteic-close) {
    -webkit-mask-image: url('../icons/close.svg');
    mask-image: url('../icons/close.svg');
  }
  :global(.pteic.pteic-preserve-case) {
    -webkit-mask-image: url('../icons/preserve-case.svg');
    mask-image: url('../icons/preserve-case.svg');
  }
  :global(.pteic.pteic-regex) {
    -webkit-mask-image: url('../icons/regex.svg');
    mask-image: url('../icons/regex.svg');
  }
  :global(.pteic.pteic-replace-all) {
    -webkit-mask-image: url('../icons/replace-all.svg');
    mask-image: url('../icons/replace-all.svg');
  }
  :global(.pteic.pteic-replace) {
    -webkit-mask-image: url('../icons/replace.svg');
    mask-image: url('../icons/replace.svg');
  }
  :global(.pteic.pteic-text-size) {
    -webkit-mask-image: url('../icons/text-size.svg');
    mask-image: url('../icons/text-size.svg');
  }
  :global(.pteic.pteic-whole-word) {
    -webkit-mask-image: url('../icons/whole-word.svg');
    mask-image: url('../icons/whole-word.svg');
  }
  :global(.pteic.pteic-word-wrap) {
    -webkit-mask-image: url('../icons/word-wrap.svg');
    mask-image: url('../icons/word-wrap.svg');
  }

  /* ── Editor shell (global) ── */
  :global(.pteic-editor-root) {
    position: relative;
    height: 100%;
    width: 100%;
    overflow: hidden;
  }
  :global(.pteic-editor-scroll) {
    position: absolute;
    inset: 0;
    overflow: auto;
    outline: none;
    cursor: text;
  }
  :global(.pteic-editor-content) {
    position: relative;
  }
  :global(.pteic-editor-canvas) {
    position: sticky;
    top: 0;
    display: block;
    width: 100%;
  }
  :global(.pteic-editor-textarea) {
    position: absolute;
    top: 0;
    left: 0;
    width: 1px;
    height: 1px;
    opacity: 0;
    overflow: hidden;
    resize: none;
    border: none;
    outline: none;
    padding: 0;
    pointer-events: none;
  }

  /* ── Context menu (global) ── */
  :global(.pteic-cm) {
    position: fixed;
    background: #252526;
    border: 1px solid #454545;
    border-radius: 8px;
    padding: 4px 0;
    z-index: 9999;
    min-width: 160px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    user-select: none;
  }
  :global(.pteic-cm-separator) {
    height: 1px;
    background: #454545;
    margin: 4px 0;
  }
  :global(.pteic-cm-item) {
    display: block;
    width: 100%;
    text-align: left;
    padding: 5px 20px;
    font-size: 13px;
    color: #cccccc;
    cursor: pointer;
    background: transparent;
    border: none;
  }
  :global(.pteic-cm-item:hover) {
    background: #094771;
  }
  :global(.pteic-cm-item--disabled) {
    color: #5a5a5a;
    cursor: default;
  }
  :global(.pteic-cm-item--disabled:hover) {
    background: transparent;
  }

  /* ── Search bar (global) ── */
  :global(.pteic-sb) {
    position: absolute;
    top: 10px;
    right: 18px;
    z-index: 100;
    background: #252526;
    border: 1px solid #454545;
    border-radius: 6px;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.6);
    padding: 2px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-family: system-ui, -apple-system, sans-serif;
    user-select: none;
  }
  :global(.pteic-sb-row) {
    display: flex;
    align-items: center;
    gap: 5px;
  }
  :global(.pteic-sb-input-wrap) {
    position: relative;
    flex-shrink: 0;
  }
  :global(.pteic-sb-input) {
    width: 240px;
    background: #3c3c3c;
    border: 1px solid #555;
    border-radius: 3px;
    color: #d4d4d4;
    font-size: 14px;
    padding: 2px 8px;
    outline: none;
    font-family: inherit;
    box-sizing: border-box;
    height: 30px;
  }
  :global(.pteic-sb-find-input) {
    padding-right: 86px;
  }
  :global(.pteic-sb-replace-input) {
    padding-right: 30px;
  }
  :global(.pteic-sb-input--no-matches) {
    background: rgba(228, 86, 73, 0.18);
  }
  :global(.pteic-sb-input--error) {
    border-color: #f48771;
  }
  :global(.pteic-sb-toggles) {
    position: absolute;
    right: 3px;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    gap: 2px;
    align-items: center;
  }
  :global(.pteic-sb-overlay) {
    position: absolute;
    right: 3px;
    top: 50%;
    transform: translateY(-50%);
  }
  :global(.pteic-sb-count) {
    font-size: 13px;
    color: #d4d4d4;
    min-width: 74px;
    text-align: center;
    flex-shrink: 0;
    white-space: nowrap;
  }
  :global(.pteic-sb-count--error) {
    color: #f48771;
  }
  :global(.pteic-sb-btns) {
    display: flex;
    gap: 2px;
  }
  :global(.pteic-sb-spacer) {
    width: 15px;
    flex-shrink: 0;
  }
  :global(.pteic-sb-error) {
    font-size: 12px;
    color: #f48771;
    padding-left: 20px;
    max-width: 420px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  :global(.pteic-btn) {
    width: 26px;
    height: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: #cccccc;
    cursor: pointer;
    padding: 0;
    flex-shrink: 0;
    outline: none;
  }
  :global(.pteic-btn:hover:not(:disabled)) {
    background: #37373d;
  }
  :global(.pteic-btn.pteic-btn--active) {
    background: #0e639c;
  }
  :global(.pteic-btn:disabled) {
    color: #555;
    cursor: default;
  }
  :global(.pteic-btn--narrow) {
    width: 15px;
  }
  :global(.pteic.pteic-chevron-down) {
    transition: transform 0.12s;
  }
  :global(.pteic.pteic-chevron-down.pteic-chevron-down--collapsed) {
    transform: rotate(-90deg);
  }
</style>
