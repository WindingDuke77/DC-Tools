import { HashRouter, Routes, Route } from 'react-router-dom'
import Home from './components/Home'
import ColorPalette from './components/ColorPalette'
import NotFound from './components/NotFound'

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/tools/color-palette" element={<ColorPalette />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </HashRouter>
  )
}

export default App
