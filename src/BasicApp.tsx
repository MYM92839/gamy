// App.tsx
import { Canvas } from '@react-three/fiber';
import { XR, createXRStore } from '@react-three/xr';
import { Suspense, useEffect, useRef, useState, useCallback } from 'react';
import { Box } from './ArApp';
import NftAppT3 from './NftAppT3';

// ------------------------
// polyfill을 앱 진입 전에 실행 (iOS의 경우)
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
// XR 스토어 (iOS가 아닌 경우 사용)
const xrStore = createXRStore();

// ------------------------
// Scene 컴포넌트 (예시: 사용자 위치에서 3미터 앞에 빨간 박스)
function Scene({ visible }: { visible: boolean }) {
  return (
    <>
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} />
      <Suspense fallback={null}>
        <group
          position={[0, 1.16, -3]}
          scale={[0.5, 0.5, 0.5]}
          visible={visible}
        >
          <Box on onRenderEnd={() => {}} />
        </group>
      </Suspense>
    </>
  );
}

// ------------------------
// CameraPreview 컴포넌트 (AR 모드 진입 전용)
// 부모의 onCleanup 콜백을 통해 cleanup 완료를 알립니다.
function CameraPreview({ onCleanup }: { onCleanup?: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function startCamera() {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
        if (!isMounted) return;
        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
        console.log('Camera stream acquired');
      } catch (error) {
        console.error('Failed to get camera stream:', error);
      }
    }
    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => {
          console.log('Stopping track', track);
          track.stop();
        });
        setStream(null);
      }
      console.log('CameraPreview cleanup complete');
      if (onCleanup) {
        onCleanup();
      }
      isMounted = false;
    };
    // 빈 배열로 한 번만 실행
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
        zIndex: 0,
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
  const [cameraActive, setCameraActive] = useState(true);
  const [cameraCleaned, setCameraCleaned] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // cleanup 완료 시 호출되는 콜백
  const handleCameraCleanup = useCallback(() => {
    console.log('Camera cleanup callback called');
    setCameraCleaned(true);
  }, []);

  // cleanup 완료를 기다리는 함수 (상태를 폴링)
  async function waitForCameraCleanup() {
    while (!cameraCleaned) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  // XR 진입 버튼 핸들러
  const handleEnterXR = async () => {
    console.log('XR enter clicked');
    // 미리보기 컴포넌트를 제거하고 cleanup 상태 초기화
    setCameraActive(false);
    setCameraCleaned(false);

    // CameraPreview 컴포넌트가 완전히 cleanup 될 때까지 기다립니다.
    await waitForCameraCleanup();
    console.log('Camera cleanup complete, starting XR');

    // XR 요청 실행
    if (!isIOS) {
      try {
        console.log('Requesting XR session for non-iOS');
        await xrStore.enterAR(); // immersive-ar 세션 요청
        setSessionStarted(true);
      } catch (error) {
        console.error('Failed to start XR session:', error);
      }
      return;
    }
    // iOS의 경우 polyfill 사용
    if (navigator.xr) {
      try {
        const session = await navigator.xr.requestSession('immersive-ar', {
          requiredFeatures: ['local-floor'],
        });
        console.log('XR session started on iOS (via polyfill):', session);
        setSessionStarted(true);
      } catch (err) {
        console.error('Failed to start XR session on iOS:', err);
      }
    } else {
      console.warn('navigator.xr not available on this device.');
    }
  };

  return (
    <>
      {isIOS ? (
        // iOS에서는 polyfill 기반 앱(NftAppT3)을 사용
        <NftAppT3 />
      ) : (
        <>
          {/* 미리보기 video는 AR 모드 진입 전(cameraActive true)일 때만 렌더링 */}
          {cameraActive && !sessionStarted && (
            <CameraPreview onCleanup={handleCameraCleanup} />
          )}

          {/* XR 진입 버튼: XR 세션 시작 전만 표시 */}
          {!sessionStarted && (
            <button
              onClick={handleEnterXR}
              style={{
                position: 'absolute',
                zIndex: 1,
                top: 20,
                left: 20,
                padding: '10px 20px',
                fontSize: '16px',
              }}
            >
              Enter XR
            </button>
          )}

          {/* XR 세션이 시작되면 XR 씬 렌더링 */}
          <Canvas
            ref={canvasRef}
            style={{
              width: '100vw',
              height: '100vh',
              background: 'transparent',
              position: 'absolute',
              top: 0,
              left: 0,
            }}
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
