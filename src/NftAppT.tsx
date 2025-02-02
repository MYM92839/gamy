import { useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import * as THREE from 'three';
import { Box, Tree } from './ArApp';
import Back from './assets/icons/Back';
import { AlvaARConnectorTHREE } from './libs/alvaConnector';
import SlamCanvas from './libs/arnft/arnft/components/SlamCanvas';
import { requestCameraPermission } from './libs/util';
import { useSlam, } from './libs/SLAMProvider';

// const m = new THREE.Matrix4()
// const r = new THREE.Quaternion()
// const t = new THREE.Vector3();


// const context = createContext(undefined);
// const currentCameraPosition = new THREE.Vector3();
// const objectPosition = new THREE.Vector3()
/**
 * 유틸: 두 Matrix4 간 위치·회전 차이를 단순 비교
 * diff값이 작을수록 유사하다고 봄
 */
function matrixDiff(m1: THREE.Matrix4, m2: THREE.Matrix4) {
  // position & rotation
  const pos1 = new THREE.Vector3();
  const pos2 = new THREE.Vector3();
  const rot1 = new THREE.Quaternion();
  const rot2 = new THREE.Quaternion();
  const sca1 = new THREE.Vector3();
  const sca2 = new THREE.Vector3();

  m1.decompose(pos1, rot1, sca1);
  m2.decompose(pos2, rot2, sca2);

  // 위치 차이
  const posDiff = pos1.distanceTo(pos2);

  // 회전 차이 (쿼터니언 dot product)
  // dot==1이면 회전이 동일, dot이 낮을수록 회전 차가 큼
  const dot = Math.abs(rot1.dot(rot2));
  const rotDiff = 1 - dot; // 간단 처리(0에 가까울수록 동일)

  // 간단히 둘을 합산
  return posDiff + rotDiff;
}

interface CameraTrackerProps {
  setCameraPosition: (pos: THREE.Vector3) => void;
  setObjectPosition: (pos: THREE.Vector3) => void;
  onPlaneStable: () => void; // plane이 안정되었음을 부모에게 알리는 콜백
  onPlaneConfidenceChange: (confidence: number) => void; // 실시간 confidence 업데이트
}

/**
 * CameraTracker:
 * - 1) 카메라 Pose 추적
 * - 2) 평면 검출 + "안정도" 로직(planeConfidence)
 * - 3) 평면이 충분히 안정되면(planeFound) Plane 시각화 + 오브젝트 배치
 */
const CameraTracker = ({
  setCameraPosition,
  setObjectPosition,
  onPlaneStable,
  onPlaneConfidenceChange
}: CameraTrackerProps) => {
  const { char } = useParams();
  const [searchParams] = useSearchParams();
  const { alvaAR } = useSlam();

  // 파라미터에서 스케일 / 좌표 오프셋
  const scale = parseFloat(searchParams.get('scale') || '1');
  const offsetX = parseFloat(searchParams.get('x') || '0');
  const offsetY = parseFloat(searchParams.get('y') || '0');
  const offsetZ = parseFloat(searchParams.get('z') || '0');

  // AlvaAR -> Three.js
  const applyPose = useRef<any>(null);

  // 평면 확정 여부
  const [planeFound, setPlaneFound] = useState(false);
  // 오브젝트 배치 여부
  const [objectPlaced, setObjectPlaced] = useState(false);

  // 평면 행렬
  const planeMatrix = useRef(new THREE.Matrix4());
  // 이전 프레임 평면 행렬
  const prevPlaneMatrix = useRef<THREE.Matrix4 | null>(null);

  // 평면 안정도
  const [planeConfidence, setPlaneConfidence] = useState(0);
  // 임계값(예: 5)
  const planeConfidenceThreshold = 5;

  // Plane 시각화를 위한 ref
  const planeRef = useRef<THREE.Mesh>(null);

  // 오브젝트 ref
  const objectRef = useRef<THREE.Group>(null);

  // AlvaAR SLAM 초기화
  useEffect(() => {
    if (alvaAR) {
      applyPose.current = AlvaARConnectorTHREE.Initialize(THREE);
      console.log("✅ AlvaAR SLAM 활성화됨!");
    }
  }, [alvaAR]);

  // 매 프레임 동작
  useFrame(({ camera }) => {
    if (!alvaAR || !applyPose.current) return;

    /** 1) 카메라 Pose 추적 */
    const video = document.getElementById("ar-video") as HTMLVideoElement;
    if (!video) return;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    const camPose = alvaAR.findCameraPose(imageData);
    if (camPose) {
      applyPose.current(camPose, camera.quaternion, camera.position);
      setCameraPosition(camera.position.clone());
    }

    /** 2) 평면이 아직 확정되지 않았다면 -> findPlane() */
    if (!planeFound) {
      const planePose = alvaAR.findPlane();
      if (planePose) {
        // 2-1) 행렬 변환
        const newMatrix = new THREE.Matrix4().fromArray(planePose);

        // 2-2) 이전 행렬이 없으면(처음 감지) confidence=1
        if (!prevPlaneMatrix.current) {
          prevPlaneMatrix.current = newMatrix.clone();
          setPlaneConfidence(1);
        } else {
          // 2-3) 이전 행렬과 비교
          const diff = matrixDiff(prevPlaneMatrix.current, newMatrix);
          if (diff < 0.05) {
            // 차이가 작으면 안정적 => confidence++
            setPlaneConfidence((c) => c + 1);
          } else {
            // 갑자기 튀면 confidence 리셋
            setPlaneConfidence(1);
          }
          prevPlaneMatrix.current = newMatrix.clone();
        }

        // 2-4) planeConfidence가 임계값 이상이면 "평면 확정"
        if (planeConfidence >= planeConfidenceThreshold) {
          planeMatrix.current.copy(newMatrix);
          setPlaneFound(true);
          console.log("✅ 평면이 안정적으로 검출되었습니다!");
          onPlaneStable(); // 부모에게 알림(원 색 변경 등)
        }
      }
    }

    // 부모에게 실시간 confidence 알려주기
    onPlaneConfidenceChange(planeConfidence);

    /** 3) 평면이 확정(planeFound)되면 => planeRef에 position/quaternion 반영 */
    if (planeFound && planeRef.current) {
      const pos = new THREE.Vector3();
      const rot = new THREE.Quaternion();
      const sca = new THREE.Vector3();
      planeMatrix.current.decompose(pos, rot, sca);

      planeRef.current.position.copy(pos);
      planeRef.current.quaternion.copy(rot);
      // planeRef.current.scale.set(1,1,1); // 필요시 크기 조절
    }

    /** 4) 오브젝트가 아직 배치되지 않았다면 -> 배치 */
    if (planeFound && !objectPlaced && objectRef.current) {
      const pos = new THREE.Vector3();
      const rot = new THREE.Quaternion();
      const sca = new THREE.Vector3();
      planeMatrix.current.decompose(pos, rot, sca);

      // 추가 오프셋
      pos.x += offsetX;
      pos.y += offsetY;
      pos.z += offsetZ;

      // 오브젝트 배치
      objectRef.current.position.copy(pos);
      objectRef.current.quaternion.copy(rot);
      objectRef.current.scale.set(scale, scale, scale);

      setObjectPosition(pos.clone());
      setObjectPlaced(true);
      console.log("✅ 오브젝트 배치 완료!");
    }
  });

  return (
    <>
      {/* 파란색 반투명 plane 시각화 */}
      {planeFound && (
        <mesh ref={planeRef}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial
            color="#0000ff"
            opacity={0.3}
            transparent
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* 오브젝트 */}
      {planeFound && (
        <group ref={objectRef}>
          {char === 'moons' ? (
            <Box onRenderEnd={() => {}} on />
          ) : (
            <Tree onRenderEnd={() => {}} on />
          )}
        </group>
      )}
    </>
  );
};
/**
 * 메인 컴포넌트
 * - 카메라 권한 요청
 * - "원" 색상: 평면 안정 전(빨간) / 후(파랑)
 * - HUD로 카메라/오브젝트 위치, planeConfidence 표시
 */
export default function NftAppT() {
  const [cameraPosition, setCameraPosition] = useState(new THREE.Vector3());
  const [objectPosition, setObjectPosition] = useState(new THREE.Vector3());

  // 평면 안정 여부
  const [planeStable, setPlaneStable] = useState(false);
  // 평면 안정도
  const [planeConfidence, setPlaneConfidence] = useState(0);

  useEffect(() => {
    requestCameraPermission();
  }, []);

  // 원의 색상 결정
  const circleColor = planeStable ? "blue" : "red";

  return (
    <>
      {/* 뒤로가기 버튼 */}
      <button
        style={{
          zIndex: 999,
          position: 'fixed',
          width: 'fit-content',
          height: 'fit-content',
          border: 0,
          backgroundColor: 'transparent',
          padding: '1rem',
        }}
        onClick={() => {
          window.history.back();
        }}
      >
        <Back />
      </button>

      {/* HUD: 카메라/오브젝트 위치, planeConfidence */}
      <div
        style={{
          position: "absolute",
          zIndex: 9999,
          top: "10px",
          right: "10px",
          background: "rgba(0,0,0,0.6)",
          padding: "10px",
          borderRadius: "8px",
          color: "white",
          fontSize: "14px",
        }}
      >
        <p>
          <b>카메라:</b> {cameraPosition.x.toFixed(2)}, {cameraPosition.y.toFixed(2)}, {cameraPosition.z.toFixed(2)}
        </p>
        <p>
          <b>오브젝트:</b> {objectPosition.x.toFixed(2)}, {objectPosition.y.toFixed(2)}, {objectPosition.z.toFixed(2)}
        </p>
        <p>
          <b>planeConfidence:</b> {planeConfidence}
        </p>
      </div>

      {/* 가운데 가이드 원 */}
      <div
        style={{
          position: "absolute",
          width: "50dvw",
          height: "50dvh",
          top: "50dvh",
          left: "50dvw",
          zIndex: 9999,
          transform: "translate(-50%, -50%)",
        }}
      >
        <svg width="200px" height="200px" viewBox="0 0 50 50">
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

      {/* 안내 문구 */}
      <div
        style={{
          position: "absolute",
          zIndex: 9999,
          top: "70dvh",
          left: "50dvw",
          transform: "translate(-50%, -50%)",
          background: "rgba(0,0,0,0.6)",
          padding: "10px",
          borderRadius: "8px",
          color: "white",
          fontSize: "14px",
        }}
      >
        {!planeStable ? (
          <p>평면 스캔 중... 기기를 움직여주세요!</p>
        ) : (
          <p>평면이 안정되었습니다. 오브젝트를 배치했어요!</p>
        )}
      </div>

      {/* SLAM + Three.js Canvas */}
      <SlamCanvas id="three-canvas">
        <Suspense fallback={null}>
          <CameraTracker
            setCameraPosition={(pos) => setCameraPosition(pos)}
            setObjectPosition={(pos) => setObjectPosition(pos)}
            onPlaneStable={() => setPlaneStable(true)}
            onPlaneConfidenceChange={(conf) => setPlaneConfidence(conf)}
          />
          <ambientLight />
          <directionalLight position={[100, 100, 0]} />
        </Suspense>
      </SlamCanvas>
    </>
  );
}


// useGLTF.preload('data/mp.glb');
