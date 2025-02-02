import { useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import * as THREE from 'three';
import { Box, Tree } from './ArApp'; // import 경로는 프로젝트에 맞게
import Back from './assets/icons/Back'; // import 경로는 프로젝트에 맞게
import { AlvaARConnectorTHREE } from './libs/alvaConnector'; // import 경로는 프로젝트에 맞게
import SlamCanvas from './libs/arnft/arnft/components/SlamCanvas'; // import 경로는 프로젝트에 맞게
import { requestCameraPermission } from './libs/util'; // import 경로는 프로젝트에 맞게
import { useSlam } from './libs/SLAMProvider'; // import 경로는 프로젝트에 맞게

/**
 * 행렬 간 차이를 단순 계산(위치 + 회전 차)
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

  const posDiff = pos1.distanceTo(pos2);
  const dot = Math.abs(rot1.dot(rot2));
  const rotDiff = 1 - dot;

  return posDiff + rotDiff;
}

/**
 * "이 행렬이 수평 바닥인가?" 검사
 * - 바닥(ground)이라면, 회전 행렬에서 "up벡터"가 (0,1,0)에 가깝게 나와야 함
 * - threshold 각도(라디안) 내면 수평면으로 본다 (0.3 ~ 약 17도)
 */
function isGroundPlane(m: THREE.Matrix4, thresholdRadians = 0.3): boolean {
  // m에서 쿼터니언 추출
  const tempPos = new THREE.Vector3();
  const tempRot = new THREE.Quaternion();
  const tempSca = new THREE.Vector3();
  m.decompose(tempPos, tempRot, tempSca);

  // 로컬 up(0,1,0)에 tempRot 적용 → 월드 up벡터
  const worldUp = new THREE.Vector3(0, 1, 0).applyQuaternion(tempRot);

  // worldUp이 (0,1,0)과 이루는 각도
  const angle = worldUp.angleTo(new THREE.Vector3(0, 1, 0)); // 0이면 완전수직, PI면 완전 거꾸로

  // angle이 threshold 이내면 "바닥"으로 판단
  return angle < thresholdRadians;
}

function CameraTracker({
  planeFound,
  setPlaneFound,
  stablePlane,
  setStablePlane,
  requestFinalizePlane,
  setCameraPosition,
  setObjectPosition,
  onPlaneConfidenceChange
}: {
  planeFound: boolean;
  setPlaneFound: (v: boolean) => void;
  stablePlane: boolean;
  setStablePlane: (v: boolean) => void;
  requestFinalizePlane: boolean;
  setCameraPosition: (pos: THREE.Vector3) => void;
  setObjectPosition: (pos: THREE.Vector3) => void;
  onPlaneConfidenceChange?: (confidence: number) => void;
}) {
  const { char } = useParams();
  const [searchParams] = useSearchParams();
  const { alvaAR } = useSlam();

  // URL 파라미터들
  const scale = parseFloat(searchParams.get('scale') || '1');
  const offsetX = parseFloat(searchParams.get('x') || '0');
  const offsetY = parseFloat(searchParams.get('y') || '0');
  const offsetZ = parseFloat(searchParams.get('z') || '0');

  // SLAM -> THREE 초기화
  const applyPose = useRef<any>(null);

  // planeConfidence
  const [planeConfidence, setPlaneConfidence] = useState(0);
  const planeConfidenceThreshold = 5;

  // 이전 평면행렬
  const prevPlaneMatrix = useRef<THREE.Matrix4 | null>(null);

  // 현재 후보(수평면) 행렬
  const candidatePlaneMatrix = useRef(new THREE.Matrix4());
  // 최종 확정된 행렬
  const finalPlaneMatrix = useRef(new THREE.Matrix4());

  // plane 시각화용
  const planeRef = useRef<THREE.Mesh>(null);

  // 오브젝트 배치 ref
  const objectRef = useRef<THREE.Group>(null);
  const [objectPlaced, setObjectPlaced] = useState(false);

  useEffect(() => {
    if (alvaAR) {
      applyPose.current = AlvaARConnectorTHREE.Initialize(THREE);
      console.log("✅ AlvaAR SLAM 활성화!");
    }
  }, [alvaAR]);

  useFrame(({ camera }) => {
    if (!alvaAR || !applyPose.current) return;

    // 1) 카메라 pose
    const video = document.getElementById("ar-video") as HTMLVideoElement;
    if (!video) return;

    const tmpCanvas = document.createElement("canvas");
    const ctx = tmpCanvas.getContext("2d");
    tmpCanvas.width = video.videoWidth || 1280;
    tmpCanvas.height = video.videoHeight || 720;
    ctx.drawImage(video, 0, 0, tmpCanvas.width, tmpCanvas.height);

    const frame = ctx.getImageData(0, 0, tmpCanvas.width, tmpCanvas.height);

    // 카메라 업데이트
    const camPose = alvaAR.findCameraPose(frame);
    if (camPose) {
      applyPose.current(camPose, camera.quaternion, camera.position);
      setCameraPosition(camera.position.clone());
    }

    // 2) planeFound=false 라면 -> 바닥인지 체크 + planeConfidence 로직
    if (!planeFound) {
      const planePose = alvaAR.findPlane(frame);
      if (planePose) {
        const newMatrix = new THREE.Matrix4().fromArray(planePose);

        // **수평 바닥인지** 먼저 검사
        if (isGroundPlane(newMatrix, 0.3)) {
          // 이전 행렬 없으면 confidence=1
          if (!prevPlaneMatrix.current) {
            prevPlaneMatrix.current = newMatrix.clone();
            setPlaneConfidence(1);
          } else {
            // diff 비교
            const diffVal = matrixDiff(prevPlaneMatrix.current, newMatrix);
            if (diffVal < 0.05) {
              setPlaneConfidence((c) => c + 1);
            } else {
              setPlaneConfidence(1);
            }
            prevPlaneMatrix.current.copy(newMatrix);
          }

          // threshold 이상이면 stablePlane=true
          if (planeConfidence >= planeConfidenceThreshold) {
            candidatePlaneMatrix.current.copy(newMatrix);
            setStablePlane(true);
          } else {
            setStablePlane(false);
          }
        } else {
          // 수평이 아닌 평면이면 confidence 리셋
          setPlaneConfidence(0);
          setStablePlane(false);
        }
      } else {
        // planePose= null => 못찾음
        setPlaneConfidence(0);
        setStablePlane(false);
      }
    }

    // 부모 HUD에 confidence 전달
    onPlaneConfidenceChange?.(planeConfidence);

    // 3) stablePlane == true && planeFound == false 시, planeRef에 표시
    if (!planeFound && stablePlane && planeRef.current) {
      const pos = new THREE.Vector3();
      const rot = new THREE.Quaternion();
      const sca = new THREE.Vector3();
      candidatePlaneMatrix.current.decompose(pos, rot, sca);

      planeRef.current.position.copy(pos);
      planeRef.current.quaternion.copy(rot);
    }

    // 4) requestFinalizePlane === true => 최종 확정
    if (!planeFound && requestFinalizePlane) {
      finalPlaneMatrix.current.copy(candidatePlaneMatrix.current);
      setPlaneFound(true);
      console.log("🎉 바닥 평면 최종 확정! 오브젝트를 놓습니다.");
    }

    // 5) 오브젝트 배치 (planeFound==true && 아직 안 놓았다면)
    if (planeFound && !objectPlaced && objectRef.current) {
      const pos = new THREE.Vector3();
      const rot = new THREE.Quaternion();
      const sca = new THREE.Vector3();
      finalPlaneMatrix.current.decompose(pos, rot, sca);

      // 오프셋
      pos.x += offsetX;
      pos.y += offsetY;
      pos.z += offsetZ;

      // 오브젝트 배치
      objectRef.current.position.copy(pos);
      objectRef.current.quaternion.copy(rot);
      objectRef.current.scale.set(scale, scale, scale);

      setObjectPosition(pos.clone());
      setObjectPlaced(true);
      console.log("✅ 바닥에 오브젝트 배치 완료!");
    }
  });

  return (
    <>
      {/* 평면 시각화 Mesh
          - planeGeometry를 크게 잡아서 "넓은 땅" 느낌
          - 예: 5×5 m (혹은 10×10) */}
      <mesh ref={planeRef}>
        <planeGeometry args={[5, 5]} />
        <meshBasicMaterial
          color="#0000ff"
          opacity={0.3}
          transparent
          side={THREE.DoubleSide}
        />
      </mesh>

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
}

export default function NftAppT() {
  const [cameraPosition, setCameraPosition] = useState(new THREE.Vector3());
  const [objectPosition, setObjectPosition] = useState(new THREE.Vector3());

  // planeFound(최종 확정), stablePlane(안정화)
  const [planeFound, setPlaneFound] = useState(false);
  const [stablePlane, setStablePlane] = useState(false);

  // 사용자가 "토끼 부르기" 버튼 누르면 -> true
  const [requestFinalizePlane, setRequestFinalizePlane] = useState(false);

  // 디버깅/표시용 confidence
  const [planeConfidence, setPlaneConfidence] = useState(0);

  useEffect(() => {
    requestCameraPermission();
  }, []);

  // 빨강/파랑 원
  const circleColor = planeFound ? "blue" : "red";

  // 토끼부르기 버튼 조건
  const showButton = !planeFound && stablePlane;

  return (
    <>
      {/* 뒤로가기 */}
      <button
        style={{
          zIndex: 9999,
          position: 'fixed',
          border: 0,
          backgroundColor: 'transparent',
          padding: '1rem',
        }}
        onClick={() => window.history.back()}
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
          <b>카메라:</b>{" "}
          {cameraPosition.x.toFixed(2)}, {cameraPosition.y.toFixed(2)}, {cameraPosition.z.toFixed(2)}
        </p>
        <p>
          <b>오브젝트:</b>{" "}
          {objectPosition.x.toFixed(2)}, {objectPosition.y.toFixed(2)}, {objectPosition.z.toFixed(2)}
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
            }}
          >
            <p>넓은 바닥을 스캔해주세요!</p>
            <p>수평이 잡히면 planeConfidence가 올라가고, 안정되면 버튼이 생깁니다.</p>
          </div>

          {/* 토끼 부르기 버튼 */}
          {showButton && (
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
              onClick={() => setRequestFinalizePlane(true)}
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
          <p>토끼가 바닥에 소환되었습니다!</p>
        </div>
      )}

      {/* SLAM Canvas */}
      <SlamCanvas id="three-canvas">
        <Suspense fallback={null}>
          <CameraTracker
            planeFound={planeFound}
            setPlaneFound={setPlaneFound}
            stablePlane={stablePlane}
            setStablePlane={setStablePlane}
            requestFinalizePlane={requestFinalizePlane}
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
