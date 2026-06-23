// Vanilla HTML5 demo — zero framework, pure EditorController + DOM
var { EditorController, FONT_SIZE_TO_LINE_HEIGHT } = require('pretext-editor')

var SAMPLE = '// Pure HTML5 + pretext-editor — no React, no Vue, no anything\n' +
  'function fibonacci(n) {\n' +
  '  if (n <= 1) return n\n' +
  '  return fibonacci(n - 1) + fibonacci(n - 2)\n' +
  '}\n' +
  '\n' +
  'for (var i = 0; i < 10; i++) {\n' +
  '  console.log("fib(" + i + ") = " + fibonacci(i))\n' +
  '}\n'

// --- Helpers ---
function el(tag, attrs, children) {
  var e = document.createElement(tag)
  if (attrs) {
    Object.keys(attrs).forEach(function(k) {
      if (k === 'style') {
        Object.keys(attrs.style).forEach(function(p) { e.style[p] = attrs.style[p] })
      } else if (k === 'class') {
        e.className = attrs['class']
      } else if (k === 'disabled') {
        if (attrs[k]) e.setAttribute('disabled', '')
      } else if (k === 'title') {
        e.title = attrs[k]
      } else if (k.startsWith('on')) {
        e.addEventListener(k.slice(2).toLowerCase(), attrs[k])
      } else {
        e.setAttribute(k, attrs[k])
      }
    })
  }
  if (children !== undefined) {
    if (typeof children === 'string') e.textContent = children
    else if (Array.isArray(children)) children.forEach(function(c) { if (c) e.appendChild(c) })
    else e.appendChild(children)
  }
  return e
}

function iconSpan(name) {
  return el('span', { class: 'pteic pteic-' + name })
}

function iconBtn(title, iconName, opts) {
  opts = opts || {}
  var cls = 'pteic-btn'
  if (opts.narrow) cls += ' pteic-btn--narrow'
  if (opts.active) cls += ' pteic-btn--active'
  return el('button', {
    class: cls,
    title: title,
    disabled: !!opts.disabled,
    onClick: opts.onClick,
  }, [iconSpan(iconName)])
}

// --- Build UI ---
document.body.style.cssText = 'margin:0;padding:0;background:#1e1e1e;color:#d4d4d4;font-family:sans-serif;height:100vh;display:flex;flex-direction:column'

