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

// 모달 스타일 (content 스타일만 사용)
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

// iOS 분기용 플래그 (기존 코드 유지)
const isIOS =
  /iPad|iPhone|iPod/.test(navigator.userAgent) &&
  !(window as any).MSStream;

// offscreen 캔버스 생성 함수
const createOffscreenCanvas = (width: number, height: number, devicePixelRatio: number) => {
  const canvas = document.createElement('canvas');
  canvas.width = width * devicePixelRatio;
  canvas.height = height * devicePixelRatio;
  return canvas;
};

// Scene 컴포넌트: 예시로 박스를 표시
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

// UIOverlay 컴포넌트 (기존 UI 버튼 등)
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
  fotoUrl: string; // 사용하지 않음(미리보기 이미지 관련)
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
      {/* 안내용 원과 버튼 (예시) */}
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
            title=" 토끼 부르기"
            className="z-[1001] fixed bottom-[20%] left-1/2 -translate-x-1/2 w-max mx-auto p-4 h-fit"
          />
        </>
      )}
    </div>
  );
};

// ARCanvas 컴포넌트
function ARCanvas(props: any) {
  const { setOffscreenCanvas, logDebug } = props;
  const [init, setInit] = useState(false);

  useEffect(() => {
    let id: ReturnType<typeof setTimeout>;
    const func = async () => {
      if (props.xrStoreRef.current) {
        try {
          await props.xrStoreRef.current.enterAR();
          props.setSessionStarted(true);
          logDebug('XR session started.');
        } catch (err) {
          logDebug('XR session failed to start: ' + err);
        }
      }
    };
    if (init) {
      id = setTimeout(() => {
        func();
      }, 1000);
    }
    return () => clearTimeout(id);
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
          logDebug('Canvas created, init set to true.');

          // offscreen 캔버스 생성 후 상위 상태에 저장
          const offscreen = createOffscreenCanvas(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
          setOffscreenCanvas(offscreen);
          logDebug('Offscreen canvas created in ARCanvas.');
        }}
      >
        <XR store={props.xrStoreRef.current}>
          <XROrigin position={[0, 0.5, 0]} />
          <Scene visible={props.sessionStarted && props.show} />
          <XRDomOverlay>
            <UIOverlay
              modalIsOpen={props.modalIsOpen}
              fotoUrl={''} // 미사용
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

// BackgroundVideo: 사용자 카메라 피드를 표시
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

// ModalU 컴포넌트: offscreen 캔버스를 상위에서 전달받아 캡쳐 진행
const ModalU = function ({
  closeModal,
  closeSaveModal,
  setFoto,
  offscreenCanvas,
  logDebug,
  isMount,
}: any) {
  const [fotoUrl, setFotoUrl] = useState<string>('');

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;

    const captureImage = () => {
      // 여기서는 video 요소와 offscreenCanvas를 이용해 캡쳐 진행
      const videoElement: HTMLVideoElement | null = document.querySelector('#three-video');
      const container = videoElement?.parentElement || null;
      if (!container || !videoElement) {
        logDebug('ModalU: Required video or container elements not ready.');
        return;
      }

      if (!offscreenCanvas) {
        logDebug('ModalU: offscreenCanvas is null, delaying capture...');
        timeoutId = setTimeout(captureImage, 500);
        return;
      }

      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;
      const devicePixelRatio = window.devicePixelRatio || 1;

      // offscreen 캔버스 크기 재설정 및 드로잉 (ModalU에서는 video의 내용만 캡쳐)
      offscreenCanvas.width = containerWidth * devicePixelRatio;
      offscreenCanvas.height = containerHeight * devicePixelRatio;
      const context = offscreenCanvas.getContext('2d');
      if (!context) {
        logDebug('ModalU: Failed to get offscreen canvas context.');
        return;
      }
      context.scale(devicePixelRatio, devicePixelRatio);

      // video 요소를 offscreen 캔버스에 그림
      context.drawImage(videoElement, 0, 0, containerWidth, containerHeight);
      logDebug('ModalU: Video drawn on offscreen canvas.');

      // offscreen 캔버스를 Blob으로 변환
      offscreenCanvas.toBlob((blob: Blob | null) => {
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
    };

    if (isMount) {
      timeoutId = setTimeout(captureImage, 1000);
    }
    return () => clearTimeout(timeoutId);
  }, [isMount, offscreenCanvas]);

  return (
    <div style={{ ...customStyles, position: 'fixed' }}>
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {fotoUrl && (
            <img style={{ width: '100%', height: '100%', objectFit: 'contain' }} src={fotoUrl} alt="캡쳐 이미지" />
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={closeModal} style={{ flex: 1 }}>다시찍기</button>
          <button onClick={closeSaveModal} style={{ flex: 1 }}>저장하기</button>
        </div>
      </div>
    </div>
  );
};

// shareOrDownloadImage 함수: Blob을 공유하거나 다운로드
const shareOrDownloadImage = (blob: Blob, logDebug: (msg: string) => void): void => {
  if (
    navigator.canShare &&
    navigator.canShare({ files: [new File([blob], 'capture.png', { type: blob.type })] })
  ) {
    const file = new File([blob], `capture-${new Date().getTime()}.png`, {
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
    link.download = `capture-${new Date().getTime()}.png`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  }
};

// DebugPanel 컴포넌트: 디버그 로그 출력
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

// BasicApp: offscreen 캔버스를 상태로 관리하고 전체 UI를 렌더링
export default function BasicApp() {
  const xrStoreRef = useRef<any>(null);
  const [mount, setMount] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [modalIsOpen, setIsOpen] = useState(false);
  const [foto, setFoto] = useState<Blob | null>(null);
  const [show, setShow] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const [isMount, setIsMount] = useState(false);

  // offscreen 캔버스를 상태로 관리 (초기 null)
  const [offscreenCanvas, setOffscreenCanvas] = useState<HTMLCanvasElement | null>(null);

  // 디버그 로그 상태
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
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

  // onTest: XRStore 초기화 및 마운트 상태 전환
  const onTest = () => {
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

  // captureARContent: ARCanvas의 three.js 캔버스 내용을 offscreenCanvas에 그린 후,
  // ARCanvas를 언마운트하기 위해 mount를 false로 전환
  const captureARContent = () => {
    const threeCanvas = document.querySelector('#three-canvas') as HTMLCanvasElement;
    if (!threeCanvas) {
      logDebug('captureARContent: threeCanvas not found.');
      return;
    }
    const containerWidth = threeCanvas.clientWidth;
    const containerHeight = threeCanvas.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    if (offscreenCanvas) {
      offscreenCanvas.width = containerWidth * dpr;
      offscreenCanvas.height = containerHeight * dpr;
      const ctx = offscreenCanvas.getContext('2d');
      if (!ctx) {
        logDebug('captureARContent: Failed to get offscreen canvas context.');
        return;
      }
      ctx.scale(dpr, dpr);
      ctx.drawImage(threeCanvas, 0, 0, containerWidth, containerHeight);
      logDebug('captureARContent: AR content captured to offscreen canvas.');
    } else {
      logDebug('captureARContent: offscreenCanvas is null.');
    }
  };

  // closeSaveModal: 사진 저장(공유 또는 다운로드) 처리
  const handleCloseSaveModal = () => {
    if (foto) {
      shareOrDownloadImage(foto, logDebug);
    } else {
      logDebug('handleCloseSaveModal: No image to share/download.');
    }
    setIsOpen(false);
  };

  useEffect(() => {
    const func = async () => {
      try {
        const constraints = {
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        };
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

  return (
    <>
      {isIOS ? (
        // iOS 기기에서는 기존 iOS 전용 컴포넌트 렌더링
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
              // ARCanvas에서 캡쳐 버튼 클릭 시,
              // 먼저 AR 콘텐츠를 offscreen 캔버스에 복사한 후,
              // mount 상태를 false로 변경해 ARCanvas를 언마운트하고 ModalU를 렌더링함.
              captureARContent();
              setMount(false);
              setIsOpen(true);
            }}
            closeModal={() => setIsOpen(false)}
            closeSaveModal={handleCloseSaveModal}
            setShow={setShow}
            domWidth={domWidth}
            domHeight={domHeight}
            circleX={circleX}
            circleY={circleY}
            circleR={circleR}
            circleColor={circleColor}
            setOffscreenCanvas={setOffscreenCanvas}
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
              closeModal={() => {
                setIsOpen(false);
                onTest();
              }}
              closeSaveModal={handleCloseSaveModal}
              offscreenCanvas={offscreenCanvas}
              logDebug={logDebug}
            />
          )}
        </>
      )}
      <DebugPanel logs={debugLogs} />
    </>
  );
}
