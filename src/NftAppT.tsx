import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useParams, useSearchParams } from 'react-router-dom';
import { useFrame } from '@react-three/fiber';

// 예: SlamCanvas, requestCameraPermission, AlvaARConnectorTHREE, useSlam 등
// 실제 프로젝트 경로/파일에 맞게 import 조정
import SlamCanvas from './libs/arnft/arnft/components/SlamCanvas';
import { requestCameraPermission } from './libs/util';
import { AlvaARConnectorTHREE } from './libs/alvaConnector';
import { useSlam } from './libs/SLAMProvider';

// 예시 아이콘/모델
import Back from './assets/icons/Back';
import { Box, Tree } from './ArApp';

/** =============== 유틸 함수들 =============== */

/**
 * planeMatrix에서 3D 중심 pos -> camera.project() -> "비디오" 좌표 -> "DOM" 좌표
 * => "빨간 원(cx, cy, r, DOM좌표)" 내부인지 판정
 */
function isPlaneInCircleDom(
  planeMatrix: THREE.Matrix4,
  camera: THREE.PerspectiveCamera,
  videoWidth: number,   // ex) 1280
  videoHeight: number,  // ex) 720
  domWidth: number,     // ex) 360
  domHeight: number,    // ex) 640
  circleCenterX: number,// DOM 좌표
  circleCenterY: number,
  circleRadius: number
): boolean {
  // 1) plane center
  const pos = new THREE.Vector3();
  const rot = new THREE.Quaternion();
  const sca = new THREE.Vector3();
  planeMatrix.decompose(pos, rot, sca);

  // 2) world -> clip space
  pos.project(camera);

  // 3) clip(-1..1) -> "비디오 해상도"(0..videoWidth, 0..videoHeight)
  const halfVw = videoWidth / 2;
  const halfVh = videoHeight / 2;
  let videoX = (pos.x * halfVw) + halfVw;
  let videoY = (-pos.y * halfVh) + halfVh;

  // 4) "비디오" -> "DOM" 스케일링
  //    예: 1280->360, 720->640
  const scaleX = domWidth / videoWidth;
  const scaleY = domHeight / videoHeight;
  const domX = videoX * scaleX;
  const domY = videoY * scaleY;

  // 5) circle 판정 (DOM 좌표)
  const dx = domX - circleCenterX;
  const dy = domY - circleCenterY;
  const dist2 = dx*dx + dy*dy;
  return dist2 <= (circleRadius * circleRadius);
}

/** Matrix4 두 개의 위치/회전 차이를 계산 */
function matrixDiff(m1: THREE.Matrix4, m2: THREE.Matrix4) {
  const pos1 = new THREE.Vector3();
  const pos2 = new THREE.Vector3();
  const rot1 = new THREE.Quaternion();
  const rot2 = new THREE.Quaternion();
  const sc1 = new THREE.Vector3();
  const sc2 = new THREE.Vector3();

  m1.decompose(pos1, rot1, sc1);
  m2.decompose(pos2, rot2, sc2);

  const posDiff = pos1.distanceTo(pos2);
  const dot = Math.abs(rot1.dot(rot2));
  const rotDiff = 1 - dot;
  return posDiff + rotDiff;
}


/** ============= CameraTracker ============= */
interface CameraTrackerProps {
  planeFound: boolean;
  setPlaneFound: (b: boolean) => void;
  stablePlane: boolean;
  setStablePlane: (b: boolean) => void;
  requestFinalizePlane: boolean;

  setCameraPosition: (pos: THREE.Vector3) => void;
  setObjectPosition: (pos: THREE.Vector3) => void;
  onPlaneConfidenceChange?: (val: number) => void;

  // 해상도 보정용
  videoWidth: number;   // ex) 1280
  videoHeight: number;  // ex) 720
  domWidth: number;     // ex) 360
  domHeight: number;    // ex) 640

  // 빨간 원 (DOM 좌표)
  circleX: number;  // ex) 180
  circleY: number;  // ex) 320
  circleR: number;  // ex) 100
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

