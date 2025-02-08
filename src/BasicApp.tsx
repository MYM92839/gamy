/* eslint-disable prefer-const */

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitHandles } from '@react-three/handle';
import { createXRStore, noEvents, PointerEvents, XR, XRDomOverlay, XROrigin } from '@react-three/xr';
import { Leva, useControls } from 'leva';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
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
  oposition: any;
  sposition: any;
  cposition: any;
  addGl: any;
  visible: boolean;
  glRef: any;
  calibrationMatrixRef: React.MutableRefObject<THREE.Matrix4 | null>;
  rabbitPosition: [number, number, number]; // 토끼 위치
}

interface UIOverlayProps {
  correctPose: any;
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

// XR 세션 종료 시 현재 오브젝트와 카메라 행렬 저장
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
    const calibratedMatrix = new THREE.Matrix4();
    calibratedMatrix.multiplyMatrices(calibrationMatrix.clone().invert(), camera.matrixWorld);
    tempCamera.matrixWorld.copy(calibratedMatrix);
    tempCamera.matrixWorldInverse.copy(calibratedMatrix).invert();
  } else {
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
  renderer.render(scene, tempCamera);

  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = width;
  tempCanvas.height = height;
  const tempCtx = tempCanvas.getContext('2d');
  if (!tempCtx) return '';

  const pixels = new Uint8Array(width * height * 4);
  const gl = renderer.getContext();
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

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

function Scene({ visible, glRef, rabbitPosition, oposition, cposition, sposition, addGl }: SceneProps) {
  const { gl, camera, scene } = useThree();
  const groupRef = useRef<THREE.Group>(null);

  // 매 프레임 glRef 업데이트 → 최신 카메라 포즈 반영
  useFrame(() => {
    if (glRef.current) {
      glRef.current.camera = camera;
      glRef.current.scene = scene;
      glRef.current.gl = gl;
    }
  });

  useEffect(() => {
    if (gl) {
      // 최초 렌더 시에도 gl, camera, scene 정보를 저장
      glRef.current = { gl, camera, scene };
      addGl(glRef.current);
    }
  }, [camera, gl, glRef, scene]);

  useEffect(() => {
    if (visible && groupRef.current && camera) {
      // 토끼 오브젝트의 그룹 위치는 BasicApp에서 계산한 rabbitPosition 사용
      camera.lookAt(rabbitPosition[0], rabbitPosition[1], rabbitPosition[2]);
      camera.updateProjectionMatrix();
    }
  }, [visible, camera, rabbitPosition]);

  return (
    <>
      <ambientLight intensity={2} />
      <pointLight position={[10, 10, 10]} />
      <Suspense fallback={null}>
        <group
          ref={groupRef}
          position={[rabbitPosition[0] + cposition.x, rabbitPosition[1] + cposition.y, rabbitPosition[2] + cposition.z]}
          rotation={[0, -Math.PI / 4, 0]}
          scale={[0.5, 0.5, 0.5]}
          visible={visible}
        >
          {visible && (
            <Box
              sposition={[sposition.x, sposition.y, sposition.z]}
              oposition={[oposition.x, oposition.y, oposition.z]}
              on
              onRenderEnd={() => {}}
            />
          )}
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
  circleR,
  correctPose,
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
          zIndex: 100000,
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
          zIndex: 99999,
        }}
      >
        <svg width={domWidth} height={domHeight} style={{ position: 'absolute', top: 0, left: 0 }}>
          <circle cx={circleX} cy={circleY} r={circleR} fill="none" stroke={circleColor} strokeWidth="2" />
        </svg>
      </div>
      <Button
        onClick={() => {
          correctPose();
          setShow(true);
        }}
        title="토끼 부르기"
        className="z-[99999] fixed bottom-[20%] left-1/2 -translate-x-1/2 w-max mx-auto p-4 h-fit"
      />
    </div>
  );
}

