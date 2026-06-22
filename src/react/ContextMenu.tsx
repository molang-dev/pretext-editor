import { useEffect, useRef } from 'react'
import type { ContextMenuItem } from './PretextEditor'

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
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left: x,
        top: y,
        background: '#252526',
        border: '1px solid #454545',
        borderRadius: 8,
        padding: '4px 0',
        zIndex: 9999,
        minWidth: 160,
        boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        userSelect: 'none',
      }}
    >
      {items.map((item, i) =>
        item.separator ? (
          <div key={i} style={{ height: 1, background: '#454545', margin: '4px 0' }} />
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
      style={{
        padding: '5px 20px',
        fontSize: 13,
        color: item.disabled ? '#5a5a5a' : '#cccccc',
        cursor: item.disabled ? 'default' : 'pointer',
        background: 'transparent',
      }}
      onMouseEnter={e => {
        if (!item.disabled) (e.currentTarget as HTMLDivElement).style.background = '#094771'
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.background = 'transparent'
      }}
    >
      {item.label}
    </div>
  )
}
