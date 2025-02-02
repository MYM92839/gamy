import { useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import * as THREE from 'three';
import { Box, Tree } from './ArApp';
import Back from './assets/icons/Back';
import { AlvaARConnectorTHREE } from './libs/alvaConnector';
import SlamCanvas from './libs/arnft/arnft/components/SlamCanvas';
import { requestCameraPermission } from './libs/util';
import { useSlam } from './libs/SLAMProvider';

/**
 * 행렬 비교해 위치·회전 차이 계산
 * => diff값이 작을수록 유사
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
 * "수평 바닥"인지 판단
 * 기존: thresholdRadians = 0.3 (약 17도)
 * -> 여기서는 0.5로 완화(약 28도까지 허용)
 */
function isGroundPlane(m: THREE.Matrix4, thresholdRadians = 0.5): boolean {
  const tmpPos = new THREE.Vector3();
  const tmpRot = new THREE.Quaternion();
  const tmpSca = new THREE.Vector3();
  m.decompose(tmpPos, tmpRot, tmpSca);

  // 로컬 up(0,1,0) → 월드 up
  const worldUp = new THREE.Vector3(0, 1, 0).applyQuaternion(tmpRot);
  const angle = worldUp.angleTo(new THREE.Vector3(0, 1, 0));

  return angle < thresholdRadians;
}

const CameraTracker = ({
  planeFound,
  setPlaneFound,
  stablePlane,
  setStablePlane,
  requestFinalizePlane,
  setCameraPosition,
  setObjectPosition,
  onPlaneConfidenceChange
}: any) => {
  const { char } = useParams();
  const [searchParams] = useSearchParams();
  const { alvaAR } = useSlam();

  // URL 파라미터(스케일, 오프셋)
  const scale = parseFloat(searchParams.get('scale') || '1');
  const offsetX = parseFloat(searchParams.get('x') || '0');
  const offsetY = parseFloat(searchParams.get('y') || '0');
  const offsetZ = parseFloat(searchParams.get('z') || '0');

  // AlvaAR -> THREE
  const applyPose = useRef<any>(null);

  // 평면 안정도 로직
  const [planeConfidence, setPlaneConfidence] = useState(0);
  const planeConfidenceThreshold = 5; // 예: 5

  // 이전 평면행렬
  const prevPlaneMatrix = useRef<THREE.Matrix4 | null>(null);

  // 현재 후보 평면
  const candidatePlaneMatrix = useRef(new THREE.Matrix4());
  // 최종 확정 평면
  const finalPlaneMatrix = useRef(new THREE.Matrix4());

  // plane 시각화
  const planeRef = useRef<THREE.Mesh>(null);

  // 오브젝트
  const objectRef = useRef<THREE.Group>(null);
  const [objectPlaced, setObjectPlaced] = useState(false);

  useEffect(() => {
    if (alvaAR) {
      applyPose.current = AlvaARConnectorTHREE.Initialize(THREE);
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
    if (ctx) {
      ctx.drawImage(video, 0, 0, tmpCanvas.width, tmpCanvas.height);
      const frame = ctx.getImageData(0, 0, tmpCanvas.width, tmpCanvas.height);

      // SLAM 카메라 업데이트
      const camPose = alvaAR.findCameraPose(frame);
      if (camPose) {
        applyPose.current(camPose, camera.quaternion, camera.position);
        setCameraPosition(camera.position.clone());
      }

      // 2) planeFound=false 상태 -> planeConfidence 로직
      if (!planeFound) {
        const planePose = alvaAR.findPlane(frame);
        if (planePose) {
          const newMatrix = new THREE.Matrix4().fromArray(planePose);

          // 수평 바닥인지
          if (isGroundPlane(newMatrix, 0.5)) {
            if (!prevPlaneMatrix.current) {
              prevPlaneMatrix.current = newMatrix.clone();
              setPlaneConfidence(1);
            } else {
              // 기존 0.05 -> 0.1로 완화
              const diffVal = matrixDiff(prevPlaneMatrix.current, newMatrix);
              if (diffVal < 0.1) {
                setPlaneConfidence((c) => c + 1);
              } else {
                setPlaneConfidence(1);
              }
              prevPlaneMatrix.current.copy(newMatrix);
            }

            if (planeConfidence >= planeConfidenceThreshold) {
              candidatePlaneMatrix.current.copy(newMatrix);
              setStablePlane(true);
            } else {
              setStablePlane(false);
            }
          } else {
            // 수평 아니다
            setPlaneConfidence(0);
            setStablePlane(false);
          }
        } else {
          // planePose 안 잡힘
          setPlaneConfidence(0);
          setStablePlane(false);
        }
      }

      onPlaneConfidenceChange?.(planeConfidence);

      // 3) stablePlane && !planeFound -> planeRef 표시
      if (!planeFound && stablePlane && planeRef.current) {
        const pos = new THREE.Vector3();
        const rot = new THREE.Quaternion();
        const sca = new THREE.Vector3();
        candidatePlaneMatrix.current.decompose(pos, rot, sca);

        planeRef.current.position.copy(pos);
        planeRef.current.quaternion.copy(rot);
      }

      // 4) requestFinalizePlane -> 최종 확정
      if (!planeFound && requestFinalizePlane) {
        finalPlaneMatrix.current.copy(candidatePlaneMatrix.current);
        setPlaneFound(true);
      }

      // 5) planeFound && 아직 오브젝트 안 놓은 경우
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
      }
    }

  });

  return (
    <>
      {/* plane 표시 (좀 크게) */}
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
          {char === 'moons' ? <Box onRenderEnd={() => { }} on /> : <Tree onRenderEnd={() => { }} on />}
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

  useEffect(() => {
    requestCameraPermission();
  }, []);

  // 가운데 원 색: planeFound ? 파랑 : 빨강
  const circleColor = planeFound ? "blue" : "red";
  // "토끼 부르기" 버튼: !planeFound && stablePlane
  const showButton = !planeFound && stablePlane;

  return (
    <>
      {/* 뒤로가기 */}
      <button
        style={{ zIndex: 9999, position: 'fixed', border: 0, background: 'transparent', padding: '1rem' }}
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
        <p><b>카메라:</b> {cameraPosition.x.toFixed(2)}, {cameraPosition.y.toFixed(2)}, {cameraPosition.z.toFixed(2)}</p>
        <p><b>오브젝트:</b> {objectPosition.x.toFixed(2)}, {objectPosition.y.toFixed(2)}, {objectPosition.z.toFixed(2)}</p>
        <p><b>planeConfidence:</b> {planeConfidence}</p>
        <p><b>planeFound:</b> {planeFound ? "true" : "false"}</p>
        <p><b>stablePlane:</b> {stablePlane ? "true" : "false"}</p>
      </div>

      {/* 가운데 원 */}
      <div
        style={{
          position: "absolute",
          width: '50dvw',
          height: '50dvh',
          top: '50dvh',
          left: '50dvw',
          zIndex: 9999,
          transform: 'translate(-50%, -50%)',
        }}
      >
        <svg width="200" height="200" viewBox="0 0 50 50">
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

      {/* 안내 문구 + 버튼 */}
      {!planeFound ? (
        <>
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
              width: '90vw',
              maxWidth: '400px',
            }}
          >
            <p>넓은 바닥을 스캔해주세요!</p>
            <p style={{ marginTop: '8px' }}>
              <b>안정화 팁:</b>
              <ul style={{ marginLeft: '16px', paddingLeft: '20px', listStyle: 'circle' }}>
                <li>주변이 어둡다면, 조명을 더 밝혀주세요.</li>
                <li>바닥 표면이 너무 매끈하다면, 신문지나 패턴 있는 물건을 잠시 놓아주세요.</li>
                <li>카메라를 좌우·위아래로 크게 움직여 여러 각도에서 바닥을 스캔해 주세요.</li>
              </ul>
            </p>
            <p style={{ marginTop: '8px' }}>
              바닥이 "수평"이라고 판단되면 <i>planeConfidence</i>가 올라가고,
              안정화가 되면 버튼이 나타납니다.
            </p>
          </div>

          {/* "토끼 부르기" 버튼 */}
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
            zIndex: 9999
          }}
        >
          <p>토끼가 소환되었습니다!</p>
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
            setCameraPosition={setCameraPosition}
            setObjectPosition={setObjectPosition}
            onPlaneConfidenceChange={(c: any) => setPlaneConfidence(c)}
          />
          <ambientLight />
          <directionalLight position={[100, 100, 0]} />
        </Suspense>
      </SlamCanvas>
    </>
  );
}
