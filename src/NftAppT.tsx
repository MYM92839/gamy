/**
 * NftAppT.tsx
 * TypeScript + React + Three.js + React Router v6 (useParams, useSearchParams)
 * - DOM에 빨간원
 * - Three.js에 파란 Plane
 * - planeConfidence 로직
 * - "토끼 부르기" 버튼
 */

import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useParams, useSearchParams } from 'react-router-dom';

import SlamCanvas from './libs/arnft/arnft/components/SlamCanvas';
import { requestCameraPermission } from './libs/util';
import { AlvaARConnectorTHREE } from './libs/alvaConnector';
import { useSlam } from './libs/SLAMProvider';

// 예시 컴포넌트 (모델들, 아이콘 등)
import Back from './assets/icons/Back';
import { Box, Tree } from './ArApp';

/**
 * planeMatrix에서 3D 중심 → camera.project() → 2D 좌표
 * -> 빨간원(cx, cy, r) 내부인지 검사
 */
function isPlaneInCircle(
  planeMatrix: THREE.Matrix4,
  camera: THREE.PerspectiveCamera,
  canvasWidth: number,
  canvasHeight: number,
  circleCenterX: number,
  circleCenterY: number,
  circleRadius: number
): boolean {
  const pos = new THREE.Vector3();
  const rot = new THREE.Quaternion();
  const sca = new THREE.Vector3();
  planeMatrix.decompose(pos, rot, sca);

  // world -> NDC
  pos.project(camera);

  // -1..1 → 화면 픽셀
  const halfW = canvasWidth / 2;
  const halfH = canvasHeight / 2;
  const screenX = pos.x * halfW + halfW;
  const screenY = -pos.y * halfH + halfH;

  const dx = screenX - circleCenterX;
  const dy = screenY - circleCenterY;
  const dist2 = dx * dx + dy * dy;
  return dist2 <= (circleRadius * circleRadius);
}

/** 두 행렬의 위치/회전 차이 간단 계산 */
function matrixDiff(m1: THREE.Matrix4, m2: THREE.Matrix4) {
  const pos1 = new THREE.Vector3();
  const pos2 = new THREE.Vector3();
  const rot1 = new THREE.Quaternion();
  const rot2 = new THREE.Quaternion();
  const sc1 = new THREE.Vector3();
  const sc2 = new THREE.Vector3();

  m1.decompose(pos1, rot1, sc1);
  m2.decompose(pos2, rot2, sc2);

  const posDiff = pos1.distanceTo(pos2);
  const dot = Math.abs(rot1.dot(rot2));
  const rotDiff = 1 - dot;
  return posDiff + rotDiff;
}

// CameraTracker 컴포넌트
interface CameraTrackerProps {
  planeFound: boolean;
  setPlaneFound: (v: boolean) => void;
  stablePlane: boolean;
  setStablePlane: (v: boolean) => void;
  requestFinalizePlane: boolean;
  setCameraPosition: (pos: THREE.Vector3) => void;
  setObjectPosition: (pos: THREE.Vector3) => void;
  onPlaneConfidenceChange?: (val: number) => void;

  // DOM 빨간원
  circleCenterX: number;
  circleCenterY: number;
  circleRadius: number;
  canvasWidth: number;
  canvasHeight: number;
}

