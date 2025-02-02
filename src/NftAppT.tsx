import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useParams, useSearchParams } from 'react-router-dom';
import { useFrame } from '@react-three/fiber';

// 예: SlamCanvas, requestCameraPermission, AlvaARConnectorTHREE, useSlam 등
// 실제 프로젝트 경로/파일에 맞게 import 조정
import SlamCanvas from './libs/arnft/arnft/components/SlamCanvas';
import { requestCameraPermission } from './libs/util';
import { AlvaARConnectorTHREE } from './libs/alvaConnector';
import { useSlam } from './libs/SLAMProvider';

// 예시 아이콘/모델
import Back from './assets/icons/Back';
import { Box, Tree } from './ArApp';

/** =============== 유틸 함수들 =============== */

/**
 * planeMatrix에서 3D 중심 pos -> camera.project() -> "비디오" 좌표 -> "DOM" 좌표
 * => "빨간 원(cx, cy, r, DOM좌표)" 내부인지 판정
 */
function isPlaneInCircleDom(
  planeMatrix: THREE.Matrix4,
  camera: THREE.PerspectiveCamera,
  videoWidth: number,   // ex) 1280
  videoHeight: number,  // ex) 720
  domWidth: number,     // ex) 360
  domHeight: number,    // ex) 640
  circleCenterX: number,// DOM 좌표
  circleCenterY: number,
  circleRadius: number
): boolean {
  // 1) 평면 중심 계산
  const pos = new THREE.Vector3();
  const rot = new THREE.Quaternion();
  const sca = new THREE.Vector3();
  planeMatrix.decompose(pos, rot, sca);

  // 2) world 좌표 -> clip space (NDC)
  pos.project(camera);

  // 3) NDC(-1..1) -> 비디오 해상도 좌표
  const halfVw = videoWidth / 2;
  const halfVh = videoHeight / 2;
  const videoX = (pos.x * halfVw) + halfVw;
  const videoY = (-pos.y * halfVh) + halfVh;

  // 4) 비디오 좌표 -> DOM 좌표 (필요 시 반올림 또는 보정 가능)
  const scaleX = domWidth / videoWidth;
  const scaleY = domHeight / videoHeight;
  const domX = videoX * scaleX;
  const domY = videoY * scaleY;

  // 5) 빨간 원 내부 판정
  const dx = domX - circleCenterX;
  const dy = domY - circleCenterY;
  const dist2 = dx * dx + dy * dy;
  return dist2 <= (circleRadius * circleRadius);
}

/** Matrix4 두 개의 위치/회전 차이를 계산 */
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


/** ============= CameraTracker ============= */
interface CameraTrackerProps {
  planeFound: boolean;
  setPlaneFound: (b: boolean) => void;
  stablePlane: boolean;
  setStablePlane: (b: boolean) => void;
  requestFinalizePlane: boolean;

  setCameraPosition: (pos: THREE.Vector3) => void;
  setObjectPosition: (pos: THREE.Vector3) => void;
  onPlaneConfidenceChange?: (val: number) => void;
  setPlaneVisible: (v: boolean) => void; // 평면이 visible인지 여부를 부모에게 알림

  // 해상도 보정용
  videoWidth: number;   // ex) 1280
  videoHeight: number;  // ex) 720
  domWidth: number;     // ex) 360
  domHeight: number;    // ex) 640

  // 빨간 원 (DOM 좌표)
  circleX: number;  // ex) 180
  circleY: number;  // ex) 320
  circleR: number;  // ex) 100
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
  setPlaneVisible,

