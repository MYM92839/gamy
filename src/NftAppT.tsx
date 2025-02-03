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

// --- 전역 임시 객체들 ---
const cameraForward = new THREE.Vector3();
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

const newMat = new THREE.Matrix4();

/** =============== 유틸 함수들 ============== **/

/**
 * getPlaneDOMCenter
 * SLAM에서 반환한 평면 행렬(4x4)을 분해하여, 해당 평면 중심을 카메라 투영 좌표로 변환한 후
 * DOM 좌표 (픽셀 단위)로 변환합니다.
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
  // 투영 변환 (Normalized Device Coordinates, NDC)
  pos.project(camera);
  // NDC [-1, 1]을 DOM 좌표로 변환 (예: domWidth x domHeight)
  const halfVw = videoWidth / 2;
  const halfVh = videoHeight / 2;
  const videoX = (pos.x * halfVw) + halfVw;
  const videoY = (-pos.y * halfVh) + halfVh;
  // 영상에서 DOM으로의 스케일 변환
  const scaleX = domWidth / videoWidth;
  const scaleY = domHeight / videoHeight;
  return { x: videoX * scaleX, y: videoY * scaleY };
}

/** 두 Matrix4의 차이를 계산 (위치, 회전 변화량) */
function matrixDiff(m1: THREE.Matrix4, m2: THREE.Matrix4) {
  pos.set(0, 0, 0);
  pos.set(0, 0, 0);
  rot.set(0, 0, 0, 1);
  sca.set(0, 0, 0);
  m1.decompose(pos, rot, sca);
  const pos1 = pos.clone();
  m2.decompose(pos, rot, sca);
  const pos2 = pos.clone();
  const posDiff = pos1.distanceTo(pos2);

  // 회전의 내적을 통해 유사도를 계산하고, 차이를 반영
  const dot = Math.abs(rot.dot(rot));
  const rotDiff = 1 - dot;
  return posDiff + rotDiff;
}

