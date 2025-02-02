import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useParams, useSearchParams } from 'react-router-dom';
import { useFrame } from '@react-three/fiber';

// 실제 프로젝트 경로에 맞게 import 조정
import SlamCanvas from './libs/arnft/arnft/components/SlamCanvas';
import { requestCameraPermission } from './libs/util';
import { AlvaARConnectorTHREE } from './libs/alvaConnector';
import { useSlam } from './libs/SLAMProvider';

// 예시 아이콘/모델
import Back from './assets/icons/Back';
import { Box, Tree } from './ArApp';

/** =============== 유틸 함수들 =============== */

/**
 * 평면 중심의 DOM 좌표를 구하는 함수 (빨간 원 중심과의 거리를 측정하기 위해)
 */
function getPlaneDOMCenter(
  planeMatrix: THREE.Matrix4,
  camera: THREE.PerspectiveCamera,
  videoWidth: number,
  videoHeight: number,
  domWidth: number,
  domHeight: number
): { x: number; y: number } {
  const pos = new THREE.Vector3();
  const rot = new THREE.Quaternion();
  const sca = new THREE.Vector3();
  planeMatrix.decompose(pos, rot, sca);
  pos.project(camera);
  const halfVw = videoWidth / 2;
  const halfVh = videoHeight / 2;
  const videoX = (pos.x * halfVw) + halfVw;
  const videoY = (-pos.y * halfVh) + halfVh;
  const scaleX = domWidth / videoWidth;
  const scaleY = domHeight / videoHeight;
  return {
    x: videoX * scaleX,
    y: videoY * scaleY,
  };
}

/** 두 Matrix4의 위치/회전 차이를 계산 */
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

/**
 * 빨간 원의 중심을 기준으로, 카메라에서 해당 화면 좌표를 통과하는 광선과
 * 후보 평면(candidateMatrix)과의 교차점을 계산하여 반환하는 함수.
 * → 현재 이 함수는 사용하지 않습니다.
 */
function getIntersectionWithCandidatePlane(
  camera: THREE.Camera,
  candidateMatrix: THREE.Matrix4,
  domWidth: number,
  domHeight: number,
  circleX: number,
  circleY: number
): THREE.Vector3 | null {
  const ndcX = (circleX / domWidth) * 2 - 1;
  const ndcY = -((circleY / domHeight) * 2 - 1);
  const ndc = new THREE.Vector3(ndcX, ndcY, 0.5);
  ndc.unproject(camera);
  const ray = new THREE.Ray(camera.position, ndc.sub(camera.position).normalize());

  const planePos = new THREE.Vector3();
  const planeQuat = new THREE.Quaternion();
  const planeScale = new THREE.Vector3();
  candidateMatrix.decompose(planePos, planeQuat, planeScale);
  const localNormal = new THREE.Vector3(0, 0, 1);
  const planeNormal = localNormal.clone().applyQuaternion(planeQuat);
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, planePos);
  const intersection = new THREE.Vector3();
  if (ray.intersectPlane(plane, intersection)) {
    return intersection;
  }
  return null;
}

/**
 * AR 시스템이 반환하는 평면 행렬의 translation 요소에 scaleFactor를 곱해
 * 단위(예: 센티미터 → 미터) 보정을 적용한 새 행렬을 반환합니다.
 */
