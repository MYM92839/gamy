/**
 * NftAppT (모바일 기준 예시)
 * - DOM에 빨간 원 (200×200, 화면 중앙)
 * - Three.js 파란 Plane (planeConfidence로 활성화)
 * - "토끼 부르기" 버튼 (안정화 후)
 * - useParams, useSearchParams로 URL 파라미터 처리
 */

import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useParams, useSearchParams } from 'react-router-dom';

import SlamCanvas from './libs/arnft/arnft/components/SlamCanvas';
import { requestCameraPermission } from './libs/util';
import { AlvaARConnectorTHREE } from './libs/alvaConnector';
import { useSlam } from './libs/SLAMProvider';

// 예시 아이콘, 모델들
import Back from './assets/icons/Back';       // 뒤로가기 아이콘
import { Box, Tree } from './ArApp';         // 3D 오브젝트들

/** ======================
 *  유틸 함수
 =======================*/

/** Plane 행렬에서 중심점 → camera.project() → 2D 좌표
 *  => 빨간 원(cx,cy,r) 내부인지 판별
 */
function isPlaneInCircle(
  planeMatrix: THREE.Matrix4,
  camera: THREE.PerspectiveCamera,
  canvasWidth: number,    // 실제 카메라 해상도 가정(예: 1280)
  canvasHeight: number,   // 예: 720
  circleCenterX: number,  // 2D 좌표(픽셀)
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
  const dist2 = dx*dx + dy*dy;
  return dist2 <= (circleRadius * circleRadius);
}

/** Matrix4 두 개의 위치/회전 차이를 간단히 계산 */
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


/** ======================
 *  CameraTracker
 =======================*/
interface CameraTrackerProps {
  planeFound: boolean;
  setPlaneFound: (b: boolean) => void;
  stablePlane: boolean;
  setStablePlane: (b: boolean) => void;
  requestFinalizePlane: boolean;

  setCameraPosition: (pos: THREE.Vector3) => void;
  setObjectPosition: (pos: THREE.Vector3) => void;
  onPlaneConfidenceChange?: (val: number) => void;

  // "빨간 원" 판정에 사용할 캔버스/원 정보
  canvasWidth: number;
  canvasHeight: number;
  circleCenterX: number;
  circleCenterY: number;
  circleRadius: number;
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

