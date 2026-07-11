// Vanilla HTML5 demo — zero framework, pure EditorController + DOM
var { EditorController, FONT_SIZE_TO_LINE_HEIGHT } = require('pretext-editor')

var LANGUAGES = [
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

var EXT_TO_LANG = {
  ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
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

function iconSpan(name) { return el('span', { class: 'pteic pteic-' + name }) }

function iconBtn(title, iconName, opts) {
  opts = opts || {}
  var cls = 'pteic-btn'
  if (opts.narrow) cls += ' pteic-btn--narrow'
  if (opts.active) cls += ' pteic-btn--active'
  return el('button', { class: cls, title: title, disabled: !!opts.disabled, onClick: opts.onClick }, [iconSpan(iconName)])
}

var selStyle = { background: '#3c3c3c', color: '#ccc', border: '1px solid #555', borderRadius: '4px', padding: '4px 8px', fontSize: '13px' }
var btnStyle = { background: '#0e639c', color: '#fff', border: 'none', borderRadius: '4px', padding: '4px 12px', fontSize: '13px', cursor: 'pointer' }

// --- State ---
var language = 'typescript'
var theme = 'dark-plus'
var fontSize = 14
var tabSize = 4
var wordWrap = false

// --- Build UI ---
document.body.style.cssText = 'margin:0;padding:0;background:#1e1e1e;color:#d4d4d4;font-family:sans-serif;height:100vh;display:flex;flex-direction:column'

// Toolbar
var toolbar = el('div', {
  style: { display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', padding: '8px 16px', background: '#252526', borderBottom: '1px solid #333', fontSize: '13px', flexShrink: '0' },
})
toolbar.appendChild(el('b', { style: { color: '#0098ff' } }, 'pretext-editor'))
toolbar.appendChild(el('span', { style: { color: '#888' } }, 'Vanilla HTML5 Demo (zero framework)'))

// Language selector
var langLabel = el('label', { style: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px', color: '#ccc' } })
langLabel.appendChild(document.createTextNode('Language: '))
var langSelect = el('select', { style: selStyle })
LANGUAGES.forEach(function(l) {
  var opt = el('option', { value: l.value }, l.label)
  if (l.value === language) opt.selected = true
  langSelect.appendChild(opt)
})
langLabel.appendChild(langSelect)
toolbar.appendChild(langLabel)

// Theme selector
var themeLabel = el('label', { style: { display: 'flex', alignItems: 'center', gap: '6px', color: '#ccc' } })
themeLabel.appendChild(document.createTextNode('Theme: '))
var themeSelect = el('select', { style: selStyle })
;[
  { value: 'dark-plus', label: 'Dark+ (VS Code)' },
  { value: 'dracula', label: 'Dracula' },
  { value: 'github-light', label: 'GitHub Light' },
].forEach(function(t) {
  themeSelect.appendChild(el('option', { value: t.value }, t.label))
})
themeLabel.appendChild(themeSelect)
toolbar.appendChild(themeLabel)

// Font size selector
var fontLabel = el('label', { style: { display: 'flex', alignItems: 'center', gap: '6px', color: '#ccc' } })
fontLabel.appendChild(document.createTextNode('Font size: '))
var fontSelect = el('select', { style: Object.assign({}, selStyle, { width: '64px' }) })
for (var n = 5; n <= 40; n += 2) {
  var opt = el('option', { value: String(n) }, String(n))
  if (n === fontSize) opt.selected = true
  fontSelect.appendChild(opt)
}
fontLabel.appendChild(fontSelect)
toolbar.appendChild(fontLabel)

// Open File button
var fileInput = el('input', { type: 'file', style: { display: 'none' } })
var openBtn = el('button', { style: btnStyle }, 'Open File')
toolbar.appendChild(openBtn)
toolbar.appendChild(fileInput)

// Word wrap button
var wrapBtn = el('button', { style: btnStyle }, '换行')
toolbar.appendChild(wrapBtn)

document.body.appendChild(toolbar)

// Editor wrapper
var editorWrap = el('div', { style: { flex: '1', position: 'relative', overflow: 'hidden' } })

// Editor container
var container = el('div', {
  class: 'pteic-editor-scroll',
  style: { position: 'relative', overflow: 'auto', outline: 'none', cursor: 'text' },
  onClick: function() { textarea.focus({ preventScroll: true }) },
})

var spacer = el('div', { class: 'pteic-editor-content' })
var canvas = el('canvas', { class: 'pteic-editor-canvas' })
spacer.appendChild(canvas)
container.appendChild(spacer)

var textarea = el('textarea', {
  class: 'pteic-editor-textarea',
  rows: '1',
  autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false',
})
container.appendChild(textarea)
editorWrap.appendChild(container)

// Context menu
var ctxMenu = el('div', { class: 'pteic-cm', style: { display: 'none' } })
document.body.appendChild(ctxMenu)

// Search bar
var searchBar = el('div', { class: 'pteic-sb', style: { display: 'none' } })
var findRow = el('div', { class: 'pteic-sb-row' })
var chevBtn = iconBtn('', 'chevron-down', { narrow: true, onClick: function() { ctrl.toggleReplace() } })
var findInputWrap = el('div', { class: 'pteic-sb-input-wrap' })
var findInput = el('input', { class: 'pteic-sb-input pteic-sb-find-input', placeholder: 'Find' })
var togglesDiv = el('div', { class: 'pteic-sb-toggles' })
var caseBtn = iconBtn('Match Case (Alt+C)', 'case-sensitive', { onClick: function() { ctrl.setSearchCaseSensitive(!searchState.caseSensitive) } })
var wordBtn = iconBtn('Match Whole Word (Alt+W)', 'whole-word', { onClick: function() { ctrl.setSearchWholeWord(!searchState.wholeWord) } })
var regexBtn = iconBtn('Use Regular Expression (Alt+R)', 'regex', { onClick: function() { ctrl.setSearchUseRegex(!searchState.useRegex) } })
togglesDiv.appendChild(caseBtn); togglesDiv.appendChild(wordBtn); togglesDiv.appendChild(regexBtn)
findInputWrap.appendChild(findInput); findInputWrap.appendChild(togglesDiv)
var countSpan = el('span', { class: 'pteic-sb-count' })
var navDiv = el('div', { class: 'pteic-sb-btns' })
var prevBtn = iconBtn('Previous Match (Shift+Enter)', 'arrow-up', { disabled: true, onClick: function() { ctrl.searchPrev() } })
var nextBtn = iconBtn('Next Match (Enter)', 'arrow-down', { disabled: true, onClick: function() { ctrl.searchNext() } })
var closeBtn = iconBtn('Close (Escape)', 'close', { onClick: function() { ctrl.closeSearch() } })
navDiv.appendChild(prevBtn); navDiv.appendChild(nextBtn); navDiv.appendChild(closeBtn)
findRow.appendChild(chevBtn); findRow.appendChild(findInputWrap); findRow.appendChild(countSpan); findRow.appendChild(navDiv)

var replaceRow = el('div', { class: 'pteic-sb-row', style: { display: 'none' } })
var replaceInputWrap = el('div', { class: 'pteic-sb-input-wrap' })
var replaceInput = el('input', { class: 'pteic-sb-input pteic-sb-replace-input', placeholder: 'Replace' })
var replaceOverlay = el('div', { class: 'pteic-sb-overlay' })
var preserveBtn = iconBtn('Preserve Case (AB)', 'preserve-case', { onClick: function() { ctrl.setPreserveCase(!searchState.preserveCase) } })
replaceOverlay.appendChild(preserveBtn); replaceInputWrap.appendChild(replaceInput); replaceInputWrap.appendChild(replaceOverlay)
var replaceNav = el('div', { class: 'pteic-sb-btns' })
var replaceBtn = iconBtn('Replace (Enter)', 'replace', { disabled: true, onClick: function() { ctrl.replace() } })
var replaceAllBtn = iconBtn('Replace All (Ctrl+Alt+Enter)', 'replace-all', { disabled: true, onClick: function() { ctrl.replaceAll() } })
replaceNav.appendChild(replaceBtn); replaceNav.appendChild(replaceAllBtn)
replaceRow.appendChild(el('div', { class: 'pteic-sb-spacer' })); replaceRow.appendChild(replaceInputWrap); replaceRow.appendChild(replaceNav)

var errorDiv = el('div', { class: 'pteic-sb-error', style: { display: 'none' } })
searchBar.appendChild(findRow); searchBar.appendChild(replaceRow); searchBar.appendChild(errorDiv)
editorWrap.appendChild(searchBar)
document.body.appendChild(editorWrap)

// Status bar
var statusBar = el('div', { style: { display: 'flex', gap: '16px', alignItems: 'center', padding: '2px 16px', background: '#007acc', color: '#fff', fontSize: '12px', flexShrink: '0', userSelect: 'none' } })
var statusPos = el('span', {}, '行 1, 列 1')
var statusTab = el('span', {}, 'Tab Size: ' + tabSize)
var statusEnc = el('span', {}, 'UTF-8')
var statusLang = el('span', {}, 'TypeScript')
statusBar.appendChild(statusPos); statusBar.appendChild(statusTab); statusBar.appendChild(statusEnc); statusBar.appendChild(statusLang)
document.body.appendChild(statusBar)

// --- EditorController ---
var ctrl = new EditorController({
  value: SAMPLE,
  onChange: function() {},
  language: language,
  theme: theme,
  fontSize: fontSize,
  tabSize: tabSize,
  wordWrap: wordWrap,
})

var searchState = {
  query: '', caseSensitive: false, wholeWord: false, useRegex: false,
  matchCount: 0, currentIndex: -1, isOpen: false, regexError: null,
  showReplace: false, replaceQuery: '', preserveCase: false, focusToken: 0,
}

function updateStatus(s) {
  var doc = s.doc
  statusPos.textContent = '行 ' + (doc.cursor.line + 1) + ', 列 ' + (doc.cursor.col + 1)
  statusTab.textContent = 'Tab Size: ' + tabSize
  var langEntry = LANGUAGES.find(function(l) { return l.value === language })
  statusLang.textContent = langEntry ? langEntry.label : language
  spacer.style.height = Math.max(1, doc.lines.length) * FONT_SIZE_TO_LINE_HEIGHT(fontSize) + 16 + 'px'

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
          onClick: function() { if (!item.disabled) { item.onClick(); ctrl.closeMenu() } },
        }, item.label))
      }
    })
  } else {
    ctxMenu.style.display = 'none'
  }

  var ss = s.searchState
  var wasClosed = !searchState.isOpen
  var focusTokenChanged = ss.focusToken !== searchState.focusToken
  searchState = ss

  searchBar.style.display = ss.isOpen ? 'flex' : 'none'
  if (ss.isOpen && (wasClosed || focusTokenChanged)) { findInput.focus(); findInput.select() }
  if (findInput.value !== ss.query) findInput.value = ss.query
  findInput.className = 'pteic-sb-input pteic-sb-find-input' +
    (!!ss.query && !ss.regexError && ss.matchCount === 0 ? ' pteic-sb-input--no-matches' : '') +
    (ss.regexError ? ' pteic-sb-input--error' : '')
  findInput.title = ss.regexError || ''
  caseBtn.className = 'pteic-btn' + (ss.caseSensitive ? ' pteic-btn--active' : '')
  wordBtn.className = 'pteic-btn' + (ss.wholeWord ? ' pteic-btn--active' : '')
  regexBtn.className = 'pteic-btn' + (ss.useRegex ? ' pteic-btn--active' : '')
  var hasErr = !!ss.regexError
  var noMatch = !!ss.query && !hasErr && ss.matchCount === 0
  countSpan.textContent = hasErr ? '' : ss.matchCount === 0 ? (ss.query ? 'No results' : '') : (ss.currentIndex + 1) + ' of ' + (ss.matchCount > 999 ? '999+' : ss.matchCount)
  countSpan.className = 'pteic-sb-count' + (hasErr || noMatch ? ' pteic-sb-count--error' : '')
  prevBtn.disabled = ss.matchCount === 0
  nextBtn.disabled = ss.matchCount === 0
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
  errorDiv.style.display = ss.regexError ? 'block' : 'none'
  if (ss.regexError) errorDiv.textContent = ss.regexError
}