function ARCanvas(props: any) {
  const { setOffscreenCanvas, logDebug } = props;
  const [init, setInit] = useState(false);
  const glRef = useRef(null);
  // localStorage에 저장된 값을 불러와 초기값으로 사용 (없으면 기본값)
  const initialValues = useMemo(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('levaValues');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (error) {
          console.error('저장된 값을 파싱하는데 실패했습니다:', error);
        }
      }
    }
    return {
      oposition: { x: 0, y: 0, z: 0 },
      sposition: { x: 0, y: 0, z: 0 },
      cposition: { x: 0, y: 0, z: 0 },
    };
  }, []);
  const { oposition, sposition, cposition } = useControls({
    oposition: { value: initialValues.oposition, step: 0.1 },
    sposition: { value: initialValues.sposition, step: 0.1 },
    cposition: { value: initialValues.cposition, step: 0.1 },
  });

  useEffect(() => {
    // 컨트롤 값 localStorage에 저장
    const data = { oposition, sposition, cposition };
    localStorage.setItem('levaValues', JSON.stringify(data));
  }, [oposition, sposition, cposition]);

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
      <div className="w-screen h-screen bg-white flex items-center justify-center">
        <div role="status" className="inset-0">
          <svg
            aria-hidden="true"
            className="w-8 h-8 text-gray-200 animate-spin dark:text-gray-600 fill-blue-600"
            viewBox="0 0 100 101"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z"
              fill="currentColor"
            />
            <path
              d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z"
              fill="currentFill"
            />
          </svg>
          <span className="sr-only">Loading...</span>
        </div>
      </div>
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
            visible={props.show}
            glRef={glRef}
            addGl={(gl: any) => {
              glRef.current = gl;
            }}
            calibrationMatrixRef={props.calibrationMatrixRef}
            rabbitPosition={props.rabbitPosition}
            sposition={sposition}
            oposition={oposition}
            cposition={cposition}
          />
          <XRDomOverlay>
            <UIOverlay
              modalIsOpen={props.modalIsOpen}
              fotoUrl={''}
              correctPose={() => {
                props.correctPose(glRef.current);
              }}
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
            <div className="fixed top-0 bottom-0 z-[99999999]">
              <Leva collapsed={false} />
            </div>
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
 * - 유저 카메라 영상과 three.js 캔버스를 합성합니다.
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

      const videoElement = document.querySelector('#three-video') as HTMLVideoElement;
      const videoWidth = videoElement.videoWidth || containerWidth;
      const videoHeight = videoElement.videoHeight || containerHeight;
      const videoParams = calcCover(videoWidth, videoHeight, containerWidth, containerHeight);

      const defaultVideoFov = 35;
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

      const threeCSSWidth = offscreenCanvas!.width / dpr;
      const threeCSSHeight = offscreenCanvas!.height / dpr;
      const scaleFactorThree = Math.max(containerWidth / threeCSSWidth, containerHeight / threeCSSHeight);
      const drawWidth = threeCSSWidth * scaleFactorThree;
      const drawHeight = threeCSSHeight * scaleFactorThree;
      const offsetX = (containerWidth - drawWidth) / 2;
      const offsetY = (containerHeight - drawHeight) / 2;

      ctx.filter = 'brightness(2)';
      ctx.drawImage(offscreenCanvas!, offsetX, offsetY, drawWidth, drawHeight);
      ctx.filter = 'none';

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
          {fotoUrl ? (
            <img style={{ width: '100%', height: 'auto', objectFit: 'cover' }} src={fotoUrl} alt="캡처 이미지" />
          ) : (
            <div className="w-screen h-screen bg-white flex items-center justify-center">
              <div role="status" className="inset-0">
                <svg
                  aria-hidden="true"
                  className="w-8 h-8 text-gray-200 animate-spin dark:text-gray-600 fill-blue-600"
                  viewBox="0 0 100 101"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z"
                    fill="currentColor"
                  />
                  <path
                    d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z"
                    fill="currentFill"
                  />
                </svg>
                <span className="sr-only">Loading...</span>
              </div>
            </div>
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

  // 캘리브레이션 행렬 (센서 보정용)
  const calibrationMatrixRef = useRef<THREE.Matrix4 | null>(null);
  useEffect(() => {
    console.log('Calibration ref in BasicApp:', calibrationMatrixRef.current);
  }, []);

  // 토끼(오브젝트) 배치를 위한 상태
  const [rabbitPosition, setRabbitPosition] = useState<[number, number, number]>([0, 0, 0]);

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

  // 기존 자동진입 로직 (페이지 접속 시 XR 세션 시작)
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
        setMount(true);
      } catch (err) {
        logDebug('UserMedia test failed: ' + err);
      }
    };

    initializeMedia();
  }, []);

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

  // const correctPose = (gl: any) => {
  //   if (gl && gl.camera) {
  //     // 최신 카메라 포즈를 기준으로 계산 (3m 앞)
  //     const cameraPos = gl.camera.position.clone();
  //     const direction = new THREE.Vector3();
  //     gl.camera.getWorldDirection(direction);
  //     const newRabbitPos = cameraPos.add(direction.multiplyScalar(3));
  //     setRabbitPosition([newRabbitPos.x, newRabbitPos.y, newRabbitPos.z]);
  //     logDebug('Rabbit position updated on button click:', newRabbitPos);
  //   }
  // };

  const correctPose = (gl: any) => {
    if (gl && gl.camera) {
      // 추가 오프셋 값이 localStorage에 저장되어 있다면 불러오기 (없으면 기본값 사용)
      let pos = { x: 0, y: 0, z: 0 };
      if (typeof window !== 'undefined') {
        const saved = localStorage.getItem('levaValues');
        if (saved) {
          try {
            const s = JSON.parse(saved);
            pos = s.oposition;
          } catch (error) {
            console.error('저장된 값을 파싱하는데 실패했습니다:', error);
          }
        }
      }

      // 카메라의 최신 행렬 업데이트
      gl.camera.updateMatrixWorld(true);

      // 머리 좌표계에서의 오프셋을 정의합니다. 여기서는 (0,0,3)을 사용합니다.
      const offset = new THREE.Vector3(pos.x, pos.y, 3 + pos.z);

      // 원하는 동작: 카메라가 회전하면 오프셋이 사용자의 머리 좌표계에서는 고정되도록 하기 위해,
      // 카메라의 쿼터니언의 역(인버스)을 적용합니다.
      const invQuat = gl.camera.quaternion.clone().invert();
      offset.applyQuaternion(invQuat);

      // 최종 오브젝트(토끼) 위치는 카메라 위치에 이 오프셋을 더한 값
      const newPosition = gl.camera.position.clone().add(offset);

      setRabbitPosition([newPosition.x, newPosition.y, newPosition.z]);
      logDebug('Rabbit position updated:', newPosition);
    }
  };

  /**
   * openModalHandler
   * - UI의 “토끼 부르기” 버튼 클릭 시 호출됨.
   * - 그 시점의 최신 glRef.current.camera 를 기준으로 토끼 위치(3m 앞)를 계산합니다.
   * - 캡쳐 후 onXRSessionEnd 로 오브젝트와 카메라 행렬을 저장하고, 세션 종료 후 모달을 엽니다.
   */
  const openModalHandler = (gl: any) => {
    correctPose(gl);
    // 캡쳐 및 보정을 수행
    captureARContent(gl);
    // 세션 종료 및 XRStore 파괴 → 다음 진입 시 새로운 기준 적용
    if (xrStoreRef.current) {
      xrStoreRef.current.getState().session?.end();
      xrStoreRef.current.destroy();
      xrStoreRef.current = null;
    }
    setMount(false);
    setIsOpen(true);
  };

  /**
   * captureARContent:
   * - gl, scene, camera 정보를 사용하여 캡쳐 이미지를 생성합니다.
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
      if (navigator.canShare && navigator.canShare({ files: [new File([foto], 'capture.png', { type: foto.type })] })) {
        const file = new File([foto], `capture-${new Date().getTime()}.png`, {
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
        const url = URL.createObjectURL(foto);
        const link = document.createElement('a');
        link.download = `capture-${new Date().getTime()}.png`;
        link.href = url;
        link.click();
        URL.revokeObjectURL(url);
      }
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
          modalIsOpen={modalIsOpen}
          openModal={openModalHandler}
          closeModal={() => {
            setIsOpen(false);
            setShow(false);
          }}
          closeSaveModal={handleCloseSaveModal}
          setShow={setShow}
          correctPose={correctPose}
          domWidth={domWidth}
          domHeight={domHeight}
          circleX={circleX}
          circleY={circleY}
          circleR={circleR}
          circleColor={circleColor}
          setOffscreenCanvas={setOffscreenCanvas}
          logDebug={logDebug}
          cameraFov={cameraFov}
          calibrationMatrixRef={calibrationMatrixRef}
          rabbitPosition={rabbitPosition}
        />
      ) : sessionStarted ? (
        <>
          <BackgroundVideo streamRef={streamRef} setIsMount={setIsMount} logDebug={logDebug} />
          {isMount && (
            <ModalU
              isMount={isMount}
              modalIsOpen={modalIsOpen}
              setFoto={setFoto}
              closeModal={() => {
                setIsOpen(false);
                setShow(false);
                onTest();
                // 필요시 XR 세션 재진입 로직 추가 가능
              }}
              closeSaveModal={handleCloseSaveModal}
              offscreenCanvas={offscreenCanvas}
              logDebug={logDebug}
              cameraFov={cameraFov}
            />
          )}
        </>
      ) : (
        <div className="w-screen h-screen bg-white flex items-center justify-center">
          <div role="status" className="inset-0">
            <svg
              aria-hidden="true"
              className="w-8 h-8 text-gray-200 animate-spin dark:text-gray-600 fill-blue-600"
              viewBox="0 0 100 101"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z"
                fill="currentColor"
              />
              <path
                d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z"
                fill="currentFill"
              />
            </svg>
            <span className="sr-only">Loading...</span>
          </div>
        </div>
      )}
    </>
  );
}
