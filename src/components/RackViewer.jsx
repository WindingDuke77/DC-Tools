import { useEffect, useMemo, useRef, Suspense } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { useGLTF, Center } from '@react-three/drei'
import * as THREE from 'three'

const BASE = import.meta.env.BASE_URL

// --- Model paths ---
const MODEL_PATHS = {
  rack: `${BASE}models/Rack.glb`,
  servers: {
    system:    `${BASE}models/Servers/Server.System.3u.glb`,
    mainframe: `${BASE}models/Servers/Server.Mainframe.3u.glb`,
    risc:      `${BASE}models/Servers/Server.RISC.3u.glb`,
    gpu:       `${BASE}models/Servers/Server.GPU.3u.glb`,
  },
  patch: `${BASE}models/Patch/PatchPanel.CU.2u.glb`,
  cable: `${BASE}models/Cables/Cat6.glb`,
}

// --- Recolor: tint existing material, preserve texture (rack only) ---
// Brighten color to compensate for texture darkening
function useRecolor(scene, color) {
  useEffect(() => {
    if (!scene || !color) return
    const col = new THREE.Color(color)
    col.r = Math.min(col.r * 1.4, 1)
    col.g = Math.min(col.g * 1.4, 1)
    col.b = Math.min(col.b * 1.4, 1)
    scene.traverse((child) => {
      if (child.isMesh) {
        child.material = child.material.clone()
        child.material.color.set(col)
      }
    })
  }, [scene, color])
}

// --- Flat recolor: solid color, no texture ---
function useFlatRecolor(scene, color) {
  useEffect(() => {
    if (!scene || !color) return
    const col = new THREE.Color(color)
    scene.traverse((child) => {
      if (child.isMesh) {
        child.material = new THREE.MeshStandardMaterial({ color: col, roughness: 0.5, metalness: 0.3 })
      }
    })
  }, [scene, color])
}

// --- Cable-specific recolor: cable body → picked color, spinner → orange (flat, no texture) ---
function useCableRecolor(scene, color) {
  useEffect(() => {
    if (!scene || !color) return
    const cableCol = new THREE.Color(color)
    const orangeCol = new THREE.Color('#FF8C00')
    scene.traverse((child) => {
      if (!child.isMesh) return
      const matName = (child.material?.name || '').toLowerCase()
      const meshName = (child.name || '').toLowerCase()
      const isSpinner = matName.includes('orange') || meshName.includes('spinner')
      child.material = new THREE.MeshStandardMaterial({
        color: isSpinner ? orangeCol : cableCol,
        roughness: 0.5,
        metalness: 0.3,
      })
    })
  }, [scene, color])
}

// --- Fixed front-facing camera that auto-fits to content ---
function FrontCamera() {
  const { camera, scene } = useThree()
  const fitted = useRef(false)
  useFrame(() => {
    if (fitted.current) return
    const box = new THREE.Box3().setFromObject(scene)
    const size = box.getSize(new THREE.Vector3())
    if (size.length() < 0.01) return
    fitted.current = true
    const center = box.getCenter(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)
    const fov = camera.fov * (Math.PI / 180)
    const dist = maxDim / (2 * Math.tan(fov / 2)) * 1.4
    camera.position.set(center.x, center.y, center.z + dist)
    camera.lookAt(center)
    camera.updateProjectionMatrix()
  })
  return null
}

// --- Static preview container (no orbit controls) ---
function PreviewCanvas({ children, className = '', height = '300px' }) {
  return (
    <div className={`w-full rounded-2xl overflow-hidden bg-gray-900 ${className}`} style={{ height, minHeight: 0 }}>
      <Canvas camera={{ fov: 40, near: 0.1, far: 100 }}>
        <ambientLight intensity={0.8} />
        <directionalLight position={[0, 2, 5]} intensity={1.2} />
        <directionalLight position={[-3, 1, 2]} intensity={0.5} />
        <Suspense fallback={null}>
          <Center>
            {children}
          </Center>
          <FrontCamera />
        </Suspense>
      </Canvas>
    </div>
  )
}

// --- Inner model components (used inside Canvas) ---
function RackModelInner({ color }) {
  const { scene } = useGLTF(MODEL_PATHS.rack)
  const cloned = useMemo(() => scene.clone(true), [scene])
  useRecolor(cloned, color)
  return <primitive object={cloned} />
}

function ServerModelInner({ type = 'system', color }) {
  const path = MODEL_PATHS.servers[type] || MODEL_PATHS.servers.system
  const { scene } = useGLTF(path)
  const cloned = useMemo(() => scene.clone(true), [scene])
  useFlatRecolor(cloned, color)
  return <primitive object={cloned} />
}

function CableModelInner({ color = '#655A00' }) {
  const { scene } = useGLTF(MODEL_PATHS.cable)
  const cloned = useMemo(() => scene.clone(true), [scene])
  useCableRecolor(cloned, color)
  return <primitive object={cloned} />
}

// --- Exported preview components ---
export function RackPreview({ color, className, height = '300px' }) {
  return (
    <PreviewCanvas className={className} height={height}>
      <RackModelInner color={color} />
    </PreviewCanvas>
  )
}

export function ServerPreview({ type = 'system', color, className, height = '300px' }) {
  return (
    <PreviewCanvas className={className} height={height}>
      <ServerModelInner type={type} color={color} />
    </PreviewCanvas>
  )
}

export function CablePreview({ color, className, height = '300px' }) {
  return (
    <PreviewCanvas className={className} height={height}>
      <CableModelInner color={color} />
    </PreviewCanvas>
  )
}

// Preload all models so switching types is instant
useGLTF.preload(MODEL_PATHS.rack)
useGLTF.preload(MODEL_PATHS.patch)
useGLTF.preload(MODEL_PATHS.cable)
Object.values(MODEL_PATHS.servers).forEach((path) => useGLTF.preload(path))
