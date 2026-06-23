import { useEffect, useRef, useState } from 'react'
import type { SearchState, SearchActions } from '../core/search'

interface SearchBarProps {
  state: SearchState
  actions: SearchActions
}

function IconBtn({
  children,
  title,
  active,
  disabled,
  onClick,
}: {
  children: React.ReactNode
  title: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 22,
        height: 22,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: 'none',
        borderRadius: 3,
        background: active ? '#0e639c' : hovered && !disabled ? '#37373d' : 'transparent',
        color: disabled ? '#5a5a5a' : '#cccccc',
        cursor: disabled ? 'default' : 'pointer',
        fontSize: 12,
        fontFamily: 'system-ui, sans-serif',
        padding: 0,
        flexShrink: 0,
        lineHeight: 1,
        outline: 'none',
      }}
    >
      {children}
    </button>
  )
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

  const hasError = !!state.regexError
  const noMatches = !!state.query && !hasError && state.matchCount === 0
  const inputBorderColor = hasError || noMatches ? '#f48771' : '#3c3c3c'

  const countText = hasError
    ? ''
    : state.matchCount === 0
      ? (state.query ? 'No results' : '')
      : `${state.currentIndex + 1} of ${state.matchCount}`

  const countColor = hasError || noMatches ? '#f48771' : '#a0a0a0'

  return (
    <div
      style={{
        position: 'absolute',
        top: 8,
        right: 16,
        zIndex: 100,
        background: '#252526',
        border: '1px solid #454545',
        borderRadius: 4,
        boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
        padding: '5px 6px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        userSelect: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {/* Search input */}
        <input
          ref={inputRef}
          value={state.query}
          onChange={(e) => actions.setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Find"
          title={state.regexError ?? undefined}
          style={{
            width: 200,
            background: '#3c3c3c',
            border: `1px solid ${inputBorderColor}`,
            borderRadius: 2,
            color: '#cccccc',
            fontSize: 13,
            padding: '3px 6px',
            outline: 'none',
            fontFamily: 'inherit',
            boxSizing: 'border-box',
          }}
        />

        {/* Toggle buttons: Aa .* W */}
        <div style={{ display: 'flex', gap: 1 }}>
          <IconBtn
            title="Match Case (Alt+C)"
            active={state.caseSensitive}
            onClick={() => actions.setCaseSensitive(!state.caseSensitive)}
          >
            <span style={{ fontStyle: 'italic', fontWeight: 'bold', letterSpacing: '-1px' }}>Aa</span>
          </IconBtn>
          <IconBtn
            title="Match Whole Word (Alt+W)"
            active={state.wholeWord}
            onClick={() => actions.setWholeWord(!state.wholeWord)}
          >
            <span style={{ fontFamily: 'monospace', textDecoration: 'underline', fontSize: 13 }}>W</span>
          </IconBtn>
          <IconBtn
            title="Use Regular Expression (Alt+R)"
            active={state.useRegex}
            onClick={() => actions.setUseRegex(!state.useRegex)}
          >
            <span style={{ fontFamily: 'monospace', fontSize: 12 }}>.*</span>
          </IconBtn>
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 16, background: '#555', flexShrink: 0 }} />

        {/* Match count */}
        <span style={{
          fontSize: 11,
          color: countColor,
          minWidth: 68,
          textAlign: 'center',
          flexShrink: 0,
          whiteSpace: 'nowrap',
        }}>
          {countText}
        </span>

        {/* Divider */}
        <div style={{ width: 1, height: 16, background: '#555', flexShrink: 0 }} />

        {/* Prev / Next */}
        <div style={{ display: 'flex', gap: 1 }}>
          <IconBtn
            title="Previous Match (Shift+Enter)"
            disabled={state.matchCount === 0}
            onClick={actions.prev}
          >
            ↑
          </IconBtn>
          <IconBtn
            title="Next Match (Enter)"
            disabled={state.matchCount === 0}
            onClick={actions.next}
          >
            ↓
          </IconBtn>
        </div>

        {/* Close */}
        <IconBtn title="Close (Escape)" onClick={actions.close}>✕</IconBtn>
      </div>

      {/* Regex error message */}
      {state.regexError && (
        <div style={{
          fontSize: 11,
          color: '#f48771',
          padding: '0 2px',
          maxWidth: 360,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {state.regexError}
        </div>
      )}
    </div>
  )
}
