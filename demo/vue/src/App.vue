<template>
  <div class="app">
    <div class="panels">
      <EditorPanel
        :initial-code="TS_SAMPLE"
        initial-language="typescript"
      />
      <div class="divider" />
      <EditorPanel
        :initial-code="PY_SAMPLE"
        initial-language="python"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import EditorPanel from './EditorPanel.vue'

const TS_SAMPLE = `function fibonacci(n: number): number {
  if (n <= 1) return n
  return fibonacci(n - 1) + fibonacci(n - 2)
}

// Test it
for (let i = 0; i < 10; i++) {
  console.log(\`fib(\${i}) = \${fibonacci(i)}\`)
}
`

const PY_SAMPLE = `def fibonacci(n: int) -> int:
    if n <= 1:
        return n
    return fibonacci(n - 1) + fibonacci(n - 2)

# Test it
for i in range(10):
    print(f"fib({i}) = {fibonacci(i)}")
`
</script>

<style scoped>
.app { height: 100%; display: flex; flex-direction: column; }
.panels { flex: 1; display: flex; overflow: hidden; }
.panels > :deep(.panel) { flex: 1; min-width: 0; }
.divider { width: 1px; background: #444; flex-shrink: 0; }
</style>
