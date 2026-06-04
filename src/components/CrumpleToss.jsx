import { useCallback, useEffect, useRef, useState } from 'react'
import { colorFor } from '../state.js'

// Physics tuning (units are px / frame at ~60fps).
const GRAVITY = 0.55
const AIR_DRAG = 0.992
const BALL = 72 // crumpled ball diameter
const MAX_SPEED = 60

export default function CrumpleToss({ note, origin, binRef, onScored, onCancel }) {
  // phase: 'crumpling' -> 'ready' -> 'flying' -> 'scored' | 'missed'
  const [phase, setPhase] = useState('crumpling')
  const ballRef = useRef(null)
  const color = colorFor(note.color)

  // Mutable physics state kept off the render path.
  const pos = useRef({ x: origin.x, y: origin.y })
  const vel = useRef({ x: 0, y: 0 })
  const dragging = useRef(false)
  const samples = useRef([]) // recent pointer samples for flick velocity
  const raf = useRef(0)
  const prevY = useRef(origin.y)

  const paint = useCallback(() => {
    const el = ballRef.current
    if (el) {
      el.style.transform = `translate(${pos.current.x - BALL / 2}px, ${
        pos.current.y - BALL / 2
      }px) rotate(${(pos.current.x + pos.current.y) % 360}deg)`
    }
  }, [])

  // Settle into "ready" after the crumple animation plays.
  useEffect(() => {
    paint()
    const t = setTimeout(() => setPhase('ready'), 480)
    return () => clearTimeout(t)
  }, [paint])

  const stopLoop = () => {
    if (raf.current) cancelAnimationFrame(raf.current)
    raf.current = 0
  }

  const binMouth = () => {
    const r = binRef.current?.getBoundingClientRect()
    if (!r) return null
    return {
      y: r.top + r.height * 0.16,
      left: r.left + r.width * 0.14,
      right: r.right - r.width * 0.14,
      floor: r.bottom,
    }
  }

  // ----- physics loop -------------------------------------------------------
  const step = useCallback(() => {
    const mouth = binMouth()
    vel.current.y += GRAVITY
    vel.current.x *= AIR_DRAG
    prevY.current = pos.current.y
    pos.current.x += vel.current.x
    pos.current.y += vel.current.y
    paint()

    const { x, y } = pos.current
    const floorY = window.innerHeight - BALL / 2

    // Swish — crossed the bin mouth while descending, within the opening.
    if (
      mouth &&
      vel.current.y > 0 &&
      prevY.current < mouth.y &&
      y >= mouth.y &&
      x > mouth.left &&
      x < mouth.right
    ) {
      stopLoop()
      setPhase('scored')
      setTimeout(onScored, 650)
      return
    }

    // Off-screen sideways or above — a miss.
    if (x < -120 || x > window.innerWidth + 120 || y < -300) {
      stopLoop()
      setPhase('missed')
      return
    }

    // Hit the floor — settle and miss.
    if (y >= floorY) {
      pos.current.y = floorY
      vel.current = { x: 0, y: 0 }
      paint()
      stopLoop()
      setPhase('missed')
      return
    }

    raf.current = requestAnimationFrame(step)
  }, [binRef, onScored, paint])

  // ----- pointer handling ---------------------------------------------------
  const onPointerDown = (e) => {
    if (phase !== 'ready' && phase !== 'missed') return
    e.target.setPointerCapture?.(e.pointerId)
    dragging.current = true
    samples.current = [{ x: e.clientX, y: e.clientY, t: performance.now() }]
    pos.current = { x: e.clientX, y: e.clientY }
    vel.current = { x: 0, y: 0 }
    if (phase === 'missed') setPhase('ready')
    paint()
  }

  const onPointerMove = (e) => {
    if (!dragging.current) return
    pos.current = { x: e.clientX, y: e.clientY }
    samples.current.push({ x: e.clientX, y: e.clientY, t: performance.now() })
    if (samples.current.length > 6) samples.current.shift()
    paint()
  }

  const onPointerUp = () => {
    if (!dragging.current) return
    dragging.current = false
    const s = samples.current
    if (s.length >= 2) {
      const a = s[0]
      const b = s[s.length - 1]
      const dt = Math.max(b.t - a.t, 1)
      const k = 16 / dt // normalize to a 16ms frame
      let vx = (b.x - a.x) * k
      let vy = (b.y - a.y) * k
      const sp = Math.hypot(vx, vy)
      if (sp > MAX_SPEED) {
        vx = (vx / sp) * MAX_SPEED
        vy = (vy / sp) * MAX_SPEED
      }
      vel.current = { x: vx, y: vy }
    }
    // Need a real throw to fly; otherwise just stay grabbable.
    if (Math.hypot(vel.current.x, vel.current.y) > 2.5) {
      setPhase('flying')
      prevY.current = pos.current.y
      raf.current = requestAnimationFrame(step)
    }
  }

  useEffect(() => () => stopLoop(), [])

  return (
    <div className="toss-overlay">
      <div className="toss-bar">
        {phase === 'crumpling' && <span>Crumpling…</span>}
        {phase === 'ready' && (
          <span>Drag the ball and <b>flick it</b> toward the bin →</span>
        )}
        {phase === 'flying' && <span>🪂</span>}
        {phase === 'scored' && <span className="toss-score">Swish! 🎉</span>}
        {phase === 'missed' && <span className="toss-miss">Missed — flick again, or:</span>}
        <span className="toss-bar-actions">
          {(phase === 'missed' || phase === 'ready') && (
            <button className="btn btn-danger" onClick={onScored}>
              Trash it anyway
            </button>
          )}
          <button className="btn btn-ghost" onClick={onCancel}>
            Keep note
          </button>
        </span>
      </div>

      <div
        ref={ballRef}
        className={`paper-ball phase-${phase}`}
        style={{
          width: BALL,
          height: BALL,
          '--ball-bg': color.note,
          '--ball-edge': color.edge,
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <span className="ball-glyph">{phase === 'scored' ? '🗑' : ''}</span>
      </div>
    </div>
  )
}
