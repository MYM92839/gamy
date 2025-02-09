/* eslint-disable prefer-const */

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitHandles } from '@react-three/handle';
import {
  createXRStore,
  noEvents,
  PointerEvents,
  XR,
  XRDomOverlay,
  XROrigin,
} from '@react-three/xr';
import { usePinch } from '@use-gesture/react';
import { Leva, useControls } from 'leva';
import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

// 실제 경로에 따라 조정 (여기서는 예시로 처리)
import { Environment } from '@react-three/drei';
import { Box } from './ArApp';
import Back from './assets/icons/Back';
import Capture from './assets/icons/Capture';
import Button from './components/Button';

/* ---------------- 타입 정의들 ----------------- */
interface SavedObjectData {
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
}

// 기존 SceneProps에 isIOS? 플래그를 추가하여 분기 처리
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
  rabbitPosition: [number, number, number]; // AR 오브젝트(예: 토끼)의 위치
  isIOS?: boolean; // iOS 분기를 위한 플래그 (iOS에서는 별도 처리)
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

/* -------------- 유틸 및 전역 -------------- */
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

function extractFovFromProjectionMatrix(mat: Float32Array | number[]) {
  const m11 = mat[5]; // 1/tan(fov/2)
  const verticalFovRad = 2 * Math.atan(1 / m11);
  return (verticalFovRad * 180) / Math.PI;
}

function onXRSessionEnd(scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
  savedObjects = scene.children.map((obj) => ({
    position: obj.position.clone(),
    rotation: obj.rotation.clone(),
    scale: obj.scale.clone(),
  }));
  savedCameraMatrix.copy(camera.matrixWorld);
}

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

  // Y축 180도 보정
  const offsetQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
  tempCamera.quaternion.copy(camera.quaternion).multiply(offsetQuaternion);

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

