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
 * SLAM에서 반환한 평면 행렬(4x4)을 분해하여, 평면 중심을 카메라 투영 좌표로 변환한 후
 * DOM 좌표(픽셀 단위)로 변환합니다.
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
  // 투영 변환 (NDC)
  pos.project(camera);
  const halfVw = videoWidth / 2;
  const halfVh = videoHeight / 2;
  const videoX = (pos.x * halfVw) + halfVw;
  const videoY = (-pos.y * halfVh) + halfVh;
  const scaleX = domWidth / videoWidth;
  const scaleY = domHeight / videoHeight;
  return { x: videoX * scaleX, y: videoY * scaleY };
}

/** 두 Matrix4의 차이를 계산 (위치와 회전 변화량) */
function matrixDiff(m1: THREE.Matrix4, m2: THREE.Matrix4) {
  const pos1 = new THREE.Vector3();
  const pos2 = new THREE.Vector3();
  const quat1 = new THREE.Quaternion();
  const quat2 = new THREE.Quaternion();
  const scale1 = new THREE.Vector3();
  const scale2 = new THREE.Vector3();
  m1.decompose(pos1, quat1, scale1);
  m2.decompose(pos2, quat2, scale2);
  const posDiff = pos1.distanceTo(pos2);
  const dot = Math.abs(quat1.dot(quat2));
  const rotDiff = 1 - dot;
  return posDiff + rotDiff;
}

/**
 * scaleMatrixTranslation
 * 평면 행렬의 translation 요소(인덱스 12, 13, 14)에 scaleFactor를 곱해 단위 보정.
 */
