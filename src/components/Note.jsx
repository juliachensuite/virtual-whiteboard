import { useState } from 'react'
import { URGENCY_COLORS, colorFor } from '../state.js'

export default function Note({
  note,
  left,
  top,
  dragging,
  onBeginDrag,
  onSetColor,
  onToss,
}) {
  const [showColors, setShowColors] = useState(false)
  const color = colorFor(note.color)

  const handleToss = (e) => {
    e.stopPropagation()
    const rect = e.currentTarget.closest('.note')?.getBoundingClientRect()
    onToss({
      x: rect ? rect.left + rect.width / 2 : window.innerWidth / 2,
      y: rect ? rect.top + rect.height / 2 : window.innerHeight / 2,
      w: rect?.width || 176,
      h: rect?.height || 168,
    })
  }

  // Start a drag only when the gesture begins on the note body — never on the
  // action buttons or the color popover.
  const onPointerDown = (e) => {
    if (e.button != null && e.button !== 0) return
    if (e.target.closest('.note-actions')) return
    onBeginDrag(e)
  }

  return (
    <article
      className={`note${dragging ? ' note-dragging' : ''}`}
      style={{
        left,
        top,
        '--note-bg': color.note,
        '--note-edge': color.edge,
        '--tilt': `${note.tilt || 0}deg`,
      }}
      onPointerDown={onPointerDown}
    >
      <div className="note-fold" aria-hidden />

      <div className="note-text">
        {note.text || <span className="note-placeholder">Empty note — tap to edit</span>}
      </div>

      {note.details?.trim() && (
        <span className="note-detail-badge" title="Has notes — tap to open" aria-hidden>
          📝
        </span>
      )}

      <div className="note-actions">
        <div className="color-wrap">
          <button
            className="action-btn"
            title="Urgency color"
            onClick={(e) => {
              e.stopPropagation()
              setShowColors((v) => !v)
            }}
          >
            <span className="swatch-dot" style={{ background: color.note }} />
          </button>
          {showColors && (
            <div className="color-pop" onMouseLeave={() => setShowColors(false)}>
              {URGENCY_COLORS.map((c) => (
                <button
                  key={c.id}
                  className={`swatch${c.id === note.color ? ' swatch-on' : ''}`}
                  style={{ background: c.note }}
                  title={c.label}
                  onClick={(e) => {
                    e.stopPropagation()
                    onSetColor(c.id)
                    setShowColors(false)
                  }}
                />
              ))}
            </div>
          )}
        </div>

        <button
          className="action-btn action-trash"
          title="Crumple & toss"
          onClick={handleToss}
        >
          🗑
        </button>
      </div>
    </article>
  )
}