  // videoWidth,
  // videoHeight,
  domWidth,
  domHeight,
  circleX,
  circleY,
  circleR,
}: CameraTrackerProps) {
  // URL 파라미터 (모델 종류, scale, offset)
  const { char } = useParams();
  const [searchParams] = useSearchParams();
  const scale = parseFloat(searchParams.get('scale') || '1');
  const offsetX = parseFloat(searchParams.get('x') || '0');
  const offsetY = parseFloat(searchParams.get('y') || '0');
  const offsetZ = parseFloat(searchParams.get('z') || '0');

  // SLAM
  const { alvaAR } = useSlam();
  const applyPose = useRef<any>(null);

  // 평면 안정도 (Confidence) 관련 상태
  const [planeConfidence, setPlaneConfidence] = useState(0);
  const planeConfidenceThreshold = 5; // 누적된 안정도 기준값
  const prevPlaneMatrix = useRef<THREE.Matrix4 | null>(null);
  const candidatePlaneMatrix = useRef(new THREE.Matrix4());
  const finalPlaneMatrix = useRef(new THREE.Matrix4());

  // 3D 오브젝트 레퍼런스
  const planeRef = useRef<THREE.Mesh>(null);
  const objectRef = useRef<THREE.Group>(null);

  // 오브젝트 배치 여부
  const [objectPlaced, setObjectPlaced] = useState(false);

  useEffect(() => {
    if (alvaAR) {
      applyPose.current = AlvaARConnectorTHREE.Initialize(THREE);
      console.log("✅ AlvaAR SLAM Initialized");
    }
  }, [alvaAR]);

  useFrame(({ camera }) => {
    if (!alvaAR || !applyPose.current) return;

    // 1) 카메라 Pose 업데이트
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

    // 2) 평면 안정도(Confidence) 업데이트 (planeFound가 false일 때)
    if (!planeFound) {
      const planePose = alvaAR.findPlane(frame);
      if (planePose) {
        const newMatrix = new THREE.Matrix4().fromArray(planePose);

        // (A) 빨간 원 내부 판정 (DOM 좌표 변환)
        const inCircle = isPlaneInCircleDom(
          newMatrix,
          camera as THREE.PerspectiveCamera,
          video.videoWidth || 1280,
          video.videoHeight || 720,
          domWidth,
          domHeight,
          circleX,
          circleY,
          circleR
        );

        // (B) 평면의 노멀 검증 및 가중치 계산
        const pos = new THREE.Vector3();
        const rot = new THREE.Quaternion();
        const sca = new THREE.Vector3();
        newMatrix.decompose(pos, rot, sca);
        // 기본 PlaneGeometry의 로컬 노멀 (0, 0, 1)
        const localNormal = new THREE.Vector3(0, 0, 1);
        const worldNormal = localNormal.clone().applyQuaternion(rot);
        // 카메라에서 평면 중심으로 향하는 단위 벡터
        const camVec = new THREE.Vector3().subVectors(camera.position, pos).normalize();
        const dot = worldNormal.dot(camVec);
        // dot 값이 1이면 평면이 정확히 카메라를 향함, 0이면 수직, 음수면 반대 방향
        // 여기서는 임계값 0.3 이상이면 어느 정도 향한다고 판단
        const FACING_THRESHOLD = 0.3;
        let facingWeight = 0;
        if (dot > FACING_THRESHOLD) {
          facingWeight = (dot - FACING_THRESHOLD) / (1 - FACING_THRESHOLD);
          // facingWeight: 0 ~ 1 사이의 값
        }
        // (C) 추가로 평면이 "설치물"이라면 (땅과 수직한 경우) 검증
        // 수직 평면의 경우, 평면의 노멀은 수평해야 함 (즉, 업벡터 (0,1,0)와의 내적이 낮아야 함)
        const up = new THREE.Vector3(0, 1, 0);
        const verticality = Math.abs(worldNormal.dot(up));
        // 예: 수직 평면이면 verticality가 0.3 이하(즉, 평면의 노멀이 수평에 가까움)여야 함.
        const isVertical = verticality < 0.3;

        // (D) 두 조건 모두 만족해야 안정도 누적
        if (!inCircle || facingWeight <= 0 || !isVertical) {
          setPlaneConfidence(0);
          setStablePlane(false);
        } else {
          // 평면 변화량 계산 (이전 프레임과의 차이)
          if (!prevPlaneMatrix.current) {
            prevPlaneMatrix.current = newMatrix.clone();
            setPlaneConfidence(facingWeight);
          } else {
            const diffVal = matrixDiff(prevPlaneMatrix.current, newMatrix);
            // 스무딩(EMA) 계수: alpha 값 (0 ~ 1)
            const alpha = 0.3;
            setPlaneConfidence(prev =>
              diffVal < 0.1
                ? alpha * facingWeight + (1 - alpha) * prev
                : facingWeight
            );
            prevPlaneMatrix.current.copy(newMatrix);
          }

          // 누적된 평면 안정도가 기준을 넘으면 안정적(stable)로 판단
          if (planeConfidence >= planeConfidenceThreshold) {
            candidatePlaneMatrix.current.copy(newMatrix);
            setStablePlane(true);
          }
        }
      } else {
        setPlaneConfidence(0);
        setStablePlane(false);
      }
    }

    onPlaneConfidenceChange?.(planeConfidence);

    // 3) 평면 표시: 안정적(stable) 후보가 있으면 후보 transform 적용, 아니면 기본 위치(카메라 앞)를 사용
    if (!planeFound && planeRef.current) {
      if (stablePlane) {
        const pos = new THREE.Vector3();
        const rot = new THREE.Quaternion();
        const sca = new THREE.Vector3();
        candidatePlaneMatrix.current.decompose(pos, rot, sca);
        planeRef.current.position.copy(pos);
        planeRef.current.quaternion.copy(rot);
        planeRef.current.scale.set(3, 3, 3);
      } else {
        // 기본: 카메라 앞(defaultDistance만큼 떨어진 곳)
        const defaultDistance = 2;
        const camDir = new THREE.Vector3();
        camera.getWorldDirection(camDir);
        const defaultPos = camera.position.clone().add(camDir.multiplyScalar(defaultDistance));
        planeRef.current.position.copy(defaultPos);
        planeRef.current.quaternion.copy(camera.quaternion);
        planeRef.current.scale.set(3, 3, 3);
      }
      planeRef.current.visible = true;
    }

    // 4) requestFinalizePlane: 최종 확정 시 후보 평면을 final로 지정
    if (!planeFound && requestFinalizePlane) {
      finalPlaneMatrix.current.copy(candidatePlaneMatrix.current);
      setPlaneFound(true);
      console.log("🎉 planeFound => place object");
    }

    // 5) 평면 확정 후, 오브젝트 배치 (한 번만 배치)
    if (planeFound && !objectPlaced && objectRef.current) {
      const pos = new THREE.Vector3();
      const rot = new THREE.Quaternion();
      const sca = new THREE.Vector3();
      finalPlaneMatrix.current.decompose(pos, rot, sca);

      pos.x += offsetX;
      pos.y += offsetY;
      pos.z += offsetZ;

      objectRef.current.position.copy(pos);
      objectRef.current.quaternion.copy(rot);
      objectRef.current.scale.setScalar(scale);

      setObjectPosition(pos.clone());
      setObjectPlaced(true);
      console.log("✅ Object placed!");
    }

    if (planeRef.current) {
      setPlaneVisible(planeRef.current.visible);
    } else {
      setPlaneVisible(false);
    }
  });

  // char 파라미터에 따라 모델 결정 ('moons'이면 Box, 아니면 Tree)
  const isMoons = (char === 'moons');

  return (
    <>
      {/* 파란 평면 (디버그용 혹은 후보 표시) */}
      <mesh ref={planeRef} visible={false}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          color="#00f"
          opacity={0.3}
          transparent
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* 평면 확정 시 오브젝트 배치 */}
      {planeFound && (
        <group ref={objectRef}>
          {isMoons ? <Box onRenderEnd={() => { }} on={true} /> : <Tree onRenderEnd={() => { }} on={true} />}
        </group>
      )}
    </>
  );
}

