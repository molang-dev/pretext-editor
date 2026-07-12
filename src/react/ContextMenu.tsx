import { useEffect, useRef } from 'react'
import type { ContextMenuItem } from './PretextEditor'
import '../styles/context-menu.css'

interface Props {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

export function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  // REVIEW: useEffect used because window-level capture listener must attach after mount
  useEffect(() => {
    const onPointer = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('pointerdown', onPointer, { capture: true })
    document.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointer, { capture: true })
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div ref={ref} className="contextmenu" style={{ left: x, top: y }}>
      {items.map((item, i) =>
        item.separator ? (
          <div key={i} className="contextmenu-separator" />
        ) : (
          <MenuRow key={i} item={item} onClose={onClose} />
        )
      )}
    </div>
  )
}

function MenuRow({ item, onClose }: { item: ContextMenuItem; onClose: () => void }) {
  return (
    <div
      onClick={() => {
        if (!item.disabled) {
          item.onClick()
          onClose()
        }
      }}
      className={`contextmenu-item${item.disabled ? ' contextmenu-item--disabled' : ''}`}
    >
      {item.label}
    </div>
  )
}
