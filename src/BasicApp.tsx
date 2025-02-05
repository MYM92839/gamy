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
// XR 캔버스 위에 렌더링할 UI를 React Portal을 이용하여 별도 DOM (#overlay-root)에 표시합니다.
//
const UIOverlay = ({
  modalIsOpen,
  fotoUrl,
  openModal,
  closeModal,
  closeSaveModal,
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
  console.log("URL", fotoUrl)


  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        pointerEvents: 'auto',
      }}
    >
      {/* 캡쳐 모달 */}
      <div style={{ ...customStyles, display: modalIsOpen ? 'block' : 'none' }}>
        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            {fotoUrl && (
              <img style={{ width: '100%', height: '100%', objectFit: 'contain' }} src={fotoUrl} alt="캡쳐 이미지" />
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


function ARHelper({ store }: any) {
  const [init, setInit] = useState(false);

  useEffect(() => {
    if (!init) setInit(true)
    return () => {
      const func = () => {
        if (store.current) {
          store.current.getState().session?.end()
          store.current.destroy()
          store.current = null
        }

      }
      func()
    }
  }, [])

  return null
}


function ARCanvas(props: any) {
  const [init, setInit] = useState(false);

  useEffect(() => {
    let id: string | number | NodeJS.Timeout | undefined;
    const func = async () => {
      // VR 모드로 진입 (AR 대신 VR로 전환)
      if (props.xrStoreRef.current) {
        await props.xrStoreRef.current.enterAR()
        props.setSessionStarted(true);
      }
    };
    if (init) {
      id = setTimeout(() => {
        func();
      }, 1000);
    }
    return () => {
      props.draw()


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
          // XR 세션 시작 전에 한 번만 크기를 설정합니다.
          state.gl.setPixelRatio(window.devicePixelRatio);
          state.gl.setSize(window.innerWidth, window.innerHeight);
          // 이후에는 XR 세션이 시작되면 크기 변경을 하지 않도록 합니다.
          setInit(true);
        }}
      >
        <XR store={props.xrStoreRef.current}>
          <ARHelper store={props.xrStoreRef} />
          <XROrigin position={[0, 0.5, 0]} />
          {/* CameraZoomHandle를 사용하여 핀치/드래그 입력으로 카메라 zoom 제어 */}
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
  )
}
//
// VR 모드에서 사용자의 카메라 피드를 배경으로 보여주기 위한 컴포넌트
// getUserMedia를 사용하여 video 스트림을 받아 배경에 표시합니다.
//
function BackgroundVideo({ streamRef, setIsMount }: any) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      })
      .then((stream) => {
        if (videoRef.current) {
          // 이미 스트림이 할당되어 있지 않은지 확인
          if (videoRef.current.srcObject !== stream) {
            videoRef.current.srcObject = stream;

            streamRef.current = stream
          }
          // onloadeddata 이벤트를 기다렸다가 play() 호출
          videoRef.current.onloadeddata = () => {
            videoRef.current?.play().catch((err) =>
              console.error('Video play error:', err)
            );

              setIsMount(true)

          };
        }
      })
      .catch((err) => console.error('getUserMedia error:', err));


    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track: any) => track.stop());
        streamRef.current = null
      }

    }
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
        zIndex: 0, // 캔버스 뒤쪽에 배경으로 표시
      }}
      autoPlay
      playsInline
      muted
      loop
    />
  );
}

