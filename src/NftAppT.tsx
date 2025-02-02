import { useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import * as THREE from 'three';
import { Box, Tree } from './ArApp';
import Back from './assets/icons/Back';
import SlamCanvas from './libs/arnft/arnft/components/SlamCanvas';
import { useSlam } from './libs/SLAMProvider';
import { requestCameraPermission } from './libs/util';
import { AlvaARConnectorTHREE } from './libs/alvaConnector';

/**
 * 3D 평면 중심(planeMatrix) -> 2D 스크린 좌표로 투영 후,
 * 빨간 원(circleCenterX, circleCenterY, circleRadius) 내부인지 확인
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



export function isPlaneInCircle(
  planeMatrix: THREE.Matrix4,
  camera: THREE.PerspectiveCamera,
  canvasWidth: number,
  canvasHeight: number,
  circleCenterX: number,
  circleCenterY: number,
  circleRadius: number
): boolean {
  // 1) plane center
  const pos = new THREE.Vector3();
  const rot = new THREE.Quaternion();
  const sca = new THREE.Vector3();
  planeMatrix.decompose(pos, rot, sca);

  // 2) world coords -> NDC via project()
  pos.project(camera);

  // pos.x, pos.y in [-1..1]
  const halfW = canvasWidth / 2;
  const halfH = canvasHeight / 2;
  const screenX = pos.x * halfW + halfW;
  const screenY = -pos.y * halfH + halfH;

  // 3) circle check
  const dx = screenX - circleCenterX;
  const dy = screenY - circleCenterY;
  const dist2 = dx * dx + dy * dy;

  return dist2 <= circleRadius * circleRadius;
}

// Props 정의
interface CameraTrackerProps {
  planeFound: boolean;
  setPlaneFound: (v: boolean) => void;
  stablePlane: boolean;
  setStablePlane: (v: boolean) => void;
  requestFinalizePlane: boolean;
  setCameraPosition: (pos: THREE.Vector3) => void;
  setObjectPosition: (pos: THREE.Vector3) => void;
  onPlaneConfidenceChange?: (val: number) => void;

  // "빨간 원" 정보
  circleCenterX: number;
  circleCenterY: number;
  circleRadius: number;
  canvasWidth: number;
  canvasHeight: number;

  // 나머지 설정
}

// CameraTracker 컴포넌트
export const CameraTracker: React.FC<CameraTrackerProps> = ({
  planeFound,
  setPlaneFound,
  stablePlane,
  setStablePlane,
  requestFinalizePlane,
  setCameraPosition,
  setObjectPosition,
  onPlaneConfidenceChange,
  circleCenterX,
  circleCenterY,
  circleRadius,
  canvasWidth,
  canvasHeight,
}) => {
  // 1) URL 파라미터 처리
  const { char } = useParams(); // 예: /nft-app/moons
  const [searchParams] = useSearchParams();

  const scale = parseFloat(searchParams.get('scale') || '1');
  const offsetX = parseFloat(searchParams.get('x') || '0');
  const offsetY = parseFloat(searchParams.get('y') || '0');
  const offsetZ = parseFloat(searchParams.get('z') || '0');

  // Slam
  const { alvaAR } = useSlam();
  const applyPose = useRef<any>(null);

  // planeConfidence 로직
  const [planeConfidence, setPlaneConfidence] = useState(0);
  const planeConfidenceThreshold = 5;

  // Plane 행렬 관련 refs
  const finalPlaneMatrix = useRef(new THREE.Matrix4());
  const candidatePlaneMatrix = useRef(new THREE.Matrix4());
  const prevPlaneMatrix = useRef<THREE.Matrix4 | null>(null);

  // 시각화/오브젝트 ref
  const planeRef = useRef<THREE.Mesh>(null);
  const objectRef = useRef<THREE.Group>(null);

  // 오브젝트 배치 여부
  const [objectPlaced, setObjectPlaced] = useState(false);

  useEffect(() => {
    if (alvaAR) {
      applyPose.current = AlvaARConnectorTHREE.Initialize(THREE);
      console.log("✅ AlvaAR SLAM 활성화됨!");
    }
  }, [alvaAR]);

  useFrame(({ camera }) => {
    if (!alvaAR || !applyPose.current) return;

    // 1) 카메라 Pose 업데이트
    const video = document.getElementById('ar-video') as HTMLVideoElement;
    if (!video) return;

    const tmpCanvas = document.createElement('canvas');
    const ctx = tmpCanvas.getContext('2d');
    tmpCanvas.width = video.videoWidth || 1280;
    tmpCanvas.height = video.videoHeight || 720;
    ctx?.drawImage(video, 0, 0, tmpCanvas.width, tmpCanvas.height);
    const frame = ctx?.getImageData(0, 0, tmpCanvas.width, tmpCanvas.height);
    if (!frame) return;

    const pose = alvaAR.findCameraPose(frame);
    if (pose) {
      applyPose.current(pose, camera.quaternion, camera.position);
      setCameraPosition(camera.position.clone());
    }

    // 2) planeConfidence 로직 (planeFound==false 상태)
    if (!planeFound) {
      const planePose = alvaAR.findPlane(frame);
      if (planePose) {
        const newMatrix = new THREE.Matrix4().fromArray(planePose);

        // "빨간 원" 내부인가?
        const inCircle = isPlaneInCircle(
          newMatrix,
          camera as THREE.PerspectiveCamera,
          canvasWidth,
          canvasHeight,
          circleCenterX,
          circleCenterY,
          circleRadius
        );

        if (!inCircle) {
          setPlaneConfidence(0);
          setStablePlane(false);
        } else {
          // 원 안에 있으면 => diff 비교
          if (!prevPlaneMatrix.current) {
            prevPlaneMatrix.current = newMatrix.clone();
            setPlaneConfidence(1);
          } else {
            const diffVal = matrixDiff(prevPlaneMatrix.current, newMatrix);
            if (diffVal < 0.1) {
              setPlaneConfidence(c => c + 1);
            } else {
              setPlaneConfidence(1);
            }
            prevPlaneMatrix.current.copy(newMatrix);
          }

          // threshold 이상이면 stablePlane=true
          if (planeConfidence >= planeConfidenceThreshold) {
            candidatePlaneMatrix.current.copy(newMatrix);
            setStablePlane(true);
          }
        }
      } else {
        // planePose = null
        setPlaneConfidence(0);
        setStablePlane(false);
      }
    }

    onPlaneConfidenceChange?.(planeConfidence);

    // 3) stablePlane && !planeFound => planeRef 표시
    if (!planeFound && stablePlane && planeRef.current) {
      const pos = new THREE.Vector3();
      const rot = new THREE.Quaternion();
      const sca = new THREE.Vector3();
      candidatePlaneMatrix.current.decompose(pos, rot, sca);

      planeRef.current.position.copy(pos);
      planeRef.current.quaternion.copy(rot);
      planeRef.current.scale.set(5, 5, 5); // 예시 (plane 크게)
      planeRef.current.visible = true;
    }

    // 4) requestFinalizePlane => 최종 확정
    if (!planeFound && requestFinalizePlane) {
      finalPlaneMatrix.current.copy(candidatePlaneMatrix.current);
      console.log("🎉 Plane 확정");
      setPlaneFound(true);
    }

    // 5) planeFound && 오브젝트 아직 배치 안했으면 => 오브젝트 배치
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
      console.log("✅ 오브젝트 배치 완료!");
    }
  });

  // 캐릭터 판단
  const isMoons = char === 'moons';

  return (
    <>
      {/* 파란 plane */}
      <mesh ref={planeRef} visible={false}>
        <planeGeometry args={[1, 1]} />
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
          {isMoons ? (
            <Box onRenderEnd={() => { }} on />
          ) : (
            <Tree onRenderEnd={() => { }} on />
          )}
        </group>
      )}
    </>
  );
};