// [웹XR용] 기존 Scene 로직은 그대로 사용
function Scene({ visible, glRef, rabbitPosition, oposition, cposition, sposition, addGl, scale, isIOS = false }: SceneProps) {
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

  // 분기: 웹XR(비‑iOS)는 기존 로직, iOS는 오브젝트 위치와 고정 회전만 설정
  useEffect(() => {
    if (visible && groupRef.current && camera) {
      if (isIOS) {
        groupRef.current.position.set(
          rabbitPosition[0] + cposition.x,
          rabbitPosition[1] + cposition.y,
          rabbitPosition[2] + cposition.z
        );
        groupRef.current.rotation.set(0, -Math.PI / 4, 0);
      } else {
        camera.lookAt(rabbitPosition[0], rabbitPosition[1], rabbitPosition[2]);
        camera.updateProjectionMatrix();
        if (groupRef.current && glRef.current && glRef.current.camera) {
          groupRef.current.lookAt(glRef.current.camera.position);
          const offsetEuler = new THREE.Euler(0, -Math.PI / 4, 0, 'XYZ');
          const offsetQuat = new THREE.Quaternion().setFromEuler(offsetEuler);
          groupRef.current.quaternion.multiply(offsetQuat);
        }
      }
    }
  }, [visible, camera, rabbitPosition, cposition, isIOS]);

  return (
    <>
      <ambientLight intensity={2} />
      <pointLight position={[10, 10, 10]} />
      <Suspense fallback={null}>
        <Environment files="/HDRI_01.exr" preset={undefined} />
        <group ref={groupRef} scale={[0.5, 0.5, 0.5]} visible={visible}>
          {visible && (
            <Box
              sposition={[sposition.x, sposition.y, sposition.z]}
              oposition={[oposition.x, oposition.y, oposition.z]}
              sscale={scale}
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
  // char,
}: UIOverlayProps) {
  const [init, setInit] = useState(false);
  const [radius, setRadius] = useState(circleR);

  const bind = usePinch((state) => {
    setRadius(circleR * state.offset[0]);
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
  ★ DeviceOrientationController (iOS 전용)
  기존 로직에서 회전값이 반대로 적용되는 문제를 해결하기 위해 각도를 반전시킵니다.
*/
function DeviceOrientationController({ isPermissionGranted }: { isPermissionGranted: boolean }) {
  const { camera } = useThree();
  useEffect(() => {
    function handleOrientation(event: DeviceOrientationEvent) {
      const { alpha, beta, gamma } = event;
      const radAlpha = THREE.MathUtils.degToRad(alpha || 0);
      const radBeta = THREE.MathUtils.degToRad(beta || 0);
      const radGamma = THREE.MathUtils.degToRad(gamma || 0);
      // 변경: 회전값을 반전시켜 올바른 방향이 되도록 함
      const euler = new THREE.Euler(-radBeta, -radAlpha, radGamma, 'YXZ');
      camera.quaternion.setFromEuler(euler);
    }
    if (isPermissionGranted) {
      window.addEventListener('deviceorientation', handleOrientation, true);
    }
    return () => {
      window.removeEventListener('deviceorientation', handleOrientation, true);
    };
  }, [camera, isPermissionGranted]);
  return null;
}

/*
  -----------------------------
  ARCanvasCore: 웹XR용(비‑iOS) 캔버스 내부 로직
  -----------------------------
*/
function ARCanvasCore(props: any) {
  const { latestCameraTransformRef } = props;
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
      <PointerEvents />
      <OrbitHandles />
      <CameraUpdater latestCameraTransformRef={latestCameraTransformRef} />
      <XR store={props.xrStoreRef.current}>
        <XROrigin position={[0, 0.5, 0]} />
        {/* 웹XR용 Scene: isIOS 미설정 */}
        <Scene
          visible={props.show}
          glRef={props.glRef}
          addGl={(gl: any) => {
            props.glRef.current = gl;
          }}
          char=''
          calibrationMatrixRef={props.calibrationMatrixRef}
          rabbitPosition={props.rabbitPosition}
          sposition={sposition}
          oposition={oposition}
          cposition={cposition}
          scale={sscale}
        />
        <XRDomOverlay>
          <UIOverlay
            modalIsOpen={props.modalIsOpen}
            fotoUrl={''}
            correctPose={() => props.correctPose(props.glRef.current)}
            openModal={() => props.openModal(props.glRef.current)}
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
    </>
  );
}

/*
  -----------------------------
  IOSARCanvasCore: iOS 전용, DeviceOrientation 사용
  -----------------------------
*/
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
      <DeviceOrientationController isPermissionGranted={orientationEnabled} />
      {/* iOS용 Scene: isIOS를 true로 전달 */}
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
        isIOS={true}
        char={props.char}
      />
    </>
  );
}

/*
  -----------------------------
  ARCanvas: 웹XR 사용하는 비‑iOS 캔버스 (Canvas 래퍼)
  -----------------------------
*/
function ARCanvas(props: any) {
  const [init, setInit] = useState(false);
  const glRef = useRef<any>(null);

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
          const offscreen = document.createElement('canvas');
          offscreen.width = Math.floor(window.innerWidth * window.devicePixelRatio);
          offscreen.height = Math.floor(window.innerHeight * window.devicePixelRatio);
          props.setOffscreenCanvas(offscreen);
          props.logDebug('Offscreen canvas created in ARCanvas.');
        }}
        events={noEvents}
      >
        <ARCanvasCore {...props} glRef={glRef} />
      </Canvas>
    </div>
  );
}

/*
  -----------------------------
  IOSARCanvas: iOS 전용 – 배경 비디오 포함, DeviceOrientation 권한 요청
  -----------------------------
*/
function IOSARCanvas(props: any) {
  const [, setInit] = useState(false);
  const glRef = useRef<any>(null);
  const latestCameraTransformRef = props.latestCameraTransformRef;

  // DeviceOrientation 권한 활성화 상태 관리
  const [orientationEnabled, setOrientationEnabled] = useState(false);

  // 사용자 제스처를 통한 권한 요청 (TypeScript 캐스팅 적용)
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
          latestCameraTransformRef={latestCameraTransformRef}
          orientationEnabled={orientationEnabled}
        />
      </Canvas>
      <UIOverlay
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
      />
      <div style={{ position: 'fixed', top: 0, zIndex: 99999999 }}>
        <Leva collapsed={false} />
      </div>
      {!orientationEnabled && (
        <button
          onClick={requestDeviceOrientation}
          style={{
            position: 'fixed',
            top: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 999999,
            padding: '0.5rem 1rem',
            background: '#fff',
            border: '1px solid #ccc',
            borderRadius: '4px',
          }}
        >
          Enable Device Orientation
        </button>
      )}
    </div>
  );
}

