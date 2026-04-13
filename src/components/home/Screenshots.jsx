import { useRef, useEffect, useState } from 'react'

const BASE = import.meta.env.BASE_URL + 'gallery/'

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default function Screenshots() {
  const trackRef = useRef(null)
  const offsetRef = useRef(0)
  const rafRef = useRef(null)
  const speed = 0.5

  const [images, setImages] = useState([])

  useEffect(() => {
    fetch(import.meta.env.BASE_URL + 'gallery/manifest.json')
      .then((r) => r.json())
      .then((data) => {
        const all = data.authors.flatMap((a) =>
          a.images.map((img) => ({
            src: BASE + a.folder + '/' + img,
            alt: `Screenshot by ${a.name}`,
          }))
        )
        setImages(shuffle(all))
      })
  }, [])

  useEffect(() => {
    const track = trackRef.current
    if (!track || images.length === 0) return

    const tick = () => {
      offsetRef.current -= speed
      const halfWidth = track.scrollWidth / 2
      if (Math.abs(offsetRef.current) >= halfWidth) {
        offsetRef.current += halfWidth
      }
      track.style.transform = `translateX(${offsetRef.current}px)`
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [images])

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
