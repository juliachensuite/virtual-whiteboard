import { forwardRef } from 'react'
import { colorFor } from '../state.js'

// A receipt spike parked in the bottom-right corner. Disposed notes (in spike
// mode) impale here and stay, stacking like restaurant tickets. Clicking it
// opens the viewer to page through and act on them. The impale animation reads
// this element's bounding box to know where to fly.
const Spike = forwardRef(function Spike({ notes, active, onOpen }, ref) {
  const count = notes.length
  // Show the newest few ticket edges fanned on the needle.
  const peek = notes.slice(-4)

  return (
    <div
      className={`spike${active ? ' spike-active' : ''}${count ? ' spike-loaded' : ''}`}
      ref={ref}
    >
      {count > 0 && (
        <button
          className="spike-open"
          onClick={onOpen}
          title={`${count} spiked note${count === 1 ? '' : 's'} — click to view`}
        >
          {count}
        </button>
      )}
      <div className="spike-stack" aria-hidden>
        {peek.map((nt, i) => {
          const c = colorFor(nt.color)
          return (
            <span
              key={nt.id}
              className="spike-ticket"
              style={{
                background: c.note,
                borderColor: c.edge,
                bottom: 30 + i * 13,
                transform: `translateX(-50%) rotate(${(i % 2 ? 1 : -1) * (2 + i)}deg)`,
                zIndex: i,
              }}
            />
          )
        })}
        {/* needle + base */}
        <span className="spike-needle" />
        <span className="spike-base" />
      </div>
      <div className="spike-label">{active ? 'Spike' : count ? 'Spike' : ''}</div>
    </div>
  )
})

export default Spike
