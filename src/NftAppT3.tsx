import { useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import * as THREE from 'three';

import { AlvaARConnectorTHREE } from './libs/alvaConnector';
import SlamCanvas from './libs/arnft/arnft/components/SlamCanvas';
import { useSlam } from './libs/SLAMProvider';
import { requestCameraPermission } from './libs/util';

import { Box, Tree } from './ArApp';
import Back from './assets/icons/Back';

// --- 전역 임시 객체들 ---
const tempVec1 = new THREE.Vector3();
const tempVec2 = new THREE.Vector3();
const tempQuat1 = new THREE.Quaternion();
const tempScale1 = new THREE.Vector3();

const candidatePos = new THREE.Vector3();
const candidateQuat = new THREE.Quaternion();

const localNormal = new THREE.Vector3(0, 0, 1);
const matt = new THREE.Matrix4();
const newMat = new THREE.Matrix4();

/** =============== 유틸 함수들 ============== **/
/**
 * 평면 행렬의 translation 부분에 scaleFactor를 곱해 단위 보정 (예: 센티미터 → 미터)
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

/** ============= CameraTracker 컴포넌트 (수직성만 이용, 보정 및 dot값 예외 처리) ============= */
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
  // 디버그 데이터를 외부에 전달하기 위한 콜백 (추가)
  onDebugUpdate?: (debug: DebugData) => void;
}

export interface DebugData {
  candidatePos: number[];
  candidateQuat: number[];
  cameraPosition: number[];
  planeConfidence: number;
  dotValue: number;
}

