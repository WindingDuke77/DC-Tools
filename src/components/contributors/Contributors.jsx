import Navbar from '../layout/Navbar'
import Footer from '../layout/Footer'

const developers = [
  {
    name: 'Jessica',
    handle: '@dutc',
    avatar: 'https://avatars.githubusercontent.com/u/64500127',
    role: 'Developer',
  },
]

const ideaSmiths = [
  {
    name: 'damppancakes',
    avatar:
      'https://cdn.discordapp.com/avatars/727244866098299010/5c0ffd7ef132fd84618f837347761a3c.webp?size=96',
    contribution: 'Custom presets',
  },
  {
    name: 'dpslwk',
    avatar:
      'https://cdn.discordapp.com/avatars/904757369936961616/c0a1c90893dd0a27371613ae85a8112b.webp?size=96',
    contribution: 'Cable A & B colors and color palette',
  },
]

function ContributorCard({ name, handle, avatar, role, contribution }) {
  return (
    <div className="flex items-center gap-4 bg-gray-900 border border-gray-800 rounded-xl p-4">
      <img
        src={avatar}
        alt={name}
        className="w-14 h-14 rounded-full object-cover"
      />
      <div>
        <p className="text-gray-100 font-semibold text-lg">{name}</p>
        {handle && <p className="text-indigo-400 text-sm">{handle}</p>}
        {role && <p className="text-gray-400 text-sm">{role}</p>}
        {contribution && (
          <p className="text-gray-400 text-sm">{contribution}</p>
        )}
      </div>
    </div>
  )
}

export default function Contributors() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-950 text-gray-100">
      <Navbar />
      <div className="flex-1">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <h1 className="text-4xl font-bold mb-12 text-center">Contributors</h1>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-6 text-indigo-400">
              Developers
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {developers.map((c) => (
                <ContributorCard key={c.name} {...c} />
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-6 text-indigo-400">
              Idea Smiths
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {ideaSmiths.map((c) => (
                <ContributorCard key={c.name} {...c} />
              ))}
            </div>
          </section>
        </div>
      </div>
      <Footer />
    </div>
  )
}
