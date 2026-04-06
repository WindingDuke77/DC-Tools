const LOGO_URL = 'https://waseku.com/press/Data_Center/images/DataCenterLogo.png'
const HERO_URL = 'https://waseku.com/press/Data_Center/images/MainCapsule4.png'

export default function Hero() {
  return (
    <header className="relative overflow-hidden">
      <div className="absolute inset-0">
        <img src={HERO_URL} alt="" className="w-full h-full object-cover opacity-20" />
        <div className="absolute inset-0 bg-gradient-to-b from-gray-950/60 via-gray-950/80 to-gray-950" />
      </div>
      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-24 sm:py-32 text-center">
        <img src={LOGO_URL} alt="Data Center logo" className="mx-auto h-20 sm:h-28 mb-8" />
        <p className="text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto mb-4">
          Community-made tools for <strong className="text-gray-200">Data Center</strong> 
        </p>
        <p className="text-sm text-gray-500 max-w-lg mx-auto mb-10">
          This is an unofficial fan site.
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <a
            href="#/"
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-6 py-3 rounded-xl transition-colors"
          >
            Explore Tools
          </a>
          <a
            href="https://www.youtube.com/watch?v=TWjKP_xzcM8"
            target="_blank"
            rel="noopener noreferrer"
            className="border border-gray-700 hover:border-gray-500 text-gray-300 hover:text-white font-medium px-6 py-3 rounded-xl transition-colors"
          >
            ▶ Watch Trailer
          </a>
        </div>
      </div>
    </header>
  )
}
