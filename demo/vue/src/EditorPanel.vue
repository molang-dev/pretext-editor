<template>
  <div class="panel">
    <div class="toolbar">
      <label class="ctrl-label">
        Language:
        <select v-model="language" class="ctrl-select">
          <option v-for="lang in LANGUAGES" :key="lang.value" :value="lang.value">{{ lang.label }}</option>
        </select>
      </label>

      <label class="ctrl-label">
        Theme:
        <select v-model="theme" class="ctrl-select">
          <option value="dark-plus">Dark+ (VS Code)</option>
          <option value="dracula">Dracula</option>
          <option value="github-light">GitHub Light</option>
        </select>
      </label>

      <label class="ctrl-label">
        Font size:
        <select v-model.number="fontSize" class="ctrl-select ctrl-select--narrow">
          <option v-for="n in fontSizeOptions" :key="n" :value="n">{{ n }}</option>
        </select>
      </label>

      <button class="btn" @click="openFile">Open File</button>
      <button class="btn" :class="{ 'btn--active': wordWrap }" @click="wordWrap = !wordWrap">Wrap</button>
      <input ref="fileInputRef" type="file" class="file-input-hidden" @change="onFileChange" />
    </div>

    <div class="editor-wrap">
      <PretextEditor
        :value="code"
        @update:value="code = $event"
        @cursor-change="cursor = $event"
        :language="language"
        :font-size="fontSize"
        :tab-size="tabSize"
        :theme="theme"
        :word-wrap="wordWrap"
        :keymap="{ copy: ['alt', 'c'] }"
      />
    </div>

    <div class="statusbar">
      <span>Ln {{ cursor.line + 1 }}, Col {{ cursor.col + 1 }}</span>
      <span>Tab Size: {{ tabSize }}</span>
      <span>UTF-8</span>
      <span>{{ LANGUAGES.find(l => l.value === language)?.label ?? language }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { PretextEditor } from 'pretext-editor/vue'

const props = defineProps<{
  initialCode: string
  initialLanguage: string
}>()

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
]

const EXT_TO_LANG: Record<string, string> = {
  ts: 'typescript', tsx: 'tsx',
  js: 'javascript', jsx: 'jsx',
  py: 'python',
  rs: 'rust',
  go: 'go',
  c: 'c', h: 'c',
  cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp',
  cs: 'csharp',
  java: 'java',
  kt: 'kotlin',
  swift: 'swift',
  css: 'css',
  html: 'html', htm: 'html',
  xml: 'xml',
  graphql: 'graphql', gql: 'graphql',
  sh: 'shellscript', bash: 'shellscript', zsh: 'shellscript', fish: 'fish',
  lua: 'lua',
  yaml: 'yaml', yml: 'yaml',
  rb: 'ruby',
  json: 'json',
  jsonc: 'jsonc',
  php: 'php',
  r: 'r',
  dart: 'dart',
  scala: 'scala',
  scss: 'scss',
  less: 'less',
  vue: 'vue',
  svelte: 'svelte',
  toml: 'toml',
  md: 'markdown', mdx: 'markdown',
  sql: 'sql',
  haml: 'haml',
  glsl: 'glsl', vert: 'glsl', frag: 'glsl',
}

const code = ref(props.initialCode)
const language = ref(props.initialLanguage)
const theme = ref('dark-plus')
const fontSize = ref(14)
const tabSize = ref(4)
const wordWrap = ref(false)
const cursor = ref({ line: 0, col: 0 })
const fileInputRef = ref<HTMLInputElement>()

const fontSizeOptions = computed(() => {
  const opts = []
  for (let n = 5; n <= 40; n += 2) opts.push(n)
  return opts
})

function openFile() {
  fileInputRef.value?.click()
}

function onFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  const detected = EXT_TO_LANG[ext]
  if (detected) language.value = detected
  const reader = new FileReader()
  reader.onload = () => { code.value = reader.result as string }
  reader.readAsText(file)
  ;(e.target as HTMLInputElement).value = ''
}
</script>

<style scoped>
.panel { height: 100%; display: flex; flex-direction: column; overflow: hidden; }
.toolbar {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  padding: 8px 16px; background: #252526;
  border-bottom: 1px solid #333; font-size: 13px; flex-shrink: 0;
}
.ctrl-label { display: flex; align-items: center; gap: 6px; color: #ccc; }
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
