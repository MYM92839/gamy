// App.tsx
import { Canvas } from '@react-three/fiber';
import { XR, XRDomOverlay, XROrigin, createXRStore } from '@react-three/xr';
import { Suspense, useEffect, useRef, useState } from 'react';
import Modal from 'react-modal';
import { Box } from './ArApp';
import NftAppT3 from './NftAppT3';
import Back from './assets/icons/Back';
import Capture from './assets/icons/Capture';
import Button from "./components/Button";

Modal.setAppElement('#root');

//
// 모달 스타일 (content 스타일만 사용)
//
const customStyles = {
  inset: 0,
  right: 'auto',
  bottom: 'auto',
  backgroundColor: 'white',
  borderRadius: '16px',
  width: '100vw',
  height: '100vh',
  padding: '8px',
  zIndex: 10000,
};

const isIOS =
  /iPad|iPhone|iPod/.test(navigator.userAgent) &&
  !(window as any).MSStream;

//
// Scene 컴포넌트: 예시로 박스를 표시
//
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

//
// UIOverlay 컴포넌트
//
const UIOverlay = ({
  modalIsOpen,
  openModal,
  show,
  setShow,
  domWidth,
  domHeight,
  circleX,
  circleY,
  circleR,
  circleColor,
}: {
  modalIsOpen: boolean;
  fotoUrl: string;
  openModal: () => void;
  closeModal: () => void;
  closeSaveModal: () => void;
  show: boolean;
  setShow: (v: boolean) => void;
  domWidth: number;
  domHeight: number;
  circleX: number;
  circleY: number;
  circleR: number;
  circleColor: string;
}) => {

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        pointerEvents: 'auto',
      }}
    >
      {/* 기본 UI 버튼들 */}
      {!modalIsOpen && (
        <>
          <button
            style={{
              position: 'fixed',
              bottom: '65px',
              left: '24px',
              background: 'transparent',
              border: 'none',
              zIndex: 1001,
            }}
            onClick={() => window.history.back()}
          >
            <Back />
          </button>
          <button
            style={{
              position: 'fixed',
              bottom: '48px',
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'transparent',
              border: 'none',
              padding: '1rem',
              zIndex: 1001,
            }}
            onClick={openModal}
          >
            <Capture />
          </button>
        </>
      )}
      {/* 안내용 원과 토끼 부르기 버튼 */}
      {!modalIsOpen && !show && (
        <>
          <div
            style={{
              position: 'fixed',
              width: `${domWidth}px`,
              height: `${domHeight}px`,
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background: 'transparent',
              overflow: 'hidden',
              zIndex: 1000,
            }}
          >
            <svg width={domWidth} height={domHeight} style={{ position: 'absolute', top: 0, left: 0 }}>
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
          <Button
            onClick={() => setShow(true)}
            title=" 토끼 부르기" className="z-[1001] fixed bottom-[20%] left-1/2 -translate-x-1/2 w-max mx-auto p-4 h-fit" />
        </>
      )}
    </div>
  );
};

//
// ARHelper 컴포넌트
//
function ARHelper({ store }: any) {
  const [init, setInit] = useState(false);

  useEffect(() => {
    if (!init) setInit(true);
    return () => {
      if (store.current) {
        store.current.getState().session?.end();
        store.current.destroy();
        store.current = null;
      }
    };
  }, []);

  return null;
}

