const SCREENSHOT_URL = 'https://waseku.com/press/Data_Center/images/4.png'
const SCREENSHOT2_URL = 'https://waseku.com/press/Data_Center/images/5.png'

export default function Screenshots() {
  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <div className="grid sm:grid-cols-2 gap-6">
        <img src={SCREENSHOT_URL} alt="Data Center screenshot" className="rounded-2xl border border-gray-800 shadow-2xl" />
        <img src={SCREENSHOT2_URL} alt="Data Center screenshot" className="rounded-2xl border border-gray-800 shadow-2xl" />
      </div>
    </section>
  )
}
