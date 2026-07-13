<script lang="ts">
  import PretextEditor from 'pretext-editor/svelte';
  import type { PretextEditorHandle } from 'pretext-editor/svelte';

  const LANGUAGES = [
    { value: 'c',           label: 'C' },
    { value: 'cpp',         label: 'C++' },
    { value: 'csharp',      label: 'C#' },
    { value: 'css',         label: 'CSS' },
    { value: 'dart',        label: 'Dart' },
    { value: 'fish',        label: 'Fish' },
    { value: 'glsl',        label: 'GLSL' },
    { value: 'go',          label: 'Go' },
    { value: 'graphql',     label: 'GraphQL' },
    { value: 'haml',        label: 'Haml' },
    { value: 'html',        label: 'HTML' },
    { value: 'java',        label: 'Java' },
    { value: 'javascript',  label: 'JavaScript' },
    { value: 'json',        label: 'JSON' },
    { value: 'jsonc',       label: 'JSONC' },
    { value: 'jsx',         label: 'JSX' },
    { value: 'kotlin',      label: 'Kotlin' },
    { value: 'less',        label: 'Less' },
    { value: 'lua',         label: 'Lua' },
    { value: 'markdown',    label: 'Markdown' },
    { value: 'php',         label: 'PHP' },
    { value: 'postcss',     label: 'PostCSS' },
    { value: 'python',      label: 'Python' },
    { value: 'r',           label: 'R' },
    { value: 'ruby',        label: 'Ruby' },
    { value: 'rust',        label: 'Rust' },
    { value: 'scala',       label: 'Scala' },
    { value: 'scss',        label: 'SCSS' },
    { value: 'shellscript', label: 'Shell Script' },
    { value: 'sql',         label: 'SQL' },
    { value: 'svelte',      label: 'Svelte' },
    { value: 'swift',       label: 'Swift' },
    { value: 'toml',        label: 'TOML' },
    { value: 'tsx',         label: 'TSX' },
    { value: 'typescript',  label: 'TypeScript' },
    { value: 'vue',         label: 'Vue' },
    { value: 'xml',         label: 'XML' },
    { value: 'yaml',        label: 'YAML' },
  ];

  const EXT_TO_LANG: Record<string, string> = {
    ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
    py: 'python', rs: 'rust', go: 'go',
    c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp',
    cs: 'csharp', java: 'java', kt: 'kotlin', swift: 'swift',
    css: 'css', html: 'html', htm: 'html', xml: 'xml',
    graphql: 'graphql', gql: 'graphql',
    sh: 'shellscript', bash: 'shellscript', zsh: 'shellscript', fish: 'fish',
    lua: 'lua', yaml: 'yaml', yml: 'yaml', rb: 'ruby',
    json: 'json', jsonc: 'jsonc', php: 'php', r: 'r', dart: 'dart',
    scala: 'scala', scss: 'scss', less: 'less',
    vue: 'vue', svelte: 'svelte', toml: 'toml',
    md: 'markdown', mdx: 'markdown', sql: 'sql',
    haml: 'haml', glsl: 'glsl', vert: 'glsl', frag: 'glsl',
  };

  const SAMPLE_CODE = `function fibonacci(n: number): number {
  if (n <= 1) return n
  return fibonacci(n - 1) + fibonacci(n - 2)
}

// Test it
for (let i = 0; i < 10; i++) {
  console.log(\`fib(\${i}) = \${fibonacci(i)}\`)
}
`;

  let code = SAMPLE_CODE;
  let language = 'typescript';
  let theme = 'dark-plus';
  let fontSize = 14;
  const tabSize = 4;
  let wordWrap = false;
  let cursor = { line: 0, col: 0 };
  let editorRef: PretextEditorHandle;
  let fileInput: HTMLInputElement;

  function handleChange(e: CustomEvent<string>) { code = e.detail; }
  function handleCursorChange(e: CustomEvent<{ line: number; col: number }>) { cursor = e.detail; }

  function openFile() { fileInput?.click(); }

  function onFileChange(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    const detected = EXT_TO_LANG[ext];
    if (detected) language = detected;
    const reader = new FileReader();
    reader.onload = () => { code = reader.result as string; };
    reader.readAsText(file);
    (e.target as HTMLInputElement).value = '';
  }

  $: currentLabel = LANGUAGES.find(l => l.value === language)?.label ?? language;
</script>

<div class="app">
  <div class="toolbar">
    <b class="brand">pretext-editor</b>
    <span class="tag">Svelte Demo</span>

    <button class="btn btn--openfile" on:click={openFile}>Open File</button>

    <label class="ctrl-label">
      Language:
      <select bind:value={language} class="ctrl-select">
        {#each LANGUAGES as lang}
          <option value={lang.value}>{lang.label}</option>
        {/each}
      </select>
    </label>

    <label class="ctrl-label">
      Theme:
      <select bind:value={theme} class="ctrl-select">
        <option value="dark-plus">Dark+ (VS Code)</option>
        <option value="dracula">Dracula</option>
        <option value="github-light">GitHub Light</option>
      </select>
    </label>

    <label class="ctrl-label">
      Font size:
      <input type="number" bind:value={fontSize} min="8" max="40" class="ctrl-select ctrl-select--narrow" />
    </label>

    <label class="ctrl-label" style="cursor: pointer">
      <input type="checkbox" bind:checked={wordWrap} />
      Word Wrap
    </label>

    <input bind:this={fileInput} type="file" class="file-input-hidden" on:change={onFileChange} />
  </div>

  <div class="editor-wrap">
    <PretextEditor
      value={code}
      {language}
      {fontSize}
      {tabSize}
      {theme}
      wordWrap={wordWrap}
      on:change={handleChange}
      on:cursor-change={handleCursorChange}
      bind:this={editorRef}
    />
  </div>

  <div class="statusbar">
    <span>Ln {cursor.line + 1}, Col {cursor.col + 1}</span>
    <span>Tab Size: {tabSize}</span>
    <span>UTF-8</span>
    <span>{currentLabel}</span>
  </div>
</div>

<style>
  .app { height: 100%; display: flex; flex-direction: column; }
  .toolbar {
    display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
    padding: 8px 16px; background: #252526;
    border-bottom: 1px solid #333; font-size: 13px; flex-shrink: 0;
  }
  .brand { color: #0098ff; }
  .tag { color: #888; }
  .ctrl-label { display: flex; align-items: center; gap: 6px; color: #ccc; }
  .btn--openfile { margin-left: auto; }
  .ctrl-select {
    background: #3c3c3c; color: #ccc; border: 1px solid #555;
    border-radius: 4px; padding: 4px 8px; font-size: 13px;
  }
  .ctrl-select--narrow { width: 64px; }
  .btn {
    background: #0e639c; color: #fff; border: none;
    border-radius: 4px; padding: 4px 12px; font-size: 13px; cursor: pointer;
  }
  .btn--active { background: #1177bb; outline: 1px solid #4fc3f7; }
  .editor-wrap { flex: 1; overflow: hidden; }
  .file-input-hidden { display: none; }
  .statusbar {
    display: flex; gap: 16px; align-items: center;
    padding: 2px 16px; background: #007acc; color: #fff;
    font-size: 12px; flex-shrink: 0; user-select: none;
  }
</style>
