import { useEffect, useRef, useState } from 'react'
import type { SearchState, SearchActions } from '../core/search'

interface SearchBarProps {
  state: SearchState
  actions: SearchActions
  /** When true, Replace and Replace All buttons are disabled */
  readOnly?: boolean
}

function IconBtn({
  children,
  title,
  active,
  disabled,
  onClick,
  width,
}: {
  children: React.ReactNode
  title: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
  width?: number
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
        width: width ?? 26,
        height: 26,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: 'none',
        borderRadius: 4,
        background: active ? '#0e639c' : hovered && !disabled ? '#37373d' : 'transparent',
        color: disabled ? '#555' : '#cccccc',
        cursor: disabled ? 'default' : 'pointer',
        fontSize: 13,
        fontFamily: 'system-ui, sans-serif',
        padding: 0,
        flexShrink: 0,
        lineHeight: 1,
        outline: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  )
}

export function SearchBar({ state, actions, readOnly }: SearchBarProps) {
  const findRef = useRef<HTMLInputElement>(null)
  const replaceRef = useRef<HTMLInputElement>(null)

  // REVIEW: useEffect used because we need to imperatively focus the input when the bar opens
  useEffect(() => {
    if (state.isOpen) {
      findRef.current?.focus()
      findRef.current?.select()
    }
  }, [state.isOpen])

  if (!state.isOpen) return null

  const handleFindKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      e.shiftKey ? actions.prev() : actions.next()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      actions.close()
    }
    e.stopPropagation()
  }

  const handleReplaceKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (!readOnly) e.shiftKey ? actions.replaceAll() : actions.replace()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      actions.close()
    }
    e.stopPropagation()
  }

  const hasError = !!state.regexError
  const noMatches = !!state.query && !hasError && state.matchCount === 0
  const inputBorderColor = hasError || noMatches ? '#f48771' : '#555'

  const countText = hasError
    ? ''
    : state.matchCount === 0
      ? (state.query ? 'No results' : '')
      : `${state.currentIndex + 1} of ${state.matchCount}`

  const countColor = hasError || noMatches ? '#f48771' : '#d4d4d4'

  // 3 toggle buttons × 26px + 2px gaps × 2 + 4px right padding
  const togglesWidth = 3 * 26 + 2 * 2 + 4

  const inputStyle: React.CSSProperties = {
    width: 240,
    background: '#3c3c3c',
    border: `1px solid #555`,
    borderRadius: 3,
    color: '#d4d4d4',
    fontSize: 14,
    paddingTop: 2,
    paddingBottom: 2,
    paddingLeft: 8,
    paddingRight: 8,
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
    height: 30,
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: 10,
        right: 18,
        zIndex: 100,
        background: '#252526',
        border: '1px solid #454545',
        borderRadius: 6,
        boxShadow: '0 4px 14px rgba(0,0,0,0.6)',
        padding: '6px 8px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        userSelect: 'none',
      }}
    >
      {/* ── Find row ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>

        {/* Toggle replace chevron */}
        <IconBtn
          title={state.showReplace ? 'Collapse Replace' : 'Expand Replace'}
          onClick={actions.toggleReplace}
          width={22}
        >
          <span style={{
            display: 'inline-block',
            fontSize: 12,
            transform: state.showReplace ? 'rotate(90deg)' : 'none',
            transition: 'transform 0.12s',
          }}>›</span>
        </IconBtn>

        {/* Find input + embedded toggles */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <input
            ref={findRef}
            value={state.query}
            onChange={(e) => actions.setQuery(e.target.value)}
            onKeyDown={handleFindKeyDown}
            placeholder="Find"
            title={state.regexError ?? undefined}
            style={{
              ...inputStyle,
              paddingRight: togglesWidth,
              borderColor: inputBorderColor,
            }}
          />
          <div style={{
            position: 'absolute',
            right: 3,
            top: '50%',
            transform: 'translateY(-50%)',
            display: 'flex',
            gap: 2,
            alignItems: 'center',
          }}>
            <IconBtn title="Match Case (Alt+C)" active={state.caseSensitive}
              onClick={() => actions.setCaseSensitive(!state.caseSensitive)}>
              <span style={{ fontStyle: 'italic', fontWeight: 'bold', fontSize: 12, letterSpacing: '-0.5px' }}>Aa</span>
            </IconBtn>
            <IconBtn title="Match Whole Word (Alt+W)" active={state.wholeWord}
              onClick={() => actions.setWholeWord(!state.wholeWord)}>
              <span style={{ fontFamily: 'monospace', textDecoration: 'underline', fontSize: 13 }}>W</span>
            </IconBtn>
            <IconBtn title="Use Regular Expression (Alt+R)" active={state.useRegex}
              onClick={() => actions.setUseRegex(!state.useRegex)}>
              <span style={{ fontFamily: 'monospace', fontSize: 12 }}>.*</span>
            </IconBtn>
          </div>
        </div>

        {/* Count */}
        <span style={{
          fontSize: 13,
          color: countColor,
          minWidth: 74,
          textAlign: 'center',
          flexShrink: 0,
          whiteSpace: 'nowrap',
        }}>
          {countText}
        </span>

        {/* Prev / Next / Close */}
        <div style={{ display: 'flex', gap: 2 }}>
          <IconBtn title="Previous Match (Shift+Enter)" disabled={state.matchCount === 0} onClick={actions.prev}>↑</IconBtn>
          <IconBtn title="Next Match (Enter)" disabled={state.matchCount === 0} onClick={actions.next}>↓</IconBtn>
          <IconBtn title="Close (Escape)" onClick={actions.close}>✕</IconBtn>
        </div>
      </div>

      {/* ── Replace row ── */}
      {state.showReplace && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {/* spacer aligns with find chevron */}
          <div style={{ width: 22, flexShrink: 0 }} />

          {/* Replace input */}
          <input
            ref={replaceRef}
            value={state.replaceQuery}
            onChange={(e) => actions.setReplaceQuery(e.target.value)}
            onKeyDown={handleReplaceKeyDown}
            placeholder="Replace"
            disabled={readOnly}
            style={{ ...inputStyle, borderColor: '#555', opacity: readOnly ? 0.4 : 1 }}
          />

          {/* Replace / Replace All */}
          <div style={{ display: 'flex', gap: 2 }}>
            <IconBtn
              title="Replace (Enter)"
              disabled={readOnly || state.matchCount === 0 || !!state.regexError}
              onClick={actions.replace}
              width={26}
            >
              <span style={{ fontSize: 15 }}>⟳</span>
            </IconBtn>
            <IconBtn
              title="Replace All"
              disabled={readOnly || state.matchCount === 0 || !!state.regexError}
              onClick={actions.replaceAll}
              width={46}
            >
              <span style={{ fontSize: 12 }}>⟳ All</span>
            </IconBtn>
          </div>
        </div>
      )}

      {/* ── Regex error ── */}
      {state.regexError && (
        <div style={{
          fontSize: 12,
          color: '#f48771',
          paddingLeft: 27,
          maxWidth: 420,
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
