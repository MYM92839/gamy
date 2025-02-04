// App.tsx
import { Canvas } from '@react-three/fiber';
import { XR, createXRStore } from '@react-three/xr';
import { Suspense, useRef, useState } from 'react';

// ------------------------
// 먼저 polyfill을 앱 진입 전에 실행합니다.
// 만약 iOS 환경에서만 polyfill을 쓰고 싶다면, 조건문 안에서 인스턴스화 할 수 있습니다.
const isIOS =
  /iPad|iPhone|iPod/.test(navigator.userAgent) &&
  !(window as any).MSStream;

if (isIOS) {
  // iOS 환경에서는 polyfill을 동적으로 로드합니다.
  // polyfill을 import하고 인스턴스화하여 전역에 적용합니다.
  import('webxr-polyfill').then((module) => {
    // 모듈의 기본 내보내기를 사용합니다.
    // 필요한 경우 옵션을 전달할 수 있습니다.
    const WebXRPolyfill = module.default;
    new WebXRPolyfill({
      webvr: true,
      cardboard: false,

    });
    console.log('WebXRPolyfill loaded for iOS');
  });
} else {
  // iOS가 아니라면 polyfill 없이 진행합니다.
  console.log('Non-iOS environment, polyfill not loaded');
}

// ------------------------
// XR 스토어 (iOS가 아닌 경우에만 사용)
// ------------------------
const xrStore = createXRStore();

// ------------------------
// 사용자 위치에서 3미터 앞에 빨간 박스를 배치하는 컴포넌트
// ------------------------
function RedBox() {
  // 카메라(사용자) 위치에서 [0, 1.6, -3] 위치에 배치
  return (
    <mesh position={[0, 1.6, -3]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial color="red" />
    </mesh>
  );
}

// ------------------------
// 기본 씬 구성: 조명과 빨간 박스 포함
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
  // - iOS가 아닌 경우 react-three/xr의 xrStore.enterXR('immersive-ar') 호출
  // - iOS의 경우 polyfill이 적용되므로, navigator.xr.requestSession을 직접 호출해볼 수 있습니다.
  const handleEnterXR = async () => {
    if (!isIOS) {
      console.log('Requesting XR session for non-iOS');
      xrStore.enterXR('immersive-ar');
      return;
    }
    if (navigator.xr) {
      try {
        // immersive-ar 대신 immersive-vr도 테스트해볼 수 있습니다.
        const session = await navigator.xr.requestSession('immersive-vr', {
          requiredFeatures: ['local-floor'],
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
          // iOS 환경: polyfill 적용 후, XR 컨트롤러 없이 일반 Canvas에서 씬 렌더링
          <Scene />
        ) : (
          // Non-iOS: react-three/xr의 XR 컴포넌트로 XR 세션 관리
          <XR store={xrStore}>
            <Scene />
          </XR>
        )}
      </Canvas>
    </>
  );
}
