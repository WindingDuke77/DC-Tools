import Navbar from './Navbar'
import Footer from './Footer'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      <Navbar />
      <main className="flex-1 flex items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-8xl sm:text-9xl font-bold text-indigo-500 mb-4">404</h1>
          <p className="text-2xl sm:text-3xl font-semibold mb-2">Page not found</p>
          <p className="text-gray-400 mb-8 max-w-md mx-auto">
            Looks like this rack was never installed. The page you're looking for doesn't exist.
          </p>
          <a
            href="#/"
            className="inline-block bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-6 py-3 rounded-xl transition-colors"
          >
            Back to Home
          </a>
        </div>
      </main>
      <Footer />
    </div>
  )
}
