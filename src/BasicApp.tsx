/* eslint-disable prefer-const */

import { Canvas, useThree } from '@react-three/fiber';
import { OrbitHandles } from '@react-three/handle';
import { createXRStore, noEvents, PointerEvents, XR, XRDomOverlay, XROrigin } from '@react-three/xr';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as THREE from 'three';
import { Box } from './ArApp';
import NftAppT3 from './NftAppT3';
import Back from './assets/icons/Back';
import Capture from './assets/icons/Capture';
import Button from './components/Button';

// Types
interface SavedObjectData {
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
}

interface SceneProps {
  visible: boolean;
  glRef: any;
  calibrationMatrixRef: React.MutableRefObject<THREE.Matrix4 | null>;
}

interface UIOverlayProps {
  modalIsOpen: boolean;
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
  fotoUrl: string;
  cameraFov: number; // XR 카메라의 fov
}

// Utils
function calcCover(srcWidth: number, srcHeight: number, destWidth: number, destHeight: number) {
  const srcAspect = srcWidth / srcHeight;
  const destAspect = destWidth / destHeight;
  let drawWidth, drawHeight, offsetX, offsetY;

  if (srcAspect > destAspect) {
    drawHeight = destHeight;
    drawWidth = destHeight * srcAspect;
    offsetX = (destWidth - drawWidth) / 2;
    offsetY = 0;
  } else {
    drawWidth = destWidth;
    drawHeight = destWidth / srcAspect;
    offsetX = 0;
    offsetY = (destHeight - drawHeight) / 2;
  }
  return { drawWidth, drawHeight, offsetX, offsetY };
}

// Scene Management
let savedObjects: SavedObjectData[] = [];
let savedCameraMatrix = new THREE.Matrix4();

function onXRSessionEnd(scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
  savedObjects = scene.children.map((obj) => ({
    position: obj.position.clone(),
    rotation: obj.rotation.clone(),
    scale: obj.scale.clone(),
  }));
  savedCameraMatrix.copy(camera.matrixWorld);
}

/**
 * renderSceneForCapture
 * - XR 캡쳐를 위해 임시 카메라(tempCamera)를 생성하여 WebXR 카메라의 행렬 및 좌표계 보정을 적용합니다.
 * - devicePixelRatio를 반영해 정수 크기로 렌더 타겟을 설정합니다.
 * - 추가: calibrationMatrix가 제공되면, 이를 기반으로 센서 오차 및 초기 캘리브레이션 보정을 진행합니다.
 */
function renderSceneForCapture(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  calibrationMatrix?: THREE.Matrix4 | null
): string {
  const container = document.querySelector('#three-canvas');
  if (!container) return '';

  const containerWidth = container.clientWidth;
  const containerHeight = container.clientHeight;
  const dpr = window.devicePixelRatio || 1;
  const width = Math.floor(containerWidth * dpr);
  const height = Math.floor(containerHeight * dpr);

  // --- 임시 카메라 생성 및 보정 시작 ---
  const tempCamera = new THREE.PerspectiveCamera(camera.fov, containerWidth / containerHeight, camera.near, camera.far);
  tempCamera.projectionMatrix.copy(camera.projectionMatrix);

  // XR과 Three.js 간 좌표계 차이를 보정 (예: Y축 기준 180도 회전)
  const offsetQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
  tempCamera.quaternion.copy(camera.quaternion).multiply(offsetQuaternion);

  // ★ 보정 로직 적용 ★
  if (calibrationMatrix) {
    // calibrationMatrix의 역행렬을 곱해 초기 캘리브레이션 기준으로 보정
    const calibratedMatrix = new THREE.Matrix4();
    calibratedMatrix.multiplyMatrices(calibrationMatrix.clone().invert(), camera.matrixWorld);
    tempCamera.matrixWorld.copy(calibratedMatrix);
    tempCamera.matrixWorldInverse.copy(calibratedMatrix).invert();
  } else {
    // 보정 데이터가 없다면 기존 방식으로 처리 (예: savedCameraMatrix 사용)
    tempCamera.matrixWorld.copy(savedCameraMatrix);
    tempCamera.matrixWorldInverse.copy(savedCameraMatrix).invert();
  }
  tempCamera.updateProjectionMatrix();
  // --- 임시 카메라 생성 및 보정 완료 ---

  // 저장된 오브젝트 정보 복원
  scene.children.forEach((obj, index) => {
    if (savedObjects[index]) {
      obj.position.copy(savedObjects[index].position);
      obj.rotation.copy(savedObjects[index].rotation);
      obj.scale.copy(savedObjects[index].scale);
    }
  });

  const renderTarget = new THREE.WebGLRenderTarget(width, height, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
  });

  renderer.setRenderTarget(renderTarget);
  renderer.clear(true, true, true);
  // XR 세션 보정을 적용한 tempCamera로 씬 렌더링
  renderer.render(scene, tempCamera);

  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = width;
  tempCanvas.height = height;
  const tempCtx = tempCanvas.getContext('2d');
  if (!tempCtx) return '';

  const pixels = new Uint8Array(width * height * 4);
  const gl = renderer.getContext();
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

  // 이미지 수직 뒤집기 (WebGL의 픽셀 데이터는 아래쪽부터 읽힘)
  const imageData = new ImageData(new Uint8ClampedArray(pixels), width, height);
  for (let row = 0; row < height; row++) {
    const sourceIndex = (height - row - 1) * width * 4;
    const destIndex = row * width * 4;
    imageData.data.set(pixels.subarray(sourceIndex, sourceIndex + width * 4), destIndex);
  }
  tempCtx.putImageData(imageData, 0, 0);
  renderer.setRenderTarget(null);
  renderTarget.dispose();

  return tempCanvas.toDataURL('image/png');
}

