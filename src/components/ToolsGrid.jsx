function ToolCard({ icon, title, description, link }) {
  return (
    <a 
        href={link} 
        className="bg-gray-900 border cursor-pointer border-gray-800 rounded-2xl p-6 hover:border-indigo-500/50 transition-colors"
    >
        <div className="text-3xl mb-4">{icon}</div>
        <h3 className="text-lg font-semibold mb-2">{title}</h3>
        <p className="text-gray-400 text-sm">{description}</p>
    </a>
  )
}

const tools = [
  {
    title: 'Color Palette Generator',
    description: 'Pick colours for racks, servers, and cables on an interactive rack diagram.',
    icon: '🎨',
    link: '#/tools/color-palette',
  },
  {
    title: 'Rack Calculator',
    description: 'Calculate the number of racks, servers, and switches needed from IOPS requirements.',
    icon: '🖥',
    link: '#/tools/rack-calculator',
  },
]

export default function ToolsGrid() {
  return (
    <section id="tools" className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-center mb-4">Tools</h2>
      <p className="text-gray-400 text-center mb-12 max-w-xl mx-auto">
        Handy utilities to help you plan, optimise, and manage your data center.
      </p>
      <a className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {tools.map((tool) => (
          <ToolCard key={tool.title} {...tool} />
        ))}
      </a>
    </section>
  )
}
