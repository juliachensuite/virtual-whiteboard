import { useEffect, useRef, useState } from 'react'
import { URGENCY_COLORS, colorFor } from '../state.js'

export default function NoteModal({
  note,
  subTaskCount,
  onClose,
  onEditText,
  onSetColor,
  onOpenSubBoard,
  onToss,
}) {
  const [draft, setDraft] = useState(note.text)
  const textRef = useRef(null)
  const color = colorFor(note.color)

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    textRef.current?.focus()
  }, [])

  const commit = () => {
    if (draft !== note.text) onEditText(draft)
  }

  return (
    <div className="modal-backdrop" onClick={() => { commit(); onClose() }}>
      <div
        className="modal-note"
        style={{ '--note-bg': color.note, '--note-edge': color.edge }}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close" title="Close" onClick={() => { commit(); onClose() }}>
          ×
        </button>

        <textarea
          ref={textRef}
          className="modal-text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          placeholder="Write a note…"
        />

        <div className="modal-row">
          <span className="modal-label">Urgency</span>
          <div className="modal-swatches">
            {URGENCY_COLORS.map((c) => (
              <button
                key={c.id}
                className={`swatch${c.id === note.color ? ' swatch-on' : ''}`}
                style={{ background: c.note }}
                title={c.label}
                onClick={() => onSetColor(c.id)}
              />
            ))}
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn btn-primary" onClick={onOpenSubBoard}>
            {subTaskCount > 0
              ? `Open sub-board (${subTaskCount})`
              : 'Open sub-board'}
          </button>
          <button
            className="btn btn-danger"
            onClick={() => {
              const el = document.querySelector('.modal-note')
              const rect = el?.getBoundingClientRect()
              onToss({
                x: rect ? rect.left + rect.width / 2 : window.innerWidth / 2,
                y: rect ? rect.top + rect.height / 2 : window.innerHeight / 2,
                w: 220,
                h: 220,
              })
            }}
          >
            🗑 Crumple & toss
          </button>
        </div>

        <p className="modal-hint">
          Tip: drag notes between sections right on the board.
        </p>
      </div>
    </div>
  )
}
