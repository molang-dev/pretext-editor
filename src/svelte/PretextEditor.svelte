<script context="module" lang="ts">
  import { createEagerWorker } from 'pretext-editor/worker-create'
  export const eagerWorker = createEagerWorker()
</script>

<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher, tick } from 'svelte';
  import { EditorController } from '../controller/EditorController';
  import {
    DEFAULT_FONT_SIZE,
    DEFAULT_FONT_FAMILY,
    DEFAULT_TAB_SIZE,
  } from '../core/renderer';
  import type { EditorControllerState, IEditorBinding, ContextMenuBuiltins, ContextMenuItem, PretextEditorHandle, KeyBinding, CommandId } from '../controller/EditorController';
  import type { SearchState, SearchActions } from '../core/search';

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
  export let keymap: Partial<Record<CommandId, KeyBinding>> | undefined = undefined;
  export let wordWrap: boolean = false;

  const dispatch = createEventDispatcher<{ change: string; 'cursor-change': { line: number; col: number } }>();

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

  let lastEmittedValue = value;

  const onStateChange = () => {
    const s = ctrl.getState();
    menuPos = s.menuPos;
    resolvedMenuItems = s.menuItems;
    searchState = s.searchState;
    dispatch('cursor-change', s.doc.cursor);
    const newValue = s.doc.lines.join('\n');
    if (newValue !== lastEmittedValue) {
      lastEmittedValue = newValue;
      dispatch('change', newValue);
    }

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
      language,
      fontSize,
      fontFamily,
      tabSize,
      binding,
      active,
      contextMenuItems,
      worker: eagerWorker ?? undefined,
      theme,
      keymap,
      wordWrap,
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
    ctrl.updateOptions({ language, fontSize, fontFamily, tabSize, binding, active, contextMenuItems, theme, keymap, wordWrap });
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

<div class="pretext-editor">
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div
    bind:this={containerEl}
    class="editor-scroll"
    role="textbox"
    tabindex="-1"
    on:click={onContainerClick}
    on:keydown={onContainerKeyDown}
  >
    <div class="editor-content" bind:this={contentEl}>
      <canvas
        bind:this={canvasEl}
        class="editor-canvas"
      />
    </div>

    {#if menuPos}
      <div
        bind:this={ctxMenuEl}
        class="contextmenu"
        style="left:{menuPos.x}px; top:{menuPos.y}px"
      >
        {#each resolvedMenuItems as item}
          {#if item.separator}
            <div class="contextmenu-separator" />
          {:else}
            <button
              class="contextmenu-item"
              class:contextmenu-item--disabled={item.disabled}
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
      class="editor-textarea"
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
    <div class="searchbar">
      <!-- Find row -->
      <div class="searchbar-row">
        <button
          class="button button--narrow"
          title={searchState.showReplace ? 'Collapse Replace' : 'Expand Replace'}
          on:click={searchActions.toggleReplace}
        >
          <span class="icon icon-chevrondown" class:icon-chevrondown--collapsed={!searchState.showReplace} />
        </button>

        <div class="searchbar-inputwrap">
          <input
            bind:this={findInputEl}
            value={searchState.query}
            on:input={(e) => searchActions.setQuery(getInputValue(e))}
            on:keydown={handleFindKeyDown}
            placeholder="Find"
            title={searchState.regexError ?? undefined}
            class="searchbar-input searchbar-findinput"
            class:searchbar-input--nomatches={noMatches}
            class:searchbar-input--error={hasError}
          />
          <div class="searchbar-toggles">
            <button
              class="button"
              class:button--active={searchState.caseSensitive}
              title="Match Case (Alt+C)"
              on:click={() => searchActions.setCaseSensitive(!searchState.caseSensitive)}
            >
              <span class="icon icon-casesensitive" />
            </button>
            <button
              class="button"
              class:button--active={searchState.wholeWord}
              title="Match Whole Word (Alt+W)"
              on:click={() => searchActions.setWholeWord(!searchState.wholeWord)}
            >
              <span class="icon icon-wholeword" />
            </button>
            <button
              class="button"
              class:button--active={searchState.useRegex}
              title="Use Regular Expression (Alt+R)"
              on:click={() => searchActions.setUseRegex(!searchState.useRegex)}
            >
              <span class="icon icon-regex" />
            </button>
          </div>
        </div>

        <span class="searchbar-count" class:searchbar-count--error={hasError || noMatches}>
          {countText}
        </span>

        <div class="searchbar-buttons">
          <button
            class="button"
            title="Previous Match (Shift+Enter)"
            disabled={searchState.matchCount === 0}
            on:click={searchActions.prev}
          >
            <span class="icon icon-arrowup" />
          </button>
          <button
            class="button"
            title="Next Match (Enter)"
            disabled={searchState.matchCount === 0}
            on:click={searchActions.next}
          >
            <span class="icon icon-arrowdown" />
          </button>
          <button
            class="button"
            title="Close (Escape)"
            on:click={searchActions.close}
          >
            <span class="icon icon-close" />
          </button>
        </div>
      </div>

      <!-- Replace row -->
      {#if searchState.showReplace}
        <div class="searchbar-row">
          <div class="searchbar-spacer" />

          <div class="searchbar-inputwrap">
            <input
              bind:this={replaceInputEl}
              value={searchState.replaceQuery}
              on:input={(e) => searchActions.setReplaceQuery(getInputValue(e))}
              on:keydown={handleReplaceKeyDown}
              placeholder="Replace"
              class="searchbar-input searchbar-replaceinput"
              class:searchbar-input--nomatches={noMatches}
            />
            <div class="searchbar-overlay">
              <button
                class="button"
                class:button--active={searchState.preserveCase}
                title="Preserve Case (AB)"
                disabled={searchState.useRegex}
                on:click={() => searchActions.setPreserveCase(!searchState.preserveCase)}
              >
                <span class="icon icon-preservecase" />
              </button>
            </div>
          </div>

          <div class="searchbar-buttons">
            <button
              class="button"
              title="Replace (Enter)"
              disabled={searchState.matchCount === 0 || !!searchState.regexError}
              on:click={searchActions.replace}
            >
              <span class="icon icon-replace" />
            </button>
            <button
              class="button"
              title="Replace All (Ctrl+Alt+Enter)"
              disabled={searchState.matchCount === 0 || !!searchState.regexError}
              on:click={searchActions.replaceAll}
            >
              <span class="icon icon-replaceall" />
            </button>
          </div>
        </div>
      {/if}

      <!-- Regex error -->
      {#if searchState.regexError}
        <div class="searchbar-error">{searchState.regexError}</div>
      {/if}
    </div>
  {/if}
</div>

<style>
  /* ── Icons (global) ── */
  :global(.pretext-editor .icon) {
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
  :global(.pretext-editor .icon.icon-arrowdown) {
    -webkit-mask-image: url('../icons/arrow-down.svg');
    mask-image: url('../icons/arrow-down.svg');
  }
  :global(.pretext-editor .icon.icon-arrowup) {
    -webkit-mask-image: url('../icons/arrow-up.svg');
    mask-image: url('../icons/arrow-up.svg');
  }
  :global(.pretext-editor .icon.icon-casesensitive) {
    -webkit-mask-image: url('../icons/case-sensitive.svg');
    mask-image: url('../icons/case-sensitive.svg');
  }
  :global(.pretext-editor .icon.icon-chevrondown) {
    -webkit-mask-image: url('../icons/chevron-down.svg');
    mask-image: url('../icons/chevron-down.svg');
    transition: transform 0.12s;
  }
  :global(.pretext-editor .icon.icon-chevrondown.icon-chevrondown--collapsed) {
    transform: rotate(-90deg);
  }
  :global(.pretext-editor .icon.icon-close) {
    -webkit-mask-image: url('../icons/close.svg');
    mask-image: url('../icons/close.svg');
  }
  :global(.pretext-editor .icon.icon-preservecase) {
    -webkit-mask-image: url('../icons/preserve-case.svg');
    mask-image: url('../icons/preserve-case.svg');
  }
  :global(.pretext-editor .icon.icon-regex) {
    -webkit-mask-image: url('../icons/regex.svg');
    mask-image: url('../icons/regex.svg');
  }
  :global(.pretext-editor .icon.icon-replaceall) {
    -webkit-mask-image: url('../icons/replace-all.svg');
    mask-image: url('../icons/replace-all.svg');
  }
  :global(.pretext-editor .icon.icon-replace) {
    -webkit-mask-image: url('../icons/replace.svg');
    mask-image: url('../icons/replace.svg');
  }
  :global(.pretext-editor .icon.icon-textsize) {
    -webkit-mask-image: url('../icons/text-size.svg');
    mask-image: url('../icons/text-size.svg');
  }
  :global(.pretext-editor .icon.icon-wholeword) {
    -webkit-mask-image: url('../icons/whole-word.svg');
    mask-image: url('../icons/whole-word.svg');
  }
  :global(.pretext-editor .icon.icon-wordwrap) {
    -webkit-mask-image: url('../icons/word-wrap.svg');
    mask-image: url('../icons/word-wrap.svg');
  }

  /* ── Editor shell (global) ── */
  :global(.pretext-editor) {
    position: relative;
    height: 100%;
    width: 100%;
    overflow: hidden;
  }
  :global(.pretext-editor .editor-scroll) {
    position: absolute;
    inset: 0;
    overflow: auto;
    outline: none;
    cursor: text;
  }
  :global(.pretext-editor .editor-content) {
    position: relative;
  }
  :global(.pretext-editor .editor-canvas) {
    position: sticky;
    top: 0;
    display: block;
    width: 100%;
  }
  :global(.pretext-editor .editor-textarea) {
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
  :global(.pretext-editor .contextmenu) {
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
  :global(.pretext-editor .contextmenu-separator) {
    height: 1px;
    background: #454545;
    margin: 4px 0;
  }
  :global(.pretext-editor .contextmenu-item) {
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
  :global(.pretext-editor .contextmenu-item:hover) {
    background: #094771;
  }
  :global(.pretext-editor .contextmenu-item--disabled) {
    color: #5a5a5a;
    cursor: default;
  }
  :global(.pretext-editor .contextmenu-item--disabled:hover) {
    background: transparent;
  }

  /* ── Search bar (global) ── */
  :global(.pretext-editor .searchbar) {
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
  :global(.pretext-editor .searchbar-row) {
    display: flex;
    align-items: center;
    gap: 5px;
  }
  :global(.pretext-editor .searchbar-inputwrap) {
    position: relative;
    flex-shrink: 0;
  }
  :global(.pretext-editor .searchbar-input) {
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
  :global(.pretext-editor .searchbar-findinput) {
    padding-right: 86px;
  }
  :global(.pretext-editor .searchbar-replaceinput) {
    padding-right: 30px;
  }
  :global(.pretext-editor .searchbar-input--nomatches) {
    background: rgba(228, 86, 73, 0.18);
  }
  :global(.pretext-editor .searchbar-input--error) {
    border-color: #f48771;
  }
  :global(.pretext-editor .searchbar-toggles) {
    position: absolute;
    right: 3px;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    gap: 2px;
    align-items: center;
  }
  :global(.pretext-editor .searchbar-overlay) {
    position: absolute;
    right: 3px;
    top: 50%;
    transform: translateY(-50%);
  }
  :global(.pretext-editor .searchbar-count) {
    font-size: 13px;
    color: #d4d4d4;
    min-width: 74px;
    text-align: center;
    flex-shrink: 0;
    white-space: nowrap;
  }
  :global(.pretext-editor .searchbar-count--error) {
    color: #f48771;
  }
  :global(.pretext-editor .searchbar-buttons) {
    display: flex;
    gap: 2px;
  }
  :global(.pretext-editor .searchbar-spacer) {
    width: 15px;
    flex-shrink: 0;
  }
  :global(.pretext-editor .searchbar-error) {
    font-size: 12px;
    color: #f48771;
    padding-left: 20px;
    max-width: 420px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  :global(.pretext-editor .button) {
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
  :global(.pretext-editor .button:hover:not(:disabled)) {
    background: #37373d;
  }
  :global(.pretext-editor .button.button--active) {
    background: #0e639c;
  }
  :global(.pretext-editor .button:disabled) {
    color: #555;
    cursor: default;
  }
  :global(.pretext-editor .button--narrow) {
    width: 15px;
  }

  /* Light theme overrides */
  :global(.pretext-editor[data-theme="light"] .contextmenu) {
    background: #f3f3f3;
    border-color: #d4d4d4;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  }
  :global(.pretext-editor[data-theme="light"] .contextmenu-separator) {
    background: #d4d4d4;
  }
  :global(.pretext-editor[data-theme="light"] .contextmenu-item) {
    color: #1f1f1f;
  }
  :global(.pretext-editor[data-theme="light"] .contextmenu-item:hover) {
    background: #0060c0;
    color: #ffffff;
  }
  :global(.pretext-editor[data-theme="light"] .contextmenu-item--disabled) {
    color: #a0a0a0;
  }
  :global(.pretext-editor[data-theme="light"] .searchbar) {
    background: #f3f3f3;
    border-color: #c8c8c8;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.2);
  }
  :global(.pretext-editor[data-theme="light"] .searchbar-input) {
    background: #ffffff;
    border-color: #c8c8c8;
    color: #1f1f1f;
  }
  :global(.pretext-editor[data-theme="light"] .searchbar-input:focus) {
    border-color: #0078d4;
  }
  :global(.pretext-editor[data-theme="light"] .searchbar-count) {
    color: #717171;
  }
  :global(.pretext-editor[data-theme="light"] .searchbar-count--error) {
    color: #a1260d;
  }
  :global(.pretext-editor[data-theme="light"] .searchbar-error) {
    color: #a1260d;
  }
  :global(.pretext-editor[data-theme="light"] .button) {
    color: #616161;
  }
  :global(.pretext-editor[data-theme="light"] .button:hover:not(:disabled)) {
    background: rgba(0, 0, 0, 0.07);
  }
  :global(.pretext-editor[data-theme="light"] .button.button--active) {
    background: rgba(18, 136, 214, 0.25);
    border-color: #1177bb;
    color: #1f1f1f;
  }
  :global(.pretext-editor[data-theme="light"] .button.button--active:hover:not(:disabled)) {
    background: rgba(18, 136, 214, 0.4);
  }
  :global(.pretext-editor[data-theme="light"] .button:disabled) {
    color: #a0a0a0;
  }
</style>
