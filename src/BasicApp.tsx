/* eslint-disable prefer-const */

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitHandles } from '@react-three/handle';
import { createXRStore, noEvents, PointerEvents, XR, XRDomOverlay, XROrigin } from '@react-three/xr';
import { Leva, useControls } from 'leva';
import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

// 예: 기존 컴포넌트들 (Box, Back, Capture, Button, NftAppT3 ...)은
// 실제 경로에 따라 import 조정
import { usePinch } from '@use-gesture/react';
import { useParams } from 'react-router-dom';
import { Box, Tree } from './ArApp';
import Back from './assets/icons/Back';
import Capture from './assets/icons/Capture';
import Button from './components/Button';

const isIOS = /(iPad|iPhone|iPod)/.test(navigator.userAgent);

/* ---------------- 타입 정의들 ----------------- */
interface SavedObjectData {
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
}

interface SceneProps {
  oposition: any;
  char: string;
  sposition: any;
  scale: number;
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
  char: string;
  fotoUrl: string;
  cameraFov: number; // XR 카메라의 fov
}

/* -------------- 유틸들 + 전역 -------------- */
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

let savedObjects: SavedObjectData[] = [];
let savedCameraMatrix = new THREE.Matrix4();

/** ★ 추가: FOV 추출 유틸 함수 */
function extractFovFromProjectionMatrix(mat: Float32Array | number[]) {
  // col-major 기준, mat[5] == 1 / tan(fov/2)
  const m11 = mat[5];
  const verticalFovRad = 2 * Math.atan(1 / m11);
  return (verticalFovRad * 180) / Math.PI; // degrees
}

// XR 세션 종료 시 오브젝트+카메라 행렬 저장
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
 * - XR 캡쳐(Three.js 오브젝트만)용 임시 카메라
 */