//
// 메인 앱
//
export default function BasicApp() {
  const xrStoreRef = useRef<any>/*  */(null)
  const [mount, setMount] = useState(false) // TODO: TEST
  const [sessionStarted, setSessionStarted] = useState(false);
  const [modalIsOpen, setIsOpen] = useState(false);
  const [foto, setFoto] = useState<Blob | null>(null);
  const [fotoUrl, setFotoUrl] = useState<string>('');
  const [show, setShow] = useState(false);
  const streamRef = useRef<MediaStream | null>(null)
  const [isMount, setIsMount] = useState(false)

  const offCanvasRef = useRef<any>(null)


  const domWidth = 360;
  const domHeight = 640;
  const circleX = domWidth / 2;
  const circleY = domHeight / 2;
  const circleR = 100;
  const circleColor = 'blue'


  const func1 = async () => {
    const threeCanvas: HTMLCanvasElement | null = document.querySelector('[data-webxr_runtime]')?.children[3] as HTMLCanvasElement;


    const containerWidth = threeCanvas.clientWidth;
    const containerHeight = threeCanvas.clientHeight;
    const devicePixelRatio = window.devicePixelRatio || 1;

    const offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = containerWidth * devicePixelRatio;
    offscreenCanvas.height = containerHeight * devicePixelRatio;

    offCanvasRef.current = offscreenCanvas

    const context = offscreenCanvas.getContext('2d');
    if (!context) {
      console.error('Failed to create canvas context.');
      return;
    }

    // 고해상도 지원
    context.scale(devicePixelRatio, devicePixelRatio);

    // Helper function to calculate draw parameters
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
          offsetX = (containerWidth - drawWidth) / 2; // 가로 중심 정렬
        } else {
          drawHeight = containerWidth / elementAspectRatio;
          offsetY = (containerHeight - drawHeight) / 2; // 세로 중심 정렬
        }
      } else if (objectFit === 'contain') {
        if (elementAspectRatio > containerAspectRatio) {
          drawHeight = containerWidth / elementAspectRatio;
          offsetY = (containerHeight - drawHeight) / 2; // 세로 중심 정렬
        } else {
          drawWidth = containerHeight * elementAspectRatio;
          offsetX = (containerWidth - drawWidth) / 2; // 가로 중심 정렬
        }
      }

      return { drawWidth, drawHeight, offsetX, offsetY };
    };

    try {
      // Step 2: Three.js WebGL 캔버스를 캔버스에 그리기
      const threeParams = calculateDrawParams(threeCanvas, 'cover');
      if (threeParams) {
        context.drawImage(
          threeCanvas,
          threeParams.offsetX,
          threeParams.offsetY,
          threeParams.drawWidth,
          threeParams.drawHeight
        );
      }

      // Step 3: 최종 이미지를 PNG로 저장
      offscreenCanvas.toBlob((blob) => {
        if (blob) {
          setFoto(blob);
        }
      }, 'image/png');
    } catch (error) {
      console.error('Error capturing image:', error);
    }

  }

  useEffect(() => {
    if (foto) {
      const reader = new FileReader();
      reader.onload = () => {
        setFotoUrl(reader.result as string);
      };
      reader.readAsDataURL(foto);
    }
  }, [foto]);

  // function openModal() {
  //   setIsOpen(true);
  //   captureImage();
  // }

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
    let id: string | number | NodeJS.Timeout | undefined
    const func = async () => {
      const constraints = {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      stream.getTracks().forEach((track) => track.stop());
      xrStoreRef.current = createXRStore()

    }

    func()
    onTest()
    return () => {
      if (id) clearTimeout(id)
    }
  }, [])



  const onTest = () => {

    let id: string | number | NodeJS.Timeout | undefined

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null
    }

    if (xrStoreRef.current) {
      xrStoreRef.current.getState().session?.end()
      xrStoreRef.current.destroy()
      xrStoreRef.current = null
    }

    xrStoreRef.current = createXRStore()

    id = setTimeout(() => {
      setMount(true)
    }, 2000)

    return () => {
      if (id) clearTimeout(id)
    }
  }




  useEffect(() => {

  }, [mount])


  return (
    <>
      {isIOS ? (
        <NftAppT3 />
      ) : mount ? (
        <>
          {/* 배경에 카메라 스트림을 표시 */}
          {/* XR 캔버스 영역 */}
          <ARCanvas
            xrStoreRef={xrStoreRef}
            setSessionStarted={setSessionStarted}
            show={show}
            sessionStarted={sessionStarted}
            modalIsOpen={modalIsOpen}
            fotoUrl={fotoUrl}
            openModal={() => {
              setMount(false)
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
          />
          {/* UI 영역을 Portal을 이용해 별도 DOM (#overlay-root)에 렌더링 */}
          {/*  */}
        </>
      ) : <>
        <BackgroundVideo streamRef={streamRef} setIsMount={setIsMount} />
        <ModalU
          isMount={isMount}
          modalIsOpen={modalIsOpen}
          fotoUrl={fotoUrl}
          setFoto={setFoto}
          closeModal={onTest}
          closeSaveModal={closeSaveModal}
          canvasRef={offCanvasRef}
        />
      </>
      }
    </>
  );
}


const ModalU = function ({ fotoUrl, closeModal, closeSaveModal, setFoto, canvasRef, isMount }: any) {

  useEffect(() => {
    const func = () => {
      if (isMount) {
        const videoElement: HTMLVideoElement | null = document.querySelector('#three-video'); // 비디오 요소
        // const threeCanvas: HTMLCanvasElement | null = document.querySelector('#three-canvas')?.children[0]
        //   .children[0]! as HTMLCanvasElement; // Three.js 캔버스
        const container = videoElement?.parentElement || null; // 최상위 렌더링 컨테이너

        if (!container || !videoElement) {
          console.warn('Required elements not ready');
          return;
        }

        // 캔버스 크기 설정
        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;
        const devicePixelRatio = window.devicePixelRatio || 1;

        const offscreenCanvas = document.createElement('canvas');
        offscreenCanvas.width = containerWidth * devicePixelRatio;
        offscreenCanvas.height = containerHeight * devicePixelRatio;

        const context = offscreenCanvas.getContext('2d');
        if (!context) {
          console.error('Failed to create canvas context.');
          return;
        }

        // 고해상도 지원
        context.scale(devicePixelRatio, devicePixelRatio);

        // Helper function to calculate draw parameters
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
              offsetX = (containerWidth - drawWidth) / 2; // 가로 중심 정렬
            } else {
              drawHeight = containerWidth / elementAspectRatio;
              offsetY = (containerHeight - drawHeight) / 2; // 세로 중심 정렬
            }
          } else if (objectFit === 'contain') {
            if (elementAspectRatio > containerAspectRatio) {
              drawHeight = containerWidth / elementAspectRatio;
              offsetY = (containerHeight - drawHeight) / 2; // 세로 중심 정렬
            } else {
              drawWidth = containerHeight * elementAspectRatio;
              offsetX = (containerWidth - drawWidth) / 2; // 가로 중심 정렬
            }
          }

          return { drawWidth, drawHeight, offsetX, offsetY };
        };

        try {
          // Step 1: 비디오를 캔버스에 그리기
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

            if (canvasRef.current && canvasParams) {
              context.drawImage(
                canvasRef.current,
                canvasParams.offsetX,
                canvasParams.offsetY,
                canvasParams.drawWidth,
                canvasParams.drawHeight
              )
            }
          }

          // Step 3: 최종 이미지를 PNG로 저장
          offscreenCanvas.toBlob((blob: any) => {
            if (blob) {
              setFoto(blob);
            }
          }, 'image/png');
        } catch (error) {
          console.error('Error capturing image:', error);
        }
      }
    }

    let id

    id = setTimeout(() => {
      func()
    }, 2000)

    return () => {
      if (id) clearTimeout(id)
    }
  }, [isMount])

  return (
    <div style={{ ...customStyles, display: 'block', position: 'fixed' }}>
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {fotoUrl && (
            <img style={{ width: '100%', height: '100%', objectFit: 'contain' }} src={fotoUrl} alt="캡쳐 이미지" />
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
  )
}