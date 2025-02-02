import { useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import * as THREE from 'three';
import { Box, Tree } from './ArApp'; // 경로/컴포넌트는 프로젝트에 맞춰 조정
import Back from './assets/icons/Back';
import { AlvaARConnectorTHREE } from './libs/alvaConnector';
import SlamCanvas from './libs/arnft/arnft/components/SlamCanvas';
import { requestCameraPermission } from './libs/util';
import { useSlam } from './libs/SLAMProvider';

/** 두 Matrix4 간 거리/회전 차이를 간단히 계산하는 함수 */
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

  return posDiff + rotDiff;
}

/**
 * CameraTracker(자식):
 * - SLAM 카메라 추적
 * - planeConfidence 로직으로 안정적인 평면 찾기
 * - stablePlane === true 이면 파란 Plane 시각화
 * - requestFinalizePlane === true 시점에 planeFound = true (오브젝트 배치)
 */
function CameraTracker({
  planeFound,
  setPlaneFound,
  setCameraPosition,
  setObjectPosition,
  stablePlane,
  setStablePlane,
  requestFinalizePlane, // 부모가 "토끼 부르기" 버튼 누르면 true로 줌
  onPlaneConfidenceChange,
}: {
  planeFound: boolean;
  setPlaneFound: (v: boolean) => void;
  setCameraPosition: (v: THREE.Vector3) => void;
  setObjectPosition: (v: THREE.Vector3) => void;
  stablePlane: boolean;
  setStablePlane: (v: boolean) => void;
  requestFinalizePlane: boolean;
  onPlaneConfidenceChange?: (val: number) => void;
}) {
  const { char } = useParams();
  const [searchParams] = useSearchParams();
  const { alvaAR } = useSlam();

  // URL 파라미터들
  const scale = parseFloat(searchParams.get('scale') || '1');
  const offsetX = parseFloat(searchParams.get('x') || '0');
  const offsetY = parseFloat(searchParams.get('y') || '0');
  const offsetZ = parseFloat(searchParams.get('z') || '0');

  // AlvaAR -> Three.js 초기화 ref
  const applyPose = useRef<any>(null);

  // 평면 안정도
  const [planeConfidence, setPlaneConfidence] = useState(0);
  const planeConfidenceThreshold = 5;

  // 이전 평면 행렬
  const prevPlaneMatrix = useRef<THREE.Matrix4 | null>(null);

  // "현재 후보 평면" (안정화되면 stablePlane=true 상태에서 시각화)
  const candidatePlaneMatrix = useRef(new THREE.Matrix4());

  // "최종 확정 평면" (planeFound=true 상태에서 오브젝트 배치용)
  const finalPlaneMatrix = useRef(new THREE.Matrix4());

  // plane Mesh (시각화용)
  const planeRef = useRef<THREE.Mesh>(null);

  // 오브젝트 ref
  const objectRef = useRef<THREE.Group>(null);

  // 오브젝트가 실제로 배치되었는지 여부
  const [objectPlaced, setObjectPlaced] = useState(false);

  // SLAM 초기화
  useEffect(() => {
    if (alvaAR) {
      applyPose.current = AlvaARConnectorTHREE.Initialize(THREE);
      console.log("✅ AlvaAR SLAM 활성화됨!");
    }
  }, [alvaAR]);

  /** 매 프레임 동작 */
  useFrame(({ camera }) => {
    if (!alvaAR || !applyPose.current) return;

    // 1) 카메라 pose 추적
    const video = document.getElementById("ar-video") as HTMLVideoElement;
    if (!video) return;

    const tempCanvas = document.createElement("canvas");
    const ctx = tempCanvas.getContext("2d");
    tempCanvas.width = video.videoWidth || 1280;
    tempCanvas.height = video.videoHeight || 720;

    if (ctx) {

      ctx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);
      const imageData = ctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);

      // 카메라에 pose 적용
      const camPose = alvaAR.findCameraPose(imageData);
      if (camPose) {
        applyPose.current(camPose, camera.quaternion, camera.position);
        setCameraPosition(camera.position.clone());
      }

      // 2) planeFound=false라면 -> planeConfidence 로직
      if (!planeFound) {
        const planePose = alvaAR.findPlane(imageData);
        if (planePose) {
          const newMatrix = new THREE.Matrix4().fromArray(planePose);

          // 이전 행렬이 없으면 confidence=1
          if (!prevPlaneMatrix.current) {
            prevPlaneMatrix.current = newMatrix.clone();
            setPlaneConfidence(1);
          } else {
            // diff로 비교
            const diffVal = matrixDiff(prevPlaneMatrix.current, newMatrix);
            if (diffVal < 0.05) {
              setPlaneConfidence((c) => c + 1);
            } else {
              setPlaneConfidence(1);
            }
            prevPlaneMatrix.current.copy(newMatrix);
          }

          // planeConfidence가 threshold 이상이면 stablePlane=true
          if (planeConfidence >= planeConfidenceThreshold) {
            candidatePlaneMatrix.current.copy(newMatrix);
            setStablePlane(true);
          } else {
            setStablePlane(false);
          }
        } else {
          // planePose가 안잡히면 confidence=0, stablePlane=false
          setPlaneConfidence(0);
          setStablePlane(false);
        }
      }

      // 부모 HUD에서 planeConfidence 보고 싶다면
      onPlaneConfidenceChange?.(planeConfidence);

      // 3) stablePlane == true && planeFound == false -> planeRef 시각화
      if (!planeFound && stablePlane && planeRef.current) {
        const pos = new THREE.Vector3();
        const rot = new THREE.Quaternion();
        const sca = new THREE.Vector3();
        candidatePlaneMatrix.current.decompose(pos, rot, sca);

        planeRef.current.position.copy(pos);
        planeRef.current.quaternion.copy(rot);
      }

      // 4) 만약 requestFinalizePlane가 true라면 -> 최종 확정
      if (!planeFound && requestFinalizePlane) {
        finalPlaneMatrix.current.copy(candidatePlaneMatrix.current);
        // planeFound -> true
        setPlaneFound(true);
        console.log("🎉 Plane 최종 확정! 오브젝트 배치 진행합니다.");
      }

      // 5) planeFound=true & 오브젝트 미배치면 -> 오브젝트 배치
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
        objectRef.current.scale.set(scale, scale, scale);

        setObjectPosition(pos.clone());
        setObjectPlaced(true);
        console.log("✅ 토끼(오브젝트) 배치 완료!");
      }

    }

  });

  return (
    <>
      {/* 파란 Plane (stablePlane==true일 때 위치 갱신됨) */}
      <mesh ref={planeRef}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          color="#0000ff"
          opacity={0.3}
          transparent
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* 오브젝트(planeFound==true이면 표시) */}
      {planeFound && (
        <group ref={objectRef}>
          {char === 'moons' ? <Box onRenderEnd={() => { }} on /> : <Tree onRenderEnd={() => { }} on />}
        </group>
      )}
    </>
  );
}