function renderSceneForCapture(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  calibrationMatrix?: THREE.Matrix4 | null
): string {
  const container = document.querySelector('#three-canvas') as HTMLDivElement | null;
  if (!container) return '';

  const containerWidth = container.clientWidth;
  const containerHeight = container.clientHeight;
  const dpr = window.devicePixelRatio || 1;
  const width = Math.floor(containerWidth * dpr);
  const height = Math.floor(containerHeight * dpr);

  const tempCamera = new THREE.PerspectiveCamera(camera.fov, containerWidth / containerHeight, camera.near, camera.far);
  tempCamera.projectionMatrix.copy(camera.projectionMatrix);

  // XR → Three.js 간 Y축 180도 보정
  const offsetQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
  tempCamera.quaternion.copy(camera.quaternion).multiply(offsetQuaternion);

  // calibrationMatrix 적용 (있으면)
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

  // 기존 오브젝트 상태 복원
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

  tempCtx.imageSmoothingEnabled = true;
  tempCtx.imageSmoothingQuality = 'high';

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

/* --------------------------------------------------
   Scene, UIOverlay, CameraUpdater 등: Canvas 내부 로직
   -------------------------------------------------- */
function Scene({ visible, glRef, rabbitPosition, oposition, cposition, sposition, addGl, char, scale }: SceneProps) {
  const { gl, camera, scene } = useThree();
  const groupRef = useRef<THREE.Group>(null);

  // 매 프레임: glRef 갱신
  useFrame(() => {
    if (glRef.current) {
      glRef.current.camera = camera;
      glRef.current.scene = scene;
      glRef.current.gl = gl;
    }
  });

  // 최초 렌더 시 glRef
  useEffect(() => {
    if (gl) {
      glRef.current = { gl, camera, scene };
      addGl(glRef.current);
    }
  }, [camera, gl, glRef, scene]);

  // rabbitPosition에 맞춰 토끼를 카메라 방향 보정
  useEffect(() => {
    if (visible && groupRef.current && camera) {
      camera.lookAt(rabbitPosition[0], rabbitPosition[1], rabbitPosition[2]);
      camera.updateProjectionMatrix();

      if (groupRef.current && glRef.current && glRef.current.camera) {
        groupRef.current.lookAt(glRef.current.camera.position);

        const offsetEuler = new THREE.Euler(0, -Math.PI / 4, 0, 'XYZ');
        const offsetQuat = new THREE.Quaternion().setFromEuler(offsetEuler);
        groupRef.current.quaternion.multiply(offsetQuat);
      }
    }
  }, [visible, camera, rabbitPosition]);

  return (
    <>
      <ambientLight intensity={3} />
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
            <>
              {char == 'moons' ? (
                <Box
                  sposition={[sposition.x, sposition.y, sposition.z]}
                  oposition={[oposition.x, oposition.y, oposition.z]}
                  sscale={scale}
                  on
                  onRenderEnd={() => {}}
                />
              ) : (
                <Tree oposition={[oposition.x, oposition.y, oposition.z]} sscale={scale} on onRenderEnd={() => {}} />
              )}
            </>
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
  char,
  correctPose,
}: UIOverlayProps) {
  const [init, setInit] = useState(false);
  const [radius, setRadius] = useState(circleR); // 반지름 상태 관리
  const [scale, setScale] = useState(1); // 반지름 상태 관리c

  // 핀치 제스처로 반지름을 조정
  const bind = usePinch((state) => {
    if (char == 'moons') {
      setRadius(circleR * state.offset[0]); // 원의 반지름을 핀치 크기에 맞춰 조정
    } else {
      setScale(scale * state.offset[0]);
    }
  });

  return (
    <div {...bind()} style={{ position: 'fixed', inset: 0, pointerEvents: 'auto', zIndex: 99999 }}>
      <button
        style={{
          position: 'fixed',
          bottom: '65px',
          left: '24px',
          background: 'transparent',
          border: 'none',
          zIndex: 99999,
        }}
        onClick={() => {
          // 예시 링크
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
          zIndex: 99999,
        }}
        onClick={openModal}
      >
        <Capture />
      </button>
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      >
        {char == 'moons' ? (
          <svg width={domWidth} height={domHeight}>
            <circle
              cx={circleX}
              cy={circleY}
              r={radius} // 반지름을 상태로 업데이트
              fill="none"
              stroke="white"
              strokeWidth="2"
              strokeDasharray="4, 4" // 점선으로 만들기 위한 설정
            />
          </svg>
        ) : (
          <svg
            id="tree"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 595.28 841.89"
            width={domWidth}
            height={domHeight}
            style={{ transform: `scale(${scale})` }} // 제스처로 조절된 전체 스케일 적용
          >
            <path
              id="Layer_2"
              fill="none"
              stroke="#fff"
              strokeDasharray="1,5,0,0,1,0"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeMiterlimit="10"
              strokeWidth="2"
              d="M204.7 125.49c-3.04 7.21.52 7.8 0 31.4-.58 26.31-1.15 51.75-16.09 62.04-8.43 5.81-14.84 2.25-23.74 10.72-1.79 1.7-10.77 10.25-9.96 20.68.88 11.38 12.54 13.64 20.68 27.57 5.62 9.63 4.1 15.48 6.13 33.7 4.27 38.34 13.81 37.4 13.79 62.81-.01 8.73-3.58 22.93-10.72 51.32-6.98 27.74-10.82 36.13-13.02 40.6-7.19 14.58-12.83 26-25.28 34.47-12.82 8.73-24.24 8.44-25.28 15.32-.8 5.33 5.18 11.32 10.72 13.79 6.1 2.72 10.96.87 26.04-2.3 4.49-.94 15.81-3.32 26.04-4.6 16.46-2.06 24.7-3.08 32.94 0 11.81 4.42 11.69 11.7 25.28 19.91 10.52 6.36 20.13 7.77 29.87 9.19 4.81.7 29.1 3.92 57.45-6.89 10.88-4.15 4.77-3.66 35.23-19.91 19.38-10.34 27.54-13.57 29.11-21.45.71-3.57-2.08-9.78-7.66-22.21-5.91-13.15-8.47-16.02-9.96-23.74-1.42-7.38-.69-13.19 0-18.38 3.49-26.18 5.24-39.27 6.89-46.72 11.48-51.71 5.86-48.74 13.79-70.47 5.54-15.19 11.61-25.7 23.74-46.72 2.38-4.12 7.9-13.54 28.34-44.43 19.16-28.94 27.64-30.36 28.34-42.13 1.25-21-19.86-43.68-32.94-41.36-2.44.43-4.69 1.75-16.09 17.62-10.54 14.67-13.63 20.52-20.68 30.64-13.37 19.18-14.72 16.03-23.74 30.64-7.34 11.88-6.86 14.64-16.85 30.64-6.25 10.01-9.5 15.14-15.32 20.68-9.88 9.41-13.39 7.25-20.68 15.32-6.39 7.07-8.73 14.3-13.02 27.57-5.08 15.71-2.8 26.11-6.13 26.81-3.05.64-7.52-7.24-9.96-13.02-2.24-5.33-7.55-20.25.77-58.98 2.59-12.05 4.28-19.94 8.43-30.64 9.82-25.34 17.79-26.18 24.51-48.26 1.08-3.54 5.37-18.31 4.6-37.53-.28-6.91-.63-14.16-3.83-22.98 0 0-4.85-13.35-15.32-23.74-26.33-26.14-103.07-18.64-116.42 13.02"
            ></path>
          </svg>
        )}
      </div>

      <Button
        onClick={() => {
          if (!init) setInit(true);
          correctPose();
          setShow(false);
          setTimeout(() => {
            setShow(true);
          }, 0);
        }}
        title={init ? '토끼 다시 부르기' : '토끼 부르기'}
        className="z-[9999] fixed bottom-[20%] left-1/2 -translate-x-1/2 w-max mx-auto p-4 h-fit"
      />
    </div>
  );
}

function CameraUpdater({
  latestCameraTransformRef,
}: {
  latestCameraTransformRef: React.MutableRefObject<{ position: THREE.Vector3; quaternion: THREE.Quaternion }>;
}) {
  const { camera } = useThree();
  useFrame(() => {
    latestCameraTransformRef.current.position.copy(camera.position);
    latestCameraTransformRef.current.quaternion.copy(camera.quaternion);
  });
  return null;
}

/*
  -----------------------------
  ARCanvasCore:
    원래 ARCanvas가 하던 "useFrame, Scene 렌더" 로직 담당
    -> Canvas 내부 전용
  -----------------------------
*/
function ARCanvasCore(props: any) {
  const { latestCameraTransformRef } = props;

  // LEVA 세팅
  const initialValues = useMemo(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('levaValues');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (error) {
          console.error('Leva parse failed:', error);
        }
      }
    }
    return {
      oposition: { x: 0, y: 0, z: 0 },
      sposition: { x: 0, y: 0, z: 0 },
      cposition: { x: 0, y: 0, z: 0 },
      sscale: 0.5,
    };
  }, []);
  const { oposition, sposition, cposition } = useControls({
    oposition: { value: initialValues.oposition, step: 0.1 },
    sposition: { value: initialValues.sposition, step: 0.1 },
    cposition: { value: initialValues.cposition, step: 0.1 },
  });
  const { sscale } = useControls({
    sscale: initialValues.sscale || 0.5,
  });

  useEffect(() => {
    const data = { oposition, sposition, cposition, sscale };
    localStorage.setItem('levaValues', JSON.stringify(data));
  }, [oposition, sposition, cposition, sscale]);

  return (
    <>
      <PointerEvents />
      <OrbitHandles />
      <CameraUpdater latestCameraTransformRef={latestCameraTransformRef} />

      {/* XR 영역 */}
      <XR store={props.xrStoreRef.current}>
        <XROrigin position={[0, 0.5, 0]} />
        <Scene
          visible={props.show}
          glRef={props.glRef}
          addGl={(gl: any) => {
            props.glRef.current = gl;
          }}
          calibrationMatrixRef={props.calibrationMatrixRef}
          rabbitPosition={props.rabbitPosition}
          sposition={sposition}
          oposition={oposition}
          cposition={cposition}
          scale={sscale}
          char={props.char}
        />
        <XRDomOverlay>
          <UIOverlay
            modalIsOpen={props.modalIsOpen}
            fotoUrl={''}
            correctPose={() => {
              props.correctPose(props.glRef.current);
            }}
            openModal={() => {
              // openModalHandler
              props.openModal(props.glRef.current);
            }}
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
            char={props.char}
          />
          <div className="fixed top-0 bottom-0 z-[99999999]">
            <Leva collapsed={false} />
          </div>
        </XRDomOverlay>
      </XR>
    </>
  );
}