// Components

function Scene({ visible, glRef, calibrationMatrixRef }: SceneProps) {
  const [searchParams] = useSearchParams();
  const ox = searchParams.get('ox') ? parseFloat(searchParams.get('ox')!) : 0;
  const oy = searchParams.get('oy') ? parseFloat(searchParams.get('oy')!) : 0;
  const oz = searchParams.get('oz') ? parseFloat(searchParams.get('oz')!) : 0;
  const cx = searchParams.get('cx') ? parseFloat(searchParams.get('cx')!) : 0;
  const cy = searchParams.get('cy') ? parseFloat(searchParams.get('cy')!) : 0;
  const cz = searchParams.get('cz') ? parseFloat(searchParams.get('cz')!) : 0;
  const sx = searchParams.get('sx') ? parseFloat(searchParams.get('sx')!) : 0;
  const sy = searchParams.get('sy') ? parseFloat(searchParams.get('sy')!) : 0;
  const sz = searchParams.get('sz') ? parseFloat(searchParams.get('sz')!) : 0;

  const { gl, camera, scene } = useThree();
  const groupRef = useRef<THREE.Group>(null);

  useEffect(() => {
    if (gl) {
      glRef.current = { gl, camera, scene };
    }
  }, [camera, gl, glRef, scene]);

  // AR 세션이 안정된 첫 렌더 시점에 캘리브레이션 행렬 저장
  useEffect(() => {
    if (visible && camera && !calibrationMatrixRef.current) {
      calibrationMatrixRef.current = camera.matrixWorld.clone();
      console.log('Calibration matrix set:', calibrationMatrixRef.current);
    }
  }, [visible, camera, calibrationMatrixRef]);

  useEffect(() => {
    if (visible && groupRef.current && camera) {
      const box = new THREE.Box3().setFromObject(groupRef.current);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());

      const maxDim = Math.max(size.x, size.y, size.z);
      const fov = (camera as THREE.PerspectiveCamera).fov * (Math.PI / 180);
      let distance = maxDim / (2 * Math.tan(fov / 2));
      distance *= 1.2;

      const direction = new THREE.Vector3().subVectors(camera.position, center).normalize();
      if (direction.length() === 0) {
        direction.set(0, 0, 1);
      }
      camera.position.copy(center).add(direction.multiplyScalar(distance));
      camera.lookAt(center);
      camera.updateProjectionMatrix();
    }
  }, [visible, camera]);

  return (
    <>
      <ambientLight intensity={3} />
      <pointLight position={[10, 10, 10]} />
      <Suspense fallback={null}>
        <group
          ref={groupRef}
          position={[cx, cy, -10 + cz]}
          rotation={[0, -Math.PI / 4, 0]}
          scale={[0.5, 0.5, 0.5]}
          visible={visible}
        >
          {visible && <Box sposition={[sx, sy, sz]} oposition={[ox, oy, oz]} on onRenderEnd={() => {}} />}
        </group>
      </Suspense>
    </>
  );
}