export default function NftAppT() {
  const [cameraPosition, setCameraPosition] = useState(new THREE.Vector3());
  const [objectPosition, setObjectPosition] = useState(new THREE.Vector3());

  // planeFound: 최종 확정된 평면 여부
  const [planeFound, setPlaneFound] = useState(false);
  // stablePlane: planeConfidence가 threshold 이상인지(즉, "안정화" 상태)
  const [stablePlane, setStablePlane] = useState(false);

  // 사용자가 "토끼 부르기" 누르면 -> true
  const [requestFinalizePlane, setRequestFinalizePlane] = useState(false);

  // 디버깅/HUD 표시용
  const [planeConfidence, setPlaneConfidence] = useState(0);

  useEffect(() => {
    requestCameraPermission();
  }, []);

  // 가운데 원 색상: planeFound가 이미 true면 파랑, 아니면 빨강(예시)
  const circleColor = planeFound ? "blue" : "red";

  // "토끼 부르기" 버튼을 보여줄지 여부
  // => planeFound=false && stablePlane=true 면 노출
  const showRabbitButton = !planeFound && stablePlane;

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

      {/* 상단 HUD */}
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
        <p>
          <b>stablePlane:</b> {stablePlane ? "true" : "false"}
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

      {/* 안내 문구 + 토끼 부르기 버튼 */}
      {!planeFound ? (
        <>
          {/* 안내 문구 */}
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
              textAlign: "center",
            }}
          >
            <p>카메라를 움직여 평면을 찾고 안정화하세요!</p>
            <p>안정되면 [토끼 부르기] 버튼이 활성화됩니다.</p>
          </div>

          {/* "토끼 부르기" 버튼 (캔버스 바깥 DOM) */}
          {showRabbitButton && (
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
              onClick={() => {
                setRequestFinalizePlane(true);
              }}
            >
              토끼 부르기
            </button>
          )}
        </>
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

      {/* SLAM + ThreeJS */}
      <SlamCanvas id="three-canvas">
        <Suspense fallback={null}>
          <CameraTracker
            planeFound={planeFound}
            setPlaneFound={setPlaneFound}
            stablePlane={stablePlane}
            setStablePlane={setStablePlane}
            setCameraPosition={(pos) => setCameraPosition(pos)}
            setObjectPosition={(pos) => setObjectPosition(pos)}
            requestFinalizePlane={requestFinalizePlane}
            onPlaneConfidenceChange={(val) => setPlaneConfidence(val)}
          />
          <ambientLight />
          <directionalLight position={[100, 100, 0]} />
        </Suspense>
      </SlamCanvas>
    </>
  );
}