/*
  -----------------------------
  ARCanvas:
    1) <Canvas> 리턴
    2) 내부에서 <ARCanvasCore> 렌더
    -> 여긴 R3F 훅 X
  -----------------------------
*/
function ARCanvas(props: any) {
  const [init, setInit] = useState(false);
  const glRef = useRef<any>(null);

  // XR 세션 자동 진입
  useEffect(() => {
    let id: ReturnType<typeof setTimeout>;
    const func = async () => {
      if (props.xrStoreRef.current) {
        try {
          await props.xrStoreRef.current.enterAR();
          props.setSessionStarted(true);
          props.logDebug('XR session started.');
        } catch (err) {
          props.logDebug('XR session failed to start:', err);
        }
      }
    };
    if (init) {
      id = setTimeout(func, 1000);
    }
    return () => clearTimeout(id);
  }, [init]);

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div className="w-screen h-screen bg-white flex items-center justify-center">
        <div role="status" className="inset-0">
          {/* 로딩 SVG */}
          <svg
            aria-hidden="true"
            className="w-8 h-8 text-gray-200 animate-spin dark:text-gray-600 fill-blue-600"
            viewBox="0 0 100 101"
            fill="none"
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
        camera={{ fov: 30 }}
        onCreated={(state) => {
          state.gl.setPixelRatio(window.devicePixelRatio);
          state.gl.setSize(window.innerWidth, window.innerHeight);
          setInit(true);

          props.logDebug('Canvas created, init set to true.');

          // offscreenCanvas
          const offscreen = document.createElement('canvas');
          offscreen.width = Math.floor(window.innerWidth * window.devicePixelRatio);
          offscreen.height = Math.floor(window.innerHeight * window.devicePixelRatio);
          props.setOffscreenCanvas(offscreen);
          props.logDebug('Offscreen canvas created in ARCanvas.');
        }}
        events={noEvents}
      >
        {/*
          여기 내부에서 R3F 훅을 써도 OK.
          ARCanvasCore가 실제 useFrame/useThree 로직 담당
        */}
        <ARCanvasCore {...props} glRef={glRef} />
      </Canvas>
    </div>
  );
}