function CameraTracker({
  planeFound,
  setPlaneFound,
  stablePlane,
  setStablePlane,
  requestFinalizePlane,
  setCameraPosition,
  setObjectPosition,
  onPlaneConfidenceChange,
  circleCenterX,
  circleCenterY,
  circleRadius,
  canvasWidth,
  canvasHeight,
}: CameraTrackerProps) {

  // 1) url params
  const { char } = useParams(); // 예) /nft-app/moons
  const [searchParams] = useSearchParams();
  const scale = parseFloat(searchParams.get('scale') || '1');
  const offsetX = parseFloat(searchParams.get('x') || '0');
  const offsetY = parseFloat(searchParams.get('y') || '0');
  const offsetZ = parseFloat(searchParams.get('z') || '0');

  // SLAM
  const { alvaAR } = useSlam();
  const applyPose = useRef<any>(null);

  // planeConfidence
  const [planeConfidence, setPlaneConfidence] = useState(0);
  const planeConfidenceThreshold = 5;

  const prevPlaneMatrix = useRef<THREE.Matrix4 | null>(null);
  const candidatePlaneMatrix = useRef(new THREE.Matrix4());
  const finalPlaneMatrix = useRef(new THREE.Matrix4());

  // plane, object
  const planeRef = useRef<THREE.Mesh>(null);
  const objectRef = useRef<THREE.Group>(null);
  const [objectPlaced, setObjectPlaced] = useState(false);

  useEffect(() => {
    if (alvaAR) {
      applyPose.current = AlvaARConnectorTHREE.Initialize(THREE);
      console.log("✅ AlvaAR SLAM Ready!");
    }
  }, [alvaAR]);

  useFrame(({ camera }) => {
    if (!alvaAR || !applyPose.current) return;

    // 1) 카메라 pose
    const video = document.getElementById("ar-video") as HTMLVideoElement | null;
    if (!video) return;

    const tmpCanvas = document.createElement('canvas');
    const ctx = tmpCanvas.getContext('2d');
    tmpCanvas.width = video.videoWidth || 1280;
    tmpCanvas.height = video.videoHeight || 720;
    ctx?.drawImage(video, 0, 0, tmpCanvas.width, tmpCanvas.height);
    const frame = ctx?.getImageData(0, 0, tmpCanvas.width, tmpCanvas.height);
    if (!frame) return;

    const camPose = alvaAR.findCameraPose(frame);
    if (camPose) {
      applyPose.current(camPose, camera.quaternion, camera.position);
      setCameraPosition(camera.position.clone());
    }

    // 2) planeConfidence 로직 (planeFound == false)
    if (!planeFound) {
      const planePose = alvaAR.findPlane(frame);
      if (planePose) {
        const newMatrix = new THREE.Matrix4().fromArray(planePose);

        // "빨간 원" 내부?
        const perspectiveCam = camera as THREE.PerspectiveCamera;
        const inCircle = isPlaneInCircle(
          newMatrix,
          perspectiveCam,
          canvasWidth,
          canvasHeight,
          circleCenterX,
          circleCenterY,
          circleRadius
        );

        if (!inCircle) {
          // 원 바깥 -> confidence reset
          setPlaneConfidence(0);
          setStablePlane(false);
        } else {
          // 원 안
          if (!prevPlaneMatrix.current) {
            prevPlaneMatrix.current = newMatrix.clone();
            setPlaneConfidence(1);
          } else {
            const diffVal = matrixDiff(prevPlaneMatrix.current, newMatrix);
            // 0.1정도 완화
            if (diffVal < 0.1) {
              setPlaneConfidence(c => c + 1);
            } else {
              setPlaneConfidence(1);
            }
            prevPlaneMatrix.current.copy(newMatrix);
          }

          // threshold 넘어가면
          if (planeConfidence >= planeConfidenceThreshold) {
            candidatePlaneMatrix.current.copy(newMatrix);
            setStablePlane(true);
          }
        }
      } else {
        // planePose= null
        setPlaneConfidence(0);
        setStablePlane(false);
      }
    }

    // HUD
    onPlaneConfidenceChange?.(planeConfidence);

    // 3) stablePlane && !planeFound => planeRef 시각화
    if (!planeFound && stablePlane && planeRef.current) {
      const pos = new THREE.Vector3();
      const rot = new THREE.Quaternion();
      const sc = new THREE.Vector3();
      candidatePlaneMatrix.current.decompose(pos, rot, sc);

      planeRef.current.position.copy(pos);
      planeRef.current.quaternion.copy(rot);
      planeRef.current.scale.set(3, 3, 3); // plane 크기 임의
      planeRef.current.visible = true;
    }

    // 4) 버튼 누르면 -> 최종 확정
    if (!planeFound && requestFinalizePlane) {
      finalPlaneMatrix.current.copy(candidatePlaneMatrix.current);
      console.log("🎉 Plane Found => place object");
      (setPlaneFound)(true);
    }

    // 5) planeFound && 오브젝트 배치 안했다면
    if (planeFound && !objectPlaced && objectRef.current) {
      const pos = new THREE.Vector3();
      const rot = new THREE.Quaternion();
      const sc = new THREE.Vector3();
      finalPlaneMatrix.current.decompose(pos, rot, sc);

      pos.x += offsetX; // url 파라미터
      pos.y += offsetY;
      pos.z += offsetZ;

      objectRef.current.position.copy(pos);
      objectRef.current.quaternion.copy(rot);
      objectRef.current.scale.setScalar(scale);

      setObjectPosition(pos.clone());
      setObjectPlaced(true);
      console.log("✅ Object placed!");
    }
  });

  // char
  const isMoons = (char === 'moons');

  return (
    <>
      {/* 파란 plane */}
      <mesh ref={planeRef} visible={false}>
        <planeGeometry args={[1,1]} />
        <meshBasicMaterial
          color="#0000ff"
          transparent
          opacity={0.3}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* 오브젝트 */}
      {planeFound && (
        <group ref={objectRef}>
          {isMoons ? <Box onRenderEnd={()=>{}} on /> : <Tree onRenderEnd={()=>{}} on />}
        </group>
      )}
    </>
  );
}