// Toolbar
var toolbar = el('div', {
  style: { display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 16px', background: '#252526', borderBottom: '1px solid #333', fontSize: '13px', flexShrink: '0' },
})
toolbar.appendChild(el('b', { style: { color: '#0098ff' } }, 'pretext-editor'))
toolbar.appendChild(el('span', { style: { color: '#888' } }, 'Vanilla HTML5 Demo (zero framework)'))

// Language selector
var langLabel = el('label', { style: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' } })
langLabel.appendChild(document.createTextNode('Language: '))
var langSelect = el('select', { style: { background: '#3c3c3c', color: '#ccc', border: '1px solid #555', borderRadius: '4px', padding: '4px 8px', fontSize: '13px' } })
;['typescript','javascript','python','go','rust','json','css','html'].forEach(function(l) {
  langSelect.appendChild(el('option', { value: l }, l))
})
langLabel.appendChild(langSelect)
toolbar.appendChild(langLabel)

// Scroll button
var scrollBtn = el('button', {
  style: { background: '#0e639c', color: '#fff', border: 'none', borderRadius: '4px', padding: '4px 12px', fontSize: '13px', cursor: 'pointer' },
}, 'Scroll to Top')
toolbar.appendChild(scrollBtn)
document.body.appendChild(toolbar)

// Editor wrapper (for search bar positioning)
var editorWrap = el('div', { style: { flex: '1', position: 'relative', overflow: 'hidden' } })

// Editor container
var container = el('div', {
  class: 'pteic-editor-scroll',
  style: { position: 'relative', overflow: 'auto', outline: 'none', cursor: 'text' },
  onClick: function() {
    textarea.focus({ preventScroll: true })
  },
})

// Spacer + canvas
var spacer = el('div', { class: 'pteic-editor-content' })
var canvas = el('canvas', { class: 'pteic-editor-canvas' })
spacer.appendChild(canvas)
container.appendChild(spacer)

// Hidden textarea
var textarea = el('textarea', {
  class: 'pteic-editor-textarea',
  rows: '1',
  autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false',
})
container.appendChild(textarea)

editorWrap.appendChild(container)

// Context menu (rendered at document level)
var ctxMenu = el('div', { class: 'pteic-cm', style: { display: 'none' } })
document.body.appendChild(ctxMenu)

// ---- Search bar (plain DOM) ----
var searchBar = el('div', { class: 'pteic-sb', style: { display: 'none' } })

// Find row
var findRow = el('div', { class: 'pteic-sb-row' })

var chevBtn = iconBtn('', 'chevron-down', { narrow: true, onClick: function() { ctrl.toggleReplace() } })

var findInputWrap = el('div', { class: 'pteic-sb-input-wrap' })
var findInput = el('input', { class: 'pteic-sb-input pteic-sb-find-input', placeholder: 'Find' })

var togglesDiv = el('div', { class: 'pteic-sb-toggles' })
var caseBtn = iconBtn('Match Case (Alt+C)', 'case-sensitive', { onClick: function() { ctrl.setSearchCaseSensitive(!searchState.caseSensitive) } })
var wordBtn = iconBtn('Match Whole Word (Alt+W)', 'whole-word', { onClick: function() { ctrl.setSearchWholeWord(!searchState.wholeWord) } })
var regexBtn = iconBtn('Use Regular Expression (Alt+R)', 'regex', { onClick: function() { ctrl.setSearchUseRegex(!searchState.useRegex) } })
togglesDiv.appendChild(caseBtn)
togglesDiv.appendChild(wordBtn)
togglesDiv.appendChild(regexBtn)

findInputWrap.appendChild(findInput)
findInputWrap.appendChild(togglesDiv)

var countSpan = el('span', { class: 'pteic-sb-count' })

var navDiv = el('div', { class: 'pteic-sb-btns' })
var prevBtn = iconBtn('Previous Match (Shift+Enter)', 'arrow-up', { disabled: true, onClick: function() { ctrl.searchPrev() } })
var nextBtn = iconBtn('Next Match (Enter)', 'arrow-down', { disabled: true, onClick: function() { ctrl.searchNext() } })
var closeBtn = iconBtn('Close (Escape)', 'close', { onClick: function() { ctrl.closeSearch() } })
navDiv.appendChild(prevBtn)
navDiv.appendChild(nextBtn)
navDiv.appendChild(closeBtn)

findRow.appendChild(chevBtn)
findRow.appendChild(findInputWrap)
findRow.appendChild(countSpan)
findRow.appendChild(navDiv)

// Replace row
var replaceRow = el('div', { class: 'pteic-sb-row', style: { display: 'none' } })
var replaceSpacer = el('div', { class: 'pteic-sb-spacer' })

var replaceInputWrap = el('div', { class: 'pteic-sb-input-wrap' })
var replaceInput = el('input', { class: 'pteic-sb-input pteic-sb-replace-input', placeholder: 'Replace' })
var replaceOverlay = el('div', { class: 'pteic-sb-overlay' })
var preserveBtn = iconBtn('Preserve Case (AB)', 'preserve-case', { onClick: function() { ctrl.setPreserveCase(!searchState.preserveCase) } })
replaceOverlay.appendChild(preserveBtn)
replaceInputWrap.appendChild(replaceInput)
replaceInputWrap.appendChild(replaceOverlay)

var replaceNav = el('div', { class: 'pteic-sb-btns' })
var replaceBtn = iconBtn('Replace (Enter)', 'replace', { disabled: true, onClick: function() { ctrl.replace() } })
var replaceAllBtn = iconBtn('Replace All (Ctrl+Alt+Enter)', 'replace-all', { disabled: true, onClick: function() { ctrl.replaceAll() } })
replaceNav.appendChild(replaceBtn)
replaceNav.appendChild(replaceAllBtn)

replaceRow.appendChild(replaceSpacer)
replaceRow.appendChild(replaceInputWrap)
replaceRow.appendChild(replaceNav)

// Error line
var errorDiv = el('div', { class: 'pteic-sb-error', style: { display: 'none' } })

searchBar.appendChild(findRow)
searchBar.appendChild(replaceRow)
searchBar.appendChild(errorDiv)
editorWrap.appendChild(searchBar)

document.body.appendChild(editorWrap)

// Status bar
var statusBar = el('div', { style: { display: 'flex', gap: '16px', padding: '4px 16px', background: '#007acc', color: '#fff', fontSize: '12px', flexShrink: '0' } })
var statusLine = el('span')
var statusLang = el('span')
statusBar.appendChild(statusLine)
statusBar.appendChild(statusLang)
document.body.appendChild(statusBar)

// --- EditorController ---
var ctrl = new EditorController({
  value: SAMPLE,
  onChange: function(v) {},
  language: 'typescript',
  fontSize: 14,
})

// Local snapshot of search state (reconciled in updateStatus)
var searchState = {
  query: '', caseSensitive: false, wholeWord: false, useRegex: false,
  matchCount: 0, currentIndex: -1, isOpen: false, regexError: null,
  showReplace: false, replaceQuery: '', preserveCase: false,
  focusToken: 0,
}

function updateStatus(s) {
  var doc = s.doc
  statusLine.textContent = 'Ln ' + (doc.cursor.line + 1) + ', Col ' + (doc.cursor.col + 1)
  statusLang.textContent = 'Lines: ' + doc.lines.length
  spacer.style.height = Math.max(1, doc.lines.length) * FONT_SIZE_TO_LINE_HEIGHT(14) + 16 + 'px'

  // Context menu
  if (s.menuPos) {
    ctxMenu.style.display = 'block'
    ctxMenu.style.left = s.menuPos.x + 'px'
    ctxMenu.style.top = s.menuPos.y + 'px'
    ctxMenu.innerHTML = ''
    s.menuItems.forEach(function(item) {
      if (item.separator) {
        ctxMenu.appendChild(el('div', { class: 'pteic-cm-separator' }))
      } else {
        ctxMenu.appendChild(el('div', {
          class: 'pteic-cm-item' + (item.disabled ? ' pteic-cm-item--disabled' : ''),
          onClick: function() {
            if (!item.disabled) { item.onClick(); ctrl.closeMenu() }
          },
        }, item.label))
      }
    })
  } else {
    ctxMenu.style.display = 'none'
  }

  // Search bar
  var ss = s.searchState
  var wasClosed = !searchState.isOpen
  var focusTokenChanged = ss.focusToken !== searchState.focusToken
  searchState = ss

  if (ss.isOpen) {
    searchBar.style.display = 'flex'
    if (wasClosed || focusTokenChanged) {
      findInput.focus()
      findInput.select()
    }
  } else {
    searchBar.style.display = 'none'
  }

  // Update find input
  if (findInput.value !== ss.query) findInput.value = ss.query
  findInput.className = 'pteic-sb-input pteic-sb-find-input' +
    (!!ss.query && !ss.regexError && ss.matchCount === 0 ? ' pteic-sb-input--no-matches' : '') +
    (ss.regexError ? ' pteic-sb-input--error' : '')
  findInput.title = ss.regexError || ''

  // Update toggle buttons
  caseBtn.className = 'pteic-btn' + (ss.caseSensitive ? ' pteic-btn--active' : '')
  wordBtn.className = 'pteic-btn' + (ss.wholeWord ? ' pteic-btn--active' : '')
  regexBtn.className = 'pteic-btn' + (ss.useRegex ? ' pteic-btn--active' : '')

  // Count
  var hasErr = !!ss.regexError
  var noMatch = !!ss.query && !hasErr && ss.matchCount === 0
  countSpan.textContent = hasErr ? '' : ss.matchCount === 0 ? (ss.query ? 'No results' : '') : (ss.currentIndex + 1) + ' of ' + (ss.matchCount > 999 ? '999+' : ss.matchCount)
  countSpan.className = 'pteic-sb-count' + (hasErr || noMatch ? ' pteic-sb-count--error' : '')

  // Nav buttons
  prevBtn.disabled = ss.matchCount === 0
  nextBtn.disabled = ss.matchCount === 0

  // Replace row
  var showR = ss.showReplace
  replaceRow.style.display = showR ? 'flex' : 'none'
  var chevSpan = chevBtn.querySelector('.pteic')
  if (chevSpan) chevSpan.className = 'pteic pteic-chevron-down' + (showR ? '' : ' pteic-chevron-down--collapsed')
  chevBtn.title = showR ? 'Collapse Replace' : 'Expand Replace'

  if (showR) {
    if (replaceInput.value !== ss.replaceQuery) replaceInput.value = ss.replaceQuery
    replaceInput.className = 'pteic-sb-input pteic-sb-replace-input' + (noMatch ? ' pteic-sb-input--no-matches' : '')
    preserveBtn.className = 'pteic-btn' + (ss.preserveCase ? ' pteic-btn--active' : '')
    preserveBtn.disabled = ss.useRegex
    replaceBtn.disabled = ss.matchCount === 0 || !!ss.regexError
    replaceAllBtn.disabled = ss.matchCount === 0 || !!ss.regexError
  }

  // Error
  if (ss.regexError) {
    errorDiv.style.display = 'block'
    errorDiv.textContent = ss.regexError
  } else {
    errorDiv.style.display = 'none'
  }
}

// Forward keyboard shortcuts (Ctrl+F/Z, arrows, etc.) from textarea to controller
textarea.addEventListener('keydown', function(e) {
  ctrl.onKeyDown(e)
})

ctrl.mount(container, canvas, textarea, function() {
  updateStatus(ctrl.getState())
})

// --- Keyboard handlers for search inputs ---
findInput.addEventListener('keydown', function(e) {
  // Block browser Ctrl+F / Cmd+F when search input is focused
  if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); return }
  if (e.altKey && !e.ctrlKey && !e.metaKey) {
    var k = e.key.toLowerCase()
    if (k === 'c') { e.preventDefault(); ctrl.setSearchCaseSensitive(!searchState.caseSensitive); return }
    if (k === 'w') { e.preventDefault(); ctrl.setSearchWholeWord(!searchState.wholeWord); return }
    if (k === 'r') { e.preventDefault(); ctrl.setSearchUseRegex(!searchState.useRegex); return }
  }
  if (e.key === 'Enter') { e.preventDefault(); e.shiftKey ? ctrl.searchPrev() : ctrl.searchNext(); return }
  if (e.key === 'Escape') { e.preventDefault(); ctrl.closeSearch(); textarea.focus({ preventScroll: true }); return }
  e.stopPropagation()
})

findInput.addEventListener('input', function() {
  ctrl.setSearchQuery(findInput.value)
})

replaceInput.addEventListener('keydown', function(e) {
  // Block browser Ctrl+F / Cmd+F when search input is focused
  if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); return }
  if (e.altKey && !e.ctrlKey && !e.metaKey) {
    var k = e.key.toLowerCase()
    if (k === 'c') { e.preventDefault(); ctrl.setSearchCaseSensitive(!searchState.caseSensitive); return }
    if (k === 'w') { e.preventDefault(); ctrl.setSearchWholeWord(!searchState.wholeWord); return }
    if (k === 'r') { e.preventDefault(); ctrl.setSearchUseRegex(!searchState.useRegex); return }
  }
  if ((e.ctrlKey || e.metaKey) && e.altKey && e.key === 'Enter') {
    e.preventDefault(); ctrl.replaceAll(); return
  }
  if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
    e.preventDefault(); ctrl.replace(); return
  }
  if (e.key === 'Escape') { e.preventDefault(); ctrl.closeSearch(); textarea.focus({ preventScroll: true }); return }
  e.stopPropagation()
})

replaceInput.addEventListener('input', function() {
  ctrl.setReplaceQuery(replaceInput.value)
})

// --- Toolbar events ---
langSelect.addEventListener('change', function() {
  ctrl.updateOptions({ language: langSelect.value })
})

scrollBtn.addEventListener('click', function() {
  ctrl.getHandle().scrollToLine(0)
})

// Hide context menu on outside click
document.addEventListener('click', function(e) {
  if (!ctxMenu.contains(e.target)) ctrl.closeMenu()
})

// Initial render
updateStatus(ctrl.getState())
