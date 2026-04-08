import { useRef, useEffect } from 'react'

const BASE = 'https://waseku.com/press/Data_Center/images/'

const images = [
  { src: `${BASE}4.png`, alt: 'Data Center screenshot 1' },
  { src: `${BASE}5.png`, alt: 'Data Center screenshot 2' },
  { src: `${BASE}Screenshot%202026-01-28%20121057.png`, alt: 'Data Center screenshot 3' },
]

export default function Screenshots() {
  const trackRef = useRef(null)
  const offsetRef = useRef(0)
  const rafRef = useRef(null)
  const speed = 0.5 // pixels per frame (~30px/s at 60fps)

  useEffect(() => {
    const track = trackRef.current
    if (!track) return

    const tick = () => {
      offsetRef.current -= speed
      // half the track width = one full set of images
      const halfWidth = track.scrollWidth / 2
      if (Math.abs(offsetRef.current) >= halfWidth) {
        offsetRef.current += halfWidth
      }
      track.style.transform = `translateX(${offsetRef.current}px)`
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  // Render images twice for seamless wrap
  const allImages = [...images, ...images]

  return (
    <section className="py-16 overflow-hidden">
      <div
        ref={trackRef}
        className="flex gap-6 will-change-transform"
        style={{ width: 'max-content' }}
      >
        {allImages.map((img, i) => (
          <img
            key={i}
            src={img.src}
            alt={img.alt}
            className="h-72 sm:h-96 aspect-video object-cover rounded-2xl border border-gray-800 shadow-2xl flex-shrink-0"
          />
        ))}
      </div>
    </section>
  )
}