function scaleMatrixTranslation(matrix: THREE.Matrix4, scaleFactor: number): THREE.Matrix4 {
  const elements = matrix.elements.slice(); // 복사본 생성
  elements[12] *= scaleFactor;
  elements[13] *= scaleFactor;
  elements[14] *= scaleFactor;
  const newMat = new THREE.Matrix4();
  newMat.fromArray(elements);
  return newMat;
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

  // dot 값 디버그용 콜백
  onDotValueChange?: (dot: number) => void;

  videoWidth: number;
  videoHeight: number;
  domWidth: number;
  domHeight: number;

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
  onDotValueChange,

  videoWidth,
  videoHeight,
  domWidth,
  domHeight,
  circleX,
  circleY,
  circleR,
}: CameraTrackerProps) {
  const { char } = useParams();
  const [searchParams] = useSearchParams();
  const scale = parseFloat(searchParams.get('scale') || '1');
  // 쿼리 파라미터 offset은 제거한 상태로 처리

  const { alvaAR } = useSlam();
  const applyPose = useRef<any>(null);

  const [planeConfidence, setPlaneConfidence] = useState(0);
  const planeConfidenceThreshold = 5; // 누적 안정도 임계값
  const prevPlaneMatrix = useRef<THREE.Matrix4 | null>(null);
  const candidatePlaneMatrix = useRef(new THREE.Matrix4());
  const finalPlaneMatrix = useRef(new THREE.Matrix4());

  // 최종 오브젝트 위치를 한 번 결정하면 고정할 ref
  const finalObjectPosition = useRef<THREE.Vector3 | null>(null);

  const planeRef = useRef<THREE.Mesh>(null);
  const objectRef = useRef<THREE.Group>(null);
  const [objectPlaced, setObjectPlaced] = useState(false);

  // translation 단위 보정을 위한 scale factor (예: AR 시스템이 센티미터 단위라면 0.01)
  const translationScale = 0.01;

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
    tmpCanvas.width = video.videoWidth || videoWidth;
    tmpCanvas.height = video.videoHeight || videoHeight;
    ctx?.drawImage(video, 0, 0, tmpCanvas.width, tmpCanvas.height);
    const frame = ctx?.getImageData(0, 0, tmpCanvas.width, tmpCanvas.height);
    if (!frame) return;
    const camPose = alvaAR.findCameraPose(frame);
    if (camPose) {
      applyPose.current(camPose, camera.quaternion, camera.position);
      setCameraPosition(camera.position.clone());
    }

    // 2) 평면 안정도 업데이트 (planeFound가 false일 때)
    if (!planeFound) {
      const planePose = alvaAR.findPlane(frame);
      if (planePose) {
        // AR 시스템이 반환하는 행렬에 대해 translation 보정을 적용합니다.
        let newMatrix = new THREE.Matrix4().fromArray(planePose);
        newMatrix = scaleMatrixTranslation(newMatrix, translationScale);

        // (A) 평면 중심의 DOM 좌표 계산 (빨간 원 중심과의 거리 측정)
        const { x: domCenterX, y: domCenterY } = getPlaneDOMCenter(newMatrix, camera as THREE.PerspectiveCamera, video.videoWidth || videoWidth, video.videoHeight || videoHeight, domWidth, domHeight);
        const dx = domCenterX - circleX;
        const dy = domCenterY - circleY;
        const centerDistance = Math.sqrt(dx * dx + dy * dy);
        const centerDistanceThreshold = circleR * 1.5; // 예: 원 반경의 1.5배

        // (B) 평면의 노멀 검증 및 effectiveFacingWeight 계산
        const pos = new THREE.Vector3();
        const rot = new THREE.Quaternion();
        const sca = new THREE.Vector3();
        newMatrix.decompose(pos, rot, sca);
        const localNormal = new THREE.Vector3(0, 0, 1);
        const worldNormal = localNormal.clone().applyQuaternion(rot);
        const camVec = new THREE.Vector3().subVectors(camera.position, pos).normalize();
        const dot = worldNormal.dot(camVec);
        const effectiveDot = -dot; // 부호 반전 (예: 원래 dot가 -0.4 ~ -0.6이면 effectiveDot는 0.4~0.6)
        onDotValueChange?.(dot);
        const FACING_THRESHOLD = 0.2;
        let facingWeight = 0;
        if (effectiveDot > FACING_THRESHOLD) {
          facingWeight = (effectiveDot - FACING_THRESHOLD) / (1 - FACING_THRESHOLD);
        }

        // (C) 평면의 수직성 검사
        const up = new THREE.Vector3(0, 1, 0);
        const verticality = Math.abs(worldNormal.dot(up));
        const isVertical = verticality < 0.5;

        console.log("Plane Debug:", {
          centerDistance: centerDistance.toFixed(2),
          dot: dot.toFixed(2),
          effectiveDot: effectiveDot.toFixed(2),
          facingWeight: facingWeight.toFixed(2),
          verticality: verticality.toFixed(2),
          isVertical,
        });

        // (D) 후보 업데이트 조건: 평면 중심과 빨간 원 중심 사이의 거리가 임계값 이내, facingWeight > 0, 그리고 isVertical
        if (centerDistance < centerDistanceThreshold && facingWeight > 0 && isVertical) {
          let newConfidence = 0;
          if (prevPlaneMatrix.current) {
            const diffVal = matrixDiff(prevPlaneMatrix.current, newMatrix);
            newConfidence = diffVal < 0.1 ? planeConfidence + facingWeight : facingWeight;
          } else {
            newConfidence = facingWeight;
          }
          setPlaneConfidence(newConfidence);
          prevPlaneMatrix.current = newMatrix.clone();

          // EMA 업데이트 (스무딩 강화: α=0.1)
          const alphaMatrix = 0.1;
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

          console.log("Updated candidatePlaneMatrix Position:", currentPos);

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

    // 3) 평면 표시: 안정 상태이면 candidatePlaneMatrix 적용, 아니면 기본 위치(카메라 앞)
    if (!planeFound && planeRef.current) {
      if (stablePlane) {
        const pos = new THREE.Vector3();
        const rot = new THREE.Quaternion();
        const sca = new THREE.Vector3();
        candidatePlaneMatrix.current.decompose(pos, rot, sca);
        // 회전 보정: 후보 평면의 노멀 방향이 카메라를 향하도록 보정
        const localNormal = new THREE.Vector3(0, 0, 1);
        const worldNormal = localNormal.clone().applyQuaternion(rot);
        const camDir = new THREE.Vector3().subVectors(camera.position, pos).normalize();
        if (worldNormal.dot(camDir) < 0) {
          const flipQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
          rot.multiply(flipQuat);
        }
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

    // 4) 평면 확정 요청: 버튼 클릭 시
    if (!planeFound && requestFinalizePlane) {
      finalPlaneMatrix.current.copy(candidatePlaneMatrix.current);
      setPlaneFound(true);
      console.log("🎉 planeFound => place object");
    }

    // 5) 평면 확정 후 오브젝트 배치 (최종 오브젝트 위치 결정)
    // 최종 오브젝트 위치는 후보 평면(finalPlaneMatrix)에서 분해한 위치를 그대로 사용
    if (planeFound && !objectPlaced && objectRef.current) {
      if (!finalObjectPosition.current) {
        const finalPos = new THREE.Vector3();
        finalPlaneMatrix.current.decompose(finalPos, new THREE.Quaternion(), new THREE.Vector3());
        finalObjectPosition.current = finalPos.clone();
      }
      if (finalObjectPosition.current) {
        objectRef.current.position.copy(finalObjectPosition.current);
        // 회전 보정: finalPlaneMatrix에서 Y축 회전만 남기도록 보정
        const planeQuat = new THREE.Quaternion();
        finalPlaneMatrix.current.decompose(new THREE.Vector3(), planeQuat, new THREE.Vector3());
        const euler = new THREE.Euler().setFromQuaternion(planeQuat, 'YXZ');
        euler.x = 0;
        euler.z = 0;
        const finalQuat = new THREE.Quaternion().setFromEuler(euler);
        objectRef.current.quaternion.copy(finalQuat);
        objectRef.current.scale.setScalar(scale);
        setObjectPosition(finalObjectPosition.current.clone());
        setObjectPlaced(true);
        console.log("✅ Object placed at final position:", finalObjectPosition.current);
      }
    }

    if (planeRef.current) {
      setPlaneVisible(planeRef.current.visible);
    }
  });

  const isMoons = (char === 'moons');

  return (
    <>
      <mesh ref={planeRef} visible={false}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color="#00f" opacity={0.3} transparent side={THREE.DoubleSide} />
      </mesh>
      {planeFound && (
        <group ref={objectRef}>
          {isMoons ? <Box onRenderEnd={() => { }} on /> : <Tree onRenderEnd={() => { }} on />}
        </group>
      )}
    </>
  );
}

/** ============= NftAppT (메인) ============= */
export default function NftAppT() {
  const [cameraPosition, setCameraPosition] = useState(new THREE.Vector3());
  const [objectPosition, setObjectPosition] = useState(new THREE.Vector3());
  const [planeFound, setPlaneFound] = useState(false);
  const [stablePlane, setStablePlane] = useState(false);
  const [requestFinalizePlane, setRequestFinalizePlane] = useState(false);
  const [planeConfidence, setPlaneConfidence] = useState(0);
  const [dotValue, setDotValue] = useState(0);

  useEffect(() => {
    requestCameraPermission();
  }, []);

  const domWidth = 360;
  const domHeight = 640;
  const circleX = domWidth / 2;
  const circleY = domHeight / 2;
  const circleR = 100;

  // 평면이 확정되거나 안정 상태이면 원 색상을 파란색으로
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
        <p>
          <b>dot</b>: {dotValue.toFixed(2)}
        </p>
      </div>

      {/* 토끼 확정 후엔 빨간 원 SVG 숨김 */}
      {!planeFound && (
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
      )}

      {!planeFound && (
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
            <p>빨간 원 안에 달조형물을 맞춰주세요.</p>
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
      )}

      <SlamCanvas id="three-canvas">
        <React.Suspense fallback={null}>
          <CameraTracker
            setPlaneVisible={() => { }}
            planeFound={planeFound}
            setPlaneFound={setPlaneFound}
            stablePlane={stablePlane}
            setStablePlane={setStablePlane}
            requestFinalizePlane={requestFinalizePlane}
            setCameraPosition={(pos) => setCameraPosition(pos)}
            setObjectPosition={(pos) => setObjectPosition(pos)}
            onPlaneConfidenceChange={(val) => setPlaneConfidence(val)}
            onDotValueChange={(val) => setDotValue(val)}
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