  videoWidth,
  videoHeight,
  domWidth,
  domHeight,
  circleX,
  circleY,
  circleR,
}: CameraTrackerProps)
{
  // URL 파라미터(모델 종류, scale, offset)
  const { char } = useParams();
  const [searchParams] = useSearchParams();
  const scale = parseFloat(searchParams.get('scale') || '1');
  const offsetX = parseFloat(searchParams.get('x') || '0');
  const offsetY = parseFloat(searchParams.get('y') || '0');
  const offsetZ = parseFloat(searchParams.get('z') || '0');

  // SLAM
  const { alvaAR } = useSlam();
  const applyPose = useRef<any>(null);

  // planeConfidence
  const [planeConfidence, setPlaneConfidence] = useState(0);
  const planeConfidenceThreshold = 5;
  const prevPlaneMatrix = useRef<THREE.Matrix4 | null>(null);
  const candidatePlaneMatrix = useRef(new THREE.Matrix4());
  const finalPlaneMatrix = useRef(new THREE.Matrix4());

  // 3D refs
  const planeRef = useRef<THREE.Mesh>(null);
  const objectRef = useRef<THREE.Group>(null);

  // 오브젝트 배치 여부
  const [objectPlaced, setObjectPlaced] = useState(false);

  useEffect(() => {
    if (alvaAR) {
      applyPose.current = AlvaARConnectorTHREE.Initialize(THREE);
      console.log("✅ AlvaAR SLAM Initialized");
    }
  }, [alvaAR]);

  useFrame(({ camera }) => {
    if (!alvaAR || !applyPose.current) return;

    // 1) 카메라 Pose
    const video = document.getElementById('ar-video') as HTMLVideoElement | null;
    if (!video) return;

    const tmpCanvas = document.createElement('canvas');
    const ctx = tmpCanvas.getContext('2d');
    tmpCanvas.width = video.videoWidth || 1280;
    tmpCanvas.height = video.videoHeight || 720;
    ctx?.drawImage(video, 0, 0, tmpCanvas.width, tmpCanvas.height);
    const frame = ctx?.getImageData(0, 0, tmpCanvas.width, tmpCanvas.height);
    if (!frame) return;

    const camPose = alvaAR.findCameraPose(frame);
    if (camPose) {
      applyPose.current(camPose, camera.quaternion, camera.position);
      setCameraPosition(camera.position.clone());
    }

    // 2) planeConfidence (planeFound=false)
    if (!planeFound) {
      const planePose = alvaAR.findPlane(frame);
      if (planePose) {
        const newMatrix = new THREE.Matrix4().fromArray(planePose);

        // 빨간 원 DOM 내부?
        const perspCam = camera as THREE.PerspectiveCamera;
        const inCircle = isPlaneInCircleDom(
          newMatrix,
          perspCam,
          videoWidth,
          videoHeight,
          domWidth,
          domHeight,
          circleX,
          circleY,
          circleR
        );

        if (!inCircle) {
          setPlaneConfidence(0);
          setStablePlane(false);
        } else {
          if (!prevPlaneMatrix.current) {
            prevPlaneMatrix.current = newMatrix.clone();
            setPlaneConfidence(1);
          } else {
            const diffVal = matrixDiff(prevPlaneMatrix.current, newMatrix);
            // 예) 0.1 완화
            if (diffVal < 0.1) {
              setPlaneConfidence(c => c + 1);
            } else {
              setPlaneConfidence(1);
            }
            prevPlaneMatrix.current.copy(newMatrix);
          }

          if (planeConfidence >= planeConfidenceThreshold) {
            candidatePlaneMatrix.current.copy(newMatrix);
            setStablePlane(true);
          }
        }
      } else {
        setPlaneConfidence(0);
        setStablePlane(false);
      }
    }

    onPlaneConfidenceChange?.(planeConfidence);

    // 3) stablePlane & !planeFound => 파란 Plane 표시
    if (!planeFound && stablePlane && planeRef.current) {
      planeRef.current.visible = true;
      const pos = new THREE.Vector3();
      const rot = new THREE.Quaternion();
      const sc = new THREE.Vector3();
      candidatePlaneMatrix.current.decompose(pos, rot, sc);

      planeRef.current.position.copy(pos);
      planeRef.current.quaternion.copy(rot);
      planeRef.current.scale.set(3, 3, 3); // 임의 크기
    }

    // 4) requestFinalizePlane => planeFound=true
    if (!planeFound && requestFinalizePlane) {
      finalPlaneMatrix.current.copy(candidatePlaneMatrix.current);
      setPlaneFound(true);
      console.log("🎉 planeFound => place object");
    }

    // 5) planeFound && objectPlaced=false => 오브젝트 배치
    if (planeFound && !objectPlaced && objectRef.current) {
      const pos = new THREE.Vector3();
      const rot = new THREE.Quaternion();
      const sc = new THREE.Vector3();
      finalPlaneMatrix.current.decompose(pos, rot, sc);

      pos.x += offsetX;
      pos.y += offsetY;
      pos.z += offsetZ;

      objectRef.current.position.copy(pos);
      objectRef.current.quaternion.copy(rot);
      objectRef.current.scale.setScalar(scale);

      setObjectPosition(pos.clone());
      setObjectPlaced(true);
      console.log("✅ Object placed!");
    }
  });

  // char => 'moons'? => Box, else Tree
  const isMoons = (char === 'moons');

  return (
    <>
      {/* 파란 Plane */}
      <mesh ref={planeRef} visible={false}>
        <planeGeometry args={[1,1]} />
        <meshBasicMaterial
          color="#00f"
          opacity={0.3}
          transparent
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* 오브젝트 */}
      {planeFound && (
        <group ref={objectRef}>
          {isMoons ? <Box onRenderEnd={()=>{}} on /> : <Tree onRenderEnd={()=>{}} on />}
        </group>
      )}
    </>
  );
}


