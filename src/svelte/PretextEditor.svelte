<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { EditorController } from '../controller/EditorController';
  import {
    FONT_SIZE_TO_LINE_HEIGHT,
    DEFAULT_FONT_SIZE,
    DEFAULT_FONT_FAMILY,
    DEFAULT_TAB_SIZE,
  } from '../core/renderer';
  import type { EditorControllerState, IEditorBinding, ContextMenuBuiltins, ContextMenuItem } from '../controller/EditorController';

  // Props
  export let value: string = '';
  export let language: string | undefined = undefined;
  export let fontSize: number = DEFAULT_FONT_SIZE;
  export let fontFamily: string = DEFAULT_FONT_FAMILY;
  export let tabSize: number = DEFAULT_TAB_SIZE;
  export let binding: IEditorBinding | undefined = undefined;
  export let active: boolean = false;
  export let contextMenuItems:
    | ((builtins: ContextMenuBuiltins) => ContextMenuItem[])
    | undefined = undefined;

  const dispatch = createEventDispatcher<{ change: string }>();

  // DOM refs
  let containerEl: HTMLDivElement;
  let canvasEl: HTMLCanvasElement;
  let textareaEl: HTMLTextAreaElement;

  // Local state for context menu rendering
  let menuPos: { x: number; y: number } | null = null;
  let resolvedMenuItems: ContextMenuItem[] = [];
  let docLineCount = 1;

  $: lineHeight = FONT_SIZE_TO_LINE_HEIGHT(fontSize);
  $: totalHeight = Math.max(1, docLineCount) * lineHeight + 16;

  let ctrl: EditorController;

  const onStateChange = () => {
    const s = ctrl.getState();
    menuPos = s.menuPos;
    resolvedMenuItems = s.menuItems;
    docLineCount = s.doc.lines.length;
  };

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
    });
    ctrl.mount(containerEl, canvasEl, textareaEl, onStateChange);
  });

  onDestroy(() => {
    ctrl?.destroy();
  });

  // React to prop changes
  $: if (ctrl) {
    ctrl.setValue(value);
  }
  $: if (ctrl) {
    ctrl.updateOptions({ language, fontSize, fontFamily, tabSize, binding, active, contextMenuItems });
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

  function onContainerClick(e: MouseEvent) {
    if (e.target === containerEl) {
      textareaEl?.focus({ preventScroll: true });
    }
  }

  function onContainerKeyDown(_e: KeyboardEvent) {
    // Container div's role="textbox" — keyboard handled by hidden textarea
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

  function onMenuItemClick(item: ContextMenuItem) {
    if (!item.disabled) {
      item.onClick();
      ctrl?.closeMenu();
    }
  }
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
  bind:this={containerEl}
  class="pretext-editor"
  role="textbox"
  tabindex="0"
  style="position:relative;overflow:auto;height:100%;width:100%;outline:none;cursor:text"
  on:click={onContainerClick}
  on:keydown={onContainerKeyDown}
>
  <div style="height:{totalHeight}px;position:relative">
    <canvas
      bind:this={canvasEl}
      style="position:sticky;top:0;display:block;width:100%"
    />
  </div>

  {#if menuPos}
    <div
      style="position:fixed;left:{menuPos.x}px;top:{menuPos.y}px;
             background:#252526;border:1px solid #454545;border-radius:8px;
             padding:4px 0;z-index:9999;min-width:160px;
             box-shadow:0 4px 12px rgba(0,0,0,0.4);user-select:none"
    >
      {#each resolvedMenuItems as item}
        {#if item.separator}
          <div style="height:1px;background:#454545;margin:4px 0" />
        {:else}
          <button
            class="ctx-item"
            disabled={item.disabled}
            on:click={() => onMenuItemClick(item)}
            style="display:block;width:100%;text-align:left;padding:5px 20px;font-size:13px;
                   color:{item.disabled ? '#5a5a5a' : '#cccccc'};
                   cursor:{item.disabled ? 'default' : 'pointer'};
                   background:transparent;border:none"
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
    style="position:absolute;top:0;left:0;width:1px;height:1px;opacity:0;
           overflow:hidden;resize:none;border:none;outline:none;padding:0;
           pointer-events:none"
    autocomplete="off"
    autocorrect="off"
    autocapitalize="off"
    spellcheck="false"
    on:keydown={onKeyDown}
    on:compositionstart={onCompositionStart}
    on:compositionend={onCompositionEnd}
  />
</div>

<style>
  :global(.pretext-editor) {
    display: block;
  }
</style>
