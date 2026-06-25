import { useEffect, useRef } from 'react'
import { colorFor } from '../state.js'

// Spike-mode disposal: the note flies from where it sat and impales onto the
// spike with a quick downward stab, then onDone flags it `spiked`. Non-
// interactive and brief — spiking is reversible from the viewer, so there's no
// aim-and-flick game like the toss.
export default function SpikeImpale({ note, origin, spikeRef, onDone }) {
  const ref = useRef(null)
  const color = colorFor(note.color)

  useEffect(() => {
    const el = ref.current
    if (!el) {
      const t = setTimeout(onDone, 0)
      return () => clearTimeout(t)
    }
    const target = spikeRef.current?.getBoundingClientRect()
    const tx = target ? target.left + target.width / 2 : window.innerWidth - 60
    const ty = target ? target.top + 18 : window.innerHeight - 150

    // Start where the note was.
    el.style.transform =
      `translate(${origin.x}px, ${origin.y}px) translate(-50%, -50%) rotate(${note.tilt || 0}deg)`
    el.style.opacity = '1'
    // Force a reflow so the transition runs from the start transform.
    void el.offsetWidth
    el.style.transition =
      'transform 0.46s cubic-bezier(.55,-0.2,.4,1.25), opacity 0.18s ease 0.34s'
    el.style.transform =
      `translate(${tx}px, ${ty}px) translate(-50%, -92%) rotate(3deg)`
    el.style.opacity = '0'

    const t = setTimeout(onDone, 480)
    return () => clearTimeout(t)
  }, [note, origin, spikeRef, onDone])

  return (
    <div className="toss-overlay spike-overlay">
      <div
        ref={ref}
        className="spike-fly"
        style={{ '--note-bg': color.note, '--note-edge': color.edge }}
      >
        <span className="spike-fly-hole" aria-hidden />
        <span className="spike-fly-text">{note.text || '…'}</span>
      </div>
    </div>
  )
}
