const ICON_URL = 'https://waseku.com/press/Data_Center/images/Icon512.png'

export default function Navbar() {
  return (
    <nav className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <a href="#/">
            <img 
                src={ICON_URL} alt="Data Center icon" className="w-8 h-8 rounded cursor-pointer" />
          </a>
          Data Center Tools
        </div>
        <div className="flex items-center gap-6 text-sm text-gray-400">
          <a
            href="#/"
            onClick={(e) => {
              const el = document.getElementById('tools')
              if (el) {
                e.preventDefault()
                el.scrollIntoView({ behavior: 'smooth' })
              }
            }}
            className="hover:text-gray-100 transition-colors"
          >
            Tools
          </a>
          <a
            href="#/contributors"
            className="hover:text-gray-100 transition-colors"
          >
            Contributors
          </a>
          <a
            href="https://github.com/WindingDuke77/DC-Tools"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-1.5 rounded-lg transition-colors"
          >
            GitHub
          </a>
        </div>
      </div>
    </nav>
  )
}
