import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useParams, useSearchParams } from 'react-router-dom';
import { useFrame } from '@react-three/fiber';

import SlamCanvas from './libs/arnft/arnft/components/SlamCanvas';
import { requestCameraPermission } from './libs/util';
import { AlvaARConnectorTHREE } from './libs/alvaConnector';
import { useSlam } from './libs/SLAMProvider';

import Back from './assets/icons/Back';
import { Box, Tree } from './ArApp';

// --- 전역 임시 객체들 ---
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

/** =============== 유틸 함수들 ============== **/
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

function scaleMatrixTranslation(matrix: THREE.Matrix4, scaleFactor: number): THREE.Matrix4 {
  const elements = matrix.elements.slice();
  elements[12] *= scaleFactor;
  elements[13] *= scaleFactor;
  elements[14] *= scaleFactor;
  newMat.identity();
  newMat.fromArray(elements);
  return newMat;
}

/** ============= CameraTracker 컴포넌트 (첫 번째 로직) ============= */
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
  // const x = parseFloat(searchParams.get('x') || '0');
  // const y = parseFloat(searchParams.get('y') || '0');
  // const z = parseFloat(searchParams.get('z') || '0');
  const t = parseFloat(searchParams.get('t') || '0');

  const { alvaAR } = useSlam();
  const applyPose = useRef<any>(null);

  // 추가: 초기 후보 평면 위치를 저장하는 ref
  const initialCandidatePos = useRef<THREE.Vector3 | null>(null);

  const [planeConfidence, setPlaneConfidence] = useState(0);
  const planeConfidenceThreshold = 5;
  const prevPlaneMatrix = useRef<THREE.Matrix4 | null>(null);
  const candidatePlaneMatrix = useRef(new THREE.Matrix4());
  const finalPlaneMatrix = useRef(new THREE.Matrix4());
  const finalObjectPosition = useRef<THREE.Vector3 | null>(null);
  const planeRef = useRef<THREE.Mesh>(null);
  const objectRef = useRef<THREE.Group>(null);
  const [objectPlaced, setObjectPlaced] = useState(false);
  const translationScale = 0.01;
  const objectFootOffset = 0.5;

  const tmpCanvasRef = useRef<HTMLCanvasElement | null>(null);
  if (!tmpCanvasRef.current) {
    tmpCanvasRef.current = document.createElement('canvas');
  }
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
        applyPose.current(camPose, camera.quaternion, camera.position);
        setCameraPosition(camera.position.clone());
      }
    }

    // 평면 인식 및 후보 평면 업데이트
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
        const dx = domCenterX - circleX;
        const dy = domCenterY - circleY;
        const centerDistance = Math.sqrt(dx * dx + dy * dy);
        const centerDistanceThreshold = circleR * 1.5;

        newMatrix.decompose(tempVec1, tempQuat1, tempScale1);

        // 평면 노말 구하기
        tempVec2.copy(localNormal).applyQuaternion(tempQuat1);

        // 평면이 카메라 앞쪽(시야 내)에 있는지 검사
        const candidatePosition = tempVec1.clone();
        const cameraForward = new THREE.Vector3();
        camera.getWorldDirection(cameraForward);
        const camToPlane = candidatePosition.clone().sub(camera.position);
        if (camToPlane.dot(cameraForward) <= 0) {
          setStablePlane(false);
          setPlaneConfidence(0);
          return;
        }

        // 최대 거리 조건
        const maxPlaneDistance = 5;
        if (candidatePosition.distanceTo(camera.position) > maxPlaneDistance) {
          setStablePlane(false);
          setPlaneConfidence(0);
          return;
        }

        // 카메라와 평면 간의 벡터 계산 (카메라가 평면을 바라보는 방향)
        camVec.subVectors(camera.position, tempVec1).normalize();
        const dot = tempVec2.dot(camVec);
        const effectiveDot = -dot;
        onDotValueChange?.(effectiveDot);

        const FACING_THRESHOLD = (t !== undefined && t > 0) ? t : 0.4;
        let facingWeight = 0;
        if (effectiveDot > FACING_THRESHOLD) {
          facingWeight = (effectiveDot - FACING_THRESHOLD) / (1 - FACING_THRESHOLD);
        }

        // 수직성 검사: 평면이 수직(벽처럼)인 경우, up 벡터와의 내적 절대값이 0.3 미만이어야 함
        const verticality = Math.abs(tempVec2.dot(up));
        const isVertical = verticality < 0.3;

        console.log("Plane Debug:", {
          centerDistance: centerDistance.toFixed(2),
          dot: dot.toFixed(2),
          effectiveDot: effectiveDot.toFixed(2),
          facingWeight: facingWeight.toFixed(2),
          verticality: verticality.toFixed(2),
          isVertical,
        });

        // 후보 평면 업데이트 조건 (복합 조건)
        if (centerDistance < centerDistanceThreshold && facingWeight > 0 && isVertical) {
          // 오프셋 계산을 위한 초기 후보 저장 (최초 안정 평면이 잡힐 때)
          if (!initialCandidatePos.current) {
            initialCandidatePos.current = candidatePos.clone();
          }
          // 후보 평면 업데이트 보간
          candidatePlaneMatrix.current.decompose(candidatePos, candidateQuat, candidateScale);
          newMatrix.decompose(tempVec1, tempQuat1, tempScale1);
          candidatePos.lerp(tempVec1, 0.1);
          candidateQuat.slerp(tempQuat1, 0.1);
          candidateScale.lerp(tempScale1, 0.1);
          candidatePlaneMatrix.current.compose(candidatePos, candidateQuat, candidateScale);

          // 오프셋: 최초 안정 후보와 현재 후보의 차이 계산
          const offset = new THREE.Vector3().subVectors(candidatePos, initialCandidatePos.current);
          console.log("Offset:", offset.toArray());

          // 누적 안정도 판단 (예시: matrixDiff 조건)
          let newConfidence = prevPlaneMatrix.current
            ? (matrixDiff(prevPlaneMatrix.current, newMatrix) < 0.1
                ? planeConfidence + facingWeight
                : facingWeight)
            : facingWeight;
          setPlaneConfidence(newConfidence);
          prevPlaneMatrix.current = newMatrix.clone();

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

    // 평면 메시 업데이트 (후보 평면 표시)
    if (!planeFound && planeRef.current) {
      if (stablePlane) {
        candidatePlaneMatrix.current.decompose(candidatePos, candidateQuat, candidateScale);
        candidateQuat.set(-candidateQuat.x, candidateQuat.y, candidateQuat.z, candidateQuat.w);
        candidatePos.set(candidatePos.x, -candidatePos.y, -candidatePos.z);

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
        planeRef.current.scale.set(3, 3, 3);
      } else {
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

    // 오브젝트 배치: 평면 확정 후, 최종 후보 평면 위치에서 오프셋 보정을 적용하여 오브젝트 배치
    if (planeFound && !objectPlaced && objectRef.current) {
      // 최종 후보 평면의 위치를 기준으로 오브젝트 배치 (초기 후보 오프셋 적용)
      finalPlaneMatrix.current.decompose(candidatePos, candidateQuat, candidateScale);
      // 오프셋 적용: 초기 후보 평면 위치와 현재 후보 평면 위치 차이를 최종 위치에 반영
      let offset = new THREE.Vector3(0, 0, 0);
      if (initialCandidatePos.current) {
        offset = new THREE.Vector3().subVectors(candidatePos, initialCandidatePos.current);
      }
      candidatePos.add(offset);
      candidatePos.y -= objectFootOffset;
      finalObjectPosition.current = candidatePos.clone();

      objectRef.current.position.copy(finalObjectPosition.current);
      finalPlaneMatrix.current.decompose(tempVec1, tempQuat1, tempScale1);
      tempQuat1.set(-tempQuat1.x, tempQuat1.y, tempQuat1.z, tempQuat1.w);
      flipQuat.set(0, 0, 0, 1);
      flipQuat.setFromAxisAngle(dummy, Math.PI / 2);
      tempQuat1.multiply(flipQuat);
      objectRef.current.quaternion.copy(tempQuat1);
      objectRef.current.scale.setScalar(scale);
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
