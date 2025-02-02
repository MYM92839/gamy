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
/**
 * 두 Matrix4 간 위치/회전 차이를 간단 계산
 * - 차이가 작을수록 유사
 */
function matrixDiff(m1: THREE.Matrix4, m2: THREE.Matrix4) {
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
  // 회전 차이(쿼터니언 dot)
  const dot = Math.abs(rot1.dot(rot2));
  const rotDiff = 1 - dot; // 0이면 동일, 1이면 완전 반대

  // 단순 합산
  return posDiff + rotDiff;
}

/**
 * CameraTracker:
 * - planeConfidence 로직으로 "안정된 평면"을 찾음
 * - stablePlane이 되면(planeConfidence >= threshold), 파란 Plane 시각화 + "토끼 부르기" 버튼 활성화
 * - "토끼 부르기" 버튼 누르면 planeFound = true → 그 시점 planePose로 오브젝트 배치
 */
const CameraTracker = ({
  planeFound,
  setPlaneFound,
  setCameraPosition,
  setObjectPosition,
  onPlaneConfidenceChange, // 부모가 planeConfidence를 HUD에 표시하고 싶다면
}: {
  planeFound: boolean;
  setPlaneFound: (b: boolean) => void;
  setCameraPosition: (pos: THREE.Vector3) => void;
  setObjectPosition: (pos: THREE.Vector3) => void;
  onPlaneConfidenceChange?: (val: number) => void;
}) => {
  const { char } = useParams();
  const [searchParams] = useSearchParams();
  const { alvaAR } = useSlam();

  // 파라미터(스케일/오프셋)
  const scale = parseFloat(searchParams.get('scale') || '1');
  const offsetX = parseFloat(searchParams.get('x') || '0');
  const offsetY = parseFloat(searchParams.get('y') || '0');
  const offsetZ = parseFloat(searchParams.get('z') || '0');

  // AlvaAR -> Three.js 연동
  const applyPose = useRef<any>(null);

  // 평면 안정도 (연속 프레임 누적)
  const [planeConfidence, setPlaneConfidence] = useState(0);
  const planeConfidenceThreshold = 5;

  // 이전 평면 행렬
  const prevPlaneMatrix = useRef<THREE.Matrix4 | null>(null);

  // "현재 후보 평면" (stablePlane=false인 동안은 계속 갱신)
  const candidatePlaneMatrix = useRef(new THREE.Matrix4());

  // "최종 확정 평면" (planeFound=true일 때 오브젝트 배치용)
  const finalPlaneMatrix = useRef(new THREE.Matrix4());

  // stablePlane: planeConfidence >= threshold 이면 true
  // => 이 평면을 화면에 시각화 + 버튼 활성화
  const [stablePlane, setStablePlane] = useState(false);

  // 평면 Mesh (시각화용)
  const planeRef = useRef<THREE.Mesh>(null);

  // 오브젝트 ref
  const objectRef = useRef<THREE.Group>(null);

  // 오브젝트 배치 완료 여부
  const [objectPlaced, setObjectPlaced] = useState(false);

  useEffect(() => {
    if (alvaAR) {
      applyPose.current = AlvaARConnectorTHREE.Initialize(THREE);
      console.log("✅ AlvaAR SLAM 활성화됨!");
    }
  }, [alvaAR]);

  /** 매 프레임 Loop */
  useFrame(({ camera }) => {
    if (!alvaAR || !applyPose.current) return;

    // 1) 카메라 Pose
    const video = document.getElementById("ar-video") as HTMLVideoElement;
    if (!video) return;

    const c = document.createElement("canvas");
    const ctx = c.getContext("2d");
    c.width = video.videoWidth || 1280;
    c.height = video.videoHeight || 720;
    ctx.drawImage(video, 0, 0, c.width, c.height);
    const frame = ctx.getImageData(0, 0, c.width, c.height);

    // 카메라 업데이트
    const camPose = alvaAR.findCameraPose(frame);
    if (camPose) {
      applyPose.current(camPose, camera.quaternion, camera.position);
      setCameraPosition(camera.position.clone());
    }

    // 2) 평면이 아직 "최종 확정(planeFound=false)"이 아니라면 -> planeConfidence 로직
    if (!planeFound) {
      const planePose = alvaAR.findPlane(frame);
      if (planePose) {
        const newMatrix = new THREE.Matrix4().fromArray(planePose);

        // 처음 감지되면 confidence=1
        if (!prevPlaneMatrix.current) {
          prevPlaneMatrix.current = newMatrix.clone();
          setPlaneConfidence(1);
        } else {
          // 이전과 비교
          const diff = matrixDiff(prevPlaneMatrix.current, newMatrix);
          if (diff < 0.05) {
            setPlaneConfidence((c) => c + 1);
          } else {
            setPlaneConfidence(1);
          }
          prevPlaneMatrix.current.copy(newMatrix);
        }

        // stablePlane 여부 결정
        if (planeConfidence >= planeConfidenceThreshold) {
          // 안정되었다고 판단 -> candidatePlaneMatrix 갱신
          candidatePlaneMatrix.current.copy(newMatrix);
          setStablePlane(true);
        } else {
          setStablePlane(false);
        }
      } else {
        // planePose가 안잡히면 confidence 리셋
        setPlaneConfidence(0);
        setStablePlane(false);
      }
    }

    // 2-1) 부모에서 planeConfidence 표시하고 싶다면 전달
    onPlaneConfidenceChange && onPlaneConfidenceChange(planeConfidence);

    // 3) stablePlane==true이면, planeRef에 candidatePlaneMatrix를 반영(시각화)
    if (!planeFound && stablePlane && planeRef.current) {
      const pos = new THREE.Vector3();
      const rot = new THREE.Quaternion();
      const sca = new THREE.Vector3();
      candidatePlaneMatrix.current.decompose(pos, rot, sca);

      planeRef.current.position.copy(pos);
      planeRef.current.quaternion.copy(rot);
      // planeRef.current.scale.set(1, 1, 1);
    }

    // 4) 최종 확정(planeFound=true)이면 -> 오브젝트 배치
    if (planeFound && !objectPlaced && objectRef.current) {
      // finalPlaneMatrix -> position/quaternion
      const pos = new THREE.Vector3();
      const rot = new THREE.Quaternion();
      const sca = new THREE.Vector3();
      finalPlaneMatrix.current.decompose(pos, rot, sca);

      // 오프셋 적용
      pos.x += offsetX;
      pos.y += offsetY;
      pos.z += offsetZ;

      // 오브젝트 배치
      objectRef.current.position.copy(pos);
      objectRef.current.quaternion.copy(rot);
      objectRef.current.scale.setScalar(scale);

      setObjectPosition(pos.clone());
      setObjectPlaced(true);
      console.log("✅ 오브젝트 배치 완료!");
    }
  });

  /**
   * "토끼 부르기" 버튼을 누르면:
   * - 지금 stablePlane==true 상태인 candidatePlaneMatrix를 "finalPlaneMatrix"에 복사
   * - planeFound=true로 전환 → 평면 최종 확정
   */
  const finalizePlane = () => {
    finalPlaneMatrix.current.copy(candidatePlaneMatrix.current);
    setPlaneFound(true);
    console.log("🎉 Plane 확정! 오브젝트를 놓습니다.");
  };

  return (
    <>
      {/* 평면 시각화: 항상 존재, stablePlane==true 일 때만 candidatePlaneMatrix로 위치 갱신됨 */}
      <mesh ref={planeRef}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          color="#0000ff"
          opacity={0.3}
          transparent
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* 오브젝트: planeFound==true 상태가 되면 배치 */}
      {planeFound && (
        <group ref={objectRef}>
          {char === 'moons' ? (
            <Box onRenderEnd={() => { }} on />
          ) : (
            <Tree onRenderEnd={() => { }} on />
          )}
        </group>
      )}

      {/* "토끼 부르기" 버튼:
          - planeFound=false && stablePlane==true 일 때만 노출/활성화 */}
      {!planeFound && stablePlane && (
        <button
          style={{
            position: "absolute",
            bottom: "10%",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 99999,
            padding: "1rem",
            fontSize: "1rem",
            backgroundColor: "darkblue",
            color: "white",
            borderRadius: "8px",
            border: "none",
          }}
          onClick={finalizePlane}
        >
          토끼 부르기
        </button>
      )}
    </>
  );
};
export default function NftAppT() {
  const [cameraPosition, setCameraPosition] = useState(new THREE.Vector3());
  const [objectPosition, setObjectPosition] = useState(new THREE.Vector3());

  // planeFound: 최종 확정 여부
  const [planeFound, setPlaneFound] = useState(false);
  // planeConfidence: 상위 HUD에서 보고 싶다면
  const [planeConfidence, setPlaneConfidence] = useState(0);

  useEffect(() => {
    requestCameraPermission();
  }, []);

  // 가운데 원 색깔: planeFound가 이미 true이면 파랑, 아니면 빨강
  // (또는 planeConfidence에 따라 그라디언트로 바꿀 수도 있음)
  const circleColor = planeFound ? "blue" : "red";

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

      {/* HUD */}
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
        <p>
          <b>planeFound:</b> {planeFound ? "true" : "false"}
        </p>
      </div>

      {/* 가운데 원 */}
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
      {!planeFound ? (
        <div
          style={{
            position: "absolute",
            top: "70dvh",
            left: "50dvw",
            transform: "translate(-50%, -50%)",
            background: "rgba(0,0,0,0.6)",
            padding: "10px",
            borderRadius: "8px",
            color: "white",
            fontSize: "14px",
            zIndex: 9999,
          }}
        >
          <p>카메라를 움직여 평면을 스캔해주세요.</p>
          <p>안정되면 [토끼 부르기] 버튼이 나타납니다!</p>
        </div>
      ) : (
        <div
          style={{
            position: "absolute",
            top: "70dvh",
            left: "50dvw",
            transform: "translate(-50%, -50%)",
            background: "rgba(0,0,0,0.6)",
            padding: "10px",
            borderRadius: "8px",
            color: "white",
            fontSize: "14px",
            zIndex: 9999,
          }}
        >
          <p>토끼가 소환되었습니다!</p>
        </div>
      )}

      {/* SLAM + Three.js Canvas */}
      <SlamCanvas id="three-canvas">
        <Suspense fallback={null}>
          <CameraTracker
            planeFound={planeFound}
            setPlaneFound={setPlaneFound}
            setCameraPosition={(pos) => setCameraPosition(pos)}
            setObjectPosition={(pos) => setObjectPosition(pos)}
            onPlaneConfidenceChange={(val) => setPlaneConfidence(val)}
          />
          <ambientLight />
          <directionalLight position={[100, 100, 0]} />
        </Suspense>
      </SlamCanvas>
    </>
  );
}