//
// ARCanvas 컴포넌트
//
function ARCanvas(props: any) {
  const [init, setInit] = useState(false);

  useEffect(() => {
    let id: ReturnType<typeof setTimeout>;
    const func = async () => {
      if (props.xrStoreRef.current) {
        try {
          await props.xrStoreRef.current.enterAR();
          props.setSessionStarted(true);
          props.logDebug('XR session started.');
        } catch (err) {
          props.logDebug('XR session failed to start: ' + err);
        }
      }
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
    <div style={{ position: 'absolute', inset: 0 }}>
      <Canvas
        id="three-canvas"
        style={{
          width: '100vw',
          height: '100vh',
          background: 'transparent',
        }}
        gl={{ alpha: true, preserveDrawingBuffer: true }}
        onCreated={(state) => {
          state.gl.setPixelRatio(window.devicePixelRatio);
          state.gl.setSize(window.innerWidth, window.innerHeight);
          setInit(true);
          props.logDebug('Canvas created, init set to true.');
        }}
      >
        <XR store={props.xrStoreRef.current}>
          <ARHelper store={props.xrStoreRef} />
          <XROrigin position={[0, 0.5, 0]} />
          <Scene visible={props.sessionStarted && props.show} />
          <XRDomOverlay>
            <UIOverlay
              modalIsOpen={props.modalIsOpen}
              fotoUrl={props.fotoUrl}
              openModal={props.openModal}
              closeModal={props.closeModal}
              closeSaveModal={props.closeSaveModal}
              show={props.show}
              setShow={props.setShow}
              domWidth={props.domWidth}
              domHeight={props.domHeight}
              circleX={props.circleX}
              circleY={props.circleY}
              circleR={props.circleR}
              circleColor={props.circleColor}
            />
          </XRDomOverlay>
        </XR>
      </Canvas>
    </div>
  );
}

//
// BackgroundVideo: 카메라 피드를 보여줌
//
function BackgroundVideo({ streamRef, setIsMount, logDebug }: any) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      })
      .then((stream) => {
        if (videoRef.current) {
          if (videoRef.current.srcObject !== stream) {
            videoRef.current.srcObject = stream;
            streamRef.current = stream;
            logDebug('UserMedia stream assigned.');
          }
          videoRef.current.onloadeddata = () => {
            videoRef.current?.play().catch((err) =>
              logDebug('Video play error: ' + err)
            );
            setIsMount(true);
            logDebug('Video onloadeddata triggered.');
          };
        }
      })
      .catch((err) => logDebug('getUserMedia error: ' + err));

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track: any) => track.stop());
        streamRef.current = null;
        logDebug('UserMedia stream stopped.');
      }
    };
  }, []);

  return (
    <video
      id="three-video"
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
      loop
    />
  );
}

//
// DebugPanel 컴포넌트: 디버깅 로그를 화면에 표시합니다.
//
const DebugPanel = ({ logs }: { logs: string[] }) => {
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        width: '100%',
        maxHeight: '40%',
        overflowY: 'auto',
        background: 'rgba(0,0,0,0.8)',
        color: 'white',
        fontSize: '12px',
        padding: '8px',
        zIndex: 11000,
      }}
    >
      <div><strong>Debug Logs:</strong></div>
      {logs.map((log, index) => (
        <div key={index}>{log}</div>
      ))}
    </div>
  );
};

