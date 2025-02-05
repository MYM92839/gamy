// App.tsx
import { Canvas, useThree } from '@react-three/fiber';
import { XR, XRDomOverlay, XROrigin } from '@react-three/xr';
import { useGesture } from '@use-gesture/react';
import { Suspense, useEffect, useState } from 'react';
import Modal from 'react-modal';
import { Box } from './ArApp';
import NftAppT3 from './NftAppT3';
import Back from './assets/icons/Back';
import Capture from './assets/icons/Capture';
import { xrStore } from './components/Layout';

Modal.setAppElement('#root');

// 모달 스타일 (content 스타일만 사용)
const customStyles = {
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
};

const isIOS =
  /iPad|iPhone|iPod/.test(navigator.userAgent) &&
  !(window as any).MSStream;

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

/**
 * PinchZoom 컴포넌트
 * use-gesture의 onPinch 핸들러를 사용하여 두 손가락 제스처로 카메라 zoom 값을 제어합니다.
 * 이 컴포넌트는 전체 영역을 덮으면서 pointerEvents: 'none'으로 설정되어 제스처 감지 전용으로 사용됩니다.
 */
const PinchZoom = () => {
  const { camera } = useThree();
  const bind = useGesture(
    {
      onPinch: ({ offset: [d] }) => {
        // d 값이 1이면 기본, 값이 커지면 zoom in, 작아지면 zoom out
        const newZoom = Math.max(0.5, Math.min(3, d));
        camera.zoom = newZoom;
        camera.updateProjectionMatrix();
      },
    },
    {
      pinch: { scaleBounds: { min: 0.5, max: 3 }, rubberband: false },
    }
  );
  return (
    <div
      {...bind()}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        touchAction: 'none',
        pointerEvents: 'none', // 제스처 감지 전용: UI 이벤트에 영향을 주지 않음.
        zIndex: 0,
        background: 'transparent',
      }}
    />
  );
};

export default function BasicApp() {
  const [init, setInit] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [modalIsOpen, setIsOpen] = useState(false);
  const [foto, setFoto] = useState<Blob | null>(null);
  const [fotoUrl, setFotoUrl] = useState<string>('');
  const [show, setShow] = useState(false);

  const domWidth = 360;
  const domHeight = 640;
  const circleX = domWidth / 2;
  const circleY = domHeight / 2;
  const circleR = 100;
  const circleColor = init ? 'blue' : 'red';

  /**
   * 캡쳐 함수: XR 모드에서 보이는 최종 화면(WebGL 캔버스 전체)을 캡쳐하여 Blob을 생성합니다.
   */
  const captureImage = () => {
    const threeCanvas = document.querySelector('#three-canvas canvas') as HTMLCanvasElement | null;
    if (!threeCanvas) {
      console.warn('Three.js canvas가 DOM에서 발견되지 않았습니다.');
      return;
    }
    const canvasWidth = threeCanvas.clientWidth;
    const canvasHeight = threeCanvas.clientHeight;
    const devicePixelRatio = window.devicePixelRatio || 1;

    const offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = canvasWidth * devicePixelRatio;
    offscreenCanvas.height = canvasHeight * devicePixelRatio;
    const context = offscreenCanvas.getContext('2d');
    if (!context) {
      console.error('오프스크린 canvas의 context 생성 실패');
      return;
    }
    context.scale(devicePixelRatio, devicePixelRatio);
    context.drawImage(threeCanvas, 0, 0, canvasWidth, canvasHeight);

    offscreenCanvas.toBlob((blob) => {
      if (blob) {
        setFoto(blob);
      } else {
        setFoto(null);
      }
    }, 'image/png');
  };

  // Blob이 업데이트되면 DataURL로 변환하여 fotoUrl에 저장 (모달 이미지 표시용)
  useEffect(() => {
    if (foto) {
      const reader = new FileReader();
      reader.onload = () => {
        setFotoUrl(reader.result as string);
      };
      reader.readAsDataURL(foto);
    }
  }, [foto]);

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

  const shareOrDownloadImage = (blob: Blob): void => {
    if (
      navigator.canShare &&
      navigator.canShare({ files: [new File([blob], 'test.png', { type: blob.type })] })
    ) {
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
    let id: string | number | NodeJS.Timeout | undefined;
    const func = async () => {
      await xrStore.enterAR(); // immersive-ar 세션 요청
      console.log('ENTER');
      setSessionStarted(true);
    };
    if (init) {
      id = setTimeout(() => {
        func();
      }, 1000);
    }
    return () => {
      clearTimeout(id);
    };
  }, [init]);

  return (
    <>
      {isIOS ? (
        // iOS에서는 polyfill 기반 앱(NftAppT3)을 사용
        <NftAppT3 />
      ) : (
        <>
          <Canvas
            id="three-canvas"
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
              setInit(true);
            }}
          >
            <XR store={xrStore}>
              {/* XRDomOverlay: UI 컨테이너(포털)를 사용하여 캔버스 위에 DOM UI를 오버레이 */}
              <XRDomOverlay
                style={{
                  position: 'fixed',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  // pointerEvents 기본값(auto)로 두어 내부 UI가 정상 동작하도록 함.
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {/* PinchZoom: 제스처 감지 전용, pointerEvents: 'none' */}
                <PinchZoom />
                {/* UI 컨테이너 */}
                <div style={{ width: '100%', height: '100%' }}>
                  {/* 캡쳐 모달 */}
                  <div style={{ ...customStyles, display: modalIsOpen ? 'block' : 'none' }}>
                    <div className="w-full h-full max-w-full max-h-full flex flex-col gap-y-2 p-2">
                      <div className="flex-1 rounded-sm overflow-hidden z-[999] isolate">
                        {fotoUrl && (
                          <img
                            className="flex-1 object-contain z-[999]"
                            src={fotoUrl}
                            alt="캡쳐 이미지"
                          />
                        )}
                      </div>
                      <div className="w-full flex gap-x-2 font-semibold">
                        <button
                          className="flex-1 rounded-[8px] p-2 border border-[#344173] text-[#344173]"
                          onClick={closeModal}
                        >
                          다시찍기
                        </button>
                        <button
                          className="flex-1 rounded-[8px] p-2 text-white bg-[#344173]"
                          onClick={closeSaveModal}
                        >
                          저장하기
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 모달이 열리지 않았을 때의 UI */}
                  {!modalIsOpen && (
                    <>
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
                        }}
                        onClick={openModal}
                      >
                        <Capture style={{}} />
                      </button>
                    </>
                  )}

                  {/* 배경에 원과 버튼 */}
                  {!show && (
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
                          <circle
                            cx={circleX}
                            cy={circleY}
                            r={circleR}
                            fill="none"
                            stroke={circleColor}
                            strokeWidth="2"
                          />
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
                          borderRadius: '8px',
                        }}
                        onClick={() => setShow(true)}
                      >
                        토끼 부르기
                      </button>
                    </>
                  )}
                </div>
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
