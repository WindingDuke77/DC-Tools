import { useState, useEffect } from 'react'
import Navbar from '../layout/Navbar'
import Footer from '../layout/Footer'

const BASE = import.meta.env.BASE_URL + 'gallery/'
const GITHUB_URL = 'https://github.com/WindingDuke77/DC-Tools'

export default function Gallery() {
  const [authors, setAuthors] = useState([])
  const [lightbox, setLightbox] = useState(null)

  useEffect(() => {
    fetch(import.meta.env.BASE_URL + 'gallery/manifest.json')
      .then((r) => r.json())
      .then((data) => setAuthors(data.authors))
  }, [])

  return (
    <div className="min-h-screen flex flex-col bg-gray-950 text-gray-100">
      <Navbar />
      <div className="flex-1">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <h1 className="text-4xl font-bold mb-4 text-center">Gallery</h1>
          <p className="text-gray-400 text-center mb-12 max-w-xl mx-auto">
            Screenshots from the community. DM{' '}
            <span className="text-indigo-400 font-semibold">dutc</span> on
            Discord or{' '}
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-400 hover:text-indigo-300 underline"
            >
              make a pull request on GitHub
            </a>{' '}
            to get your photos added!
          </p>

          {authors.map((author) => (
            <section key={author.name} className="mb-14">
              <h2 className="text-2xl font-semibold mb-6 text-indigo-400">
                {author.name}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {author.images.map((img) => (
                  <button
                    key={img}
                    onClick={() =>
                      setLightbox(BASE + author.folder + '/' + img)
                    }
                    className="overflow-hidden rounded-xl border border-gray-800 hover:border-indigo-500 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <img
                      src={BASE + author.folder + '/' + img}
                      alt={`Screenshot by ${author.name}`}
                      className="w-full aspect-video object-cover hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setLightbox(null)}
        >
          <img
            src={lightbox}
            alt="Full size screenshot"
            className="max-w-full max-h-[90vh] object-contain rounded-lg"
          />
        </div>
      )}

      <Footer />
    </div>
  )
}