//
// 메인 앱 컴포넌트
//
export default function BasicApp() {
  const xrStoreRef = useRef<any>(null);
  const [mount, setMount] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [modalIsOpen, setIsOpen] = useState(false);
  const [foto, setFoto] = useState<Blob | null>(null);
  const [show, setShow] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const [isMount, setIsMount] = useState(false);
  const offCanvasRef = useRef<any>(null);

  // 디버그 로그 상태
  const [debugLogs, setDebugLogs] = useState<string[]>([]);

  // 디버그 로그를 추가하는 함수
  const logDebug = (msg: string) => {
    console.log(msg);
    setDebugLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const domWidth = 360;
  const domHeight = 640;
  const circleX = domWidth / 2;
  const circleY = domHeight / 2;
  const circleR = 100;
  const circleColor = 'blue';

  const func1 = async () => {
    logDebug('func1: Capture started.');
    const threeCanvas: HTMLCanvasElement | null = document.querySelector('[data-webxr_runtime]')?.children[3] as HTMLCanvasElement;
    if (!threeCanvas) {
      logDebug('func1: threeCanvas not found.');
      return;
    }
    const containerWidth = threeCanvas.clientWidth;
    const containerHeight = threeCanvas.clientHeight;
    const devicePixelRatio = window.devicePixelRatio || 1;

    const offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = containerWidth * devicePixelRatio;
    offscreenCanvas.height = containerHeight * devicePixelRatio;
    offCanvasRef.current = offscreenCanvas;

    const context = offscreenCanvas.getContext('2d');
    if (!context) {
      logDebug('func1: Failed to create canvas context.');
      return;
    }
    context.scale(devicePixelRatio, devicePixelRatio);

    // draw parameters 계산 함수
    const calculateDrawParams = (element: HTMLVideoElement | HTMLCanvasElement, objectFit: 'cover' | 'contain') => {
      const elementWidth = element instanceof HTMLVideoElement ? element.videoWidth : element.width;
      const elementHeight = element instanceof HTMLVideoElement ? element.videoHeight : element.height;
      if (elementWidth === 0 || elementHeight === 0) return null;
      const elementAspectRatio = elementWidth / elementHeight;
      const containerAspectRatio = containerWidth / containerHeight;
      let drawWidth = containerWidth;
      let drawHeight = containerHeight;
      let offsetX = 0;
      let offsetY = 0;
      if (objectFit === 'cover') {
        if (elementAspectRatio > containerAspectRatio) {
          drawWidth = containerHeight * elementAspectRatio;
          offsetX = (containerWidth - drawWidth) / 2;
        } else {
          drawHeight = containerWidth / elementAspectRatio;
          offsetY = (containerHeight - drawHeight) / 2;
        }
      } else if (objectFit === 'contain') {
        if (elementAspectRatio > containerAspectRatio) {
          drawHeight = containerWidth / elementAspectRatio;
          offsetY = (containerHeight - drawHeight) / 2;
        } else {
          drawWidth = containerHeight * elementAspectRatio;
          offsetX = (containerWidth - drawWidth) / 2;
        }
      }
      return { drawWidth, drawHeight, offsetX, offsetY };
    };

    try {
      const threeParams = calculateDrawParams(threeCanvas, 'cover');
      if (threeParams) {
        context.drawImage(
          threeCanvas,
          threeParams.offsetX,
          threeParams.offsetY,
          threeParams.drawWidth,
          threeParams.drawHeight
        );
        logDebug('func1: threeCanvas drawn.');
      } else {
        logDebug('func1: threeParams calculation failed.');
      }
    } catch (error) {
      logDebug('func1: Error capturing image: ' + error);
    }
  };

  function closeModal() {
    setIsOpen(false);
  }
  function closeSaveModal() {
    if (foto) {
      shareOrDownloadImage(foto);
      setIsOpen(false);
    }
  }
  const shareOrDownloadImage = (blob: Blob): void => {
    if (
      navigator.canShare &&
      navigator.canShare({ files: [new File([blob], 'moon.png', { type: blob.type })] })
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
          logDebug('Sharing failed: ' + error);
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
    const func = async () => {
      const constraints = {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      };
      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        stream.getTracks().forEach((track) => track.stop());
        xrStoreRef.current = createXRStore();
        logDebug('UserMedia test succeeded.');
      } catch (err) {
        logDebug('UserMedia test failed: ' + err);
      }
    };

    func();
    onTest();
  }, []);

  const onTest = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      logDebug('onTest: Stopped previous stream.');
    }
    if (xrStoreRef.current) {
      xrStoreRef.current.getState().session?.end();
      xrStoreRef.current.destroy();
      xrStoreRef.current = null;
      logDebug('onTest: Previous XR session ended.');
    }
    xrStoreRef.current = createXRStore();
    setTimeout(() => {
      setMount(true);
      logDebug('onTest: Mount set to true.');
    }, 2000);
  };

  return (
    <>
      {isIOS ? (
        <NftAppT3 />
      ) : mount ? (
        <>
          <ARCanvas
            xrStoreRef={xrStoreRef}
            setSessionStarted={setSessionStarted}
            show={show}
            sessionStarted={sessionStarted}
            modalIsOpen={modalIsOpen}
            openModal={() => {
              func1();
              setMount(false);
            }}
            closeModal={closeModal}
            closeSaveModal={closeSaveModal}
            setShow={setShow}
            domWidth={domWidth}
            domHeight={domHeight}
            circleX={circleX}
            circleY={circleY}
            circleR={circleR}
            circleColor={circleColor}
            draw={func1}
            canvasRef={offCanvasRef}
            logDebug={logDebug}
          />
        </>
      ) : (
        <>
          <BackgroundVideo streamRef={streamRef} setIsMount={setIsMount} logDebug={logDebug} />
          {isMount && (
            <ModalU
              isMount={isMount}
              modalIsOpen={modalIsOpen}
              setFoto={setFoto}
              closeModal={onTest}
              closeSaveModal={closeSaveModal}
              canvasRef={offCanvasRef}
              logDebug={logDebug}
            />
          )}
        </>
      )}
      {/* 디버깅 로그 패널 */}
      <DebugPanel logs={debugLogs} />
    </>
  );
}

