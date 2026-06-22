<template>
  <div class="app">
    <div class="toolbar">
      <b class="brand">pretext-editor</b>
      <span class="tag">Vue Demo</span>

      <label class="lang-label">
        Language:
        <select v-model="language" class="lang-select">
          <option value="typescript">TypeScript</option>
          <option value="javascript">JavaScript</option>
          <option value="python">Python</option>
          <option value="go">Go</option>
          <option value="rust">Rust</option>
          <option value="json">JSON</option>
          <option value="css">CSS</option>
          <option value="html">HTML</option>
        </select>
      </label>

      <button class="btn" @click="scrollToTop">Scroll to Top</button>
    </div>

    <div class="editor-wrap">
      <PretextEditor
        ref="editorRef"
        :value="code"
        @update:value="code = $event"
        :language="language"
        :font-size="14"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { PretextEditor } from 'pretext-editor/vue'
import type { PretextEditorHandle } from 'pretext-editor/vue'

const SAMPLE_CODE = `function fibonacci(n: number): number {
  if (n <= 1) return n
  return fibonacci(n - 1) + fibonacci(n - 2)
}

// Test it
for (let i = 0; i < 10; i++) {
  console.log(\`fib(\${i}) = \${fibonacci(i)}\`)
}
`

const code = ref(SAMPLE_CODE)
const language = ref('typescript')
const editorRef = ref<PretextEditorHandle>()

function scrollToTop() {
  editorRef.value?.scrollToLine(0)
}
</script>

<style scoped>
.app { height: 100%; display: flex; flex-direction: column; }
.toolbar {
  display: flex; align-items: center; gap: 12px;
  padding: 8px 16px; background: #252526;
  border-bottom: 1px solid #333; font-size: 13px; flex-shrink: 0;
}
.brand { color: #0098ff; }
.tag { color: #888; }
.lang-label { margin-left: auto; display: flex; align-items: center; gap: 6px; }
.lang-select {
  background: #3c3c3c; color: #ccc; border: 1px solid #555;
  border-radius: 4px; padding: 4px 8px; font-size: 13px;
}
.btn {
  background: #0e639c; color: #fff; border: none;
  border-radius: 4px; padding: 4px 12px; font-size: 13px; cursor: pointer;
}
.editor-wrap { flex: 1; overflow: hidden; }
</style>