export default function NftAppT() {
  const [cameraPosition, setCameraPosition] = useState(new THREE.Vector3());
  const [objectPosition, setObjectPosition] = useState(new THREE.Vector3());

  // planeFound/stablePlane
  const [planeFound, setPlaneFound] = useState(false);
  const [stablePlane, setStablePlane] = useState(false);
  const [requestFinalizePlane, setRequestFinalizePlane] = useState(false);

  // HUD
  const [planeConfidence, setPlaneConfidence] = useState(0);

  useEffect(() => {
    requestCameraPermission();
  }, []);

  // 가정: 1280×720
  const videoWidth = 1280;
  const videoHeight = 720;

  // 빨간 원
  const circleCenterX = videoWidth / 2;
  const circleCenterY = videoHeight / 2;
  const circleRadius = 100;

  // 원 색
  const circleColor = planeFound ? 'blue' : 'red';
  // 버튼
  const showButton = !planeFound && stablePlane;

  return (
    <>
      {/* 뒤로가기 */}
      <button
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          zIndex: 9999,
          background: 'transparent',
          border: 0,
          padding: '1rem'
        }}
        onClick={() => window.history.back()}
      >
        <Back />
      </button>

      {/* HUD */}
      <div
        style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          zIndex: 9999,
          background: 'rgba(0,0,0,0.6)',
          padding: '10px',
          borderRadius: '8px',
          color: 'white',
          fontSize: '14px'
        }}
      >
        <p><b>카메라:</b> {cameraPosition.x.toFixed(2)}, {cameraPosition.y.toFixed(2)}, {cameraPosition.z.toFixed(2)}</p>
        <p><b>오브젝트:</b> {objectPosition.x.toFixed(2)}, {objectPosition.y.toFixed(2)}, {objectPosition.z.toFixed(2)}</p>
        <p><b>planeConfidence:</b> {planeConfidence}</p>
        <p><b>planeFound:</b> {planeFound ? "true" : "false"}</p>
        <p><b>stablePlane:</b> {stablePlane ? "true" : "false"}</p>
      </div>

      {/* 빨간 원 SVG */}
      <div
        style={{
          position: 'absolute',
          width: `${videoWidth}px`,
          height: `${videoHeight}px`,
          top: 0,
          left: 0,
          zIndex: 9998
        }}
      >
        <svg
          width={videoWidth}
          height={videoHeight}
          style={{ position:'absolute', top:0, left:0 }}
        >
          <circle
            cx={circleCenterX}
            cy={circleCenterY}
            r={circleRadius}
            fill="none"
            stroke={circleColor}
            strokeWidth={2}
          />
        </svg>
      </div>

      {!planeFound ? (
        <>
          <div
            style={{
              position: 'absolute',
              top: '60%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background:'rgba(0,0,0,0.6)',
              padding:'10px',
              borderRadius:'8px',
              color:'white',
              fontSize:'14px',
              zIndex:9999
            }}
          >
            <p>빨간 원 안에 평면을 맞춰주세요!</p>
            <p>안정화되면 [토끼 부르기] 버튼이 나타납니다.</p>
          </div>

          {showButton && (
            <button
              style={{
                position:'absolute',
                bottom:'10%',
                left:'50%',
                transform:'translateX(-50%)',
                zIndex:99999,
                padding:'1rem',
                fontSize:'1rem',
                backgroundColor:'darkblue',
                color:'white',
                borderRadius:'8px',
                border:'none'
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
            position: 'absolute',
            top: '60%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background:'rgba(0,0,0,0.6)',
            padding:'10px',
            borderRadius:'8px',
            color:'white',
            fontSize:'14px',
            zIndex:9999
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
            setCameraPosition={(pos)=>setCameraPosition(pos)}
            setObjectPosition={(pos)=>setObjectPosition(pos)}
            onPlaneConfidenceChange={(val)=>setPlaneConfidence(val)}

            circleCenterX={circleCenterX}
            circleCenterY={circleCenterY}
            circleRadius={circleRadius}
            canvasWidth={videoWidth}
            canvasHeight={videoHeight}
          />
          <ambientLight />
          <directionalLight position={[100, 100, 0]} />
        </Suspense>
      </SlamCanvas>
    </>
  );
}
