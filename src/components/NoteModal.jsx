import { useEffect, useRef, useState } from 'react'
import { NOTE_COLORS, colorFor, randomColorId, sizeOf } from '../state.js'

const SIZES = [
  { id: 'S', label: 'Small' },
  { id: 'M', label: 'Medium' },
  { id: 'L', label: 'Large' },
]

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1)

export default function NoteModal({
  note,
  disposalMode,
  onClose,
  onEditText,
  onEditDetails,
  onSetColor,
  onSetSize,
  onDispose,
}) {
  const spikeMode = disposalMode === 'spike'
  const [draft, setDraft] = useState(note.text)
  const [details, setDetails] = useState(note.details || '')
  const textRef = useRef(null)
  const color = colorFor(note.color)
  const size = sizeOf(note)

  const commit = () => {
    if (draft !== note.text) onEditText(draft)
    if (details !== (note.details || '')) onEditDetails(details)
  }
  // Escape closes from a one-time listener, so point it at the latest commit
  // (not the render-0 closure) to save the current draft before closing.
  const commitRef = useRef(commit)
  commitRef.current = commit

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { commitRef.current(); onClose() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    textRef.current?.focus()
  }, [])

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
          <span className="modal-label">Color</span>
          <div className="modal-swatches">
            {NOTE_COLORS.map((c) => (
              <button
                key={c.id}
                className={`swatch${c.id === note.color ? ' swatch-on' : ''}`}
                style={{ background: c.note }}
                title={capitalize(c.id)}
                onClick={() => onSetColor(c.id)}
              />
            ))}
            <button
              className="swatch swatch-random"
              title="Random color"
              onClick={() => onSetColor(randomColorId(note.color))}
            />
          </div>
        </div>

        <div className="modal-row">
          <span className="modal-label">Size</span>
          <div className="size-toggle" role="group" aria-label="Note size">
            {SIZES.map((s) => (
              <button
                key={s.id}
                className={`size-opt${size === s.id ? ' on' : ''}`}
                title={s.label}
                onClick={() => onSetSize(s.id)}
              >
                {s.id}
              </button>
            ))}
          </div>
        </div>

        <div className="modal-row modal-row-stack">
          <span className="modal-label">Notes</span>
          <textarea
            className="modal-details"
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            onBlur={commit}
            placeholder="Longer notes, details, links… (hidden when the note is closed)"
          />
        </div>

        <div className="modal-actions">
          <button
            className="btn btn-danger"
            onClick={() => {
              const el = document.querySelector('.modal-note')
              const rect = el?.getBoundingClientRect()
              onDispose({
                x: rect ? rect.left + rect.width / 2 : window.innerWidth / 2,
                y: rect ? rect.top + rect.height / 2 : window.innerHeight / 2,
                w: 220,
                h: 220,
              })
            }}
          >
            {spikeMode ? '📌 Stick on spike' : '🗑 Crumple & toss'}
          </button>
        </div>

        <p className="modal-hint">
          Tip: the headline shows on the post-it; notes stay hidden until you open it.
        </p>
      </div>
    </div>
  )
}