/** ============= NftAppT (메인) ============= */
export default function NftAppT() {
  const [cameraPosition, setCameraPosition] = useState(new THREE.Vector3());
  const [objectPosition, setObjectPosition] = useState(new THREE.Vector3());
  const [planeVisible, setPlaneVisible] = useState(false);

  // planeFound / stablePlane / finalize 상태
  const [planeFound, setPlaneFound] = useState(false);
  const [stablePlane, setStablePlane] = useState(false);
  const [requestFinalizePlane, setRequestFinalizePlane] = useState(false);

  const [planeConfidence, setPlaneConfidence] = useState(0);

  useEffect(() => {
    // 모바일 카메라 권한 요청
    requestCameraPermission();
  }, []);

  /**
   * 가정:
   * - 실제 카메라 영상: 1280×720
   * - DOM 표시 영역: 360×640
   * - 빨간 원: DOM 좌표 (180,320) 반경 100
   */
  const domWidth = 360;
  const domHeight = 640;

  // 빨간 원
  const circleX = domWidth / 2;   // 180
  const circleY = domHeight / 2;  // 320
  const circleR = 100;

  // 원 색상: 평면 확정 여부에 따라 변경
  const circleColor = planeFound ? 'blue' : 'red';
  // "토끼 부르기" 버튼 표시 여부
  const showButton = !planeFound && stablePlane;

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
          padding: '1rem'
        }}
        onClick={() => window.history.back()}
      >
        <Back />
      </button>

      {/* HUD */}
      <div
        style={{
          position: 'fixed',
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
        <p>
          <b>카메라</b>: {cameraPosition.x.toFixed(2)}, {cameraPosition.y.toFixed(2)}, {cameraPosition.z.toFixed(2)}
        </p>
        <p>
          <b>오브젝트</b>: {objectPosition.x.toFixed(2)}, {objectPosition.y.toFixed(2)}, {objectPosition.z.toFixed(2)}
        </p>
        <p><b>confidence</b>: {planeConfidence}</p>
        <p><b>planeFound</b>: {planeFound ? 'true' : 'false'}</p>
        <p><b>stablePlane</b>: {stablePlane ? 'true' : 'false'}</p>
      </div>

      <div
        style={{
          position: 'absolute',
          top: '10px',
          left: '10px',
          zIndex: 9999,
          color: 'white',
          background: 'rgba(0,0,0,0.5)',
          padding: '10px',
          borderRadius: '8px'
        }}
      >
        <p><b>Plane Visible?</b> {planeVisible ? 'YES' : 'NO'}</p>
      </div>

      {/* 빨간 원 (DOM 영역) */}
      <div
        style={{
          position: 'fixed',
          width: `${domWidth}px`,
          height: `${domHeight}px`,
          top: '50%',
          left: '50%',
          transform: 'translate(-50%,-50%)',
          background: 'transparent',
          overflow: 'hidden',
          zIndex: 9998,
        }}
      >
        <svg
          width={domWidth}
          height={domHeight}
          style={{ position: 'absolute', top: 0, left: 0 }}
        >
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

      {/* 안내 문구 및 버튼 */}
      {!planeFound ? (
        <>
          <div
            style={{
              position: 'fixed',
              top: '70%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 9999,
              background: 'rgba(0,0,0,0.6)',
              color: 'white',
              padding: '10px',
              borderRadius: '8px',
              fontSize: '14px'
            }}
          >
            <p>빨간 원 안에 평면을 맞춰주세요.</p>
            <p>폰을 천천히 움직여 텍스처·조명을 확보하세요!</p>
          </div>

          {showButton && (
            <button
              style={{
                position: 'fixed',
                bottom: '10%',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 99999,
                padding: '1rem',
                fontSize: '1rem',
                backgroundColor: 'darkblue',
                color: 'white',
                border: 'none',
                borderRadius: '8px'
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
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'rgba(0,0,0,0.6)',
            color: 'white',
            padding: '10px',
            borderRadius: '8px',
            fontSize: '14px',
            zIndex: 9999
          }}
        >
          <p>토끼가 소환되었습니다!</p>
        </div>
      )}

      {/* SLAM + Three.js 캔버스 */}
      <SlamCanvas id="three-canvas">
        <React.Suspense fallback={null}>
          <CameraTracker
            setPlaneVisible={(v) => setPlaneVisible(v)}
            planeFound={planeFound}
            setPlaneFound={setPlaneFound}
            stablePlane={stablePlane}
            setStablePlane={setStablePlane}
            requestFinalizePlane={requestFinalizePlane}
            setCameraPosition={(pos) => setCameraPosition(pos)}
            setObjectPosition={(pos) => setObjectPosition(pos)}
            onPlaneConfidenceChange={(val) => setPlaneConfidence(val)}
            videoWidth={1280}
            videoHeight={720}
            domWidth={360}
            domHeight={640}
            circleX={180}
            circleY={320}
            circleR={100}
          />
          <ambientLight />
          <directionalLight position={[100, 100, 0]} />
        </React.Suspense>
      </SlamCanvas>
    </>
  );
}