  canvasWidth,
  canvasHeight,
  circleCenterX,
  circleCenterY,
  circleRadius,
}: CameraTrackerProps) {

  // URL 파라미터 (마커없는 AR이지만, 모델·스케일·오프셋 지정)
  const { char } = useParams();
  const [searchParams] = useSearchParams();
  const scale = parseFloat(searchParams.get('scale') || '1');
  const offsetX = parseFloat(searchParams.get('x') || '0');
  const offsetY = parseFloat(searchParams.get('y') || '0');
  const offsetZ = parseFloat(searchParams.get('z') || '0');

  // SLAM
  const { alvaAR } = useSlam();
  const applyPose = useRef<any>(null);

  // 평면 안정도 로직
  const [planeConfidence, setPlaneConfidence] = useState(0);
  const planeConfidenceThreshold = 5;

  // 이전/후보/최종 Plane 행렬
  const prevPlaneMatrix = useRef<THREE.Matrix4 | null>(null);
  const candidatePlaneMatrix = useRef(new THREE.Matrix4());
  const finalPlaneMatrix = useRef(new THREE.Matrix4());

  // 3D 오브젝트 refs
  const planeRef = useRef<THREE.Mesh>(null);
  const objectRef = useRef<THREE.Group>(null);

  // 오브젝트 배치 완료?
  const [objectPlaced, setObjectPlaced] = useState(false);

  useEffect(() => {
    if (alvaAR) {
      applyPose.current = AlvaARConnectorTHREE.Initialize(THREE);
    }
  }, [alvaAR]);

  useFrame(({ camera }) => {
    if (!alvaAR || !applyPose.current) return;

    // 1) 카메라 pose
    const video = document.getElementById('ar-video') as HTMLVideoElement | null;
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

    // 2) planeConfidence 로직 (planeFound=false 일 때)
    if (!planeFound) {
      const planePose = alvaAR.findPlane(frame);
      if (planePose) {
        const newMatrix = new THREE.Matrix4().fromArray(planePose);

        // "빨간 원" 내부인가?
        const perspCam = camera as THREE.PerspectiveCamera;
        const inCircle = isPlaneInCircle(
          newMatrix,
          perspCam,
          canvasWidth,
          canvasHeight,
          circleCenterX,
          circleCenterY,
          circleRadius
        );

        if (!inCircle) {
          setPlaneConfidence(0);
          setStablePlane(false);
        } else {
          if (!prevPlaneMatrix.current) {
            prevPlaneMatrix.current = newMatrix.clone();
            setPlaneConfidence(1);
          } else {
            const diffVal = matrixDiff(prevPlaneMatrix.current, newMatrix);
            // 0.1 정도로 완화
            if (diffVal < 0.1) {
              setPlaneConfidence(c => c + 1);
            } else {
              setPlaneConfidence(1);
            }
            prevPlaneMatrix.current.copy(newMatrix);
          }

          // threshold
          if (planeConfidence >= planeConfidenceThreshold) {
            candidatePlaneMatrix.current.copy(newMatrix);
            setStablePlane(true);
          }
        }
      } else {
        // planePose=null
        setPlaneConfidence(0);
        setStablePlane(false);
      }
    }
    onPlaneConfidenceChange?.(planeConfidence);

    // 3) stablePlane & !planeFound => 파란 Plane 시각화
    if (!planeFound && stablePlane && planeRef.current) {
      const pos = new THREE.Vector3();
      const rot = new THREE.Quaternion();
      const sc = new THREE.Vector3();
      candidatePlaneMatrix.current.decompose(pos, rot, sc);

      planeRef.current.visible = true;
      planeRef.current.position.copy(pos);
      planeRef.current.quaternion.copy(rot);
      planeRef.current.scale.set(3, 3, 3); // 필요하면 더 크게
    }

    // 4) 사용자 버튼 눌렀다면 -> 최종 확정
    if (!planeFound && requestFinalizePlane) {
      finalPlaneMatrix.current.copy(candidatePlaneMatrix.current);
      setPlaneFound(true);
    }

    // 5) planeFound & object not placed => 오브젝트 배치
    if (planeFound && !objectPlaced && objectRef.current) {
      const pos = new THREE.Vector3();
      const rot = new THREE.Quaternion();
      const sc = new THREE.Vector3();
      finalPlaneMatrix.current.decompose(pos, rot, sc);

      pos.x += offsetX;
      pos.y += offsetY;
      pos.z += offsetZ;

      objectRef.current.position.copy(pos);
      objectRef.current.quaternion.copy(rot);
      objectRef.current.scale.setScalar(scale);

      setObjectPosition(pos.clone());
      setObjectPlaced(true);
    }
  });

  // 어떤 모델 쓸지 (URL /nft-app?char=moons 등)
  const isMoons = (char === 'moons');

  return (
    <>
      {/* 파란 Plane */}
      <mesh ref={planeRef} visible={false}>
        <planeGeometry args={[1,1]} />
        <meshBasicMaterial
          color="#0000ff"
          opacity={0.3}
          transparent
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* 오브젝트 */}
      {planeFound && (
        <group ref={objectRef}>
          { isMoons ? <Box onRenderEnd={()=>{}} on /> : <Tree onRenderEnd={()=>{}} on /> }
        </group>
      )}
    </>
  );
}

/** ======================
 * NftAppT (메인)
 * 모바일 기준 DOM/CSS
 =======================*/
