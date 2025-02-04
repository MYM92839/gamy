// App.tsx
import { Canvas } from '@react-three/fiber';
import { XR, createXRStore } from '@react-three/xr';
import { Suspense, useEffect, useRef, useState } from 'react';
import { Box } from './ArApp';
import NftAppT3 from './NftAppT3';

// ------------------------
// 먼저 polyfill을 앱 진입 전에 실행합니다.
const isIOS =
  /iPad|iPhone|iPod/.test(navigator.userAgent) &&
  !(window as any).MSStream;

if (isIOS) {
  import('webxr-polyfill').then((module) => {
    const WebXRPolyfill = module.default;
    new WebXRPolyfill({
      webvr: true,
      cardboard: false,
    });
    console.log('WebXRPolyfill loaded for iOS');
  });
} else {
  console.log('Non-iOS environment, polyfill not loaded');
}

// ------------------------
// XR 스토어 (iOS가 아닌 경우에만 사용)
const xrStore = createXRStore();

// ------------------------
// 사용자 위치에서 3미터 앞에 빨간 박스를 배치하는 컴포넌트 (예시)
function Scene({ visible }: { visible: boolean }) {
  return (
    <>
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} />
      <Suspense fallback={null}>
        <group position={[0, 1.16, -3]} scale={[0.5, 0.5, 0.5]} visible={visible}>
          <Box on onRenderEnd={() => {}} />
        </group>
      </Suspense>
    </>
  );
}

// ------------------------
// 카메라 미리보기용 Video 컴포넌트 (비-iOS용)
function CameraPreview() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  useEffect(() => {
    async function startCamera() {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      } catch (error) {
        console.error('카메라 스트림을 가져오는데 실패했습니다:', error);
      }
    }
    startCamera();

    // 언마운트 시에 스트림 정리
    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
    // stream이 변경될 때마다 클린업 처리하지 않도록 빈 배열 사용
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <video
      ref={videoRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        objectFit: 'cover',
        zIndex: 0, // 배경으로 보이게 z-index 설정
      }}
      autoPlay
      playsInline
      muted
    />
  );
}

// ------------------------
// 메인 App 컴포넌트
export default function BasicApp() {
  const [sessionStarted, setSessionStarted] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraActive, setCameraActive] = useState(true);

  // XR 진입 버튼 핸들러:
  const handleEnterXR = async () => {
    console.log('XR 세션 진입 버튼 클릭');
    // XR 진입 전에 카메라 스트림을 중지하여 리소스를 정리합니다.
    setCameraActive(false); // CameraPreview 컴포넌트를 언마운트 시킵니다.

    // 약간의 딜레이를 주어 스트림 정리가 완료되도록 합니다.
    setTimeout(async () => {
      if (!isIOS) {
        try {
          console.log('Requesting XR session for non-iOS');
          await xrStore.enterAR();
          setSessionStarted(true);
        } catch (error) {
          console.error('XR session 시작 실패:', error);
        }
        return;
      }
      if (navigator.xr) {
        try {
          const session = await navigator.xr.requestSession('immersive-ar', {
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
    }, 300); // 300ms 정도 딜레이를 줍니다.
  };

  return (
    <>
      {isIOS ? (
        // iOS 환경: polyfill 적용 후, XR 컨트롤러 없이 일반 Canvas에서 씬 렌더링
        <NftAppT3 />
      ) : (
        <>
          {/* 카메라 미리보기 배경: cameraActive가 true일 때만 렌더링 */}
          {cameraActive && !sessionStarted && <CameraPreview />}

          {/* XR 진입 버튼: XR 세션 시작 전만 표시 */}
          {!sessionStarted && (
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
          )}

          {/* XR 세션이 시작된 후 XR 씬 렌더링 */}
          <Canvas
            ref={canvasRef}
            style={{ width: '100vw', height: '100vh' }}
            gl={{ alpha: true }}
          >
            <XR store={xrStore}>
              <Scene visible={sessionStarted} />
            </XR>
          </Canvas>
        </>
      )}
    </>
  );
}
