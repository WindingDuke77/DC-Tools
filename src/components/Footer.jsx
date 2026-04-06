const ICON_URL = 'https://waseku.com/press/Data_Center/images/Icon512.png'

export default function Footer() {
  return (
    <footer className="border-t border-gray-800 py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-500">
        <div className="flex items-center gap-2">
          <img src={ICON_URL} alt="" className="w-5 h-5 rounded" />
          <span>Unofficial community tools for Data Center</span>
        </div>
        <div className="flex gap-4">
          <a href="https://waseku.com" target="_blank" rel="noopener noreferrer" className="hover:text-gray-300 transition-colors">
            Waseku
          </a>
          <a href="https://store.steampowered.com/app/4170200/Data_Center" target="_blank" rel="noopener noreferrer" className="hover:text-gray-300 transition-colors">
            Steam
          </a>
        </div>
      </div>
    </footer>
  )
}