function UIOverlay({
  openModal,
  setShow,
  domWidth,
  domHeight,
  circleX,
  circleY,
  show,
  circleR,
  circleColor,
}: UIOverlayProps) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 99999, pointerEvents: 'auto' }}>
      <button
        style={{
          position: 'fixed',
          bottom: '65px',
          left: '24px',
          background: 'transparent',
          border: 'none',
          zIndex: 1001,
        }}
        onClick={() => {
          window.location.href = 'https://gamy-six.vercel.app/test';
        }}
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
          zIndex: 100001,
        }}
        onClick={openModal}
      >
        <Capture />
      </button>
      {!show && (
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
              zIndex: 9999999,
            }}
          >
            <svg width={domWidth} height={domHeight} style={{ position: 'absolute', top: 0, left: 0 }}>
              <circle cx={circleX} cy={circleY} r={circleR} fill="none" stroke={circleColor} strokeWidth="2" />
            </svg>
          </div>
          <Button
            onClick={() => setShow(true)}
            title="토끼 부르기"
            className="z-[99999999] fixed bottom-[20%] left-1/2 -translate-x-1/2 w-max mx-auto p-4 h-fit"
          />
        </>
      )}
    </div>
  );
}

function ARCanvas(props: any) {
  const { setOffscreenCanvas, logDebug } = props;
  const [init, setInit] = useState(false);
  const glRef = useRef(null);

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
      id = setTimeout(func, 1000);
    }
    return () => clearTimeout(id);
  }, [init]);

  const handleModal = () => {
    props.openModal(glRef.current);
  };

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <Canvas
        id="three-canvas"
        style={{ width: '100vw', height: '100vh', background: 'transparent' }}
        gl={{ alpha: true, preserveDrawingBuffer: true }}
        onCreated={(state) => {
          state.gl.setPixelRatio(window.devicePixelRatio);
          state.gl.setSize(window.innerWidth, window.innerHeight);
          setInit(true);
          logDebug('Canvas created, init set to true.');
          const offscreen = document.createElement('canvas');
          offscreen.width = Math.floor(window.innerWidth * window.devicePixelRatio);
          offscreen.height = Math.floor(window.innerHeight * window.devicePixelRatio);
          setOffscreenCanvas(offscreen);
          logDebug('Offscreen canvas created in ARCanvas.');
        }}
        events={noEvents}
      >
        <PointerEvents />
        <OrbitHandles />
        <XR store={props.xrStoreRef.current}>
          <XROrigin position={[0, 0.5, 0]} />
          <Scene
            visible={props.sessionStarted && props.show}
            glRef={glRef}
            calibrationMatrixRef={props.calibrationMatrixRef}
          />
          <XRDomOverlay>
            <UIOverlay
              modalIsOpen={props.modalIsOpen}
              fotoUrl={''}
              openModal={handleModal}
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
              cameraFov={props.cameraFov}
            />
          </XRDomOverlay>
        </XR>
      </Canvas>
    </div>
  );
}

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
          videoRef.current.srcObject = stream;
          streamRef.current = stream;
          videoRef.current.onloadeddata = () => {
            videoRef.current?.play().catch((err) => logDebug('Video play error: ' + err));
            setIsMount(true);
          };
        }
      })
      .catch((err) => logDebug('getUserMedia error: ' + err));

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track: any) => track.stop());
        streamRef.current = null;
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

/**
 * ModalU 컴포넌트 (합성)
 * - 유저 카메라 화면과 three.js 캔버스를 합성합니다.
 * - 여기서 유저 카메라 영상에만 FOV 보정 효과를 적용합니다.
 */
