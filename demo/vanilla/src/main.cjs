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

// --- Build UI (plain DOM) ---
document.body.style.cssText = 'margin:0;padding:0;background:#1e1e1e;color:#d4d4d4;font-family:sans-serif;height:100vh;display:flex;flex-direction:column'

// Toolbar
var toolbar = document.createElement('div')
toolbar.style.cssText = 'display:flex;align-items:center;gap:12px;padding:8px 16px;background:#252526;border-bottom:1px solid #333;font-size:13px;flex-shrink:0'

var brand = document.createElement('b')
brand.style.color = '#0098ff'
brand.textContent = 'pretext-editor'
toolbar.appendChild(brand)

var tag = document.createElement('span')
tag.style.color = '#888'
tag.textContent = 'Vanilla HTML5 Demo (zero framework)'
toolbar.appendChild(tag)

// Language selector
var langLabel = document.createElement('label')
langLabel.style.cssText = 'margin-left:auto;display:flex;align-items:center;gap:6px'
langLabel.textContent = 'Language: '
var langSelect = document.createElement('select')
langSelect.style.cssText = 'background:#3c3c3c;color:#ccc;border:1px solid #555;border-radius:4px;padding:4px 8px;font-size:13px'
;['typescript','javascript','python','go','rust','json','css','html'].forEach(function(l) {
  var o = document.createElement('option')
  o.value = l
  o.textContent = l
  langSelect.appendChild(o)
})
langLabel.appendChild(langSelect)
toolbar.appendChild(langLabel)

// Scroll button
var scrollBtn = document.createElement('button')
scrollBtn.textContent = 'Scroll to Top'
scrollBtn.style.cssText = 'background:#0e639c;color:#fff;border:none;border-radius:4px;padding:4px 12px;font-size:13px;cursor:pointer'
toolbar.appendChild(scrollBtn)

document.body.appendChild(toolbar)

// Editor container
var container = document.createElement('div')
container.style.cssText = 'flex:1;position:relative;overflow:auto;outline:none;cursor:text'
container.addEventListener('click', function(e) {
  if (e.target === container) textarea.focus({ preventScroll: true })
})

// Height spacer (for scrollbar)
var spacer = document.createElement('div')
spacer.style.position = 'relative'
container.appendChild(spacer)

var canvas = document.createElement('canvas')
canvas.style.cssText = 'position:sticky;top:0;display:block;width:100%'
spacer.appendChild(canvas)

// Hidden textarea
var textarea = document.createElement('textarea')
textarea.rows = 1
textarea.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:1px;opacity:0;overflow:hidden;resize:none;border:none;outline:none;padding:0;pointer-events:none'
textarea.autocomplete = 'off'
textarea.autocorrect = 'off'
textarea.autocapitalize = 'off'
textarea.spellcheck = false
container.appendChild(textarea)

// Context menu (hidden)
var ctxMenu = document.createElement('div')
ctxMenu.style.cssText = 'position:fixed;display:none;background:#252526;border:1px solid #454545;border-radius:8px;padding:4px 0;z-index:9999;min-width:160px;box-shadow:0 4px 12px rgba(0,0,0,0.4);user-select:none'
document.body.appendChild(ctxMenu)

document.body.appendChild(container)

// Status bar
var statusBar = document.createElement('div')
statusBar.style.cssText = 'display:flex;gap:16px;padding:4px 16px;background:#007acc;color:#fff;font-size:12px;flex-shrink:0'
var statusLine = document.createElement('span')
var statusLang = document.createElement('span')
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
        var sep = document.createElement('div')
        sep.style.cssText = 'height:1px;background:#454545;margin:4px 0'
        ctxMenu.appendChild(sep)
      } else {
        var row = document.createElement('div')
        row.textContent = item.label
        row.style.cssText = 'padding:5px 20px;font-size:13px;color:' + (item.disabled ? '#5a5a5a' : '#ccc') + ';cursor:' + (item.disabled ? 'default' : 'pointer') + ';background:transparent'
        row.addEventListener('click', function() {
          if (!item.disabled) { item.onClick(); ctrl.closeMenu() }
        })
        ctxMenu.appendChild(row)
      }
    })
  } else {
    ctxMenu.style.display = 'none'
  }
}

ctrl.mount(container, canvas, textarea, function() {
  updateStatus(ctrl.getState())
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