textarea.addEventListener('keydown', function(e) { ctrl.onKeyDown(e) })
ctrl.mount(container, canvas, textarea, function() { updateStatus(ctrl.getState()) })

// Search input handlers
findInput.addEventListener('keydown', function(e) {
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
findInput.addEventListener('input', function() { ctrl.setSearchQuery(findInput.value) })

replaceInput.addEventListener('keydown', function(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); return }
  if (e.altKey && !e.ctrlKey && !e.metaKey) {
    var k = e.key.toLowerCase()
    if (k === 'c') { e.preventDefault(); ctrl.setSearchCaseSensitive(!searchState.caseSensitive); return }
    if (k === 'w') { e.preventDefault(); ctrl.setSearchWholeWord(!searchState.wholeWord); return }
    if (k === 'r') { e.preventDefault(); ctrl.setSearchUseRegex(!searchState.useRegex); return }
  }
  if ((e.ctrlKey || e.metaKey) && e.altKey && e.key === 'Enter') { e.preventDefault(); ctrl.replaceAll(); return }
  if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); ctrl.replace(); return }
  if (e.key === 'Escape') { e.preventDefault(); ctrl.closeSearch(); textarea.focus({ preventScroll: true }); return }
  e.stopPropagation()
})
replaceInput.addEventListener('input', function() { ctrl.setReplaceQuery(replaceInput.value) })

