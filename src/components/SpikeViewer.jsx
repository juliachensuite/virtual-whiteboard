import { useEffect, useState } from 'react'
import { colorFor } from '../state.js'

// Opened by clicking the spike. Pages left/right through the impaled notes
// (newest first) and acts on the current one: put it back on the board, or
// send it to the trash. "Clear spike" sends them all to the trash at once.
export default function SpikeViewer({
  notes,
  onReturnToBoard,
  onSendToTrash,
  onClearAll,
  onClose,
}) {
  const [i, setI] = useState(0)

  // Keep the cursor in range as the stack shrinks under us.
  const count = notes.length
  const idx = Math.min(i, Math.max(count - 1, 0))
  const note = notes[idx]

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') setI((v) => Math.max(0, v - 1))
      if (e.key === 'ArrowRight') setI((v) => Math.min(count - 1, v + 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, count])

  useEffect(() => {
    if (count === 0) onClose()
  }, [count, onClose])

  if (!note) return null
  const color = colorFor(note.color)

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="spike-viewer" onClick={(e) => e.stopPropagation()}>
        <header className="spike-viewer-head">
          <h3>On the spike</h3>
          <span className="spike-viewer-count">{idx + 1} / {count}</span>
          <button className="modal-close" title="Close" onClick={onClose}>×</button>
        </header>

        <div className="spike-viewer-body">
          <button
            className="spike-nav"
            disabled={idx === 0}
            onClick={() => setI((v) => Math.max(0, v - 1))}
            aria-label="Previous"
          >
            ‹
          </button>

          <article
            className="spike-card"
            style={{ '--note-bg': color.note, '--note-edge': color.edge }}
          >
            <div className="spike-card-text">
              {note.text || <span className="note-placeholder">Empty note</span>}
            </div>
            {note.details?.trim() && (
              <div className="spike-card-details">{note.details}</div>
            )}
          </article>

          <button
            className="spike-nav"
            disabled={idx >= count - 1}
            onClick={() => setI((v) => Math.min(count - 1, v + 1))}
            aria-label="Next"
          >
            ›
          </button>
        </div>

        <div className="spike-viewer-actions">
          <button className="btn" onClick={() => onReturnToBoard(note.id)}>
            ↩ Return to board
          </button>
          <button className="btn btn-danger" onClick={() => onSendToTrash(note.id)}>
            🗑 Send to trash
          </button>
          <span className="spike-viewer-spacer" />
          <button className="btn btn-ghost" onClick={onClearAll}>
            Clear spike → trash
          </button>
        </div>
      </div>
    </div>
  )
}
