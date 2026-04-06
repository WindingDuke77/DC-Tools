const TAGS = [
  'Hands-on Building',
  'Visual Networking',
  'Customer Goals',
  'Progression System',
  'Redundancy',
  'Maintenance & Reliability',
]

export default function About() {
  return (
    <section id="about" className="border-t border-gray-800">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">About the Game</h2>
        <p className="text-gray-400 max-w-2xl mx-auto mb-6">
          Build, cable, and automate. Assemble racks, servers, and switches, connect
          enough capacity for each app, earn money from processed data, and unlock gear and
          bigger customers with XP and reputation. Follow colored data packets as your center
          comes to life.
        </p>
        <div className="flex flex-wrap justify-center gap-3 text-sm">
          {TAGS.map((tag) => (
            <span key={tag} className="bg-gray-800 px-3 py-1 rounded-full">{tag}</span>
          ))}
        </div>
      </div>
    </section>
  )
}
