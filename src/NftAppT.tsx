import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useParams, useSearchParams } from 'react-router-dom';
import { useFrame } from '@react-three/fiber';

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
 * 평면의 중심을 계산하여 카메라 좌표계의 비디오 좌표로 투영한 후,
 * DOM 좌표로 변환하고, 빨간 원 내부 여부를 판정한다.
 * (평면의 크기에 따라 toleranceFactor를 적용)
 */
function isPlaneInCircleDom(
  planeMatrix: THREE.Matrix4,
  camera: THREE.PerspectiveCamera,
  videoWidth: number,
  videoHeight: number,
  domWidth: number,
  domHeight: number,
  circleCenterX: number,
  circleCenterY: number,
  circleRadius: number
): boolean {
  const pos = new THREE.Vector3();
  const rot = new THREE.Quaternion();
  const sca = new THREE.Vector3();
  planeMatrix.decompose(pos, rot, sca);

  // 평면의 스케일에 따라 toleranceFactor 적용
  const scaleFactor = Math.max(sca.x, sca.y, sca.z);
  const toleranceFactor = scaleFactor > 1 ? 1.2 : 1;

  pos.project(camera);
  const halfVw = videoWidth / 2;
  const halfVh = videoHeight / 2;
  const videoX = (pos.x * halfVw) + halfVw;
  const videoY = (-pos.y * halfVh) + halfVh;

  const scaleX = domWidth / videoWidth;
  const scaleY = domHeight / videoHeight;
  const domX = videoX * scaleX;
  const domY = videoY * scaleY;

  const dx = domX - circleCenterX;
  const dy = domY - circleCenterY;
  const dist2 = dx * dx + dy * dy;
  return dist2 <= (circleRadius * toleranceFactor) ** 2;
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
  setPlaneVisible: (v: boolean) => void;

  // 해상도 보정용
  videoWidth: number;
  videoHeight: number;
  domWidth: number;
  domHeight: number;

  // 빨간 원 (DOM 좌표)
  circleX: number;
  circleY: number;
  circleR: number;
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

  // 평면 안정도(Confidence) 관련 상태
  const [planeConfidence, setPlaneConfidence] = useState(0);
  const planeConfidenceThreshold = 5; // 누적 안정도가 이 값 이상일 때 안정 상태로 판단
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

        // (B) 평면의 노멀 검증 및 facingWeight 계산
        const pos = new THREE.Vector3();
        const rot = new THREE.Quaternion();
        const sca = new THREE.Vector3();
        newMatrix.decompose(pos, rot, sca);
        const localNormal = new THREE.Vector3(0, 0, 1);
        const worldNormal = localNormal.clone().applyQuaternion(rot);
        const camVec = new THREE.Vector3().subVectors(camera.position, pos).normalize();
        const dot = worldNormal.dot(camVec);
        const FACING_THRESHOLD = 0.2;
        let facingWeight = 0;
        if (dot > FACING_THRESHOLD) {
          facingWeight = (dot - FACING_THRESHOLD) / (1 - FACING_THRESHOLD);
        }

        // (C) 평면의 수직성 검사: 수직 평면이면 (업 벡터와의 내적이 낮아야 함)
        const up = new THREE.Vector3(0, 1, 0);
        const verticality = Math.abs(worldNormal.dot(up));
        const isVertical = verticality < 0.5; // 수직이면 true

        // (D) 조건: 빨간 원 내부, facingWeight > 0, 그리고 수직이면 → 누적 안정도 업데이트
        if (inCircle && facingWeight > 0 && isVertical) {
          // 누적 안정도를 갱신 (조건이 계속 만족되면 누적, 아니면 리셋)
          let newConfidence = 0;
          if (prevPlaneMatrix.current) {
            const diffVal = matrixDiff(prevPlaneMatrix.current, newMatrix);
            // diff가 작으면 안정한 상태로 누적
            newConfidence = diffVal < 0.1 ? planeConfidence + facingWeight : facingWeight;
          } else {
            newConfidence = facingWeight;
          }
          setPlaneConfidence(newConfidence);
          prevPlaneMatrix.current = newMatrix.clone();

          // EMA 방식으로 candidatePlaneMatrix 업데이트 (조건이 만족되면 계속 보정)
          const alphaMatrix = 0.4;
          const currentPos = new THREE.Vector3();
          const currentQuat = new THREE.Quaternion();
          const currentScale = new THREE.Vector3();
          candidatePlaneMatrix.current.decompose(currentPos, currentQuat, currentScale);
          const newPos = new THREE.Vector3();
          const newQuat = new THREE.Quaternion();
          const newScale = new THREE.Vector3();
          newMatrix.decompose(newPos, newQuat, newScale);
          currentPos.lerp(newPos, alphaMatrix);
          currentQuat.slerp(newQuat, alphaMatrix);
          currentScale.lerp(newScale, alphaMatrix);
          candidatePlaneMatrix.current.compose(currentPos, currentQuat, currentScale);

          // 누적 안정도가 threshold 이상이면 안정 상태로 판단
          if (newConfidence >= planeConfidenceThreshold) {
            setStablePlane(true);
          } else {
            setStablePlane(false);
          }
        } else {
          setStablePlane(false);
          setPlaneConfidence(0);
        }
      } else {
        setStablePlane(false);
        setPlaneConfidence(0);
      }
    }

    onPlaneConfidenceChange?.(planeConfidence);

    // 3) 평면 표시: 조건 만족 시 candidatePlaneMatrix 적용, 아니면 카메라 앞쪽 기본 위치 사용
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

    // 4) requestFinalizePlane: 최종 확정 시 candidatePlaneMatrix를 finalPlaneMatrix에 복사
    if (!planeFound && requestFinalizePlane) {
      finalPlaneMatrix.current.copy(candidatePlaneMatrix.current);
      setPlaneFound(true);
      console.log("🎉 planeFound => place object");
    }

    // 5) 평면 확정 후 오브젝트 배치 (한 번)
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

  // char 파라미터에 따라 모델 선택 ('moons'이면 Box, 아니면 Tree)
  const isMoons = (char === 'moons');

  return (
    <>
      {/* 파란 평면 (디버그/후보 표시) */}
      <mesh ref={planeRef} visible={false}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color="#00f" opacity={0.3} transparent side={THREE.DoubleSide} />
      </mesh>

      {/* 평면 확정 시 오브젝트 배치 */}
      {planeFound && (
        <group ref={objectRef}>
          {isMoons ? <Box onRenderEnd={() => {}} on={true} /> : <Tree onRenderEnd={() => {}} on={true} />}
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
  const [planeFound, setPlaneFound] = useState(false);
  const [stablePlane, setStablePlane] = useState(false);
  const [requestFinalizePlane, setRequestFinalizePlane] = useState(false);
  const [planeConfidence, setPlaneConfidence] = useState(0);

  useEffect(() => {
    requestCameraPermission();
  }, []);

  const domWidth = 360;
  const domHeight = 640;
  const circleX = domWidth / 2;
  const circleY = domHeight / 2;
  const circleR = 100;

  // UI: planeFound가 true이면 원 색상과 버튼 상태 변경
  const circleColor = planeFound || stablePlane ? 'blue' : 'red';
  const showButton = !planeFound && stablePlane;

  return (
    <>
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
        <p>
          <b>confidence</b>: {planeConfidence}
        </p>
        <p>
          <b>planeFound</b>: {planeFound ? 'true' : 'false'}
        </p>
        <p>
          <b>stablePlane</b>: {stablePlane ? 'true' : 'false'}
        </p>
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
        <p>
          <b>Plane Visible?</b> {planeVisible ? 'YES' : 'NO'}
        </p>
      </div>

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
          <circle cx={circleX} cy={circleY} r={circleR} fill="none" stroke={circleColor} strokeWidth="2" />
        </svg>
      </div>

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