/*
  -----------------------------
  BackgroundVideo: 사용자 카메라 피드를 표시 (getUserMedia)
  -----------------------------
*/
function BackgroundVideo({ streamRef, setIsMount, logDebug }: any) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
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
      style={{ position: 'absolute', top: 0, left: 0, width: '100vw', height: '100vh', objectFit: 'cover', zIndex: 0 }}
      autoPlay
      playsInline
      muted
      loop
    />
  );
}

/*
  -----------------------------
  ModalU: 배경 비디오와 3D offscreen 캔버스 합성
  -----------------------------
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
      const manualShiftY = -50;
      const adjustedOffsetX = (containerWidth - adjustedDrawWidth) / 2;
      const adjustedOffsetY = (containerHeight - adjustedDrawHeight) / 2 + manualShiftY;
      ctx.drawImage(videoElement, adjustedOffsetX, adjustedOffsetY, adjustedDrawWidth, adjustedDrawHeight);
      const threeCSSWidth = offscreenCanvas!.width / dpr;
      const threeCSSHeight = offscreenCanvas!.height / dpr;
      const threeParams = calcCover(threeCSSWidth, threeCSSHeight, containerWidth, containerHeight);
      ctx.filter = 'brightness(2)';
      ctx.drawImage(
        offscreenCanvas!,
        threeParams.offsetX,
        threeParams.offsetY,
        threeParams.drawWidth,
        threeParams.drawHeight
      );
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', height: '100%' }}>
        <div style={{ display: 'flex', gap: '8px', padding: '1rem' }}>
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
}

/*
  -----------------------------
  BasicApp: 메인 컴포넌트
  -----------------------------
*/
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

  // cameraFov를 상태로 선언 (초기값 60)
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

  const latestCameraTransform = useRef({
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
  });

  useEffect(() => {
    const initMedia = async () => {
      try {
        const constraints = {
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
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
    // iOS 여부에 따라 분기 (iOS는 별도 캔버스를 사용)
    const isIOS = /(iPad|iPhone|iPod)/.test(navigator.userAgent);
    if (!isIOS) initMedia();
    else setMount(true);
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

  const correctPose = (glRefObj: any) => {
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
    const cameraPos = latestCameraTransform.current.position.clone();
    const cameraQuat = latestCameraTransform.current.quaternion.clone();
    const offset = new THREE.Vector3(0, 0, -11);
    offset.applyQuaternion(cameraQuat);
    const newPosition = cameraPos.add(offset);
    setRabbitPosition([newPosition.x + pos.x, newPosition.y + pos.y, newPosition.z + pos.z]);
    logDebug('Rabbit position updated:', newPosition);
  };

  const openModalHandler = (gl: any) => {
    correctPose(gl);

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

  // iOS 분기: iOS 환경이면 IOSARCanvas를 사용, 아니면 ARCanvas를 사용
  const isIOS = /(iPad|iPhone|iPod)/.test(navigator.userAgent);

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
            domWidth={domWidth}
            domHeight={domHeight}
            circleX={circleX}
            circleY={circleY}
            circleR={circleR}
            circleColor="blue"
            setOffscreenCanvas={setOffscreenCanvas}
            logDebug={logDebug}
            cameraFov={cameraFov}
            calibrationMatrixRef={calibrationMatrixRef}
            rabbitPosition={rabbitPosition}
            latestCameraTransformRef={latestCameraTransform}
            char="n/a" // 필요에 따라 전달
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
            char="n/a" // 필요에 따라 전달
            closeSaveModal={handleCloseSaveModal}
            setShow={setShow}
            correctPose={correctPose}
            domWidth={domWidth}
            domHeight={domHeight}
            circleX={circleX}
            circleY={circleY}
            circleR={circleR}
            circleColor="blue"
            setOffscreenCanvas={setOffscreenCanvas}
            logDebug={logDebug}
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