const ModalU = function ({
  closeModal,
  closeSaveModal,
  setFoto,
  offscreenCanvas,
  isMount,
  cameraFov,
}: UIOverlayProps & any) {
  const [fotoUrl, setFotoUrl] = useState<string>('');

  useEffect(() => {
    // 유저 카메라 화면과 three.js 캔버스를 합성
    const captureComposite = () => {
      const containerWidth = window.innerWidth;
      const containerHeight = window.innerHeight;
      const dpr = window.devicePixelRatio || 1;
      const compositeCanvas = document.createElement('canvas');
      compositeCanvas.width = Math.floor(containerWidth * dpr);
      compositeCanvas.height = Math.floor(containerHeight * dpr);
      const ctx = compositeCanvas.getContext('2d');
      if (!ctx) return;

      ctx.scale(dpr, dpr);

      // --- 유저 카메라 영상 그리기 (FOV 보정 적용) ---
      const videoElement = document.querySelector('#three-video') as HTMLVideoElement;
      const videoWidth = videoElement.videoWidth || containerWidth;
      const videoHeight = videoElement.videoHeight || containerHeight;
      const videoParams = calcCover(videoWidth, videoHeight, containerWidth, containerHeight);

      // 기본 video FOV를 45°로 가정, 실제 XR 카메라 fov(cameraFov)와 비교하여 스케일 계산
      const defaultVideoFov = 45;
      const effectiveFov = cameraFov || defaultVideoFov;
      const addedFactor = 0.95;
      const fovScale =
        (Math.tan(((effectiveFov / 2) * Math.PI) / 180) / Math.tan(((defaultVideoFov / 2) * Math.PI) / 180)) *
        addedFactor;

      const adjustedDrawWidth = videoParams.drawWidth * fovScale;
      const adjustedDrawHeight = videoParams.drawHeight * fovScale;
      const adjustedOffsetX = (containerWidth - adjustedDrawWidth) / 2;
      const adjustedOffsetY = (containerHeight - adjustedDrawHeight) / 2;

      ctx.drawImage(videoElement, adjustedOffsetX, adjustedOffsetY, adjustedDrawWidth, adjustedDrawHeight);
      // -----------------------------------------------------

      // --- three.js 씬 합성 (기존 계산대로) ---
      const threeCSSWidth = offscreenCanvas!.width / dpr;
      const threeCSSHeight = offscreenCanvas!.height / dpr;
      const scaleFactorThree = Math.max(containerWidth / threeCSSWidth, containerHeight / threeCSSHeight);
      const drawWidth = threeCSSWidth * scaleFactorThree;
      const drawHeight = threeCSSHeight * scaleFactorThree;
      const offsetX = (containerWidth - drawWidth) / 2;
      const offsetY = (containerHeight - drawHeight) / 2;

      ctx.filter = 'brightness(1.5)';
      ctx.drawImage(offscreenCanvas!, offsetX, offsetY, drawWidth, drawHeight);
      ctx.filter = 'none';
      // -----------------------------------------------------

      compositeCanvas.toBlob((blob: Blob | null) => {
        if (blob) {
          setFoto(blob);
          const reader = new FileReader();
          reader.readAsDataURL(blob);
          reader.onload = () => {
            setFotoUrl(reader.result as string);
          };
        }
      }, 'image/png');
    };

    if (isMount) {
      const timeoutId = setTimeout(captureComposite, 2000);
      return () => clearTimeout(timeoutId);
    }
  }, [isMount, offscreenCanvas, cameraFov]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'white',
        borderRadius: '16px',
        width: '100vw',
        height: '100vh',
        padding: '8px',
        zIndex: 10000,
      }}
      className="overflow-y-hidden"
    >
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }} className="max-h-screen">
        <div style={{ display: 'flex', gap: '8px' }} className="h-max p-4">
          <button onClick={closeModal} style={{ flex: 1 }}>
            다시 찍기
          </button>
          <button onClick={closeSaveModal} style={{ flex: 1 }}>
            저장하기
          </button>
        </div>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {fotoUrl && (
            <img style={{ width: '100%', height: 'auto', objectFit: 'cover' }} src={fotoUrl} alt="캡처 이미지" />
          )}
        </div>
      </div>
    </div>
  );
};