//
// ModalU 컴포넌트 (캡쳐된 이미지를 미리보기 및 재촬영/저장 버튼 제공)
//
const ModalU = function ({ closeModal, closeSaveModal, setFoto, canvasRef, isMount, logDebug }: any) {
  const [fotoUrl, setFotoUrl] = useState<string>('');

  useEffect(() => {
    const func = () => {
      const videoElement: HTMLVideoElement | null = document.querySelector('#three-video');
      const container = videoElement?.parentElement || null;
      if (!container || !videoElement) {
        logDebug('ModalU: Required elements not ready.');
        return;
      }
      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;
      const devicePixelRatio = window.devicePixelRatio || 1;
      const offscreenCanvas = document.createElement('canvas');
      offscreenCanvas.width = containerWidth * devicePixelRatio;
      offscreenCanvas.height = containerHeight * devicePixelRatio;
      const context = offscreenCanvas.getContext('2d');
      if (!context) {
        logDebug('ModalU: Failed to create canvas context.');
        return;
      }
      context.scale(devicePixelRatio, devicePixelRatio);

      const calculateDrawParams = (element: HTMLVideoElement | HTMLCanvasElement, objectFit: 'cover' | 'contain') => {
        const elementWidth = element instanceof HTMLVideoElement ? element.videoWidth : element.width;
        const elementHeight = element instanceof HTMLVideoElement ? element.videoHeight : element.height;
        if (elementWidth === 0 || elementHeight === 0) return null;
        const elementAspectRatio = elementWidth / elementHeight;
        const containerAspectRatio = containerWidth / containerHeight;
        let drawWidth = containerWidth;
        let drawHeight = containerHeight;
        let offsetX = 0;
        let offsetY = 0;
        if (objectFit === 'cover') {
          if (elementAspectRatio > containerAspectRatio) {
            drawWidth = containerHeight * elementAspectRatio;
            offsetX = (containerWidth - drawWidth) / 2;
          } else {
            drawHeight = containerWidth / elementAspectRatio;
            offsetY = (containerHeight - drawHeight) / 2;
          }
        } else if (objectFit === 'contain') {
          if (elementAspectRatio > containerAspectRatio) {
            drawHeight = containerWidth / elementAspectRatio;
            offsetY = (containerHeight - drawHeight) / 2;
          } else {
            drawWidth = containerHeight * elementAspectRatio;
            offsetX = (containerWidth - drawWidth) / 2;
          }
        }
        return { drawWidth, drawHeight, offsetX, offsetY };
      };

      try {
        const videoParams = calculateDrawParams(videoElement, 'cover');
        const canvasParams = calculateDrawParams(canvasRef.current, 'cover');
        if (videoParams) {
          context.drawImage(
            videoElement,
            videoParams.offsetX,
            videoParams.offsetY,
            videoParams.drawWidth,
            videoParams.drawHeight
          );
          logDebug('ModalU: Video drawn on offscreen canvas.');
          if (canvasRef.current && canvasParams) {
            context.drawImage(
              canvasRef.current,
              canvasParams.offsetX,
              canvasParams.offsetY,
              canvasParams.drawWidth,
              canvasParams.drawHeight
            );
            logDebug('ModalU: Offscreen canvas overlay drawn.');
          }
        }
        offscreenCanvas.toBlob((blob: any) => {
          if (blob) {
            setFoto(blob);
            const reader = new FileReader();
            reader.readAsDataURL(blob);
            reader.onload = () => {
              setFotoUrl(reader.result as string);
              logDebug('ModalU: Captured image blob converted to URL.');
            };
          } else {
            logDebug('ModalU: toBlob returned null.');
          }
        }, 'image/png');
      } catch (error) {
        logDebug('ModalU: Error capturing image: ' + error);
      }
    };

    let id: ReturnType<typeof setTimeout>;
    if (isMount) {
      id = setTimeout(() => {
        func();
      }, 1000);
    }
    return () => {
      clearTimeout(id);
    };
  }, [isMount]);

  return (
    <div style={{ ...customStyles, display: 'block', position: 'fixed' }}>
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {fotoUrl && (
            <img style={{ width: '100%', height: '100%', objectFit: 'contain', zIndex: 999999 }} src={fotoUrl} alt="캡쳐 이미지" />
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={closeModal} style={{ flex: 1 }}>
            다시찍기
          </button>
          <button onClick={closeSaveModal} style={{ flex: 1 }}>
            저장하기
          </button>
        </div>
      </div>
    </div>
  );
};
