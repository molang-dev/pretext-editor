import { useEffect, useRef } from 'react'
import type { SearchState, SearchActions } from '../core/search'

interface SearchBarProps {
  state: SearchState
  actions: SearchActions
}

export function SearchBar({ state, actions }: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  // REVIEW: useEffect used because we need to imperatively focus the input when the bar opens
  useEffect(() => {
    if (state.isOpen) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [state.isOpen])

  if (!state.isOpen) return null

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      e.shiftKey ? actions.prev() : actions.next()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      actions.close()
    }
    e.stopPropagation()
  }

  const countText =
    state.matchCount === 0
      ? 'No results'
      : `${state.currentIndex + 1} / ${state.matchCount}`

  return (
    <div
      style={{
        position: 'absolute',
        top: 8,
        right: 16,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        background: '#252526',
        border: '1px solid #454545',
        borderRadius: 4,
        padding: '4px 8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
        color: '#cccccc',
        fontSize: 13,
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <input
        ref={inputRef}
        value={state.query}
        onChange={(e) => actions.setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Find"
        style={{
          background: '#3c3c3c',
          border: '1px solid #555',
          borderRadius: 3,
          color: '#cccccc',
          fontSize: 13,
          padding: '2px 6px',
          outline: 'none',
          width: 180,
        }}
      />
      <button
        title="Match Case"
        onClick={() => actions.setCaseSensitive(!state.caseSensitive)}
        style={{
          background: state.caseSensitive ? '#0e639c' : 'transparent',
          border: '1px solid transparent',
          borderRadius: 3,
          color: '#cccccc',
          cursor: 'pointer',
          fontSize: 12,
          fontWeight: 'bold',
          padding: '1px 5px',
          lineHeight: 1.4,
        }}
      >
        Aa
      </button>
      <span style={{ minWidth: 60, textAlign: 'center', fontSize: 12, color: '#999' }}>
        {state.query ? countText : ''}
      </span>
      <button
        title="Previous match (Shift+Enter)"
        onClick={actions.prev}
        style={navBtnStyle}
        disabled={state.matchCount === 0}
      >
        ↑
      </button>
      <button
        title="Next match (Enter)"
        onClick={actions.next}
        style={navBtnStyle}
        disabled={state.matchCount === 0}
      >
        ↓
      </button>
      <button
        title="Close (Escape)"
        onClick={actions.close}
        style={{ ...navBtnStyle, marginLeft: 4 }}
      >
        ✕
      </button>
    </div>
  )
}

const navBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  borderRadius: 3,
  color: '#cccccc',
  cursor: 'pointer',
  fontSize: 14,
  padding: '1px 4px',
  lineHeight: 1,
}