/** ============= NftAppT (메인) ============= */
export default function NftAppT() {
  const [cameraPosition, setCameraPosition] = useState(new THREE.Vector3());
  const [objectPosition, setObjectPosition] = useState(new THREE.Vector3());

  // planeFound / stablePlane / finalize
  const [planeFound, setPlaneFound] = useState(false);
  const [stablePlane, setStablePlane] = useState(false);
  const [requestFinalizePlane, setRequestFinalizePlane] = useState(false);

  const [planeConfidence, setPlaneConfidence] = useState(0);

  useEffect(() => {
    // 모바일 카메라 권한
    requestCameraPermission();
  }, []);

  /**
   * 가정:
   * - 실제 카메라 영상: 1280×720
   * - DOM 표시(부모 div나 화면) = 360×640
   * - 빨간 원은 DOM 좌표(180,320)에 반경 100
   */
  // const videoWidth = 1280;
  // const videoHeight = 720;

  const domWidth = 360;
  const domHeight = 640;

  // 빨간 원
  const circleX = domWidth / 2;   // 180
  const circleY = domHeight / 2;  // 320
  const circleR = 100;

  // 원 색 (planeFound? 파랑 : 빨강)
  const circleColor = planeFound ? 'blue' : 'red';
  // "토끼 부르기" 버튼 표시
  const showButton = !planeFound && stablePlane;

  return (
    <>
      {/* 뒤로가기 */}
      <button
        style={{
          position:'fixed',
          top:'1rem',
          left:'1rem',
          zIndex:9999,
          background:'transparent',
          border:'none',
          padding:'1rem'
        }}
        onClick={()=> window.history.back()}
      >
        <Back />
      </button>

      {/* HUD */}
      <div
        style={{
          position:'fixed',
          top:'1rem',
          right:'1rem',
          zIndex:9999,
          background:'rgba(0,0,0,0.6)',
          padding:'10px',
          borderRadius:'8px',
          color:'white',
          fontSize:'14px'
        }}
      >
        <p><b>카메라</b>: {cameraPosition.x.toFixed(2)}, {cameraPosition.y.toFixed(2)}, {cameraPosition.z.toFixed(2)}</p>
        <p><b>오브젝트</b>: {objectPosition.x.toFixed(2)}, {objectPosition.y.toFixed(2)}, {objectPosition.z.toFixed(2)}</p>
        <p><b>confidence</b>: {planeConfidence}</p>
        <p><b>planeFound</b>: {planeFound ? 'true' : 'false'}</p>
        <p><b>stablePlane</b>: {stablePlane ? 'true' : 'false'}</p>
      </div>

      {/* 빨간 원 (DOM) - 360×640 영역 가정 */}
      <div
        style={{
          position:'fixed',
          width:`${domWidth}px`,   // 360
          height:`${domHeight}px`, // 640
          top:'50%',
          left:'50%',
          transform:'translate(-50%,-50%)',
          background:'#000',    // 예: 검은 배경(카메라 캔버스 위에 오버레이)
          overflow:'hidden',
          zIndex:9998,
        }}
      >
        {/* svg로 빨간원 */}
        <svg
          width={domWidth}   // 360
          height={domHeight} // 640
          style={{ position:'absolute', top:0, left:0 }}
        >
          <circle
            cx={circleX}    // 180
            cy={circleY}    // 320
            r={circleR}     // 100
            fill='none'
            stroke={circleColor}
            strokeWidth='2'
          />
        </svg>
      </div>

      {/* 안내/버튼 */}
      {!planeFound ? (
        <>
          <div
            style={{
              position:'fixed',
              top:'70%',
              left:'50%',
              transform:'translate(-50%, -50%)',
              zIndex:9999,
              background:'rgba(0,0,0,0.6)',
              color:'white',
              padding:'10px',
              borderRadius:'8px',
              fontSize:'14px'
            }}
          >
            <p>빨간 원 안에 평면을 맞춰주세요.</p>
            <p>폰을 천천히 움직여 텍스처·조명을 확보하세요!</p>
          </div>

          {showButton && (
            <button
              style={{
                position:'fixed',
                bottom:'10%',
                left:'50%',
                transform:'translateX(-50%)',
                zIndex:99999,
                padding:'1rem',
                fontSize:'1rem',
                backgroundColor:'darkblue',
                color:'white',
                border:'none',
                borderRadius:'8px'
              }}
              onClick={()=> setRequestFinalizePlane(true)}
            >
              토끼 부르기
            </button>
          )}
        </>
      ) : (
        <div
          style={{
            position:'fixed',
            top:'50%',
            left:'50%',
            transform:'translate(-50%, -50%)',
            background:'rgba(0,0,0,0.6)',
            color:'white',
            padding:'10px',
            borderRadius:'8px',
            fontSize:'14px',
            zIndex:9999
          }}
        >
          <p>토끼가 소환되었습니다!</p>
        </div>
      )}

      {/* SLAM + Three.js 캔버스 */}
      <SlamCanvas id='three-canvas'>
        {/* 뒤에 렌더되는 3D 씬 */}
        <React.Suspense fallback={null}>
          <CameraTracker
            planeFound={planeFound}
            setPlaneFound={setPlaneFound}
            stablePlane={stablePlane}
            setStablePlane={setStablePlane}
            requestFinalizePlane={requestFinalizePlane}

            setCameraPosition={(pos)=> setCameraPosition(pos)}
            setObjectPosition={(pos)=> setObjectPosition(pos)}
            onPlaneConfidenceChange={(val)=> setPlaneConfidence(val)}

            videoWidth={1280}
            videoHeight={720}
            domWidth={360}
            domHeight={640}
            circleX={180}
            circleY={320}
            circleR={100}
          />
          <ambientLight />
          <directionalLight position={[100,100,0]} />
        </React.Suspense>
      </SlamCanvas>
    </>
  );
}