function scaleMatrixTranslation(matrix: THREE.Matrix4, scaleFactor: number): THREE.Matrix4 {
  const elements = matrix.elements.slice();
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
  const scale = parseFloat(searchParams.get('scale') || '1');
  const x = parseFloat(searchParams.get('x') || '0');
  const y = parseFloat(searchParams.get('y') || '0');
  const z = parseFloat(searchParams.get('z') || '0');
  const t = parseFloat(searchParams.get('t') || '0');

  const { alvaAR } = useSlam();
  const applyPose = useRef<any>(null);

  // 안정도 임계값 (누적 조건을 완화)
  const planeConfidenceThreshold = 3;
  const [planeConfidence, setPlaneConfidence] = useState(0);
  const prevPlaneMatrix = useRef<THREE.Matrix4 | null>(null);
  const candidatePlaneMatrix = useRef(new THREE.Matrix4());
  const finalPlaneMatrix = useRef(new THREE.Matrix4());
  const finalObjectPosition = useRef<THREE.Vector3 | null>(null);
  const planeRef = useRef<THREE.Mesh>(null);
  const objectRef = useRef<THREE.Group>(null);
  const [objectPlaced, setObjectPlaced] = useState(false);
  // SLAM 결과가 센티미터 단위로 반환한다고 가정 → 0.01을 곱해 미터 단위로 보정
  const translationScale = 0.01;
  const objectFootOffset = 0.5;

  // 임시 캔버스 생성 (비디오 프레임 캡쳐용)
  const tmpCanvasRef = useRef<HTMLCanvasElement | null>(null);
  if (!tmpCanvasRef.current) {
    tmpCanvasRef.current = document.createElement('canvas');
  }
  const tmpCtx = useRef<CanvasRenderingContext2D | null>(null);

  useEffect(() => {
    if (alvaAR) {
      // applyPose: SLAM과 Three.js 좌표계 차이를 보정하는 함수
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

    // 카메라 포즈 업데이트 (applyPose로 보정)
    if (frame && alvaAR) {
      const camPose = alvaAR.findCameraPose(frame);
      if (camPose) {
        applyPose.current(camPose, camera.quaternion, camera.position);
        setCameraPosition(camera.position.clone());
      }
    }

    // 평면 인식: SLAM으로부터 평면 행렬을 수신
    if (!planeFound && alvaAR) {
      const planePose = alvaAR.findPlane(frame);
      if (planePose) {
        matt.identity();
        let newMatrix = matt.fromArray(planePose);
        newMatrix = scaleMatrixTranslation(newMatrix, translationScale);

        // 평면 중심의 DOM 좌표 계산
        const { x: domCenterX, y: domCenterY } = getPlaneDOMCenter(
          newMatrix,
          camera as THREE.PerspectiveCamera,
          video?.videoWidth || videoWidth,
          video?.videoHeight || videoHeight,
          domWidth,
          domHeight
        );
        // 화면상의 빨간 원 중심과 평면 중심 사이의 거리 (픽셀 단위)
        const dx = domCenterX - circleX;
        const dy = domCenterY - circleY;
        const centerDistance = Math.sqrt(dx * dx + dy * dy);
        // **새 조건:** 평면의 투영이 빨간 원을 "완전히 덮는다"는 조건으로,
        // 평면 중심이 빨간 원 내부에 거의 위치하면 안정한 평면으로 판단.
        // 여기서는 centerDistance가 빨간 원 반지름의 30% 미만이면 조건 만족.
        if (centerDistance < circleR * 0.3) {
          setStablePlane(true);
          setPlaneConfidence(1);
          // 평면 정보 업데이트 (후보 평면으로 저장)
          newMatrix.decompose(candidatePos, candidateQuat, candidateScale);
          // 좌표계 보정: SLAM 결과와 Three.js 좌표계 차이를 보정 (예: 회전의 x, 위치의 y,z 반전)
          candidateQuat.set(-candidateQuat.x, candidateQuat.y, candidateQuat.z, candidateQuat.w);
          candidatePos.set(candidatePos.x, -candidatePos.y, -candidatePos.z);
          candidatePlaneMatrix.current.copy(newMatrix);
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

    // 평면 메시(planeRef) 업데이트: 화면에 평면을 표시
    if (!planeFound && planeRef.current) {
      if (stablePlane) {
        candidatePlaneMatrix.current.decompose(candidatePos, candidateQuat, candidateScale);
        candidateQuat.set(-candidateQuat.x, candidateQuat.y, candidateQuat.z, candidateQuat.w);
        candidatePos.set(candidatePos.x, -candidatePos.y, -candidatePos.z);
        // 추가 보정: Y축 기준 90도 회전 보정 (필요 시)
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
        // 스케일 보정: 빨간 원 반지름(circleR)과 기준값(someReference)을 사용
        const someReference = 50;
        const canvasScaleFactor = circleR / someReference;
        planeRef.current.scale.setScalar(3 * canvasScaleFactor);
      } else {
        // 안정된 평면이 없으면 기본적으로 카메라 앞쪽 고정 거리 사용
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

    // 평면 확정 요청: 사용자가 버튼을 누르면 후보 평면을 최종 평면으로 고정
    if (!planeFound && requestFinalizePlane) {
      finalPlaneMatrix.current.copy(candidatePlaneMatrix.current);
      setPlaneFound(true);
      console.log("🎉 planeFound => place object");
    }

    // **오브젝트 배치 (새로운 제안 적용)**
    // "카메라와 오브젝트 사이의 거리는 항상 고정"되어 있다고 가정하고,
    // 카메라 위치와 후보 평면 중심(candidatePos)을 이용해 오브젝트의 최종 위치를 계산.
    if (planeFound && !objectPlaced && objectRef.current) {
      // 고정 거리 (예: 1.5미터)
      const fixedDistance = 1.5;
      // 카메라에서 후보 평면 중심까지의 방향 벡터
      const direction = new THREE.Vector3().subVectors(candidatePos, camera.position).normalize();
      // 오브젝트 최종 위치: 카메라 위치 + (direction * fixedDistance)
      const computedObjectPos = new THREE.Vector3().copy(camera.position).add(direction.multiplyScalar(fixedDistance));
      // 필요 시 Y축 오프셋 적용 (모델에 따라)
      computedObjectPos.y -= objectFootOffset;
      finalObjectPosition.current = computedObjectPos.clone();

      objectRef.current.position.copy(finalObjectPosition.current);
      // 평면의 회전 정보를 이용하여 오브젝트 회전 보정 (applyPose와 유사)
      finalPlaneMatrix.current.decompose(tempVec1, tempQuat1, tempScale1);
      tempQuat1.set(-tempQuat1.x, tempQuat1.y, tempQuat1.z, tempQuat1.w);
      flipQuat.set(0, 0, 0, 1);
      flipQuat.setFromAxisAngle(dummy, Math.PI / 2);
      tempQuat1.multiply(flipQuat);
      objectRef.current.quaternion.copy(tempQuat1);
      // 오브젝트 스케일 보정: URL scale과 빨간 원 반지름 기준 보정
      const someReference = 50;
      const canvasScaleFactor = circleR / someReference;
      objectRef.current.scale.setScalar(scale * canvasScaleFactor);
      setObjectPosition(finalObjectPosition.current.clone());
      setObjectPlaced(true);
      console.log("✅ Object placed at final position:", finalObjectPosition.current);
    }

    if (planeRef.current) {
      setPlaneVisible(planeRef.current.visible);
    }
  });

  const isMoons = (char === 'moons');
  return (
    <>
      <mesh ref={planeRef} visible={false}>
        {/* 메시의 기하학적 중심이 (0,0,0)인지 확인하기 위해 geometry.center() 호출 권장 */}
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