function CameraTracker({
  planeFound,
  setPlaneFound,
  setStablePlane,
  requestFinalizePlane,
  setCameraPosition,
  setObjectPosition,
  onPlaneConfidenceChange,
  setPlaneVisible,
  onDotValueChange,
  videoWidth,
  videoHeight,
  onDebugUpdate,
}: CameraTrackerProps) {
  const { char } = useParams();
  const [searchParams] = useSearchParams();
  const scale = parseFloat(searchParams.get('scale') || '1');
  const X = parseFloat(searchParams.get('x') || '0');
  const Y = parseFloat(searchParams.get('y') || '0');
  const Z = parseFloat(searchParams.get('z') || '0');

  const { alvaAR } = useSlam();
  const applyPose = useRef<any>(null);

  // 초기 후보 평면 위치 및 회전 저장 (오프셋 보정에 사용)
  const initialCandidatePos = useRef<THREE.Vector3 | null>(null);
  const initialCandidateQuat = useRef<THREE.Quaternion | null>(null);

  const [planeConfidence, setPlaneConfidence] = useState(0);
  const candidatePlaneMatrix = useRef(new THREE.Matrix4());
  const finalPlaneMatrix = useRef(new THREE.Matrix4());
  const finalObjectPosition = useRef<THREE.Vector3 | null>(null);
  const planeRef = useRef<THREE.Mesh>(null);
  const objectRef = useRef<THREE.Group>(null);
  const [objectPlaced, setObjectPlaced] = useState(false);

  // translationScale 값을 SLAM의 단위에 맞게 조정 (여기서는 0.01로 설정)
  const translationScale = 1;
  const objectFootOffset = 0.5;
  const fixedDistance = 1.5; // 카메라와 오브젝트 사이의 고정 거리

  const tmpCanvasRef = useRef<HTMLCanvasElement | null>(null);
  if (!tmpCanvasRef.current) tmpCanvasRef.current = document.createElement('canvas');
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
      if (!tmpCtx.current) tmpCtx.current = tmpCanvas.getContext('2d');
      tmpCtx.current?.drawImage(video, 0, 0, tmpCanvas.width, tmpCanvas.height);
      frame = tmpCtx.current?.getImageData(0, 0, tmpCanvas.width, tmpCanvas.height);
    }

    // 카메라 포즈 업데이트 (SLAM 적용)
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

        // 평면 행렬 분해
        newMatrix.decompose(tempVec1, tempQuat1, tempScale1);
        // 평면 노말 계산 (기본 (0,0,1)에 후보 회전 적용)
        tempVec2.copy(localNormal).applyQuaternion(tempQuat1);
        const candidatePosition = tempVec1.clone();
        candidatePos.copy(candidatePosition);

        // 최대 거리 조건: 25미터 이내 (필요에 따라 이 값을 조정)
        if (candidatePosition.distanceTo(camera.position) > 2000) {
          setStablePlane(false);
          setPlaneConfidence(0);
          onDotValueChange?.(0);
          return;
        }

        // 별도의 회전 플립 없이 안정 상태로 처리
        setStablePlane(true);
        setPlaneConfidence(1);
        candidatePlaneMatrix.current.copy(newMatrix);
        // 초기 안정 후보 평면 위치 및 회전 저장 (최초 한 번)
        if (!initialCandidatePos.current) {
          initialCandidatePos.current = candidatePosition.clone();
          initialCandidateQuat.current = tempQuat1.clone();
          console.log("Initial candidate position saved:", initialCandidatePos.current.toArray());
          console.log("Initial candidate rotation saved:", initialCandidateQuat.current.toArray());
        }
        // dot 값 계산: 카메라에서 후보 평면까지의 단위 벡터와 평면 노말 내적
        const camVec = new THREE.Vector3().subVectors(camera.position, candidatePosition).normalize();
        let dot = tempVec2.dot(camVec);
        // 예외 처리: dot이 0이면 평면이 카메라와 직각 관계로 배치된 것으로 판단하여 안정 조건을 만족하도록 함
        if (dot === 0) {
          dot = 1;
        } else if (dot < 0) {
          dot = -dot;
        }
        onDotValueChange?.(dot);
      } else {
        console.log("LOSTSTABLE");
        setStablePlane(false);
        setPlaneConfidence(0);
        onDotValueChange?.(0);
      }
    }

    onPlaneConfidenceChange?.(planeConfidence);

    // 평면 메시 업데이트 (후보 평면 표시)
    if (!planeFound && planeRef.current) {
      // 현재 후보 평면은 별도의 회전 보정 없이 단순히 보이는 용도로 처리
      planeRef.current.visible = true;
    }

    // 평면 확정 요청 (버튼 클릭 시)
    if (!planeFound && requestFinalizePlane) {
      finalPlaneMatrix.current.copy(candidatePlaneMatrix.current);
      setPlaneFound(true);
      console.log("🎉 planeFound => place object");
    }

    // 오브젝트 배치: 평면 확정 후, 고정 거리 보정 및 초기 후보 오프셋 보정을 적용하여 배치
    if (planeFound && !objectPlaced && objectRef.current) {
      // 카메라에서 fixedDistance만큼 떨어진 방향으로 배치
      const direction = new THREE.Vector3().subVectors(candidatePos, camera.position).normalize();
      const computedObjectPos = new THREE.Vector3().copy(camera.position).add(direction.multiplyScalar(fixedDistance));
      computedObjectPos.y -= objectFootOffset;
      finalObjectPosition.current = computedObjectPos.clone();

      objectRef.current.position.copy(finalObjectPosition.current);

      if (X) {
        objectRef.current.position.x = X;
      }
      if (Y) {
        objectRef.current.position.y = Y;
      }
      if (Z) {
        objectRef.current.position.z = Z;
      }

      // 회전 보정: 최종 평면 회전값에 초기 후보 회전 오프셋 보정 적용
      finalPlaneMatrix.current.decompose(tempVec1, tempQuat1, tempScale1);
      tempQuat1.set(-tempQuat1.x, tempQuat1.y, tempQuat1.z, tempQuat1.w);
      if (initialCandidateQuat.current) {
        const rotationOffset = tempQuat1.clone().multiply(initialCandidateQuat.current.clone().invert());
        tempQuat1.multiply(rotationOffset);
      }
      // 추가: 오브젝트가 항상 땅에 붙은(수평) 상태가 되도록 피치와 롤을 0으로 고정 (y축 회전만 남김)
      const euler = new THREE.Euler().setFromQuaternion(tempQuat1, 'YXZ');
      euler.x = 0; // pitch 0
      euler.z = 0; // roll 0
      tempQuat1.setFromEuler(euler);

      // 추가 보정: 오브젝트가 카메라를 바라보도록
      // 오브젝트의 전방 (local Z축)을 구한 후, 카메라 방향과 비교
      const objectForward = new THREE.Vector3(0, 0, 1).applyQuaternion(tempQuat1);
      const toCamera = new THREE.Vector3().subVectors(camera.position, objectRef.current.position).normalize();
      // 내적이 음수이면 오브젝트의 앞이 카메라 반대 방향임 => Y축 기준 180도 회전
      if (objectForward.dot(toCamera) < 0) {
        const correctionQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
        tempQuat1.multiply(correctionQuat);
      }

      objectRef.current.quaternion.copy(tempQuat1);
      objectRef.current.scale.setScalar(scale);
      setObjectPosition(finalObjectPosition.current.clone());
      setObjectPlaced(true);
      console.log("✅ Object placed at final position:", finalObjectPosition.current.toArray());
    }

    if (planeRef.current) {
      setPlaneVisible(planeRef.current.visible);
    }

    // 디버그 정보 업데이트 (필요한 값들을 외부 콜백으로 전달)
    onDebugUpdate?.({
      candidatePos: candidatePos.toArray(),
      candidateQuat: candidateQuat.toArray(),
      cameraPosition: camera.position.toArray(),
      planeConfidence,
      dotValue: onDotValueChange ? onDotValueChange.length : 0, // dot 값을 직접 관리하지 않는다면 별도로 관리하세요.
    });
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
          {isMoons ? <Box onRenderEnd={() => { }} on sposition={[0, 0, 0]} oposition={[0, 0, 0]}  /> : <Tree onRenderEnd={() => { }} on />}
        </group>
      )}
    </>
  );
}