// Toolbar events
langSelect.addEventListener('change', function() {
  language = langSelect.value
  ctrl.updateOptions({ language: language })
})

themeSelect.addEventListener('change', function() {
  theme = themeSelect.value
  ctrl.updateOptions({ theme: theme })
})

fontSelect.addEventListener('change', function() {
  fontSize = Number(fontSelect.value)
  ctrl.updateOptions({ fontSize: fontSize })
})

openBtn.addEventListener('click', function() { fileInput.click() })

fileInput.addEventListener('change', function(e) {
  var file = e.target.files && e.target.files[0]
  if (!file) return
  var ext = file.name.split('.').pop().toLowerCase()
  var detected = EXT_TO_LANG[ext]
  if (detected) {
    language = detected
    ctrl.updateOptions({ language: language })
    for (var i = 0; i < langSelect.options.length; i++) {
      if (langSelect.options[i].value === language) { langSelect.selectedIndex = i; break }
    }
  }
  var reader = new FileReader()
  reader.onload = function() { ctrl.setValue(reader.result) }
  reader.readAsText(file)
  e.target.value = ''
})

wrapBtn.addEventListener('click', function() {
  wordWrap = !wordWrap
  ctrl.updateOptions({ wordWrap: wordWrap })
  wrapBtn.style.background = wordWrap ? '#1177bb' : '#0e639c'
  wrapBtn.style.outline = wordWrap ? '1px solid #4fc3f7' : 'none'
})

document.addEventListener('click', function(e) {
  if (!ctxMenu.contains(e.target)) ctrl.closeMenu()
})

updateStatus(ctrl.getState())
