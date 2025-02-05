// App.tsx
import { Canvas } from '@react-three/fiber';
import { XR, XRDomOverlay, XROrigin } from '@react-three/xr';
import { Suspense, useEffect, useState } from 'react';
import { Box } from './ArApp';
import NftAppT3 from './NftAppT3';
import { xrStore } from './components/Layout';
import Capture from './assets/icons/Capture';
import Back from './assets/icons/Back';
import Modal from 'react-modal';

const customStyles = {
  overlay: {
    zIndex: 999,
  },
  content: {
    top: '50%',
    left: '50%',
    right: 'auto',
    bottom: 'auto',
    marginRight: '-50%',
    borderRadius: '16px',
    width: '100dvw',
    height: '100dvh',
    padding: '8px',
    transform: 'translate(-50%, -50%)',
    zIndex: 999,
  },
};

Modal.setAppElement('#root');
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
          {visible && <Box on onRenderEnd={() => { }} />}
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
  const [modalIsOpen, setIsOpen] = useState(false);
  const [foto, setFoto] = useState<Blob | null>(null);
  const [fotoUrl, setFotoUrl] = useState<string>('');

  function openModal() {
    setIsOpen(true);
    captureImage();
  }

  function closeModal() {
    setIsOpen(false);
  }

  function closeSaveModal() {
    if (foto) shareOrDownloadImage(foto);
    setIsOpen(false);
  }
  const [show, setShow] = useState(false)
  const domWidth = 360;
  const domHeight = 640;
  const circleX = domWidth / 2;
  const circleY = domHeight / 2;
  const circleR = 100;
  const circleColor = init ? 'blue' : 'red';

  const shareOrDownloadImage = (blob: Blob): void => {
    if (navigator.canShare && navigator.canShare({ files: [new File([blob], 'test.png', { type: blob.type })] })) {
      const file = new File([blob], `camera-frame-${new Date().getTime()}.png`, {
        type: 'image/png',
      });

      navigator
        .share({
          files: [file],
          title: 'My Captured Image',
          text: 'Check out this captured photo!',
        })
        .catch((error) => {
          console.error('Sharing failed:', error);
        });
    } else {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `camera-frame-${new Date().getTime()}.png`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
    }
  };
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
      }, 1000)
    }
    return () => {
      clearTimeout(id)
    }
  }, [init])


  /**
 * XR 모드에서 보이는 최종 화면(WebGL 캔버스 전체)을 캡쳐하여 PNG Blob으로 반환합니다.
 */
  const captureImage = async (): Promise<Blob | null> => {
    // Three.js 캔버스 요소를 선택합니다.
    // react-three/ar의 경우 SlamCanvas 내부에 있는 canvas를 선택할 수 있습니다.
    const threeCanvas = document.querySelector('#three-canvas canvas') as HTMLCanvasElement | null;
    if (!threeCanvas) {
      console.warn('Three.js canvas가 DOM에서 발견되지 않았습니다.');
      return null;
    }

    // 캔버스의 크기를 가져옵니다.
    const canvasWidth = threeCanvas.clientWidth;
    const canvasHeight = threeCanvas.clientHeight;
    const devicePixelRatio = window.devicePixelRatio || 1;

    // 오프스크린 캔버스를 생성합니다.
    const offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = canvasWidth * devicePixelRatio;
    offscreenCanvas.height = canvasHeight * devicePixelRatio;
    const context = offscreenCanvas.getContext('2d');
    if (!context) {
      console.error('오프스크린 canvas의 context 생성 실패');
      return null;
    }

    // 고해상도에 맞춰 스케일을 조정합니다.
    context.scale(devicePixelRatio, devicePixelRatio);

    // 현재 Three.js canvas의 내용을 오프스크린 canvas에 복사합니다.
    context.drawImage(threeCanvas, 0, 0, canvasWidth, canvasHeight);

    // 최종 캡쳐한 이미지를 PNG Blob으로 변환합니다.
    return new Promise<Blob | null>((resolve) => {
      offscreenCanvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          resolve(null);
        }
      }, 'image/png');
    });
  };



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
              <XRDomOverlay
                style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <Modal isOpen={modalIsOpen} onRequestClose={closeModal} style={customStyles} contentLabel="사진확인">
                  <div className="w-full h-full max-w-full max-h-full flex flex-col gap-y-2 p-2">
                    <div className="flex-1 rounded-sm overflow-hidden z-[999] isolate">
                      {fotoUrl && <img className="flex-1 object-contain z-[999]" src={fotoUrl} />}
                    </div>
                    <div className="w-full flex gap-x-2 font-semibold">
                      <button className="flex-1 rounded-[8px] p-2 border border-[#344173] text-[#344173]" onClick={closeModal}>
                        다시찍기
                      </button>
                      <button className="flex-1 rounded-[8px] p-2 text-white bg-[#344173]" onClick={closeSaveModal}>
                        저장하기
                      </button>
                    </div>
                  </div>
                </Modal>
                {!modalIsOpen && <>
                  <button
                    style={{
                      zIndex: 999,
                      position: 'fixed',
                      width: 'fit-content',
                      height: 'fit-content',
                      border: 0,
                      bottom: '65px',
                      left: '24px',
                      backgroundColor: 'transparent',
                      padding: '1rem',
                    }}
                    onClick={() => {
                      window.history.back();
                    }}
                  >
                    <Back style={{}} />
                  </button>
                  <button
                    style={{
                      zIndex: 999,
                      position: 'fixed',
                      width: 'fit-content',
                      height: 'fit-content',
                      border: 0,
                      backgroundColor: 'transparent',
                      padding: '1rem',
                      bottom: '48px',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      marginLeft: 'auto',
                    }}
                    onClick={openModal}
                  >
                    <Capture style={{}} />
                  </button>
                </>}
                {!show &&
                  <>
                    <div
                      style={{
                        position: 'fixed',
                        width: `${domWidth}px`,
                        height: `${domHeight}px`,
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%,-50%)',
                        background: 'transparent',
                        overflow: 'hidden',
                        zIndex: 9998,
                      }}
                    >
                      <svg
                        width={domWidth}
                        height={domHeight}
                        style={{ position: 'absolute', top: 0, left: 0 }}
                      >
                        <circle cx={circleX} cy={circleY} r={circleR} fill="none" stroke={circleColor} strokeWidth="2" />
                      </svg>
                    </div>

                    <button
                      style={{
                        position: 'fixed',
                        bottom: '10%',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        zIndex: 99999,
                        padding: '1rem',
                        fontSize: '1rem',
                        backgroundColor: 'darkblue',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px'
                      }}
                      onClick={() => setShow(true)}
                    >
                      토끼 부르기
                    </button>
                  </>
                }
              </XRDomOverlay>


              <XROrigin position={[0, 0.5, 0]} />
              <Scene visible={sessionStarted && show} />
            </XR>
          </Canvas>
        </>
      )}
    </>
  );
}