export default function NftAppT3() {
  const [cameraPosition, setCameraPosition] = useState(new THREE.Vector3());
  const [objectPosition, setObjectPosition] = useState(new THREE.Vector3());
  const [planeFound, setPlaneFound] = useState(false);
  const [stablePlane, setStablePlane] = useState(false);
  const [requestFinalizePlane, setRequestFinalizePlane] = useState(false);
  const [planeConfidence, setPlaneConfidence] = useState(0);
  const [dotValue, setDotValue] = useState(0);

  // 디버그 패널 토글 상태
  const [showDebug, setShowDebug] = useState(false);
  // 디버그 정보 상태
  const [debugData, setDebugData] = useState<DebugData | null>(null);

  useEffect(() => {
    requestCameraPermission();
  }, []);

  const domWidth = 360;
  const domHeight = 640;
  const circleX = domWidth / 2;
  const circleY = domHeight / 2;
  const circleR = 100;
  // 평면이 잡히거나 안정 상태이면 파란색으로 표시
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

      {/* 디버그 패널 토글 버튼 */}
      <button
        style={{
          position: 'fixed',
          top: '5rem',
          left: '1rem',
          zIndex: 9999,
          background: 'rgba(0,0,0,0.6)',
          color: 'white',
          border: 'none',
          padding: '0.5rem',
          borderRadius: '4px'
        }}
        onClick={() => setShowDebug((prev) => !prev)}
      >
        {showDebug ? '디버그 숨기기' : '디버그 보기'}
      </button>

      {/* 기존 정보 패널 */}
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

      {/* 디버그 정보 패널 */}
      {showDebug && debugData && (
        <div
          style={{
            position: 'fixed',
            bottom: '1rem',
            left: '1rem',
            zIndex: 9999,
            background: 'rgba(0,0,0,0.8)',
            padding: '10px',
            borderRadius: '8px',
            color: 'white',
            fontSize: '12px',
            maxWidth: '90%',
            maxHeight: '50%',
            overflowY: 'auto'
          }}
        >
          <p><b>Debug Data</b></p>
          <p>Candidate Position: {debugData.candidatePos.map((v) => v.toFixed(2)).join(', ')}</p>
          <p>Candidate Quaternion: {debugData.candidateQuat.map((v) => v.toFixed(2)).join(', ')}</p>
          <p>Camera Position: {debugData.cameraPosition.map((v) => v.toFixed(2)).join(', ')}</p>
          <p>Plane Confidence: {debugData.planeConfidence}</p>
          <p>Dot Value: {debugData.dotValue.toFixed(2)}</p>
        </div>
      )}

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
        <Suspense fallback={null}>
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
            onDebugUpdate={(debug) => setDebugData(debug)}
          />
          <ambientLight />
          <directionalLight position={[100, 100, 0]} />
        </Suspense>
      </SlamCanvas>
    </>
  );
}
