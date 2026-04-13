# DC Tools

Unofficial community toolset for [Data Center](https://store.steampowered.com/app/4170200/Data_Center) by [Waseku](https://waseku.com).

**[Live Site](https://windingduke77.github.io/DC-Tools/)**

## Tools

### Color Palette Generator

Pick a server type or go full custom. Choose a server colour and the rack and cable colours derive automatically via HSL math. Includes an interactive SVG rack diagram and 3D model previews.

- Presets for System, Mainframe, RISC, and GPU servers
- Save/load palettes to localStorage
- Share palettes via URL

### Cable Palette Generator

Generate rack + cable colour combos Coolors-style. Hit spacebar to randomize, lock the colours you like, and keep rolling.

- 1-6 cables per palette
- 3D preview per colour
- Save/load presets, share via URL

### Rack Calculator

Enter IOPS requirements and get a full hardware plan: servers, racks, switches, and costs. Supports 30+ in-game customer presets.

- Choose gateway type (small/medium/large)
- Toggle redundancy and mixed racks
- Network topology diagram and SVG rack layouts
- Save and share offers via URL

### Save Editor

Upload a Data Center `.save` file and edit coins, XP, reputation, wall prices, shop unlocks, and more. Download the modified file when done.

- Drag-and-drop file upload
- Preset buttons for quick edits
- Fully client-side (nothing leaves your browser)

## Tech Stack

| Layer | Tech |
|-------|------|
| Framework | React 19 + Vite |
| Styling | Tailwind CSS v4 |
| Routing | React Router v7 (HashRouter) |
| 3D | Three.js + React Three Fiber |
| Deployment | GitHub Pages + GitHub Actions |

## Development

```bash
npm install
npm run dev       # Start dev server
npm run build     # Production build to /dist
npm run preview   # Preview production build
npm run lint      # Run ESLint
```

## Deployment

Pushes to `main` auto-deploy to GitHub Pages via the included GitHub Actions workflow.

Manual deploy:

```bash
npm run deploy
```

---

## Creating Your Own Tool

Want to add a tool to DC Tools? Here's how.

### 1. Create your component

Create a new folder under `src/components/` for your tool:

```
src/components/my-tool/
  MyTool.jsx
```

Every tool follows the same page structure. Here's a minimal template:

```jsx
import Navbar from '../layout/Navbar'
import Footer from '../layout/Footer'

export default function MyTool() {
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-950 text-gray-100 pt-20 pb-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold mb-8">My Tool</h1>
          {/* Your tool UI here */}
        </div>
      </main>
      <Footer />
    </>
  )
}
```

### 2. Add a route

In `src/App.jsx`, import your component and add a route:

```jsx
import MyTool from './components/my-tool/MyTool'

// Inside the <Routes> block:
<Route path="/tools/my-tool" element={<MyTool />} />
```

### 3. Add it to the tools grid

In `src/components/home/ToolsGrid.jsx`, add an entry to the `tools` array:

```jsx
{
  title: 'My Tool',
  description: 'One-line description of what it does.',
  icon: '🔧',
  link: '#/tools/my-tool',
}
```

### 4. Test it

```bash
npm run dev
```

Navigate to `http://localhost:3000/#/tools/my-tool`.

### Conventions to follow

- **Dark theme**: Use `bg-gray-950` / `bg-gray-900` backgrounds and `text-gray-100` text. Accent with `indigo-500`.
- **Responsive**: Use Tailwind breakpoints (`sm:`, `lg:`) so tools work on mobile.
- **Client-side only**: All data stays in the browser. Use `localStorage` for saving user data, never send anything to a server.
- **Shareable state**: If your tool has configurable state, consider encoding it into URL query params so users can share links.
- **Self-contained**: Keep tool-specific logic inside your tool's folder. Shared components live in `src/components/layout/`.

### Available shared resources

| Resource | Location | What it does |
|----------|----------|-------------|
| `Navbar` | `src/components/layout/Navbar.jsx` | Sticky navigation bar |
| `Footer` | `src/components/layout/Footer.jsx` | Page footer with links |
| `RackViewer` | `src/components/color-palette/RackViewer.jsx` | 3D rack/server/cable previews using React Three Fiber |
| Customer data | `public/companies.json` | In-game customer names, IOPS requirements, icons |
| 3D models | `public/models/` | GLTF models for racks, servers, switches, patch panels, cables |
| Customer icons | `public/customer-icons/` | PNG icons for 30+ in-game customers |

### Submitting your tool

1. Fork the repo
2. Create your tool following the steps above
3. Open a pull request against `main`

---

## Community Gallery

The [Gallery](https://windingduke77.github.io/DC-Tools/#/gallery) page showcases community screenshots. To submit yours, DM **@dutc** on Discord or open a PR adding your images to `public/gallery/` and updating `public/gallery/manifest.json`.

## License

NonCommercial License. See [LICENSE](LICENSE) for details.

## Disclaimer

This is an unofficial fan project and is not affiliated with or endorsed by Waseku.
