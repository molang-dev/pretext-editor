import { useEffect, useRef } from 'react'
import type { SearchState, SearchActions } from '../core/search'
import '../styles/icons.css'
import '../styles/search-bar.css'

interface SearchBarProps {
  state: SearchState
  actions: SearchActions
  readOnly?: boolean
}

function IconBtn({
  children,
  title,
  active,
  disabled,
  onClick,
  narrow,
}: {
  children: React.ReactNode
  title: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
  narrow?: boolean
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`pteic-btn${narrow ? ' pteic-btn--narrow' : ''}${active ? ' pteic-btn--active' : ''}`}
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
  }, [state.isOpen, state.focusToken])

  if (!state.isOpen) return null

  const handleFindKeyDown = (e: React.KeyboardEvent) => {
    // Block browser Ctrl+F / Cmd+F when search input is focused
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); return }
    if (e.altKey && !e.ctrlKey && !e.metaKey) {
      const k = e.key.toLowerCase()
      if (k === 'c') { e.preventDefault(); actions.setCaseSensitive(!state.caseSensitive); return }
      if (k === 'w') { e.preventDefault(); actions.setWholeWord(!state.wholeWord); return }
      if (k === 'r') { e.preventDefault(); actions.setUseRegex(!state.useRegex); return }
    }
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
    // Block browser Ctrl+F / Cmd+F when search input is focused
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); return }
    if (e.altKey && !e.ctrlKey && !e.metaKey) {
      const k = e.key.toLowerCase()
      if (k === 'c') { e.preventDefault(); actions.setCaseSensitive(!state.caseSensitive); return }
      if (k === 'w') { e.preventDefault(); actions.setWholeWord(!state.wholeWord); return }
      if (k === 'r') { e.preventDefault(); actions.setUseRegex(!state.useRegex); return }
    }
    if ((e.ctrlKey || e.metaKey) && e.altKey && e.key === 'Enter') {
      e.preventDefault()
      if (!readOnly) actions.replaceAll()
    } else if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault()
      if (!readOnly) actions.replace()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      actions.close()
    }
    e.stopPropagation()
  }

  const hasError = !!state.regexError
  const noMatches = !!state.query && !hasError && state.matchCount === 0

  const countText = hasError
    ? ''
    : state.matchCount === 0
      ? (state.query ? 'No results' : '')
      : `${state.currentIndex + 1} of ${state.matchCount > 999 ? '999+' : state.matchCount}`

  return (
    <div className="pteic-sb">
      {/* ── Find row ── */}
      <div className="pteic-sb-row">
        <IconBtn
          title={state.showReplace ? 'Collapse Replace' : 'Expand Replace'}
          onClick={actions.toggleReplace}
          narrow
        >
          <span className={`pteic pteic-chevron-down${state.showReplace ? '' : ' pteic-chevron-down--collapsed'}`} />
        </IconBtn>

        <div className="pteic-sb-input-wrap">
          <input
            ref={findRef}
            value={state.query}
            onChange={(e) => actions.setQuery(e.target.value)}
            onKeyDown={handleFindKeyDown}
            placeholder="Find"
            title={state.regexError ?? undefined}
            className={`pteic-sb-input pteic-sb-find-input${noMatches ? ' pteic-sb-input--no-matches' : ''}${hasError ? ' pteic-sb-input--error' : ''}`}
          />
          <div className="pteic-sb-toggles">
            <IconBtn title="Match Case (Alt+C)" active={state.caseSensitive}
              onClick={() => actions.setCaseSensitive(!state.caseSensitive)}>
              <span className="pteic pteic-case-sensitive" />
            </IconBtn>
            <IconBtn title="Match Whole Word (Alt+W)" active={state.wholeWord}
              onClick={() => actions.setWholeWord(!state.wholeWord)}>
              <span className="pteic pteic-whole-word" />
            </IconBtn>
            <IconBtn title="Use Regular Expression (Alt+R)" active={state.useRegex}
              onClick={() => actions.setUseRegex(!state.useRegex)}>
              <span className="pteic pteic-regex" />
            </IconBtn>
          </div>
        </div>

        <span className={`pteic-sb-count${hasError || noMatches ? ' pteic-sb-count--error' : ''}`}>
          {countText}
        </span>

        <div className="pteic-sb-btns">
          <IconBtn title="Previous Match (Shift+Enter)" disabled={state.matchCount === 0} onClick={actions.prev}>
            <span className="pteic pteic-arrow-up" />
          </IconBtn>
          <IconBtn title="Next Match (Enter)" disabled={state.matchCount === 0} onClick={actions.next}>
            <span className="pteic pteic-arrow-down" />
          </IconBtn>
          <IconBtn title="Close (Escape)" onClick={actions.close}>
            <span className="pteic pteic-close" />
          </IconBtn>
        </div>
      </div>

      {/* ── Replace row ── */}
      {state.showReplace && (
        <div className="pteic-sb-row">
          <div className="pteic-sb-spacer" />

          <div className="pteic-sb-input-wrap">
            <input
              ref={replaceRef}
              value={state.replaceQuery}
              onChange={(e) => actions.setReplaceQuery(e.target.value)}
              onKeyDown={handleReplaceKeyDown}
              placeholder="Replace"
              disabled={readOnly}
              className={`pteic-sb-input pteic-sb-replace-input${noMatches ? ' pteic-sb-input--no-matches' : ''}${readOnly ? ' pteic-sb-input--readonly' : ''}`}
            />
            <div className="pteic-sb-overlay">
              <IconBtn
                title="Preserve Case (AB)"
                active={state.preserveCase}
                disabled={readOnly || state.useRegex}
                onClick={() => actions.setPreserveCase(!state.preserveCase)}
              >
                <span className="pteic pteic-preserve-case" />
              </IconBtn>
            </div>
          </div>

          <div className="pteic-sb-btns">
            <IconBtn
              title="Replace (Enter)"
              disabled={readOnly || state.matchCount === 0 || !!state.regexError}
              onClick={actions.replace}
            >
              <span className="pteic pteic-replace" />
            </IconBtn>
            <IconBtn
              title="Replace All (Ctrl+Alt+Enter)"
              disabled={readOnly || state.matchCount === 0 || !!state.regexError}
              onClick={actions.replaceAll}
            >
              <span className="pteic pteic-replace-all" />
            </IconBtn>
          </div>
        </div>
      )}

      {/* ── Regex error ── */}
      {state.regexError && (
        <div className="pteic-sb-error">{state.regexError}</div>
      )}
    </div>
  )
}
