// App.tsx
import { Canvas } from '@react-three/fiber';
import { XR, createXRStore } from '@react-three/xr';
import { Suspense, useRef, useState } from 'react';

// ------------------------
// OS detection: Check for iOS (since iOS doesn’t officially support WebXR)
// ------------------------
const isIOS =
  /iPad|iPhone|iPod/.test(navigator.userAgent) &&
  !(window as any).MSStream;

// If iOS, load the polyfill and log to confirm
if (isIOS) {
  const WebXRPolyfill = require('webxr-polyfill');
  console.log('WebXRPolyfill loaded:', WebXRPolyfill);
  // Optionally, request device orientation permission here if needed
}

// ------------------------
// XR store (only used for non-iOS)
// ------------------------
const xrStore = createXRStore();

// ------------------------
// Component to place a red box 3m in front of the user
// ------------------------
function RedBox() {
  return (
    <mesh position={[0, 1.6, -3]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial color="red" />
    </mesh>
  );
}

// ------------------------
// Scene composition: lights and the red box
// ------------------------
function Scene() {
  return (
    <>
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} />
      <Suspense fallback={null}>
        <RedBox />
      </Suspense>
    </>
  );
}

// ------------------------
// Main App component
// ------------------------
export default function BasicApp() {
  const [, setSessionStarted] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // XR enter button handler:
  // - Non-iOS: use xrStore.enterXR('immersive-ar') (or 'immersive-vr' if that works better)
  // - iOS: use polyfill to request an XR session
  const handleEnterXR = async () => {
    if (!isIOS) {
      console.log('Requesting XR session for non-iOS');
      xrStore.enterXR('immersive-ar');
      return;
    }
    // iOS: try to request an XR session using polyfill
    if (navigator.xr) {
      try {
        const session = await navigator.xr.requestSession('immersive-vr', {
          requiredFeatures: ['local-floor']
        });
        console.log('XR session started on iOS (via polyfill):', session);
        setSessionStarted(true);
      } catch (err) {
        console.error('Failed to start XR session on iOS', err);
      }
    } else {
      console.warn('navigator.xr not available on this device.');
    }
  };

  return (
    <>
      <button
        style={{
          position: 'absolute',
          zIndex: 10000,
          top: 20,
          left: 20,
          padding: '10px 20px',
          fontSize: '16px',

        }}
        onClick={handleEnterXR}
      >
        Enter XR
      </button>
      <Canvas ref={canvasRef} style={{ width: '100vw', height: '100vh', position: 'fixed', zIndex: 9999 }}>
        {isIOS ? (
          // iOS: render the scene directly (polyfill may not fully support XR UI)
          <Scene />
        ) : (
          // Non-iOS: wrap the scene with <XR>
          <XR store={xrStore}>
            <Scene />
          </XR>
        )}
      </Canvas>
    </>
  );
}