// Main App Component
export default function BasicApp() {
  const xrStoreRef = useRef<any>(null);
  const [mount, setMount] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [modalIsOpen, setIsOpen] = useState(false);
  const [foto, setFoto] = useState<Blob | null>(null);
  const [show, setShow] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const [isMount, setIsMount] = useState(false);
  const [offscreenCanvas, setOffscreenCanvas] = useState<HTMLCanvasElement | null>(null);
  const [, setDebugLogs] = useState<string[]>([]);
  const [cameraFov, setCameraFov] = useState<number>(60); // XR 카메라 fov 상태

  // 추가: 센서 오차 보정을 위한 초기 캘리브레이션 행렬 저장
  const calibrationMatrixRef = useRef<THREE.Matrix4 | null>(null);

  const logDebug = (msg: any, ...optionalParams: any[]) => {
    console.log(msg, ...optionalParams);
    setDebugLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const domWidth = 500;
  const domHeight = 900;
  const circleX = domWidth / 2;
  const circleY = domHeight / 2;
  const circleR = 100;
  const circleColor = 'blue';

  const onTest = () => {
    if (xrStoreRef.current) {
      xrStoreRef.current.getState().session?.end();
      xrStoreRef.current.destroy();
      xrStoreRef.current = null;
    }
    xrStoreRef.current = createXRStore();
    setTimeout(() => {
      setMount(true);
    }, 2000);
  };

  const shareOrDownloadImage = (blob: Blob) => {
    if (navigator.canShare && navigator.canShare({ files: [new File([blob], 'capture.png', { type: blob.type })] })) {
      const file = new File([blob], `capture-${new Date().getTime()}.png`, {
        type: 'image/png',
      });
      navigator
        .share({
          files: [file],
          title: 'My Captured Image',
          text: 'Check out this captured photo!',
        })
        .catch((error) => logDebug('Sharing failed: ' + error));
    } else {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `capture-${new Date().getTime()}.png`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
    }
  };

  /**
   * 수정된 captureARContent:
   * - 전달받은 gl, scene, camera를 사용하여 renderSceneForCapture를 호출합니다.
   * - offscreenCanvas의 크기를 container의 dpr을 고려해 정수 값으로 설정합니다.
   * - 동시에 XR 카메라의 fov 값을 state에 저장해 ModalU의 비디오 보정에 사용합니다.
   * - 추가: calibrationMatrixRef를 이용하여 센서 오차 보정 적용
   */
  const captureARContent = ({
    gl,
    scene,
    camera,
  }: {
    gl: THREE.WebGLRenderer;
    camera: THREE.PerspectiveCamera;
    scene: THREE.Scene;
  }) => {
    onXRSessionEnd(scene, camera);
    // XR 카메라의 fov 값을 업데이트
    setCameraFov(camera.fov);
    const imgData = renderSceneForCapture(gl, scene, camera, calibrationMatrixRef.current);
    const threeCanvas = document.querySelector('#three-canvas');

    if (threeCanvas && offscreenCanvas) {
      const containerWidth = window.innerWidth;
      const containerHeight = window.innerHeight;
      const dpr = window.devicePixelRatio || 1;
      offscreenCanvas.width = Math.floor(containerWidth * dpr);
      offscreenCanvas.height = Math.floor(containerHeight * dpr);
      const ctx = offscreenCanvas.getContext('2d');

      if (!ctx) {
        logDebug('captureARContent: offscreen canvas context failed.');
        return;
      }

      ctx.clearRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);
      const img = new Image();
      img.onload = () => {
        const params = calcCover(img.width, img.height, offscreenCanvas.width, offscreenCanvas.height);
        ctx.drawImage(img, params.offsetX, params.offsetY, params.drawWidth, params.drawHeight);
      };
      img.src = imgData;
    }
  };

  const handleCloseSaveModal = () => {
    if (foto) {
      shareOrDownloadImage(foto);
    }
    setIsOpen(false);
  };

  useEffect(() => {
    const initializeMedia = async () => {
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
      } catch (err) {
        logDebug('UserMedia test failed: ' + err);
      }
    };

    initializeMedia();
    onTest();
  }, []);

  if (/(iPad|iPhone|iPod)/.test(navigator.userAgent)) {
    return <NftAppT3 />;
  }

  return (
    <>
      {mount ? (
        <ARCanvas
          xrStoreRef={xrStoreRef}
          setSessionStarted={setSessionStarted}
          show={show}
          sessionStarted={sessionStarted}
          modalIsOpen={modalIsOpen}
          openModal={(gl: any) => {
            captureARContent(gl);
            if (xrStoreRef.current) {
              xrStoreRef.current.getState().session?.end();
              xrStoreRef.current.destroy();
              xrStoreRef.current = null;
            }
            setMount(false);
            setIsOpen(true);
          }}
          closeModal={() => {
            setIsOpen(false);
            setShow(false);
          }}
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
          cameraFov={cameraFov}
          calibrationMatrixRef={calibrationMatrixRef} // 추가: calibrationMatrixRef 전달
        />
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
              cameraFov={cameraFov}
            />
          )}
        </>
      )}
      {/* <DebugPanel logs={debugLogs} /> */}
    </>
  );
}
