import Navbar from '../layout/Navbar'
import Hero from './Hero'
import Screenshots from './Screenshots'
import ToolsGrid from './ToolsGrid'
import Footer from '../layout/Footer'

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
