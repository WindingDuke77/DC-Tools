import { HashRouter, Routes, Route } from 'react-router-dom'
import Home from './components/home/Home'
import ColorPalette from './components/color-palette/ColorPalette'
import CableGenerator from './components/color-palette/CableGenerator'
import RackCalculator from './components/rack-calculator/RackCalculator'
import SaveEditor from './components/save-editor/SaveEditor'
import Gallery from './components/gallery/Gallery'
import Contributors from './components/contributors/Contributors'
import NotFound from './components/NotFound'

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/tools/color-palette" element={<ColorPalette />} />
        <Route path="/tools/cable-generator" element={<CableGenerator />} />
        <Route path="/tools/rack-calculator" element={<RackCalculator />} />
        <Route path="/tools/save-editor" element={<SaveEditor />} />
        <Route path="/gallery" element={<Gallery />} />
        <Route path="/contributors" element={<Contributors />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </HashRouter>
  )
}

export default App
