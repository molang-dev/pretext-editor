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

var SAMPLE = `function fibonacci(n: number): number {
  if (n <= 1) return n
  return fibonacci(n - 1) + fibonacci(n - 2)
}

// Test it
for (let i = 0; i < 10; i++) {
  console.log(\`fib(\${i}) = \${fibonacci(i)}\`)
}
`

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

function iconSpan(name) { return el('span', { class: 'icon icon-' + name }) }

function iconBtn(title, iconName, opts) {
  opts = opts || {}
  var cls = 'button'
  if (opts.narrow) cls += ' button--narrow'
  if (opts.active) cls += ' button--active'
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
document.body.style.cssText = 'display:flex;flex-direction:column;height:100%'

// Toolbar
var toolbar = el('div', {
  style: { display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', padding: '8px 16px', background: '#252526', borderBottom: '1px solid #333', fontSize: '13px', flexShrink: '0' },
})
toolbar.appendChild(el('b', { style: { color: '#0098ff' } }, 'pretext-editor'))
toolbar.appendChild(el('span', { style: { color: '#888' } }, 'Vanilla HTML5 Demo (zero framework)'))

// Open File button (marginLeft: auto, flush right like React)
var fileInput = el('input', { type: 'file', style: { display: 'none' } })
var openBtn = el('button', { style: Object.assign({}, btnStyle, { marginLeft: 'auto' }) }, 'Open File')
toolbar.appendChild(openBtn)
toolbar.appendChild(fileInput)

// Language selector
var langLabel = el('label', { style: { display: 'flex', alignItems: 'center', gap: '6px', color: '#ccc' } })
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

// Font size (number input like React)
var fontLabel = el('label', { style: { display: 'flex', alignItems: 'center', gap: '6px', color: '#ccc' } })
fontLabel.appendChild(document.createTextNode('Font size: '))
var fontInput = el('input', { type: 'number', style: Object.assign({}, selStyle, { width: '52px' }) })
fontInput.value = String(fontSize)
fontInput.min = '8'
fontInput.max = '40'
fontLabel.appendChild(fontInput)
toolbar.appendChild(fontLabel)

// Word wrap (checkbox like React)
var wrapLabel = el('label', { style: { display: 'flex', alignItems: 'center', gap: '6px', color: '#ccc', cursor: 'pointer' } })
var wrapCheck = el('input', { type: 'checkbox' })
wrapLabel.appendChild(wrapCheck)
wrapLabel.appendChild(document.createTextNode('Word Wrap'))
toolbar.appendChild(wrapLabel)

document.body.appendChild(toolbar)

// Editor wrapper (also serves as .pretext-editor root for CSS scoping)
var editorWrap = el('div', { class: 'pretext-editor', style: { flex: '1', position: 'relative', overflow: 'hidden' } })

// Editor container
var container = el('div', {
  class: 'editor-scroll',
  onClick: function() { textarea.focus({ preventScroll: true }) },
})

var spacer = el('div', { class: 'editor-content' })
var canvas = el('canvas', { class: 'editor-canvas' })
spacer.appendChild(canvas)
container.appendChild(spacer)

var textarea = el('textarea', {
  class: 'editor-textarea',
  rows: '1',
  autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false',
})
container.appendChild(textarea)
editorWrap.appendChild(container)

// Context menu (position:fixed, appended inside editorWrap so .pretext-editor .contextmenu selector matches)
var ctxMenu = el('div', { class: 'contextmenu', style: { display: 'none' } })
editorWrap.appendChild(ctxMenu)

// Search bar
var searchBar = el('div', { class: 'searchbar', style: { display: 'none' } })
var findRow = el('div', { class: 'searchbar-row' })
var chevBtn = iconBtn('', 'chevrondown', { narrow: true, onClick: function() { ctrl.toggleReplace() } })
var findInputWrap = el('div', { class: 'searchbar-inputwrap' })
var findInput = el('input', { class: 'searchbar-input searchbar-findinput', placeholder: 'Find' })
var togglesDiv = el('div', { class: 'searchbar-toggles' })
var caseBtn = iconBtn('Match Case (Alt+C)', 'casesensitive', { onClick: function() { ctrl.setSearchCaseSensitive(!searchState.caseSensitive) } })
var wordBtn = iconBtn('Match Whole Word (Alt+W)', 'wholeword', { onClick: function() { ctrl.setSearchWholeWord(!searchState.wholeWord) } })
var regexBtn = iconBtn('Use Regular Expression (Alt+R)', 'regex', { onClick: function() { ctrl.setSearchUseRegex(!searchState.useRegex) } })
togglesDiv.appendChild(caseBtn); togglesDiv.appendChild(wordBtn); togglesDiv.appendChild(regexBtn)
findInputWrap.appendChild(findInput); findInputWrap.appendChild(togglesDiv)
var countSpan = el('span', { class: 'searchbar-count' })
var navDiv = el('div', { class: 'searchbar-buttons' })
var prevBtn = iconBtn('Previous Match (Shift+Enter)', 'arrowup', { disabled: true, onClick: function() { ctrl.searchPrev() } })
var nextBtn = iconBtn('Next Match (Enter)', 'arrowdown', { disabled: true, onClick: function() { ctrl.searchNext() } })
var closeBtn = iconBtn('Close (Escape)', 'close', { onClick: function() { ctrl.closeSearch() } })
navDiv.appendChild(prevBtn); navDiv.appendChild(nextBtn); navDiv.appendChild(closeBtn)
findRow.appendChild(chevBtn); findRow.appendChild(findInputWrap); findRow.appendChild(countSpan); findRow.appendChild(navDiv)

var replaceRow = el('div', { class: 'searchbar-row', style: { display: 'none' } })
var replaceInputWrap = el('div', { class: 'searchbar-inputwrap' })
var replaceInput = el('input', { class: 'searchbar-input searchbar-replaceinput', placeholder: 'Replace' })
var replaceOverlay = el('div', { class: 'searchbar-overlay' })
var preserveBtn = iconBtn('Preserve Case (AB)', 'preservecase', { onClick: function() { ctrl.setPreserveCase(!searchState.preserveCase) } })
replaceOverlay.appendChild(preserveBtn); replaceInputWrap.appendChild(replaceInput); replaceInputWrap.appendChild(replaceOverlay)
var replaceNav = el('div', { class: 'searchbar-buttons' })
var replaceBtn = iconBtn('Replace (Enter)', 'replace', { disabled: true, onClick: function() { ctrl.replace() } })
var replaceAllBtn = iconBtn('Replace All (Ctrl+Alt+Enter)', 'replaceall', { disabled: true, onClick: function() { ctrl.replaceAll() } })
replaceNav.appendChild(replaceBtn); replaceNav.appendChild(replaceAllBtn)
replaceRow.appendChild(el('div', { class: 'searchbar-spacer' })); replaceRow.appendChild(replaceInputWrap); replaceRow.appendChild(replaceNav)

var errorDiv = el('div', { class: 'searchbar-error', style: { display: 'none' } })
searchBar.appendChild(findRow); searchBar.appendChild(replaceRow); searchBar.appendChild(errorDiv)
editorWrap.appendChild(searchBar)
document.body.appendChild(editorWrap)

// Status bar
var statusBar = el('div', { style: { display: 'flex', gap: '16px', alignItems: 'center', padding: '2px 16px', background: '#007acc', color: '#fff', fontSize: '12px', flexShrink: '0', userSelect: 'none' } })
var statusPos = el('span', {}, 'Ln 1, Col 1')
var statusTab = el('span', {}, 'Tab Size: ' + tabSize)
var statusEnc = el('span', {}, 'UTF-8')
var statusLang = el('span', {}, 'TypeScript')
statusBar.appendChild(statusPos); statusBar.appendChild(statusTab); statusBar.appendChild(statusEnc); statusBar.appendChild(statusLang)
document.body.appendChild(statusBar)

// --- EditorController ---
var ctrl = new EditorController({
  value: SAMPLE,
  language: language,
  theme: theme,
  fontSize: fontSize,
  tabSize: tabSize,
  wordWrap: wordWrap,
  keymap: { find: ['ctrl', 'p'] },
  onChanged: function(r1, c1, r2, c2, oldValue, newValue) {
    console.log('changed', r1, c1, r2, c2, JSON.stringify(oldValue), JSON.stringify(newValue))
  },
})

var searchState = {
  query: '', caseSensitive: false, wholeWord: false, useRegex: false,
  matchCount: 0, currentIndex: -1, isOpen: false, regexError: null,
  showReplace: false, replaceQuery: '', preserveCase: false, focusToken: 0,
}

function updateStatus(s) {
  var doc = s.doc
  statusPos.textContent = 'Ln ' + (doc.cursor.line + 1) + ', Col ' + (doc.cursor.col + 1)
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
        ctxMenu.appendChild(el('div', { class: 'contextmenu-separator' }))
      } else {
        ctxMenu.appendChild(el('div', {
          class: 'contextmenu-item' + (item.disabled ? ' contextmenu-item--disabled' : ''),
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
  findInput.className = 'searchbar-input searchbar-findinput' +
    (!!ss.query && !ss.regexError && ss.matchCount === 0 ? ' searchbar-input--nomatches' : '') +
    (ss.regexError ? ' searchbar-input--error' : '')
  findInput.title = ss.regexError || ''
  caseBtn.className = 'button' + (ss.caseSensitive ? ' button--active' : '')
  wordBtn.className = 'button' + (ss.wholeWord ? ' button--active' : '')
  regexBtn.className = 'button' + (ss.useRegex ? ' button--active' : '')
  var hasErr = !!ss.regexError
  var noMatch = !!ss.query && !hasErr && ss.matchCount === 0
  countSpan.textContent = hasErr ? '' : ss.matchCount === 0 ? (ss.query ? 'No results' : '') : (ss.currentIndex + 1) + ' of ' + (ss.matchCount > 999 ? '999+' : ss.matchCount)
  countSpan.className = 'searchbar-count' + (hasErr || noMatch ? ' searchbar-count--error' : '')
  prevBtn.disabled = ss.matchCount === 0
  nextBtn.disabled = ss.matchCount === 0
  var showR = ss.showReplace
  replaceRow.style.display = showR ? 'flex' : 'none'
  var chevSpan = chevBtn.querySelector('.icon')
  if (chevSpan) chevSpan.className = 'icon icon-chevrondown' + (showR ? '' : ' icon-chevrondown--collapsed')
  chevBtn.title = showR ? 'Collapse Replace' : 'Expand Replace'
  if (showR) {
    if (replaceInput.value !== ss.replaceQuery) replaceInput.value = ss.replaceQuery
    replaceInput.className = 'searchbar-input searchbar-replaceinput' + (noMatch ? ' searchbar-input--nomatches' : '')
    preserveBtn.className = 'button' + (ss.preserveCase ? ' button--active' : '')
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

fontInput.addEventListener('change', function() {
  fontSize = Math.max(8, Math.min(40, Number(fontInput.value)))
  fontInput.value = String(fontSize)
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

wrapCheck.addEventListener('change', function() {
  wordWrap = wrapCheck.checked
  ctrl.updateOptions({ wordWrap: wordWrap })
})

document.addEventListener('click', function(e) {
  if (!ctxMenu.contains(e.target)) ctrl.closeMenu()
})

updateStatus(ctrl.getState())