/**
 * scaleMatrixTranslation
 * 평면 행렬의 translation 요소(12,13,14 인덱스)에 scaleFactor를 곱해 단위 보정을 적용합니다.
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

/** ============= CameraTracker 컴포넌트 ============= */
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
  onDebugUpdate?: (info: any) => void;
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
  onDebugUpdate,
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
  // URL query로부터 scale, x, y, z, t 등을 읽어옵니다.
  const scale = parseFloat(searchParams.get('scale') || '1');
  const x = parseFloat(searchParams.get('x') || '0');
  const y = parseFloat(searchParams.get('y') || '0');
  const z = parseFloat(searchParams.get('z') || '0');
  const t = parseFloat(searchParams.get('t') || '0');

  const { alvaAR } = useSlam();
  const applyPose = useRef<any>(null);

  // 안정도 누적 임계값 (조금 낮게)
  const planeConfidenceThreshold = 3;
  const [planeConfidence, setPlaneConfidence] = useState(0);
  const prevPlaneMatrix = useRef<THREE.Matrix4 | null>(null);
  const candidatePlaneMatrix = useRef(new THREE.Matrix4());
  const finalPlaneMatrix = useRef(new THREE.Matrix4());
  const finalObjectPosition = useRef<THREE.Vector3 | null>(null);
  const planeRef = useRef<THREE.Mesh>(null);
  const objectRef = useRef<THREE.Group>(null);
  const [objectPlaced, setObjectPlaced] = useState(false);
  // translation 보정: SLAM이 센티미터 단위로 반환한다고 가정 → 0.01 (미터)
  const translationScale = 0.01;
  const objectFootOffset = 0.5; // 모델에 따라 조정

  // 임시 캔버스 생성 (비디오 프레임을 캡쳐하기 위함)
  const tmpCanvasRef = useRef<HTMLCanvasElement | null>(null);
  if (!tmpCanvasRef.current) {
    tmpCanvasRef.current = document.createElement('canvas');
  }
  const tmpCtx = useRef<CanvasRenderingContext2D | null>(null);

  useEffect(() => {
    if (alvaAR) {
      // applyPose: SLAM과 Three.js의 좌표계 차이를 보정하는 함수
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

    // 카메라 포즈 업데이트: applyPose 함수를 통해 좌표계 보정
    if (frame && alvaAR) {
      const camPose = alvaAR.findCameraPose(frame);
      if (camPose) {
        applyPose.current(camPose, camera.quaternion, camera.position);
        setCameraPosition(camera.position.clone());
      }
    }

    // 평면 인식 및 후보 평면 업데이트 (평면 배치 전)
    if (!planeFound && alvaAR) {
      const planePose = alvaAR.findPlane(frame);
      if (planePose) {
        matt.identity();
        let newMatrix = matt.fromArray(planePose);
        newMatrix = scaleMatrixTranslation(newMatrix, translationScale);

        // 평면 중심을 DOM 좌표로 변환
        const { x: domCenterX, y: domCenterY } = getPlaneDOMCenter(
          newMatrix,
          camera as THREE.PerspectiveCamera,
          video?.videoWidth || videoWidth,
          video?.videoHeight || videoHeight,
          domWidth,
          domHeight
        );
        // 빨간 원 중심과의 거리 계산 (픽셀 단위)
        const dx = domCenterX - circleX;
        const dy = domCenterY - circleY;
        const centerDistance = Math.sqrt(dx * dx + dy * dy);

        // 원래 조건은 circleR * 1.5였으나, 디버그 로그에 따르면 값이 너무 큽니다.
        // 여기서는 환경에 맞게 threshold를 circleR * 3로 조정합니다.
        const centerDistanceThreshold = circleR * 3;

        // 평면 행렬 분해: 평면의 중심 위치, 회전, 스케일을 얻음
        newMatrix.decompose(tempVec1, tempQuat1, tempScale1);
        // 평면의 노말 벡터 계산 (SLAM이 반환하는 평면 노말 사용)
        tempVec2.copy(localNormal).applyQuaternion(tempQuat1);

        // 평면이 카메라 앞쪽에 있는지 확인:
        const candidatePosition = tempVec1.clone();
        camera.getWorldDirection(cameraForward);
        camVec.copy(camera.position).sub(candidatePosition);
        if (camVec.lengthSq() === 0 || tempVec2.lengthSq() === 0) return;
        camVec.normalize();
        let dot = tempVec2.dot(camVec);
        if (isNaN(dot)) {
          console.warn("dot is NaN", { camVec, tempVec2 });
          return;
        }
        // effectiveDot: 평면이 카메라를 향하는 정도 (절대값 사용)
        const effectiveDot = Math.abs(dot);
        onDotValueChange?.(effectiveDot);

        // facingWeight: 카메라가 평면을 정면으로 바라보는 정도
        const FACING_THRESHOLD = (t !== undefined && t > 0) ? t : 0.4;
        let facingWeight = effectiveDot > FACING_THRESHOLD
          ? (effectiveDot - FACING_THRESHOLD) / (1 - FACING_THRESHOLD)
          : 0;

        // 평면의 수직성 검사 (카메라 높이에 따라 임계값 조정)
        const dynamicVerticalThreshold = camera.position.y < 1.5 ? 0.35 : 0.3;
        const verticality = Math.abs(tempVec2.dot(up));
        const isVertical = verticality < dynamicVerticalThreshold;

        // 디버깅 정보 업데이트
        if (onDebugUpdate) {
          onDebugUpdate({
            centerDistance: centerDistance.toFixed(2),
            dot: dot.toFixed(2),
            effectiveDot: effectiveDot.toFixed(2),
            facingWeight: facingWeight.toFixed(2),
            verticality: verticality.toFixed(2),
            dynamicVerticalThreshold: dynamicVerticalThreshold.toFixed(2)
          });
        }

        // 평면과 카메라 사이의 최대 거리가 5미터를 넘으면 무시
        if (candidatePosition.distanceTo(camera.position) > 5) {
          setStablePlane(false);
          setPlaneConfidence(0);
          return;
        }

        // 조건: 중심 거리, facingWeight, 수직성이 모두 만족해야 후보 평면으로 채택
        if (centerDistance < centerDistanceThreshold && facingWeight > 0 && isVertical) {
          let newConfidence = prevPlaneMatrix.current
            ? (matrixDiff(prevPlaneMatrix.current, newMatrix) < 0.1
                ? planeConfidence + facingWeight
                : facingWeight)
            : facingWeight;
          setPlaneConfidence(newConfidence);
          prevPlaneMatrix.current = newMatrix.clone();

          // 매 프레임 선형 보간으로 후보 평면 업데이트
          candidatePlaneMatrix.current.decompose(candidatePos, candidateQuat, candidateScale);
          newMatrix.decompose(tempVec1, tempQuat1, tempScale1);
          candidatePos.lerp(tempVec1, 0.1);
          candidateQuat.slerp(tempQuat1, 0.1);
          candidateScale.lerp(tempScale1, 0.1);
          candidatePlaneMatrix.current.compose(candidatePos, candidateQuat, candidateScale);

          // 좌표계 보정: SLAM과 Three.js의 차이를 보정 (예: 회전의 x만, 이동의 y, z만 반전)
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

    // 평면 표시 업데이트
    if (!planeFound && planeRef.current) {
      if (stablePlane) {
        candidatePlaneMatrix.current.decompose(candidatePos, candidateQuat, candidateScale);
        // 동일 보정 적용
        candidateQuat.set(-candidateQuat.x, candidateQuat.y, candidateQuat.z, candidateQuat.w);
        candidatePos.set(candidatePos.x, -candidatePos.y, -candidatePos.z);

        // 추가 Y축 기준 90도 회전 보정 (필요시)
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
        // 스케일 보정: 빨간 원 반지름과 기준값(someReference)을 비교
        const someReference = 50; // 필요에 따라 조정
        const canvasScaleFactor = circleR / someReference;
        planeRef.current.scale.setScalar(3 * canvasScaleFactor);
      } else {
        // 평면이 안정적이지 않을 경우, 카메라 앞쪽 기본 위치 설정
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

    // 평면 확정 요청 (버튼 클릭 시)
    if (!planeFound && requestFinalizePlane) {
      finalPlaneMatrix.current.copy(candidatePlaneMatrix.current);
      setPlaneFound(true);
      console.log("🎉 planeFound => place object");
    }

    // 최종 오브젝트 배치 (평면 확정 후 한 번만 실행)
    if (planeFound && !objectPlaced && objectRef.current) {
      if (!finalObjectPosition.current) {
        finalPlaneMatrix.current.decompose(candidatePos, candidateQuat, candidateScale);
        // 이동 보정 (좌표계 보정과 유사)
        candidatePos.set(candidatePos.x, -candidatePos.y, -candidatePos.z);
        candidatePos.y -= objectFootOffset;
        finalObjectPosition.current = candidatePos.clone();
      }
      if (x) finalObjectPosition.current.x += x;
      if (y) finalObjectPosition.current.y += y;
      if (z) finalObjectPosition.current.z += z;
      if (finalObjectPosition.current) {
        objectRef.current.position.copy(finalObjectPosition.current);
        finalPlaneMatrix.current.decompose(tempVec1, tempQuat1, tempScale1);
        // 회전 보정: x만 반전 후 Y축 기준 90도 회전 적용
        tempQuat1.set(-tempQuat1.x, tempQuat1.y, tempQuat1.z, tempQuat1.w);
        flipQuat.set(0, 0, 0, 1);
        flipQuat.setFromAxisAngle(dummy, Math.PI / 2);
        tempQuat1.multiply(flipQuat);
        objectRef.current.quaternion.copy(tempQuat1);
        // 오브젝트 스케일 보정: 빨간 원 반지름과 기준값 비교
        const someReference = 50;
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
  const [debugInfo, setDebugInfo] = useState<any>({});

  useEffect(() => {
    requestCameraPermission();
  }, []);

  const domWidth = 360;
  const domHeight = 640;
  const circleX = domWidth / 2;
  const circleY = domHeight / 2;
  const circleR = 100; // 기본 빨간 원 반지름
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
      {/* 디버그 패널 */}
      <div
        style={{
          position: 'fixed',
          bottom: '0',
          left: '0',
          zIndex: 100000,
          background: 'rgba(0,0,0,0.7)',
          color: 'white',
          padding: '10px',
          fontSize: '12px',
          maxHeight: '300px',
          overflowY: 'auto'
        }}
      >
        <pre>{JSON.stringify(
          {
            cameraPosition: {
              x: cameraPosition.x.toFixed(2),
              y: cameraPosition.y.toFixed(2),
              z: cameraPosition.z.toFixed(2)
            },
            objectPosition: {
              x: objectPosition.x.toFixed(2),
              y: objectPosition.y.toFixed(2),
              z: objectPosition.z.toFixed(2)
            },
            planeConfidence,
            planeFound,
            stablePlane,
            dotValue: dotValue.toFixed(2),
            debugInfo
          },
          null,
          2
        )}</pre>
      </div>
      {/* 평면 디버그용 SVG (빨간 원) */}
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
            setPlaneVisible={() => {}}
            planeFound={planeFound}
            setPlaneFound={setPlaneFound}
            stablePlane={stablePlane}
            setStablePlane={setStablePlane}
            requestFinalizePlane={requestFinalizePlane}
            setCameraPosition={(pos) => setCameraPosition(pos)}
            setObjectPosition={(pos) => setObjectPosition(pos)}
            onPlaneConfidenceChange={(val) => setPlaneConfidence(val)}
            onDotValueChange={(val) => setDotValue(val)}
            onDebugUpdate={(info) => setDebugInfo(info)}
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
