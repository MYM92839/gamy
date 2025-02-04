// App.tsx
import { Canvas } from '@react-three/fiber';
import { XR, createXRStore, } from '@react-three/xr';
import { Suspense, useRef, useState } from 'react';

// ------------------------
// OS 감지: iOS 여부 (iOS에서는 WebXR 공식 지원이 없으므로 polyfill 사용)
// ------------------------
const isIOS =
  /iPad|iPhone|iPod/.test(navigator.userAgent) &&
  !(window as any).MSStream;

// iOS인 경우 polyfill 로드 (polyfill은 전역에서 navigator.xr을 채워줍니다)
if (isIOS) {
  // 웹팩/tsc 환경에서 dynamic require를 사용하여 로드합니다.
  require('webxr-polyfill');
}

// ------------------------
// XR 스토어 (iOS가 아닌 경우에만 사용)
// ------------------------
const xrStore = createXRStore();

// ------------------------
// 사용자 위치에서 3미터 앞에 빨간 박스를 배치하는 컴포넌트
// ------------------------
function RedBox() {
  // 여기서는 카메라(사용자) 위치에서 [0, 1.6, -3] 위치에 오브젝트를 배치합니다.
  return (
    <mesh position={[0, 1.6, -3]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial color="red" />
    </mesh>
  );
}

// ------------------------
// 기본 씬 구성: 조명과 빨간 박스를 포함
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
// 메인 App 컴포넌트
// ------------------------
export default function BasicApp() {
  const [, setSessionStarted] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // XR 진입 버튼 핸들러:
  // - iOS가 아닌 경우 react-three/xr의 xrStore.enterXR()을 호출
  // - iOS인 경우 polyfill이 제공하는 navigator.xr.requestSession()을 직접 호출
  const handleEnterXR = async () => {
    if (!isIOS) {
      xrStore.enterXR('immersive-ar');
      return;
    }
    // iOS: polyfill을 통해 XR 세션 요청 (정확한 동작은 디바이스와 polyfill 구현에 따라 다를 수 있습니다)
    if (navigator.xr) {
      try {
        const session = await navigator.xr.requestSession('immersive-ar', {
          requiredFeatures: ['local-floor']
        });
        console.log('XR session started on iOS (via polyfill):', session);
        setSessionStarted(true);
        // 주의: polyfill 환경에서는 Three.js와의 통합이 완벽하지 않을 수 있으므로,
        // 여기서는 별도의 XR 세션 제어 없이 일반 Canvas 내에서 씬을 렌더링합니다.
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
          zIndex: 1,
          top: 20,
          left: 20,
          padding: '10px 20px',
          fontSize: '16px',
        }}
        onClick={handleEnterXR}
      >
        Enter XR
      </button>
      <Canvas ref={canvasRef} style={{ width: '100vw', height: '100vh' }}>
        {isIOS ? (
          // iOS 환경: polyfill을 로드했으므로 XR 전용 컨트롤러 없이 일반 Canvas에 씬 렌더링
          <Scene />
        ) : (
          // iOS가 아닐 때: react-three/xr를 사용해 정식 WebXR 세션을 관리합니다.
          <XR store={xrStore}>
            <Scene />
          </XR>
        )}
      </Canvas>
    </>
  );
}
