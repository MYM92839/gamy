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

const cameraForward = new THREE.Vector3();


// 최적화를 위해 재사용할 임시 객체들
const tempVec1 = new THREE.Vector3();
const tempVec2 = new THREE.Vector3();
const tempQuat1 = new THREE.Quaternion();
const tempScale1 = new THREE.Vector3();

const candidatePos = new THREE.Vector3();
const candidateQuat = new THREE.Quaternion();
const candidateScale = new THREE.Vector3();

const localNormal = new THREE.Vector3(0, 0, 1);
const camVec = new THREE.Vector3();
const up = new THREE.Vector3(0, 1, 0);
const camDir = new THREE.Vector3();
const flipQuat = new THREE.Quaternion();
const dummy = new THREE.Vector3(0, 1, 0);
const matt = new THREE.Matrix4();

const pos = new THREE.Vector3();
const rot = new THREE.Quaternion();
const sca = new THREE.Vector3();

const pos1 = new THREE.Vector3();
const pos2 = new THREE.Vector3();
const rot1 = new THREE.Quaternion();
const rot2 = new THREE.Quaternion();
const sc1 = new THREE.Vector3();
const sc2 = new THREE.Vector3();

const newMat = new THREE.Matrix4();

/** =============== 유틸 함수들 ============== */

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
  pos.set(0, 0, 0);
  rot.set(0, 0, 0, 1);
  sca.set(0, 0, 0);

  planeMatrix.decompose(pos, rot, sca);
  pos.project(camera);
  const halfVw = videoWidth / 2;
  const halfVh = videoHeight / 2;
  const videoX = (pos.x * halfVw) + halfVw;
  const videoY = (-pos.y * halfVh) + halfVh;
  const scaleX = domWidth / videoWidth;
  const scaleY = domHeight / videoHeight;
  return { x: videoX * scaleX, y: videoY * scaleY };
}

/** 두 Matrix4의 위치/회전 차이를 계산 */
function matrixDiff(m1: THREE.Matrix4, m2: THREE.Matrix4) {
  pos1.set(0, 0, 0);
  pos2.set(0, 0, 0);
  rot1.set(0, 0, 0, 1);
  rot2.set(0, 0, 0, 1);
  sc1.set(0, 0, 0);
  sc2.set(0, 0, 0);

  m1.decompose(pos1, rot1, sc1);
  m2.decompose(pos2, rot2, sc2);
  const posDiff = pos1.distanceTo(pos2);
  const dot = Math.abs(rot1.dot(rot2));
  const rotDiff = 1 - dot;
  return posDiff + rotDiff;
}

/**
 * AR 시스템이 반환하는 평면 행렬의 translation 요소에 scaleFactor를 곱해
 * 단위 보정을 적용한 새 Matrix4를 반환합니다.
 */
