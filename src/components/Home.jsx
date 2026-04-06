import Navbar from './Navbar'
import Hero from './Hero'
import Screenshots from './Screenshots'
import ToolsGrid from './ToolsGrid'
import Footer from './Footer'

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <Navbar />
      <Hero />
      <Screenshots />
      <ToolsGrid />
      <Footer />
    </div>
  )
}