// 메인 NftAppT
export default function NftAppT() {
  const [cameraPosition, setCameraPosition] = useState(new THREE.Vector3());
  const [objectPosition, setObjectPosition] = useState(new THREE.Vector3());

  // planeFound / stablePlane / 버튼
  const [planeFound, setPlaneFound] = useState(false);
  const [stablePlane, setStablePlane] = useState(false);
  const [requestFinalizePlane, setRequestFinalizePlane] = useState(false);

  // planeConfidence HUD
  const [planeConfidence, setPlaneConfidence] = useState(0);

  useEffect(() => {
    requestCameraPermission();
  }, []);

  // 예: 비디오 크기 (1280x720 등)
  const videoWidth = 1280;
  const videoHeight = 720;

  // 빨간 원 DOM 위치/크기
  const circleRadius = 100;
  const circleCenterX = videoWidth / 2;
  const circleCenterY = videoHeight / 2;

  // 원 색
  const circleColor = planeFound ? "blue" : "red";
  // 토끼 부르기 버튼 표시 여부
  const showRabbitButton = !planeFound && stablePlane;

  return (
    <>
      {/* 뒤로가기 버튼 */}
      <button
        style={{
          position: 'fixed',
          top: '1rem',
          left: '1rem',
          zIndex: 9999,
          background: 'transparent',
          border: 'none',
          padding: '1rem',
        }}
        onClick={() => window.history.back()}
      >
        <Back />
      </button>

      {/* HUD */}
      <div
        style={{
          position: 'absolute',
          top: '1rem',
          right: '1rem',
          zIndex: 9999,
          background: 'rgba(0,0,0,0.6)',
          padding: '10px',
          borderRadius: '8px',
          color: 'white',
          fontSize: '14px'
        }}
      >
        <p><b>카메라:</b> {cameraPosition.x.toFixed(2)}, {cameraPosition.y.toFixed(2)}, {cameraPosition.z.toFixed(2)}</p>
        <p><b>오브젝트:</b> {objectPosition.x.toFixed(2)}, {objectPosition.y.toFixed(2)}, {objectPosition.z.toFixed(2)}</p>
        <p><b>planeConfidence:</b> {planeConfidence}</p>
        <p><b>planeFound:</b> {planeFound ? "true" : "false"}</p>
        <p><b>stablePlane:</b> {stablePlane ? "true" : "false"}</p>
      </div>

      {/* 빨간 원 DOM */}
      <div
        style={{
          position: "absolute",
          width: '50dvw',
          height: '50dvh',
          top: '50dvh',
          left: '50dvw',
          zIndex: 9999,
          transform: 'translate(-50%, -50%)',
        }}
      >
        <svg width="200" height="200" viewBox="0 0 50 50">
          <circle
            cx="25"
            cy="25"
            r="24"
            fill="none"
            stroke={circleColor}
            strokeWidth="2"
          />
        </svg>
      </div>

      {/* 안내/버튼 */}
      {!planeFound ? (
        <>
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background: 'rgba(0,0,0,0.6)',
              padding: '10px',
              borderRadius: '8px',
              color: 'white',
              fontSize: '14px',
              zIndex:9999
            }}
          >
            <p>빨간 원 안에 평면을 맞추어 주세요!</p>
            <p>안정화되면 토끼 부르기 버튼이 나타납니다.</p>
          </div>

          {showRabbitButton && (
            <button
              style={{
                position: 'absolute',
                bottom: '10%',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex:99999,
                padding: '1rem',
                fontSize: '1rem',
                backgroundColor: 'darkblue',
                color: 'white',
                borderRadius: '8px',
                border:'none'
              }}
              onClick={() => setRequestFinalizePlane(true)}
            >
              토끼 부르기
            </button>
          )}
        </>
      ) : (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'rgba(0,0,0,0.6)',
            padding: '10px',
            borderRadius: '8px',
            color: 'white',
            fontSize: '14px',
            zIndex:9999
          }}
        >
          <p>토끼가 소환되었습니다!</p>
        </div>
      )}

      {/* SLAM + Three.js */}
      <SlamCanvas id="three-canvas">
        <React.Suspense fallback={null}>
          <CameraTracker
            planeFound={planeFound}
            setPlaneFound={setPlaneFound}
            stablePlane={stablePlane}
            setStablePlane={setStablePlane}
            requestFinalizePlane={requestFinalizePlane}

            setCameraPosition={(pos)=> setCameraPosition(pos)}
            setObjectPosition={(pos)=> setObjectPosition(pos)}
            onPlaneConfidenceChange={(val)=> setPlaneConfidence(val)}

            // 빨간원 좌표/크기
            circleCenterX={circleCenterX}
            circleCenterY={circleCenterY}
            circleRadius={circleRadius}
            canvasWidth={videoWidth}
            canvasHeight={videoHeight}
          />
          <ambientLight />
          <directionalLight position={[100,100,0]} />
        </React.Suspense>
      </SlamCanvas>
    </>
  );
}
