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
          <Box on onRenderEnd={() => { }} />
        </group>
      </Suspense>
    </>
  );
}

// ------------------------
// 카메라 미리보기용 Video 컴포넌트 (비-iOS용)
// 이 컴포넌트는 AR 모드 진입 전에만 사용됩니다.
// function CameraPreview() {
//   const videoRef = useRef<HTMLVideoElement>(null);
//   const [stream, setStream] = useState<MediaStream | null>(null);

//   useEffect(() => {
//     let isMounted = true;
//     async function startCamera() {
//       try {
//         const mediaStream = await navigator.mediaDevices.getUserMedia({
//           video: { facingMode: 'environment' },
//           audio: false,
//         });
//         if (!isMounted) return;
//         setStream(mediaStream);
//         if (videoRef.current) {
//           videoRef.current.srcObject = mediaStream;
//         }
//       } catch (error) {
//         console.error('카메라 스트림을 가져오는데 실패했습니다:', error);
//       }
//     }
//     startCamera();

//     return () => {
//       // 언마운트 시 모든 트랙을 종료
//       if (stream) {
//         stream.getTracks().forEach((track) => track.stop());
//         setStream(null);
//       }
//       isMounted = false;
//     };
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, []);

//   return (
//     <video
//       ref={videoRef}
//       style={{
//         position: 'absolute',
//         top: 0,
//         left: 0,
//         width: '100vw',
//         height: '100vh',
//         objectFit: 'cover',
//         zIndex: 0,
//       }}
//       autoPlay
//       playsInline
//       muted
//     />
//   );
// }

// ------------------------
// 메인 App 컴포넌트
export default function BasicApp() {
  const [sessionStarted, setSessionStarted] = useState(false);
  const [, setCameraActive] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // XR 진입 버튼 핸들러:
  const handleEnterXR = async () => {
    console.log('XR 세션 진입 버튼 클릭');
    // AR 모드 진입 전에 미리보기 video 요소를 완전히 제거합니다.
    setCameraActive(false);

    // video 요소가 완전히 사라지도록 충분한 딜레이(예: 1000ms) 대기합니다.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    console.log('미리보기 제거 후 XR 요청 실행');

    // XR 요청 실행
    if (!isIOS) {
      try {
        console.log('Requesting XR session for non-iOS');
        await xrStore.enterAR(); // immersive-ar 세션이 요청됩니다.
        setSessionStarted(true);
      } catch (error) {
        console.error('XR session 시작 실패:', error);
      }
      return;
    }
  };

  return (
    <>
      {isIOS ? (
        // iOS 환경에서는 polyfill 기반 앱(NftAppT3)을 사용합니다.
        <NftAppT3 />
      ) : (
        <>
          {/* 미리보기 video는 AR 모드 진입 전(cameraActive true)일 때만 렌더링 */}
          {/* {cameraActive && !sessionStarted && <CameraPreview />} */}

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