function scaleMatrixTranslation(matrix: THREE.Matrix4, scaleFactor: number): THREE.Matrix4 {
  const elements = matrix.elements.slice(); // 복사본 생성
  elements[12] *= scaleFactor;
  elements[13] *= scaleFactor;
  elements[14] *= scaleFactor;
  newMat.identity();
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
  const x = parseFloat(searchParams.get('x') || '0');
  const y = parseFloat(searchParams.get('y') || '0');
  const z = parseFloat(searchParams.get('z') || '0');
  const t = parseFloat(searchParams.get('t') || '0');

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
  // translation 단위 보정을 위한 scale factor (예: AR 시스템이 센티미터 단위 → 미터 단위: 0.01)
  const translationScale = 0.01;
  // 오브젝트의 발을 평면에 딱 붙게 하기 위한 Y 오프셋 (모델에 맞게 조정)
  const objectFootOffset = 0.5;

  // 최적화를 위해 매 프레임 재사용할 임시 객체들을 미리 생성합니다.
  const tmpCanvasRef = useRef<HTMLCanvasElement | null>(null);
  if (!tmpCanvasRef.current) {
    tmpCanvasRef.current = document.createElement('canvas');
  }
  // useFrame에서 재사용할 임시 객체들
  const tmpCtx = useRef<CanvasRenderingContext2D | null>(null);

  useEffect(() => {
    if (alvaAR) {
      applyPose.current = AlvaARConnectorTHREE.Initialize(THREE);
      console.log("✅ AlvaAR SLAM Initialized");
    }
  }, [alvaAR]);

  useFrame(({ camera }) => {
    let frame: ImageData | undefined;
    const video = document.getElementById('ar-video') as HTMLVideoElement | null;
    if (video && tmpCanvasRef.current) {
      const tmpCanvas = tmpCanvasRef.current;
      tmpCanvas.width = video.videoWidth || videoWidth;
      tmpCanvas.height = video.videoHeight || videoHeight;
      if (!tmpCtx.current) {
        tmpCtx.current = tmpCanvas.getContext('2d');
      }
      tmpCtx.current?.drawImage(video, 0, 0, tmpCanvas.width, tmpCanvas.height);
      frame = tmpCtx.current?.getImageData(0, 0, tmpCanvas.width, tmpCanvas.height);
    }

    // 카메라 포즈 업데이트
    if (frame && alvaAR) {
      const camPose = alvaAR.findCameraPose(frame);
      if (camPose) {
        // applyPose는 내부에서 전달받은 카메라 quaternion, position을 업데이트합니다.
        applyPose.current(camPose, camera.quaternion, camera.position);
        setCameraPosition(camera.position.clone());
      }
    }

    // 평면 인식 및 후보 평면 업데이트 (객체 배치 전까지)
    if (!planeFound && alvaAR) {
      const planePose = alvaAR.findPlane(frame);
      if (planePose) {
        matt.identity();
        let newMatrix = matt.fromArray(planePose);
        newMatrix = scaleMatrixTranslation(newMatrix, translationScale);

        // DOM 상 평면 중심 좌표 계산 (빨간 원 중심과의 거리 계산용)
        const { x: domCenterX, y: domCenterY } = getPlaneDOMCenter(
          newMatrix,
          camera as THREE.PerspectiveCamera,
          video?.videoWidth || videoWidth,
          video?.videoHeight || videoHeight,
          domWidth,
          domHeight
        );
        const dx = domCenterX - circleX;
        const dy = domCenterY - circleY;
        const centerDistance = Math.sqrt(dx * dx + dy * dy);
        const centerDistanceThreshold = circleR * 1.5;

        // 평면 행렬 분해
        newMatrix.decompose(tempVec1, tempQuat1, tempScale1);

        // 평면 노말 구하기
        tempVec2.copy(localNormal).applyQuaternion(tempQuat1);

        // (추가) 평면이 카메라 앞쪽(시야 내)에 있는지 검사
        const candidatePosition = tempVec1.clone();
        camera.getWorldDirection(cameraForward);
        // const camToPlane = candidatePosition.clone().sub(camera.position);
        // dot 계산 전에 벡터 길이 검사
        camVec.copy(camera.position).sub(candidatePosition);
        if (camVec.lengthSq() === 0 || tempVec2.lengthSq() === 0) {
          return;
        }
        camVec.normalize();
        const dot = tempVec2.dot(camVec);
        if (isNaN(dot)) {
          console.warn("dot is NaN", { camVec, tempVec2 });
          return;
        }
        const effectiveDot = -dot;
        onDotValueChange?.(effectiveDot);

        // FACING_THRESHOLD 값 (t 값이 있다면 사용)
        const FACING_THRESHOLD = (t !== undefined && t > 0) ? t : 0.4;
        let facingWeight = 0;
        if (effectiveDot > FACING_THRESHOLD) {
          facingWeight = (effectiveDot - FACING_THRESHOLD) / (1 - FACING_THRESHOLD);
        }

        // 평면의 수직성 검사 – 카메라 높이에 따라 임계값 조정
        const dynamicVerticalThreshold = camera.position.y < 1.5 ? 0.35 : 0.3;
        const verticality = Math.abs(tempVec2.dot(up));
        const isVertical = verticality < dynamicVerticalThreshold;

        console.log("Plane Debug:", {
          centerDistance: centerDistance.toFixed(2),
          dot: dot.toFixed(2),
          effectiveDot: effectiveDot.toFixed(2),
          facingWeight: facingWeight.toFixed(2),
          verticality: verticality.toFixed(2),
          dynamicVerticalThreshold,
          isVertical,
        });

        // (후처리 로직 강화 1) 평면과 카메라 사이 최대 거리 조건
        const maxPlaneDistance = 5; // 5미터 이상이면 무시
        if (candidatePosition.distanceTo(camera.position) > maxPlaneDistance) {
          setStablePlane(false);
          setPlaneConfidence(0);
          return;
        }

        // 후보 평면 업데이트: 원 중심과의 거리가 충분하고, facingWeight와 수직성이 만족되어야 함
        if (centerDistance < centerDistanceThreshold && facingWeight > 0 && isVertical) {
          let newConfidence = prevPlaneMatrix.current
            ? (matrixDiff(prevPlaneMatrix.current, newMatrix) < 0.1
                ? planeConfidence + facingWeight
                : facingWeight)
            : facingWeight;
          setPlaneConfidence(newConfidence);
          prevPlaneMatrix.current = newMatrix.clone();

          // 매 프레임 선형 보간을 통해 후보 평면 업데이트
          candidatePlaneMatrix.current.decompose(candidatePos, candidateQuat, candidateScale);
          newMatrix.decompose(tempVec1, tempQuat1, tempScale1);
          candidatePos.lerp(tempVec1, 0.1);
          candidateQuat.slerp(tempQuat1, 0.1);
          candidateScale.lerp(tempScale1, 0.1);
          candidatePlaneMatrix.current.compose(candidatePos, candidateQuat, candidateScale);

          // 좌표계 보정을 위해 applyPose와 유사한 방식 적용:
          // 회전: x 성분 반전, 이동: y,z 성분 반전
          candidateQuat.set(-candidateQuat.x, candidateQuat.y, candidateQuat.z, candidateQuat.w);
          candidatePos.set(candidatePos.x, -candidatePos.y, -candidatePos.z);

          console.log("Updated candidatePlaneMatrix Position:", candidatePos);

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

    // 평면 표시 (객체 anchoring 전까지 후보 평면 업데이트)
    if (!planeFound && planeRef.current) {
      if (stablePlane) {
        candidatePlaneMatrix.current.decompose(candidatePos, candidateQuat, candidateScale);
        // 보정 적용: 회전, 위치 모두 applyPose와 유사하게 보정
        candidateQuat.set(-candidateQuat.x, candidateQuat.y, candidateQuat.z, candidateQuat.w);
        candidatePos.set(candidatePos.x, -candidatePos.y, -candidatePos.z);

        // 회전 보정 추가 (필요 시 Y축 기준 90도 회전 적용)
        localNormal.set(0, 0, 1);
        tempQuat1.copy(candidateQuat);
        tempVec2.copy(localNormal).applyQuaternion(tempQuat1);
        camDir.subVectors(camera.position, candidatePos).normalize();
        if (tempVec2.dot(camDir) < 0) {
          flipQuat.set(0, 0, 0, 1);
          flipQuat.setFromAxisAngle(dummy, Math.PI / 2);
          candidateQuat.multiply(flipQuat);
        }
        planeRef.current.position.copy(candidatePos);
        planeRef.current.quaternion.copy(candidateQuat);
        // 오브젝트의 스케일 보정:
        // 캔버스 내 빨간 원의 반지름(circleR)과 후보 평면의 스케일(candidateScale.x)을 비교하여 보정 계수를 적용.
        const someReference = 50; // 기준값 (테스트 후 조정)
        const canvasScaleFactor = circleR / someReference;
        planeRef.current.scale.setScalar(3 * canvasScaleFactor);
      } else {
        // 기본 위치 설정: 카메라 앞쪽 일정 거리
        const defaultDistance = 2;
        camDir.set(0, 0, 0);
        camera.getWorldDirection(camDir);
        const defaultPos = camera.position.clone().add(camDir.multiplyScalar(defaultDistance));
        planeRef.current.position.copy(defaultPos);
        planeRef.current.quaternion.copy(camera.quaternion);
        planeRef.current.scale.set(3, 3, 3);
      }
      planeRef.current.visible = true;
    }

    // 평면 확정 요청: 버튼 클릭 시 (객체 anchoring)
    if (!planeFound && requestFinalizePlane) {
      finalPlaneMatrix.current.copy(candidatePlaneMatrix.current);
      setPlaneFound(true);
      console.log("🎉 planeFound => place object");
    }

    // 최종 오브젝트 배치 (평면 확정 후 한 번만 실행)
    if (planeFound && !objectPlaced && objectRef.current) {
      if (!finalObjectPosition.current) {
        finalPlaneMatrix.current.decompose(candidatePos, candidateQuat, candidateScale);
        // 보정 적용: 이동 보정 (y,z 부호 반전)
        candidatePos.set(candidatePos.x, -candidatePos.y, -candidatePos.z);
        candidatePos.y -= objectFootOffset;
        finalObjectPosition.current = candidatePos.clone();
      }
      if (x) {
        finalObjectPosition.current.x += x;
      }
      if (y) {
        finalObjectPosition.current.y += y;
      }
      if (z) {
        finalObjectPosition.current.z += z;
      }
      if (finalObjectPosition.current) {
        objectRef.current.position.copy(finalObjectPosition.current);
        // 오브젝트 회전: 평면의 회전값에 보정 적용
        finalPlaneMatrix.current.decompose(tempVec1, tempQuat1, tempScale1);
        // 회전 보정: x 성분 반전, 그리고 Y축 기준 90도 회전 적용
        tempQuat1.set(-tempQuat1.x, tempQuat1.y, tempQuat1.z, tempQuat1.w);
        flipQuat.set(0, 0, 0, 1);
        flipQuat.setFromAxisAngle(dummy, Math.PI / 2);
        tempQuat1.multiply(flipQuat);
        objectRef.current.quaternion.copy(tempQuat1);
        // 오브젝트 스케일 보정: 후보 평면 스케일과 빨간 원의 비교로 보정
        const someReference = 50; // 기준값 (테스트 후 조정)
        const canvasScaleFactor = circleR / someReference;
        objectRef.current.scale.setScalar(scale * canvasScaleFactor);
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
