import React, { useState, useCallback, useRef } from 'react'
import { PretextEditor } from 'pretext-editor/react'
import type { PretextEditorHandle } from 'pretext-editor/react'

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
}

const SAMPLE_CODE = `function fibonacci(n: number): number {
  if (n <= 1) return n
  return fibonacci(n - 1) + fibonacci(n - 2)
}

// Test it
for (let i = 0; i < 10; i++) {
  console.log(\`fib(\${i}) = \${fibonacci(i)}\`)
}
`

const FONT_SIZE_OPTIONS: number[] = []
for (let n = 5; n <= 40; n += 2) FONT_SIZE_OPTIONS.push(n)

export default function App() {
  const [code, setCode] = useState(SAMPLE_CODE)
  const [language, setLanguage] = useState('typescript')
  const [theme, setTheme] = useState('dark-plus')
  const [fontSize, setFontSize] = useState(14)
  const [tabSize] = useState(4)
  const [wordWrap, setWordWrap] = useState(false)
  const [cursor, setCursor] = useState({ line: 0, col: 0 })
  const editorRef = useRef<PretextEditorHandle>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleChanged = useCallback((r1: number, c1: number, r2: number, c2: number, oldValue: string, newValue: string) => {
    console.log('changed', r1, c1, r2, c2, JSON.stringify(oldValue), JSON.stringify(newValue))
  }, [])

  function openFile() { fileInputRef.current?.click() }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    const detected = EXT_TO_LANG[ext]
    if (detected) setLanguage(detected)
    const reader = new FileReader()
    reader.onload = () => setCode(reader.result as string)
    reader.readAsText(file)
    e.target.value = ''
  }

  const sel: React.CSSProperties = {
    background: '#3c3c3c', color: '#ccc', border: '1px solid #555',
    borderRadius: 4, padding: '4px 8px', fontSize: 13,
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        padding: '8px 16px', background: '#252526',
        borderBottom: '1px solid #333', fontSize: 13, flexShrink: 0,
      }}>
        <b style={{ color: '#0098ff' }}>pretext-editor</b>
        <span style={{ color: '#888' }}>React Demo</span>

        <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, color: '#ccc' }}>
          Language:
          <select value={language} onChange={e => setLanguage(e.target.value)} style={sel}>
            {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#ccc' }}>
          Theme:
          <select value={theme} onChange={e => setTheme(e.target.value)} style={sel}>
            <option value="dark-plus">Dark+ (VS Code)</option>
            <option value="dracula">Dracula</option>
            <option value="github-light">GitHub Light</option>
          </select>
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#ccc' }}>
          Font size:
          <select value={fontSize} onChange={e => setFontSize(Number(e.target.value))} style={{ ...sel, width: 64 }}>
            {FONT_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>

        <button onClick={openFile} style={{ background: '#0e639c', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 12px', fontSize: 13, cursor: 'pointer' }}>
          Open File
        </button>
        <button
          onClick={() => setWordWrap(w => !w)}
          style={{ background: wordWrap ? '#1177bb' : '#0e639c', color: '#fff', border: 'none', outline: wordWrap ? '1px solid #4fc3f7' : 'none', borderRadius: 4, padding: '4px 12px', fontSize: 13, cursor: 'pointer' }}
        >
          换行
        </button>
        <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={onFileChange} />
      </div>

      <div style={{ flex: 1, overflow: 'hidden' }}>
        <PretextEditor
          ref={editorRef}
          value={code}
          onChanged={handleChanged}
          onCursorChange={setCursor}
          language={language}
          fontSize={fontSize}
          tabSize={tabSize}
          theme={theme}
          wordWrap={wordWrap}
          keymap={{ find: ['ctrl', 'p'] }}
        />
      </div>

      <div style={{
        display: 'flex', gap: 16, alignItems: 'center',
        padding: '2px 16px', background: '#007acc', color: '#fff',
        fontSize: 12, flexShrink: 0, userSelect: 'none',
      }}>
        <span>行 {cursor.line + 1}, 列 {cursor.col + 1}</span>
        <span>Tab Size: {tabSize}</span>
        <span>UTF-8</span>
        <span>{LANGUAGES.find(l => l.value === language)?.label ?? language}</span>
      </div>
    </div>
  )
}
