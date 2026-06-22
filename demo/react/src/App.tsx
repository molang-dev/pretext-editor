import React, { useState, useCallback } from 'react'
import { PretextEditor } from 'pretext-editor/react'
import type { PretextEditorHandle } from 'pretext-editor/react'

const SAMPLE_CODE = `function fibonacci(n: number): number {
  if (n <= 1) return n
  return fibonacci(n - 1) + fibonacci(n - 2)
}

// Test it
for (let i = 0; i < 10; i++) {
  console.log(\`fib(\${i}) = \${fibonacci(i)}\`)
}
`

export default function App() {
  const [code, setCode] = useState(SAMPLE_CODE)
  const [language, setLanguage] = useState('typescript')
  const editorRef = React.useRef<PretextEditorHandle>(null)

  const handleChange = useCallback((value: string) => {
    setCode(value)
  }, [])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '8px 16px', background: '#252526',
        borderBottom: '1px solid #333',
        fontSize: 13,
      }}>
        <b style={{ color: '#0098ff' }}>pretext-editor</b>
        <span style={{ color: '#888' }}>React Demo</span>

        <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          Language:
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            style={{
              background: '#3c3c3c', color: '#ccc', border: '1px solid #555',
              borderRadius: 4, padding: '4px 8px', fontSize: 13,
            }}
          >
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

        <button
          onClick={() => editorRef.current?.scrollToLine(0)}
          style={{
            background: '#0e639c', color: '#fff', border: 'none',
            borderRadius: 4, padding: '4px 12px', fontSize: 13, cursor: 'pointer',
          }}
        >
          Scroll to Top
        </button>
      </div>

      {/* Editor */}
      <div style={{ flex: 1 }}>
        <PretextEditor
          ref={editorRef}
          value={code}
          onChange={handleChange}
          language={language}
          fontSize={14}
        />
      </div>
    </div>
  )
}
