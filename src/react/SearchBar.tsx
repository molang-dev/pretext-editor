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
      className={`button${narrow ? ' button--narrow' : ''}${active ? ' button--active' : ''}`}
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
    <div className="searchbar">
      {/* ── Find row ── */}
      <div className="searchbar-row">
        <IconBtn
          title={state.showReplace ? 'Collapse Replace' : 'Expand Replace'}
          onClick={actions.toggleReplace}
          narrow
        >
          <span className={`icon icon-chevrondown${state.showReplace ? '' : ' icon-chevrondown--collapsed'}`} />
        </IconBtn>

        <div className="searchbar-inputwrap">
          <input
            ref={findRef}
            value={state.query}
            onChange={(e) => actions.setQuery(e.target.value)}
            onKeyDown={handleFindKeyDown}
            placeholder="Find"
            title={state.regexError ?? undefined}
            className={`searchbar-input searchbar-findinput${hasError ? ' searchbar-input--error' : ''}`}
          />
          <div className="searchbar-toggles">
            <IconBtn title="Match Case (Alt+C)" active={state.caseSensitive}
              onClick={() => actions.setCaseSensitive(!state.caseSensitive)}>
              <span className="icon icon-casesensitive" />
            </IconBtn>
            <IconBtn title="Match Whole Word (Alt+W)" active={state.wholeWord}
              onClick={() => actions.setWholeWord(!state.wholeWord)}>
              <span className="icon icon-wholeword" />
            </IconBtn>
            <IconBtn title="Use Regular Expression (Alt+R)" active={state.useRegex}
              onClick={() => actions.setUseRegex(!state.useRegex)}>
              <span className="icon icon-regex" />
            </IconBtn>
          </div>
        </div>

        <span className={`searchbar-count${hasError || noMatches ? ' searchbar-count--error' : ''}`}>
          {countText}
        </span>

        <div className="searchbar-buttons">
          <IconBtn title="Previous Match (Shift+Enter)" disabled={state.matchCount === 0} onClick={actions.prev}>
            <span className="icon icon-arrowup" />
          </IconBtn>
          <IconBtn title="Next Match (Enter)" disabled={state.matchCount === 0} onClick={actions.next}>
            <span className="icon icon-arrowdown" />
          </IconBtn>
          <IconBtn title="Close (Escape)" onClick={actions.close}>
            <span className="icon icon-close" />
          </IconBtn>
        </div>
      </div>

      {/* ── Replace row ── */}
      {state.showReplace && (
        <div className="searchbar-row">
          <div className="searchbar-spacer" />

          <div className="searchbar-inputwrap">
            <input
              ref={replaceRef}
              value={state.replaceQuery}
              onChange={(e) => actions.setReplaceQuery(e.target.value)}
              onKeyDown={handleReplaceKeyDown}
              placeholder="Replace"
              disabled={readOnly}
              className={`searchbar-input searchbar-replaceinput${readOnly ? ' searchbar-input--readonly' : ''}`}
            />
            <div className="searchbar-overlay">
              <IconBtn
                title="Preserve Case (AB)"
                active={state.preserveCase}
                disabled={readOnly}
                onClick={() => actions.setPreserveCase(!state.preserveCase)}
              >
                <span className="icon icon-preservecase" />
              </IconBtn>
            </div>
          </div>

          <div className="searchbar-buttons">
            <IconBtn
              title="Replace (Enter)"
              disabled={readOnly || state.matchCount === 0 || !!state.regexError}
              onClick={actions.replace}
            >
              <span className="icon icon-replace" />
            </IconBtn>
            <IconBtn
              title="Replace All (Ctrl+Alt+Enter)"
              disabled={readOnly || state.matchCount === 0 || !!state.regexError}
              onClick={actions.replaceAll}
            >
              <span className="icon icon-replaceall" />
            </IconBtn>
          </div>
        </div>
      )}

      {/* ── Regex error ── */}
      {state.regexError && (
        <div className="searchbar-error">{state.regexError}</div>
      )}
    </div>
  )
}
