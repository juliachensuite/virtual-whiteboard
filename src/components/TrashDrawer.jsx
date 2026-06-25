import { useEffect } from 'react'
import { colorFor, TRASH_WARN } from '../state.js'

// A slide-in drawer listing every tossed / cleared-from-spike note. Each row
// can be restored to its board or deleted for good; "Empty trash" clears all.
// Trash is kept until cleared, with a size nudge once it gets large.
export default function TrashDrawer({
  trash,
  onRestore,
  onDeleteForever,
  onEmpty,
  onClose,
}) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="trash-drawer" onClick={(e) => e.stopPropagation()}>
        <header className="drawer-head">
          <h3>🗑 Trash <span className="drawer-count">{trash.length}</span></h3>
          <div className="drawer-head-actions">
            {trash.length > 0 && (
              <button className="btn btn-danger" onClick={onEmpty}>Empty trash</button>
            )}
            <button className="modal-close" title="Close" onClick={onClose}>×</button>
          </div>
        </header>

        {trash.length > TRASH_WARN && (
          <p className="drawer-warn">
            ⚠ Trash is holding {trash.length} notes. Empty it (or export a backup)
            to keep your saved data lean.
          </p>
        )}

        {trash.length === 0 ? (
          <p className="drawer-empty">
            Nothing here. Tossed notes and notes cleared off the spike land here,
            where you can restore them or delete them for good.
          </p>
        ) : (
          <ul className="trash-list">
            {trash.map((entry) => {
              const color = colorFor(entry.note.color)
              return (
                <li className="trash-item" key={entry.tid}>
                  <span
                    className="trash-swatch"
                    style={{ background: color.note, borderColor: color.edge }}
                  />
                  <div className="trash-item-body">
                    <div className="trash-item-text">
                      {entry.note.text || <em>(empty note)</em>}
                    </div>
                    <div className="trash-item-meta">
                      {entry.boardTitle} · {whenAgo(entry.deletedAt)}
                    </div>
                  </div>
                  <div className="trash-item-actions">
                    <button
                      className="btn btn-sm"
                      title="Restore to its board"
                      onClick={() => onRestore(entry.tid)}
                    >
                      Restore
                    </button>
                    <button
                      className="btn btn-sm btn-danger"
                      title="Delete permanently"
                      onClick={() => onDeleteForever(entry.tid)}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </aside>
    </div>
  )
}

function whenAgo(ts) {
  if (!ts) return 'deleted'
  const min = Math.floor((Date.now() - ts) / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} hr ago`
  const day = Math.floor(hr / 24)
  return `${day} day${day > 1 ? 's' : ''} ago`
}