export default function NftAppT() {
  const [cameraPosition, setCameraPosition] = useState(new THREE.Vector3());
  const [objectPosition, setObjectPosition] = useState(new THREE.Vector3());

  // planeFound / stablePlane / finalize
  const [planeFound, setPlaneFound] = useState(false);
  const [stablePlane, setStablePlane] = useState(false);
  const [requestFinalizePlane, setRequestFinalizePlane] = useState(false);

  // HUD
  const [planeConfidence, setPlaneConfidence] = useState(0);

  useEffect(() => {
    // 모바일 카메라 권한 요청
    requestCameraPermission();
  }, []);

  // 모바일 기준으로 1280×720 영상이라 가정
  // (실제로는 video.videoWidth / video.videoHeight를 쓸 수도 있음)
  const videoWidth = 1280;
  const videoHeight = 720;

  // 빨간원 중심/반지름 (투영 좌표 기준)
  // 여기서는 "영상 해상도" 중간으로 가정
  const circleCenterX = videoWidth / 2;
  const circleCenterY = videoHeight / 2;
  const circleRadius = 100;

  // DOM에 표시할 빨간원 스타일 (200×200 고정)
  // planeFound=true면 파랑색
  const circleColor = planeFound ? 'blue' : 'red';

  // "토끼 부르기" 버튼 표시?
  const showRabbitButton = (!planeFound && stablePlane);

  return (
    <>
      {/* 뒤로가기 버튼 */}
      <button
        style={{
          position:'fixed',
          top:'1rem',
          left:'1rem',
          zIndex:9999,
          background:'transparent',
          border:'none',
          padding:'1rem'
        }}
        onClick={()=> window.history.back()}
      >
        <Back />
      </button>

      {/* HUD (planeConfidence 등) */}
      <div
        style={{
          position:'fixed',
          top:'1rem',
          right:'1rem',
          zIndex:9999,
          background:'rgba(0,0,0,0.6)',
          padding:'10px',
          borderRadius:'8px',
          color:'white',
          fontSize:'14px',
        }}
      >
        <p><b>카메라</b>: {cameraPosition.x.toFixed(2)}, {cameraPosition.y.toFixed(2)}, {cameraPosition.z.toFixed(2)}</p>
        <p><b>오브젝트</b>: {objectPosition.x.toFixed(2)}, {objectPosition.y.toFixed(2)}, {objectPosition.z.toFixed(2)}</p>
        <p><b>confidence</b>: {planeConfidence}</p>
        <p><b>planeFound</b>: {planeFound ? 'true' : 'false'}</p>
        <p><b>stablePlane</b>: {stablePlane ? 'true' : 'false'}</p>
      </div>

      {/* "빨간원" DOM (가운데 200×200px) */}
      <div
        style={{
          position:'fixed',
          width:'200px',
          height:'200px',
          top:'50%',
          left:'50%',
          transform:'translate(-50%, -50%)',
          zIndex:9998,
        }}
      >
        <svg width='200' height='200' viewBox='0 0 50 50'>
          <circle
            cx='25'
            cy='25'
            r='24'
            fill='none'
            stroke={circleColor}
            strokeWidth='2'
          />
        </svg>
      </div>

      {/* 안내 문구 / 버튼 */}
      {!planeFound ? (
        <>
          <div
            style={{
              position:'fixed',
              top:'60%',
              left:'50%',
              transform:'translate(-50%, -50%)',
              background:'rgba(0,0,0,0.6)',
              padding:'10px',
              borderRadius:'8px',
              color:'white',
              fontSize:'14px',
              zIndex:9999,
            }}
          >
            <p>빨간 원 안에 평면을 인식해 보세요.</p>
            <p>폰을 천천히 움직여 조명·각도를 맞추면 안정화됩니다.</p>
          </div>

          {showRabbitButton && (
            <button
              style={{
                position:'fixed',
                bottom:'10%',
                left:'50%',
                transform:'translateX(-50%)',
                zIndex:99999,
                padding:'1rem',
                fontSize:'1rem',
                backgroundColor:'darkblue',
                color:'white',
                borderRadius:'8px',
                border:'none',
              }}
              onClick={()=> setRequestFinalizePlane(true)}
            >
              토끼 부르기
            </button>
          )}
        </>
      ) : (
        <div
          style={{
            position:'fixed',
            top:'50%',
            left:'50%',
            transform:'translate(-50%, -50%)',
            background:'rgba(0,0,0,0.6)',
            padding:'10px',
            borderRadius:'8px',
            color:'white',
            fontSize:'14px',
            zIndex:9999,
          }}
        >
          <p>토끼가 소환되었습니다!</p>
        </div>
      )}

      {/* SLAM + Three.js */}
      <SlamCanvas id='three-canvas'>
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

            // 투영 좌표 계산용 (camera.project)
            canvasWidth={videoWidth}
            canvasHeight={videoHeight}
            circleCenterX={circleCenterX}
            circleCenterY={circleCenterY}
            circleRadius={circleRadius}
          />
          <ambientLight />
          <directionalLight position={[100,100,0]} />
        </React.Suspense>
      </SlamCanvas>
    </>
  );
}
