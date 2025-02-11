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
import { useParams, useSearchParams } from 'react-router-dom';
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
  cscale: number;
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
function Scene({
  visible,
  glRef,
  cscale,
  rabbitPosition,
  oposition,
  cposition,
  sposition,
  addGl,
  char,
  scale,
}: SceneProps) {
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

  // // rabbitPosition에 맞춰 토끼를 카메라 방향 보정
  useEffect(() => {
    if (visible && groupRef.current && camera) {
      if (char === 'moons') {
        camera.lookAt(
          rabbitPosition[0] + cposition.x,
          rabbitPosition[1] + cposition.y - 0.5,
          rabbitPosition[2] + cposition.z
        );
      } else {
        camera.lookAt(
          rabbitPosition[0] + cposition.x,
          rabbitPosition[1] + cposition.y - 1.5,
          rabbitPosition[2] + cposition.z
        );
      }
      camera.updateProjectionMatrix();

      if (groupRef.current && glRef.current && glRef.current.camera) {
        groupRef.current.lookAt(glRef.current.camera.position);

        const offsetEuler = new THREE.Euler(0, -Math.PI / 4, 0, 'XYZ');
        const offsetQuat = new THREE.Quaternion().setFromEuler(offsetEuler);
        groupRef.current.quaternion.multiply(offsetQuat);
      }
    }
  }, [visible, rabbitPosition, glRef, camera]);

  // useEffect(() => {
  //   if (visible && groupRef.current && camera && glRef.current && glRef.current.camera) {
  //     // 카메라가 finRabbit(토끼 위치)을 바라보도록 설정
  //     if (char === 'moons') {
  //       camera.position.y -= 0.5;
  //     } else {
  //       camera.position.y -= 1.5;
  //     }
  //     camera.lookAt(...finRabbit);
  //     camera.updateProjectionMatrix();

  //     // 그룹의 회전을 초기화
  //     groupRef.current.rotation.set(0, 0, 0);
  //     // 그룹이 카메라 방향을 바라보게 설정 (즉, 토끼가 카메라를 바라봄)
  //     groupRef.current.lookAt(glRef.current.camera.position);
  //     // 원하는 오프셋 회전을 한 번 적용 (누적되지 않도록)
  //     groupRef.current.rotateY(-Math.PI / 4);
  //   }
  // }, [finRabbit]);

  return (
    <>
      <ambientLight intensity={3} />
      <pointLight position={[10, 10, 10]} />
      <Suspense fallback={null}>
        {visible && (
          <>
            {char == 'moons' ? (
              <group
                ref={groupRef}
                position={[
                  rabbitPosition[0] + cposition.x,
                  rabbitPosition[1] + cposition.y - 0.5,
                  rabbitPosition[2] + cposition.z,
                ]}
                rotation={[0, -Math.PI / 4, 0]}
                scale={cscale * 0.5}
                visible={visible}
              >
                <Box
                  sposition={[sposition.x, sposition.y, sposition.z]}
                  oposition={[oposition.x, oposition.y - 3, oposition.z]}
                  sscale={scale * 0.7}
                  on
                  onRenderEnd={() => {}}
                />
              </group>
            ) : (
              <group
                ref={groupRef}
                position={[
                  rabbitPosition[0] + cposition.x,
                  rabbitPosition[1] + cposition.y - 1.5,
                  rabbitPosition[2] + cposition.z,
                ]}
                rotation={[0, -Math.PI / 4, 0]}
                scale={cscale * 0.5}
                visible={visible}
              >
                <Tree
                  oposition={[oposition.x, oposition.y, oposition.z]}
                  sscale={scale * 0.9}
                  on
                  onRenderEnd={() => {}}
                />
              </group>
            )}
          </>
        )}
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
  const [scale, setScale] = useState(0.7); // 반지름 상태 관리c
  // 핀치 제스처로 반지름을 조정
  const bind = usePinch((state) => {
    if (char == 'moons') {
      setRadius(circleR * state.offset[0]); // 원의 반지름을 핀치 크기에 맞춰 조정
    } else {
      setScale(scale * state.offset[0]);
    }
  });
  const getPosition = () => {
    const saved = localStorage.getItem('levaValues');
    if (saved) {
      const base = char == 'moons' ? 'https://gamy-six.vercel.app/test' : 'https://gamy-six.vercel.app/test2';
      const { oposition, sposition, cposition, sscale, cscale } = JSON.parse(saved!);

      const text =
        base +
        `?ox=${oposition.x}&oy=${oposition.y}&oz=${oposition.z}&cx=${cposition.x}&cy=${cposition.y}&cz=${cposition.z}&sx=${sposition.x}&sy=${sposition.y}&sz=${sposition.z}&ss=${sscale}&cs=${cscale}`;

      navigator.clipboard
        .writeText(text)
        .then(() => {
          alert('복사되었습니다. 원하는 곳에 붙여넣기하여 주세요.');
        })
        .catch(() => {
          prompt('키보드의 ctrl+C 또는 마우스 오른쪽의 복사하기를 이용해주세요.', text);
        });
    }
  };

  return (
    <div {...bind()} style={{ position: 'fixed', inset: 0, pointerEvents: 'auto', zIndex: 99999 }}>
      <button
        style={{
          position: 'fixed',
          top: '30%',
          right: '24px',
          background: 'rgba(0,0,0,0.5)',
          borderRadius: '8px',
          color: 'white',
          padding: '1rem',
          border: 'none',
          zIndex: 99999,
        }}
        onClick={getPosition}
      >
        위치저장
      </button>

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
          window.location.href =
            char == 'moons' ? 'https://gamy-six.vercel.app/test' : 'https://gamy-six.vercel.app/test2';
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
            style={{ transform: `scale(${scale * 0.7}) translateY(0%)` }} // 제스처로 조절된 전체 스케일 적용
          >
            <g id="Layer_2_00000049944092468416363100000003561816792095906952_">
              <path
                fill="none"
                stroke="#FFFFFF"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeMiterlimit="10"
                strokeDasharray="1,5,0,0,1,0"
                d="M167,128.3l-17-5h-15h-15l-10,12l-10,37v23l7,17l16,22l10.5,10l14.5,28l5,28l5,27.2l1,21.8l2,24l6,37l7,34
           l-6,25v21l1,16c0,0-9,14-11,18s-16,34-16,34l-11,18l-5,25l-4,13l-16,26l-15,18l-11,14l-16,8l-16,11v8l25,6h21h26c0,0,15-15,20-16
           s23-4,23-4l20,12l23,1c0,0,15-13,23-13s22,7,28,10s28,19,28,19l35,10.6l15,9.4h21h38h45l25-14l31-16l19-8l9-22l-5-21l-25-40l-4-21
           l-11-33l-10-14l-11-12l-12-15l4-14l1-20v-21l-3-20l-1-14.5l3-11.5l-2-15l8-12l-3-20l-1-11l-1-23.9l11-14.1l8-7l5-11l2-13l11-14v-14
           l9-15l8-22l4-8l5-11l4-19l6-7l14-17l-11-20l-12-20l-28-13h-24l-15,22l-15,16l-11,19l-13,14l-2,16l-4,20l-10,21l-12,16l-13,11l-2-30
           v-18c0,0,1-20,3-25s7-26,7-26l7-14l4-15l-14-27c0,0-26-21-29-21s-57-8-57-8h-37l-30.9,16.3l-10.7,5.6l-15.4,8.1L167,128.3z"
              />
            </g>
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
        title={
          init ? `${char == 'moons' ? '토끼' : '관찰사'} 다시 부르기` : `${char == 'moons' ? '토끼' : '관찰사'}  부르기`
        }
        className="z-[9999] fixed bottom-[20%] left-1/2 -translate-x-1/2 w-max mx-auto p-4 h-fit"
      />
    </div>
  );
}

function UIOverlay2({
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
  const [scale, setScale] = useState(0.7); // 반지름 상태 관리c

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
          window.location.href =
            char == 'moons' ? 'https://gamy-six.vercel.app/test' : 'https://gamy-six.vercel.app/test2';
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
            style={{ transform: `scale(${scale * 0.7}) translateY(0%)` }} // 제스처로 조절된 전체 스케일 적용
          >
            <g id="Layer_2_00000049944092468416363100000003561816792095906952_">
              <path
                fill="none"
                stroke="#FFFFFF"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeMiterlimit="10"
                strokeDasharray="1,5,0,0,1,0"
                d="M167,128.3l-17-5h-15h-15l-10,12l-10,37v23l7,17l16,22l10.5,10l14.5,28l5,28l5,27.2l1,21.8l2,24l6,37l7,34
           l-6,25v21l1,16c0,0-9,14-11,18s-16,34-16,34l-11,18l-5,25l-4,13l-16,26l-15,18l-11,14l-16,8l-16,11v8l25,6h21h26c0,0,15-15,20-16
           s23-4,23-4l20,12l23,1c0,0,15-13,23-13s22,7,28,10s28,19,28,19l35,10.6l15,9.4h21h38h45l25-14l31-16l19-8l9-22l-5-21l-25-40l-4-21
           l-11-33l-10-14l-11-12l-12-15l4-14l1-20v-21l-3-20l-1-14.5l3-11.5l-2-15l8-12l-3-20l-1-11l-1-23.9l11-14.1l8-7l5-11l2-13l11-14v-14
           l9-15l8-22l4-8l5-11l4-19l6-7l14-17l-11-20l-12-20l-28-13h-24l-15,22l-15,16l-11,19l-13,14l-2,16l-4,20l-10,21l-12,16l-13,11l-2-30
           v-18c0,0,1-20,3-25s7-26,7-26l7-14l4-15l-14-27c0,0-26-21-29-21s-57-8-57-8h-37l-30.9,16.3l-10.7,5.6l-15.4,8.1L167,128.3z"
              />
            </g>
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
        title={
          init ? `${char == 'moons' ? '토끼' : '관찰사'} 다시 부르기` : `${char == 'moons' ? '토끼' : '관찰사'}  부르기`
        }
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
  useFrame(({ camera }) => {
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
  const ss = searchParams.get('ss') ? parseFloat(searchParams.get('ss')!) : 1;
  const cs = searchParams.get('cs') ? parseFloat(searchParams.get('cs')!) : 1;

  const cv = searchParams.get('cv');
  // LEVA 세팅
  const initialValues = useMemo(() => {
    if (
      ox !== undefined ||
      oy !== undefined ||
      oz !== undefined ||
      cx !== undefined ||
      cy !== undefined ||
      cz !== undefined ||
      sx !== undefined ||
      sy !== undefined ||
      sz !== undefined ||
      ss !== undefined ||
      cs !== undefined
    ) {
      return {
        oposition: { x: ox, y: oy, z: oz },
        sposition: { x: sx, y: sy, z: sz },
        cposition: { x: cx, y: cy, z: cz },
        sscale: ss,
        cscale: cs,
      };
    } else if (typeof window !== 'undefined') {
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
      sscale: 1,
      cscale: 1,
    };
  }, []);
  const { oposition, sposition, cposition } = useControls({
    oposition: { value: initialValues.oposition, step: 0.1 },
    sposition: { value: initialValues.sposition, step: 0.1 },
    cposition: { value: initialValues.cposition, step: 0.1 },
  });
  const { sscale, cscale } = useControls({
    sscale: initialValues.sscale || 1,
    cscale: initialValues.cscale || 1,
  });

  useEffect(() => {
    const data = { oposition, sposition, cposition, sscale, cscale };
    localStorage.setItem('levaValues', JSON.stringify(data));
  }, [oposition, sposition, cposition, sscale, cscale]);

  return cv ? (
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
          cscale={cscale}
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

          <div style={{ display: cv ? 'block' : 'none' }} className="fixed top-0 bottom-0 z-[99999999]">
            <Leva collapsed={false} />
          </div>
        </XRDomOverlay>
      </XR>
    </>
  ) : (
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
          cscale={cscale}
          char={props.char}
        />
        <XRDomOverlay>
          <UIOverlay2
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

          <div style={{ display: cv ? 'block' : 'none' }} className="fixed top-0 bottom-0 z-[99999999]">
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
  isIOS,
}: UIOverlayProps & any) {
  const [fotoUrl, setFotoUrl] = useState<string>('');

  useEffect(() => {
    const captureComposite = () => {
      if (isIOS) {
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

        // 배경 비디오
        ctx.drawImage(
          videoElement,
          videoParams.offsetX,
          videoParams.offsetY,
          videoParams.drawWidth,
          videoParams.drawHeight
        );

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
      } else {
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
      }
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

  const domWidth = 700;
  const domHeight = 1100;
  const circleX = domWidth / 2;
  const circleY = domHeight / 2;
  const circleR = 120;
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
      const offset = new THREE.Vector3(0, 0, 0);
      offset.applyQuaternion(cameraQuat);
      const newPosition = cameraPos.add(offset);

      setRabbitPosition([newPosition.x + pos.x, newPosition.y + pos.y, newPosition.z + pos.z]);
      logDebug('Rabbit position updated:', newPosition);

      // 토끼 부르기마다 resetTrigger 증가하여 DeviceOrientationController를 리셋
      setResetTrigger((prev) => prev + 1);
    } else {
      if (!glRefObj) return;

      // XR 세션 카메라가 최신 상태임을 보장
      glRefObj.camera.updateMatrixWorld(true);

      // 저장된 오프셋 값 불러오기
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

      // glRefObj.camera를 직접 사용하여 최신 카메라 변환값 얻기
      const cameraPos = glRefObj.camera.position.clone();
      const cameraQuat = glRefObj.camera.quaternion.clone();

      // non-iOS의 경우 오프셋은 (0, 0, -11)로 적용
      const offset = new THREE.Vector3(0, 0, -11);
      offset.applyQuaternion(cameraQuat);
      const newPosition = cameraPos.add(offset);

      // char 값에 따라 약간의 y축 보정 적용
      if (char === 'moons') {
        setRabbitPosition([newPosition.x + pos.x, newPosition.y + pos.y - 0.5, newPosition.z + pos.z]);
      } else {
        setRabbitPosition([newPosition.x + pos.x, newPosition.y + pos.y - 1.5, newPosition.z + pos.z]);
      }

      logDebug('Rabbit position updated:', newPosition);

      // 필요한 경우 DeviceOrientationController 등을 리셋하기 위한 트리거 업데이트
      setResetTrigger((prev) => prev + 1);
    }
  };

  /** ★ 수정: openModalHandler에서 XRFrame으로부터 FOV 추출 후 setCameraFov(newFov) */
  const openModalHandler = (gl: any) => {
    if (isIOS) {
      const threeCanvas = document.querySelector('#three-canvas')?.children[0].children[0];

      if (threeCanvas && offscreenCanvas) {
        const imgData = (threeCanvas as HTMLCanvasElement).toDataURL();

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

        setMount(false);
        setIsOpen(true);
      }
    } else {
      requestAnimationFrame(() => {
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
      });
    }
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
        ctx.filter = 'brightness(1.7)';
        ctx.drawImage(img, params.offsetX, params.offsetY, params.drawWidth, params.drawHeight);
        ctx.filter = 'none';
      };
      img.src = imgData;
    }
  };

  const handleCloseSaveModal = async () => {
    if (foto) {
      try {
        // 1. File System Access API 사용 (디렉터리 선택 → 파일 핸들 얻기)
        if (
          isIOS &&
          navigator.canShare &&
          navigator.canShare({
            files: [new File([foto], 'capture.png', { type: foto.type || 'image/png' })],
          })
        ) {
          const file = new File([foto], `gamyoungar-${new Date().getTime()}.png`, { type: foto.type || 'image/png' });
          await navigator.share({
            files: [file],
            title: 'My Captured Image',
            text: 'Check out this captured photo!',
          });
        }
        // 3. 위의 방법 모두 지원되지 않으면 다운로드 링크 방식 사용
        else {
          const url = URL.createObjectURL(foto);
          const link = document.createElement('a');
          link.download = `gamyoungar-${new Date().getTime()}.png`;
          link.href = url;
          link.click();
          URL.revokeObjectURL(url);
        }
      } catch (error) {
        logDebug('Saving failed: ' + error);
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
      ) : !(isIOS && sessionStarted) || isIOS ? (
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
              isIOS={isIOS}
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
  target,
  distance = 15,
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
    // PERFECT
    const targetVec = Array.isArray(target) ? new THREE.Vector3(target[0], target[1], target[2]) : target;
    const offset = new THREE.Vector3(0, 0, distance);
    offset.applyQuaternion(camera.quaternion);
    camera.position.copy(targetVec).add(offset);
    // 대상 오브젝트의 위치 (예: 토끼 위치)
  });

  return null;
}

function SceneIOS({
  visible,
  glRef,
  cscale,
  rabbitPosition,
  oposition,
  cposition,
  sposition,
  addGl,
  char,
  scale,
}: SceneProps) {
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
      if (char === 'moons') {
        groupRef.current.position.set(
          rabbitPosition[0] + cposition.x,
          rabbitPosition[1] + cposition.y + 0.2,
          rabbitPosition[2] + cposition.z
        );
      } else {
        groupRef.current.position.set(
          rabbitPosition[0] + cposition.x,
          rabbitPosition[1] + cposition.y + 1,
          rabbitPosition[2] + cposition.z
        );
      }
      //    groupRef.current.rotation.set(0, -Math.PI / 4, 0);
    }
  }, [visible, rabbitPosition, cposition]);

  return (
    <>
      <ambientLight intensity={3} />
      <Suspense fallback={null}>
        {visible &&
          (char === 'moons' ? (
            <group
              ref={groupRef}
              position={[
                rabbitPosition[0] + cposition.x,
                rabbitPosition[1] + cposition.y + 0.2,
                rabbitPosition[2] + cposition.z,
              ]}
              rotation={[Math.PI, -Math.PI / 4, 0]}
              scale={cscale * 0.25}
              visible={visible}
            >
              <Box
                sposition={[sposition.x, sposition.y, sposition.z]}
                oposition={[oposition.x, oposition.y - 3.5, oposition.z]}
                sscale={scale * 0.85}
                on
                onRenderEnd={() => {}}
              />
            </group>
          ) : (
            <group
              ref={groupRef}
              position={[
                rabbitPosition[0] + cposition.x,
                rabbitPosition[1] + cposition.y + 1,
                rabbitPosition[2] + cposition.z,
              ]}
              rotation={[Math.PI, -Math.PI / 4, 0]}
              scale={cscale * 0.5}
              visible={visible}
            >
              <Tree
                oposition={[oposition.x, oposition.y, oposition.z]}
                sscale={scale * 0.6}
                on
                onRenderEnd={() => {}}
              />
            </group>
          ))}
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
  const [scale, setScale] = useState(0.7);
  const bind = usePinch((state) => {
    if (char === 'moons') {
      setRadius(circleR * state.offset[0]);
    } else {
      setScale(scale * state.offset[0]);
    }
  });
  const [searchParams] = useSearchParams();
  const cv = searchParams.get('cv');

  const getPosition = () => {
    const saved = localStorage.getItem('levaValues');
    if (saved) {
      const base = char == 'moons' ? 'https://gamy-six.vercel.app/test' : 'https://gamy-six.vercel.app/test2';
      const { oposition, sposition, cposition, sscale, cscale } = JSON.parse(saved!);

      const text =
        base +
        `?ox=${oposition.x}&oy=${oposition.y}&oz=${oposition.z}&cx=${cposition.x}&cy=${cposition.y}&cz=${cposition.z}&sx=${sposition.x}&sy=${sposition.y}&sz=${sposition.z}&ss=${sscale}&cs=${cscale}`;

      navigator.clipboard
        .writeText(text)
        .then(() => {
          alert('복사되었습니다. 원하는 곳에 붙여넣기하여 주세요.');
        })
        .catch(() => {
          prompt('키보드의 ctrl+C 또는 마우스 오른쪽의 복사하기를 이용해주세요.', text);
        });
    }
  };
  return (
    <div {...bind()} style={{ position: 'fixed', inset: 0, pointerEvents: 'auto', zIndex: 99999 }}>
      {cv && (
        <button
          style={{
            position: 'fixed',
            top: '30%',
            right: '24px',
            background: 'rgba(0,0,0,0.5)',
            borderRadius: '8px',
            color: 'white',
            padding: '1rem',
            border: 'none',
            zIndex: 99999,
          }}
          onClick={getPosition}
        >
          위치저장
        </button>
      )}
      <button
        style={{
          position: 'fixed',
          bottom: '21px',
          left: '24px',
          background: 'transparent',
          border: 'none',
          zIndex: 99999,
        }}
        onClick={() => {
          // 예시 링크
          window.location.href =
            char == 'moons' ? 'https://gamy-six.vercel.app/test' : 'https://gamy-six.vercel.app/test2';
        }}
      >
        <Back />
      </button>
      <button
        style={{
          position: 'fixed',
          bottom: '0px',
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
            style={{ transform: `scale(${scale * 0.7}) translateY(0%)` }} // 제스처로 조절된 전체 스케일 적용
          >
            <g id="Layer_2_00000049944092468416363100000003561816792095906952_">
              <path
                fill="none"
                stroke="#FFFFFF"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeMiterlimit="10"
                strokeDasharray="1,5,0,0,1,0"
                d="M167,128.3l-17-5h-15h-15l-10,12l-10,37v23l7,17l16,22l10.5,10l14.5,28l5,28l5,27.2l1,21.8l2,24l6,37l7,34
           l-6,25v21l1,16c0,0-9,14-11,18s-16,34-16,34l-11,18l-5,25l-4,13l-16,26l-15,18l-11,14l-16,8l-16,11v8l25,6h21h26c0,0,15-15,20-16
           s23-4,23-4l20,12l23,1c0,0,15-13,23-13s22,7,28,10s28,19,28,19l35,10.6l15,9.4h21h38h45l25-14l31-16l19-8l9-22l-5-21l-25-40l-4-21
           l-11-33l-10-14l-11-12l-12-15l4-14l1-20v-21l-3-20l-1-14.5l3-11.5l-2-15l8-12l-3-20l-1-11l-1-23.9l11-14.1l8-7l5-11l2-13l11-14v-14
           l9-15l8-22l4-8l5-11l4-19l6-7l14-17l-11-20l-12-20l-28-13h-24l-15,22l-15,16l-11,19l-13,14l-2,16l-4,20l-10,21l-12,16l-13,11l-2-30
           v-18c0,0,1-20,3-25s7-26,7-26l7-14l4-15l-14-27c0,0-26-21-29-21s-57-8-57-8h-37l-30.9,16.3l-10.7,5.6l-15.4,8.1L167,128.3z"
              />
            </g>
          </svg>
        )}
      </div>
      <Button
        onClick={() => {
          if (!init) setInit(true);
          correctPose();
          setShow(false);
          setTimeout(() => setShow(true), 0);
        }}
        title={
          init ? `${char == 'moons' ? '토끼' : '관찰사'} 다시 부르기` : `${char == 'moons' ? '토끼' : '관찰사'}  부르기`
        }
        className="z-[9999] fixed bottom-[108px] left-1/2 -translate-x-1/2 w-max mx-auto p-4 h-fit"
      />
    </div>
  );
}

function IOSARCanvasCore(props: any) {
  const { latestCameraTransformRef, orientationEnabled } = props;
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
  const ss = searchParams.get('ss') ? parseFloat(searchParams.get('ss')!) : 1;
  const cs = searchParams.get('cs') ? parseFloat(searchParams.get('cs')!) : 1;

  const initialValues = useMemo(() => {
    const saved = localStorage.getItem('levaValues');
    if (
      ox !== undefined ||
      oy !== undefined ||
      oz !== undefined ||
      cx !== undefined ||
      cy !== undefined ||
      cz !== undefined ||
      sx !== undefined ||
      sy !== undefined ||
      sz !== undefined ||
      ss !== undefined ||
      cs !== undefined
    ) {
      return {
        oposition: { x: ox, y: oy, z: oz },
        sposition: { x: sx, y: sy, z: sz },
        cposition: { x: cx, y: cy, z: cz },
        sscale: ss,
        cscale: cs,
      };
    } else if (saved) {
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
      sscale: 1,
      cscale: 1,
    };
  }, []);
  const { oposition, sposition, cposition } = useControls({
    oposition: { value: initialValues.oposition, step: 0.1 },
    sposition: { value: initialValues.sposition, step: 0.1 },
    cposition: { value: initialValues.cposition, step: 0.1 },
  });
  const { sscale, cscale } = useControls({
    sscale: initialValues.sscale || 1,
    cscale: initialValues.cscale || 1,
  });
  useEffect(() => {
    localStorage.setItem('levaValues', JSON.stringify({ oposition, sposition, cposition, sscale, cscale }));
  }, [oposition, sposition, cposition, sscale, cscale]);
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
        cscale={cscale}
      />
    </>
  );
}

function IOSARCanvas(props: any) {
  const [, setInit] = useState(false);
  const glRef = useRef<any>(null);
  const latestCameraTransformRef = props.latestCameraTransformRef;
  const [orientationEnabled] = useState(true);
  const [searchParams] = useSearchParams();
  const cv = searchParams.get('cv');

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

      <div style={{ position: 'fixed', display: cv ? 'block' : 'none', top: 0, zIndex: 99999999 }}>
        <Leva collapsed={false} />
      </div>
    </div>
  );
}