/*
  BackgroundVideo: getUserMedia + 비디오 태그
*/
function BackgroundVideo({ streamRef, setIsMount, logDebug }: any) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
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

/*
  ModalU: 배경 비디오 + offscreenCanvas(3D) 합성
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

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.scale(dpr, dpr);

      const videoElement = document.querySelector('#three-video') as HTMLVideoElement;
      const videoWidth = videoElement.videoWidth || containerWidth;
      const videoHeight = videoElement.videoHeight || containerHeight;
      const videoParams = calcCover(videoWidth, videoHeight, containerWidth, containerHeight);

      const defaultVideoFov = 25;
      const effectiveFov = cameraFov || defaultVideoFov;
      const addedFactor = 1.0;
      const fovScale =
        (Math.tan(((effectiveFov / 2) * Math.PI) / 180) / Math.tan(((defaultVideoFov / 2) * Math.PI) / 180)) *
        addedFactor;

      const adjustedDrawWidth = videoParams.drawWidth * fovScale;
      const adjustedDrawHeight = videoParams.drawHeight * fovScale;

      // ★ 원하는 만큼 화면을 위로 이동 (양수면 아래로, 음수면 위로)
      const manualShiftY = -50; // 예: -30px 하면 위로 30px 올림

      const adjustedOffsetX = (containerWidth - adjustedDrawWidth) / 2;
      // 원래 adjustedOffsetY에 manualShiftY 더하거나 빼기
      const adjustedOffsetY = (containerHeight - adjustedDrawHeight) / 2 + manualShiftY;

      // 배경 비디오
      ctx.drawImage(videoElement, adjustedOffsetX, adjustedOffsetY, adjustedDrawWidth, adjustedDrawHeight);

      // 3D offscreen
      const threeCSSWidth = offscreenCanvas!.width / dpr;
      const threeCSSHeight = offscreenCanvas!.height / dpr;
      const threeParams = calcCover(threeCSSWidth, threeCSSHeight, containerWidth, containerHeight);

      // 3D도 동일하게 manualShiftY 적용
      ctx.drawImage(
        offscreenCanvas!,
        threeParams.offsetX,
        threeParams.offsetY,
        threeParams.drawWidth,
        threeParams.drawHeight
      );

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
  }, [isMount, offscreenCanvas, cameraFov, setFoto]);

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

/*
  -----------------------------
  BasicApp: 메인
  -----------------------------
*/
export default function BasicApp() {
  const xrStoreRef = useRef<any>(null);
  const [mount, setMount] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [modalIsOpen, setIsOpen] = useState(false);
  const [foto, setFoto] = useState<Blob | null>(null);
  const [show, setShow] = useState(false);
  const { char } = useParams();
  const streamRef = useRef<MediaStream | null>(null);
  const [isMount, setIsMount] = useState(false);
  const [offscreenCanvas, setOffscreenCanvas] = useState<HTMLCanvasElement | null>(null);

  /** ★ 수정: cameraFov를 “상태”로 선언 (초기값 60) */
  const [cameraFov, setCameraFov] = useState<number>(60);

  const calibrationMatrixRef = useRef<THREE.Matrix4 | null>(null);

  // 토끼 배치
  const [rabbitPosition, setRabbitPosition] = useState<[number, number, number]>([0, 0, 0]);

  // 디버그용 로그
  const [, setDebugLogs] = useState<string[]>([]);
  const logDebug = (msg: any, ...opt: any[]) => {
    console.log(msg, ...opt);
    setDebugLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  useEffect(() => {
    console.log('Calibration ref in BasicApp:', calibrationMatrixRef.current);
  }, []);

  const domWidth = 500;
  const domHeight = 900;
  const circleX = domWidth / 2;
  const circleY = domHeight / 2;
  const circleR = 100;
  // const circleColor = 'blue';

  // 최신 카메라 변환
  const latestCameraTransform = useRef({
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
  });

  // 초기 미디어 세팅
  useEffect(() => {
    const initMedia = async () => {
      try {
        const constraints = {
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        stream.getTracks().forEach((track) => track.stop());
        xrStoreRef.current = createXRStore();
        setMount(true);
      } catch (err) {
        logDebug('UserMedia test failed:', err);
      }
    };
    if (isIOS) {
      setMount(true);
    } else initMedia();
  }, []);

  // 세션 리트라이
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

  // BasicApp (또는 해당 상위 컴포넌트) 내에서
  const [resetTrigger, setResetTrigger] = useState(0);

  // "토끼 부르기" 로직
  const correctPose = (glRefObj: any) => {
    if (isIOS) {
      if (!glRefObj) return;
      let pos = { x: 0, y: 0, z: 0 };
      const saved = localStorage.getItem('levaValues');
      if (saved) {
        try {
          const s = JSON.parse(saved);
          pos = s.cposition;
        } catch (error) {
          console.error('levaValues parse fail:', error);
        }
      }
      // 기존에 저장된 카메라 위치와 오프셋 등을 기반으로 새로운 토끼 위치 계산
      // 예시:
      const cameraPos = latestCameraTransform.current.position.clone();
      const cameraQuat = latestCameraTransform.current.quaternion.clone();
      const offset = new THREE.Vector3(0, 0, -21);
      offset.applyQuaternion(cameraQuat);
      const newPosition = cameraPos.add(offset);

      setRabbitPosition([newPosition.x + pos.x, newPosition.y + pos.y, newPosition.z + pos.z]);
      logDebug('Rabbit position updated:', newPosition);

      // 토끼 부르기마다 resetTrigger 증가하여 DeviceOrientationController를 리셋
      setResetTrigger((prev) => prev + 1);
    } else {
      if (!glRefObj) return;
      if (latestCameraTransform.current) {
        let pos = { x: 0, y: 0, z: 0 };
        const saved = localStorage.getItem('levaValues');
        if (saved) {
          try {
            const s = JSON.parse(saved);
            pos = s.cposition;
          } catch (error) {
            console.error('levaValues parse fail:', error);
          }
        }
        const cameraPos = latestCameraTransform.current.position.clone();
        const cameraQuat = latestCameraTransform.current.quaternion.clone();
        const offset = new THREE.Vector3(0, 0, -11);
        offset.applyQuaternion(cameraQuat);
        const newPosition = cameraPos.add(offset);

        setRabbitPosition([newPosition.x + pos.x, newPosition.y + pos.y, newPosition.z + pos.z]);
        logDebug('Rabbit position updated:', newPosition);
      }
    }
  };

  /** ★ 수정: openModalHandler에서 XRFrame으로부터 FOV 추출 후 setCameraFov(newFov) */
  const openModalHandler = (gl: any) => {
    correctPose(gl);

    // XRFrame → projectionMatrix → FOV 추출
    const xrFrame = gl.gl.xr.getFrame?.();
    const refSpace = gl.gl.xr.getReferenceSpace?.();
    if (xrFrame && refSpace) {
      const pose = xrFrame.getViewerPose(refSpace);
      if (pose && pose.views.length > 0) {
        const newFov = extractFovFromProjectionMatrix(pose.views[0].projectionMatrix);
        setCameraFov(newFov);
        logDebug('Captured FOV from XRFrame:', newFov);
      }
    }

    captureARContent(gl);

    if (xrStoreRef.current) {
      xrStoreRef.current.getState().session?.end();
      xrStoreRef.current.destroy();
      xrStoreRef.current = null;
    }
    setMount(false);

    setIsOpen(true);
  };

  const captureARContent = ({
    gl,
    scene,
    camera,
  }: {
    gl: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
  }) => {
    onXRSessionEnd(scene, camera);
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
      // 공유 or 다운로드
      if (
        navigator.canShare &&
        navigator.canShare({
          files: [new File([foto], 'capture.png', { type: foto.type })],
        })
      ) {
        const file = new File([foto], `capture-${new Date().getTime()}.png`, { type: 'image/png' });
        navigator
          .share({ files: [file], title: 'My Captured Image', text: 'Check out this captured photo!' })
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

  return (
    <>
      {mount ? (
        isIOS ? (
          <IOSARCanvas
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
            resetTrigger={resetTrigger} // 여기서 전달
            domWidth={domWidth}
            domHeight={domHeight}
            circleX={circleX}
            circleY={circleY}
            circleR={circleR}
            char={char}
            circleColor="blue"
            setOffscreenCanvas={setOffscreenCanvas}
            logDebug={logDebug}
            cameraFov={cameraFov}
            calibrationMatrixRef={calibrationMatrixRef}
            rabbitPosition={rabbitPosition}
            latestCameraTransformRef={latestCameraTransform}
            streamRef={streamRef}
            setIsMount={setIsMount}
          />
        ) : (
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
            char={char}
            circleColor="blue"
            setOffscreenCanvas={setOffscreenCanvas}
            logDebug={logDebug}
            /** 수정: cameraFov → 상태값 전달 */
            cameraFov={cameraFov}
            calibrationMatrixRef={calibrationMatrixRef}
            rabbitPosition={rabbitPosition}
            latestCameraTransformRef={latestCameraTransform}
          />
        )
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

/* --------------------------------------------------
   [iOS용] 컴포넌트 (DeviceOrientation 등 별도 분기)
   -------------------------------------------------- */
// iOS 전용 DeviceOrientationController (회전값 반전 적용)

interface DeviceOrientationControllerProps {
  isPermissionGranted: boolean;
  target: THREE.Vector3; // 대상 오브젝트의 위치 (예: 토끼 위치)
  distance?: number; // 대상과 카메라 사이의 고정 거리 (기본값 -30)
  resetTrigger: number; // 토끼 호출 시마다 바뀌는 값
}

function DeviceOrientationController({
  isPermissionGranted,
  // target,
  // distance = -30,
  resetTrigger,
}: DeviceOrientationControllerProps) {
  const { camera } = useThree();

  useEffect(() => {
    function handleOrientation(event: DeviceOrientationEvent) {
      const alpha = event.alpha ? THREE.MathUtils.degToRad(event.alpha) : 0;
      const beta = event.beta ? THREE.MathUtils.degToRad(event.beta) : 0;
      const gamma = event.gamma ? THREE.MathUtils.degToRad(event.gamma) : 0;

      // 센서 값으로 Euler 생성 (YXZ 순서)
      const euler = new THREE.Euler(beta, alpha, -gamma, 'YXZ');
      const deviceQuaternion = new THREE.Quaternion().setFromEuler(euler);

      // 보정: iOS 센서 좌표계 보정 (X축 기준 +90° 회전)
      const correctionQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
      deviceQuaternion.multiply(correctionQuaternion);

      camera.up.set(0, 1, 0);
      camera.quaternion.copy(deviceQuaternion);
    }

    if (isPermissionGranted) {
      window.addEventListener('deviceorientation', handleOrientation, true);
    }
    return () => {
      window.removeEventListener('deviceorientation', handleOrientation, true);
    };
    // resetTrigger를 의존성 배열에 추가하여, 값이 바뀔 때마다 이벤트 핸들러를 재설정함
  }, [camera, isPermissionGranted, resetTrigger]);

  useFrame(() => {
    // 최신 카메라 방향에 따라 대상(target)에서 일정 거리(distance) 떨어진 위치 계산
    // const targetVec = Array.isArray(target) ? new THREE.Vector3(target[0], target[1], target[2]) : target;
    // const offset = new THREE.Vector3(0, 0, distance);
    // offset.applyQuaternion(camera.quaternion);
    // camera.position.copy(targetVec).add(offset);
    // camera.lookAt(targetVec);
  });

  return null;
}

function SceneIOS({ visible, glRef, rabbitPosition, oposition, cposition, sposition, addGl, char, scale }: SceneProps) {
  const { gl, camera, scene } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  useFrame(() => {
    if (glRef.current) {
      glRef.current.camera = camera;
      glRef.current.scene = scene;
      glRef.current.gl = gl;
    }
  });
  useEffect(() => {
    if (gl) {
      glRef.current = { gl, camera, scene };
      addGl(glRef.current);
    }
  }, [camera, gl, glRef, scene]);
  // iOS에서는 센서(DeviceOrientation)로 회전 업데이트되므로, 오브젝트 위치와 고정 회전만 설정
  useEffect(() => {
    if (visible && groupRef.current) {
      groupRef.current.position.set(
        rabbitPosition[0] + cposition.x,
        rabbitPosition[1] + cposition.y,
        rabbitPosition[2] + cposition.z
      );
      //    groupRef.current.rotation.set(0, -Math.PI / 4, 0);
    }
  }, [visible, rabbitPosition, cposition]);
  return (
    <>
      <ambientLight intensity={3} />
      <Suspense fallback={null}>
        <group
          ref={groupRef}
          position={[rabbitPosition[0] + cposition.x, rabbitPosition[1] + cposition.y, rabbitPosition[2] + cposition.z]}
          rotation={[Math.PI / 2, -Math.PI / 4, 0]}
          scale={[0.5, 0.5, 0.5]}
          visible={visible}
        >
          {visible &&
            (char === 'moons' ? (
              <Box
                sposition={[sposition.x, sposition.y, sposition.z]}
                oposition={[oposition.x, oposition.y, oposition.z]}
                sscale={scale}
                on
                onRenderEnd={() => {}}
              />
            ) : (
              <Tree oposition={[oposition.x, oposition.y, oposition.z]} sscale={scale} on onRenderEnd={() => {}} />
            ))}
        </group>
      </Suspense>
    </>
  );
}

function UIOverlayIOS({
  openModal,
  setShow,
  domWidth,
  domHeight,
  circleX,
  circleY,
  circleR,
  correctPose,
  char,
}: UIOverlayProps) {
  const [init, setInit] = useState(false);
  const [radius, setRadius] = useState(circleR);
  const [scale, setScale] = useState(1);
  const bind = usePinch((state) => {
    if (char === 'moons') {
      setRadius(circleR * state.offset[0]);
    } else {
      setScale(scale * state.offset[0]);
    }
  });
  return (
    <div {...bind()} style={{ position: 'fixed', inset: 0, pointerEvents: 'auto', zIndex: 99999 }}>
      <button
        style={{
          position: 'fixed',
          bottom: '65px',
          left: '24px',
          background: 'transparent',
          border: 'none',
          zIndex: 99999,
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
          zIndex: 99999,
        }}
        onClick={openModal}
      >
        <Capture />
      </button>
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      >
        <svg width={domWidth} height={domHeight}>
          <circle
            cx={circleX}
            cy={circleY}
            r={radius}
            fill="none"
            stroke="white"
            strokeWidth="2"
            strokeDasharray="4, 4"
          />
        </svg>
      </div>
      <Button
        onClick={() => {
          if (!init) setInit(true);
          correctPose();
          setShow(false);
          setTimeout(() => setShow(true), 0);
        }}
        title={init ? '토끼 다시 부르기' : '토끼 부르기'}
        className="z-[9999] fixed bottom-[20%] left-1/2 -translate-x-1/2 w-max mx-auto p-4 h-fit"
      />
    </div>
  );
}

function IOSARCanvasCore(props: any) {
  const { latestCameraTransformRef, orientationEnabled } = props;
  const initialValues = useMemo(() => {
    const saved = localStorage.getItem('levaValues');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (error) {
        console.error('Leva parse failed:', error);
      }
    }
    return {
      oposition: { x: 0, y: 0, z: 0 },
      sposition: { x: 0, y: 0, z: 0 },
      cposition: { x: 0, y: 0, z: 0 },
      sscale: 0.5,
    };
  }, []);
  const { oposition, sposition, cposition } = useControls({
    oposition: { value: initialValues.oposition, step: 0.1 },
    sposition: { value: initialValues.sposition, step: 0.1 },
    cposition: { value: initialValues.cposition, step: 0.1 },
  });
  const { sscale } = useControls({ sscale: initialValues.sscale || 0.5 });
  useEffect(() => {
    localStorage.setItem('levaValues', JSON.stringify({ oposition, sposition, cposition, sscale }));
  }, [oposition, sposition, cposition, sscale]);
  return (
    <>
      <CameraUpdater latestCameraTransformRef={latestCameraTransformRef} />
      <DeviceOrientationController
        resetTrigger={props.resetTrigger} // 여기서 전달
        target={props.rabbitPosition}
        isPermissionGranted={orientationEnabled}
      />
      <SceneIOS
        visible={props.show}
        glRef={props.glRef}
        addGl={(gl: any) => {
          props.glRef.current = gl;
        }}
        calibrationMatrixRef={props.calibrationMatrixRef}
        rabbitPosition={props.rabbitPosition}
        sposition={sposition}
        oposition={oposition}
        cposition={cposition}
        scale={sscale}
        char={props.char}
      />
    </>
  );
}

function IOSARCanvas(props: any) {
  const [init, setInit] = useState(false);
  const glRef = useRef<any>(null);
  const latestCameraTransformRef = props.latestCameraTransformRef;
  const [orientationEnabled, setOrientationEnabled] = useState(false);
  const requestDeviceOrientation = async () => {
    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      try {
        const response = await (DeviceOrientationEvent as any).requestPermission();
        if (response === 'granted') {
          setOrientationEnabled(true);
          props.logDebug('DeviceOrientation permission granted (iOS).');
        } else {
          props.logDebug('DeviceOrientation permission not granted.');
        }
      } catch (err) {
        console.error('DeviceOrientation permission error:', err);
      }
    } else {
      setOrientationEnabled(true);
    }
  };

  useEffect(() => {
    if (init && !orientationEnabled) {
      requestDeviceOrientation();
    }
  }, [init]);

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <BackgroundVideo streamRef={props.streamRef} setIsMount={props.setIsMount} logDebug={props.logDebug} />
      <Canvas
        id="three-canvas"
        style={{ width: '100vw', height: '100vh', background: 'transparent', position: 'relative', zIndex: 10 }}
        gl={{ alpha: true, preserveDrawingBuffer: true }}
        camera={{ fov: 30 }}
        onCreated={(state) => {
          state.gl.setPixelRatio(window.devicePixelRatio);
          state.gl.setSize(window.innerWidth, window.innerHeight);
          setInit(true);
          props.logDebug('Canvas created, init set to true (iOS version).');
          const offscreen = document.createElement('canvas');
          offscreen.width = Math.floor(window.innerWidth * window.devicePixelRatio);
          offscreen.height = Math.floor(window.innerHeight * window.devicePixelRatio);
          props.setOffscreenCanvas(offscreen);
          props.logDebug('Offscreen canvas created in IOSARCanvas.');
        }}
        events={noEvents}
      >
        <IOSARCanvasCore
          {...props}
          glRef={glRef}
          resetTrigger={props.resetTrigger} // 여기서 전달
          latestCameraTransformRef={latestCameraTransformRef}
          orientationEnabled={orientationEnabled}
        />
      </Canvas>
      <UIOverlayIOS
        modalIsOpen={props.modalIsOpen}
        fotoUrl={''}
        correctPose={() => props.correctPose(glRef.current)}
        openModal={() => props.openModal(glRef.current)}
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
        char={props.char}
      />
      <div style={{ position: 'fixed', top: 0, zIndex: 99999999 }}>
        <Leva collapsed={false} />
      </div>
    </div>
  );
}
