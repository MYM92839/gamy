// App.tsx
import { Canvas } from '@react-three/fiber';
import { XR } from '@react-three/xr';
import { Suspense, useEffect, useState } from 'react';
import { Box } from './ArApp';
import NftAppT3 from './NftAppT3';
import { xrStore } from './components/Layout';


// ------------------------
// polyfill을 앱 진입 전에 실행 (iOS의 경우)
const isIOS =
  /iPad|iPhone|iPod/.test(navigator.userAgent) &&
  !(window as any).MSStream;

// if (isIOS) {
//   import('webxr-polyfill').then((module) => {
//     const WebXRPolyfill = module.default;
//     new WebXRPolyfill({
//       webvr: true,
//       cardboard: false,
//     });
//     console.log('WebXRPolyfill loaded for iOS');
//   });
// } else {
//   console.log('Non-iOS environment, polyfill not loaded');
// }

// ------------------------
// XR 스토어 (iOS가 아닌 경우 사용)

// ------------------------
// Scene 컴포넌트 (예시: 사용자 위치에서 3미터 앞에 빨간 박스)
function Scene({ visible }: { visible: boolean }) {
  return (
    <>
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} />
      <Suspense fallback={null}>
        <group
          position={[0, 0, -10]}
          rotation={[0, -Math.PI / 4, 0]}
          scale={[0.5, 0.5, 0.5]}
          visible={visible}
        >
          <Box on onRenderEnd={() => { }} />
        </group>
      </Suspense>
    </>
  );
}

// ------------------------
// CameraPreview 컴포넌트 (AR 모드 진입 전용)
// 부모에서 onCleanup 콜백을 통해 cleanup 완료를 알리고,
// shouldStop prop이 true이면 graceful하게 스트림을 중단합니다.
// function CameraPreview({
//   onCleanup,
//   shouldStop = false,
// }: {
//   onCleanup?: () => void;
//   shouldStop?: boolean;
// }) {
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
//         console.log('Camera stream acquired');
//       } catch (error) {
//         console.error('Failed to get camera stream:', error);
//       }
//     }
//     startCamera();

//     return () => {
//       if (stream) {
//         stream.getTracks().forEach((track) => {
//           console.log('Stopping track', track);
//           track.stop();
//         });
//         setStream(null);
//       }
//       console.log('CameraPreview unmount cleanup complete');
//       if (onCleanup) {
//         onCleanup();
//       }
//       isMounted = false;
//     };
//     // 빈 배열로 한 번만 실행
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, []);

//   // shouldStop이 true가 되면 graceful하게 스트림을 중단하고 video를 숨깁니다.
//   useEffect(() => {
//     if (shouldStop && videoRef.current) {
//       console.log('CameraPreview: Stopping stream gracefully');
//       videoRef.current.pause();
//       videoRef.current.srcObject = null;
//       // 스트림 해제 후 onCleanup 호출 (이미 unmount 시에도 호출되지만, 여기서도 보장)
//       if (onCleanup) {
//         onCleanup();
//       }
//     }
//   }, [shouldStop, onCleanup]);

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
  const [init, setInit] = useState(false)
  const [sessionStarted, setSessionStarted] = useState(false);
  // cameraActive는 미리보기 컴포넌트가 렌더링되는지 여부를 결정합니다.
  // const [cameraActive, setCameraActive] = useState(true);
  // // stopPreview: 미리보기 스트림을 graceful하게 중단하도록 CameraPreview에 전달합니다.
  // const [stopPreview, setStopPreview] = useState(false);
  // // cleanup 완료 여부를 관리합니다.
  // const [cameraCleaned, setCameraCleaned] = useState(false);
  // const canvasRef = useRef<HTMLCanvasElement>(null);

  // // cleanup 완료 시 호출되는 콜백
  // const handleCameraCleanup = useCallback(() => {
  //   console.log('Camera cleanup callback called');
  //   setCameraCleaned(true);
  // }, []);

  // // cleanup 완료를 기다리는 함수 (상태를 폴링)
  // async function waitForCameraCleanup() {
  //   while (!cameraCleaned) {
  //     await new Promise((resolve) => setTimeout(resolve, 50));
  //   }
  // }

  // XR 진입 버튼 핸들러
  // const handleEnterXR = async () => {
  //   console.log('XR enter clicked');
  //   // 미리보기 graceful 중단 요청
  //   setStopPreview(true);
  //   // 미리보기 컴포넌트를 그대로 렌더링 상태로 두고, cleanup 완료를 기다립니다.
  //   setCameraCleaned(false);
  //   await waitForCameraCleanup();
  //   console.log('Camera cleanup complete, starting XR');

  //   // 이제 미리보기를 DOM에서 제거합니다.
  //   setCameraActive(false);

  //   // XR 요청 실행
  //   if (!isIOS) {
  //     try {
  //       console.log('Requesting XR session for non-iOS');
  //       setSessionStarted(true);
  //     } catch (error) {
  //       console.error('Failed to start XR session:', error);
  //     }
  //     return;
  //   }
  //   // iOS의 경우 polyfill 사용
  //   if (navigator.xr) {
  //     try {
  //       const session = await navigator.xr.requestSession('immersive-ar', {
  //         requiredFeatures: ['local-floor'],
  //       });
  //       console.log('XR session started on iOS (via polyfill):', session);
  //       setSessionStarted(true);
  //     } catch (err) {
  //       console.error('Failed to start XR session on iOS:', err);
  //     }
  //   } else {
  //     console.warn('navigator.xr not available on this device.');
  //   }
  // };


  useEffect(() => {
    let id: string | number | NodeJS.Timeout | undefined
    const func = async () => {
      await xrStore.enterAR(); // immersive-ar 세션 요청
      console.log("ENTER")
      setSessionStarted(true)
    }
    if (init) {
      id = setTimeout(() => {
        func()
      }, 0)
    }
    return () => {
      clearTimeout(id)
    }
  }, [init])
  return (
    <>
      {isIOS ? (
        // iOS에서는 polyfill 기반 앱(NftAppT3)을 사용
        <NftAppT3 />
      ) : (
        <>
          {/* 미리보기 video는 cameraActive가 true일 때만 렌더링 */}
          {/* {cameraActive && !sessionStarted && (
            <CameraPreview
              shouldStop={stopPreview}
              onCleanup={handleCameraCleanup}
            />
          )} */}

          {/* XR 진입 버튼: XR 세션 시작 전만 표시 */}
          {/* {!sessionStarted && (
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
          )} */}

          {/* XR 세션이 시작되면 XR 씬 렌더링 */}
          <Canvas
            style={{
              width: '100vw',
              height: '100vh',
              background: 'transparent',
              position: 'absolute',
              top: 0,
              left: 0,
            }}
            gl={{ alpha: true }}
            onCreated={() => {
              setInit(true)
            }}
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
