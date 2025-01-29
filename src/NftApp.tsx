import { useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import Back from './assets/icons/Back';
import { AlvaARConnectorTHREE } from './libs/alvaConnector';
import ARCanvas from './libs/arnft/arnft/components/arCanvas';
import { requestCameraPermission } from './libs/util';
import { useARNft, useNftMarker } from './libs/XRProvider';

// const context = createContext(undefined);
// const currentCameraPosition = new THREE.Vector3();
// const objectPosition = new THREE.Vector3()
export function Instances({ url, setOrigin }: any) {
  const ref = useNftMarker(url);
  const { arEnabled, arnft } = useARNft();
  const markerTracked = useRef(false); // ✅ 마커 감지 여부 추적

  useEffect(() => {
    if (!arnft || !arEnabled || !ref.current) return;

    if (!markerTracked.current) {
      // ✅ 마커 감지 시 실행되는 콜백 설정 (최초 1회)
      const pre = arnft.onOriginDetected

      arnft.onOriginDetected = (adjustedOrigin: THREE.Vector3) => {
        if (!markerTracked.current) {
          pre()
          console.log("✅ `onOriginDetected()` 호출됨, 원점 설정:", adjustedOrigin);
          setOrigin(adjustedOrigin);
          markerTracked.current = true;
        }
      };
    }
  }, [arEnabled, ref, arnft, setOrigin]); // `arEnabled`가 변경될 때만 실행

  return <group ref={ref} />;
}

const CameraTracker = ({ origin, setCameraPosition }: { origin: THREE.Vector3; setCameraPosition: any; setObjectPosition: any }) => {
  const { alvaAR } = useARNft();
  const [objectColor] = useState("red");
  const [objectPlaced, setObjectPlaced] = useState(false);
  const frustum = useRef(new THREE.Frustum());
  const objectRef = useRef<THREE.Mesh>(null);
  const applyPose = useRef<any>(null);
  const objectPosition = useRef(new THREE.Vector3());
  const initialCameraPosition = useRef(new THREE.Vector3());
  const poseSet = useRef(false)


  /** ✅ 원점 감지 시 오브젝트 위치 설정 */
  useEffect(() => {
    if (origin && !objectPlaced) {
      console.log("🔄 원점 감지! 초기 오브젝트 위치 설정:", origin);
      objectPosition.current.copy(origin); // ✅ 원점 한 번만 설정
      setObjectPlaced(true); // ✅ 최초 배치 이후 더 이상 변경되지 않음
    }
  }, [origin]);


  /** ✅ AlvaAR SLAM 활성화 */
  useEffect(() => {
    if (alvaAR) {
      applyPose.current = AlvaARConnectorTHREE.Initialize(THREE);
      console.log("✅ AlvaAR SLAM 활성화됨!");
    }
  }, [alvaAR]);

  /** ✅ useFrame 루프 */
  useFrame(({ camera, gl, scene }) => {
    if (!origin || !alvaAR || !applyPose.current) {
      console.warn("🚨 useFrame 실행 중 조건 불만족!", { origin, alvaAR, applyPose: applyPose.current });
      return;
    }

    console.log("✅ useFrame 실행!");

    /** ✅ AlvaAR을 사용하여 카메라 위치 업데이트 */
    const video = document.getElementById("ar-video") as HTMLVideoElement;
    if (!video) {
      console.error("🚨 비디오 엘리먼트를 찾을 수 없음!");
      return;
    }

    /** ✅ Canvas 생성하여 ar-video 영상 캡처 */
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      console.error("🚨 Canvas 컨텍스트를 찾을 수 없음!");
      return;
    }

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    /** ✅ AlvaAR로 SLAM pose 추출 */
    const pose = alvaAR.findCameraPose(imageData);
    if (pose) {


      //////

      applyPose.current(pose, camera.quaternion, camera.position);
      console.log("📍 AlvaAR 카메라 위치 업데이트:", camera.position);

            // 오브젝트
      /** 📌 오브젝트의 위치를 SLAM 초기 위치 기준으로 변환 */
      if (objectRef.current && !poseSet.current) {
        objectRef.current.position.z = objectRef.current.scale.z * 0.5;

        applyPose.current(pose, objectRef.current.quaternion, objectRef.current.position);
        console.log("🟦 오브젝트 위치 업데이트:", objectRef.current.position);
        poseSet.current = true
      }

      // ✅ SLAM이 처음 감지한 카메라 위치를 저장 (최초 1회)
      if (initialCameraPosition.current.length() === 0) {
        initialCameraPosition.current.copy(camera.position);
        console.log("📌 최초 카메라 위치 저장:", initialCameraPosition.current);
      }

      setCameraPosition(camera.position.clone());
    } else {
      console.warn("⚠️ AlvaAR에서 pose를 찾을 수 없음!");
    }

    /** ✅ 카메라 시야 영역(Frustum) 업데이트 */
    camera.updateMatrixWorld();
    camera.near = 0.1;
    camera.far = 100;
    camera.updateProjectionMatrix();

    const matrix = new THREE.Matrix4().multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    );
    frustum.current.setFromProjectionMatrix(matrix);

    const isOriginVisible = frustum.current.containsPoint(origin);
    console.log("👀 isOriginVisible:", isOriginVisible);

    /** ✅ 원점이 카메라의 뷰포트 안에 있으면 오브젝트 배치 */
    if (!objectPlaced && isOriginVisible) {
      console.log("✅ 마커 감지됨! 오브젝트 배치 시작");
      setObjectPlaced(true);
    }

    gl.render(scene, camera)
  }, 1);

  // ✅ objectPlaced가 true이면 오브젝트 계속 유지!
  return (
    objectPlaced && (
      <mesh ref={objectRef} position={[0, 0, 0]} visible={true}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color={objectColor} />
      </mesh>
    )
  );
};



// function Box() {
//   const modelRef = useRef<THREE.Group>(null);
//   const instances: any = useContext(context);
//   const [ang, setAng] = useState<[number, number, number]>([0, 0, 0]);
//   const [pos, setPos] = useState<[number, number, number]>([0, 0, 0]);

//   useFrame(({ gl, camera }) => {
//     if (gl) {
//       (camera as THREE.PerspectiveCamera).aspect = window.innerWidth / window.innerHeight;
//       camera.updateProjectionMatrix();
//       gl.setSize(window.innerWidth, window.innerHeight);
//     }
//   });

//   useEffect(() => {
//     const getData = async () => {
//       try {
//         const res = await fetch('data/angle.json', {
//           headers: {
//             'Content-Type': 'application/json',
//             Accept: 'application/json',
//           },
//         });
//         if (res) {
//           const js = await res.json();
//           setAng(js.angle);
//           setPos(js.position);
//         }
//       } catch (e) {
//         console.log('ERROR', e);
//       }
//     };

//     getData();
//   }, []);

//   return (
//     <>
//       <group
//         ref={modelRef}
//         dispose={null}
//         scale={[1.5, 1.5, 1.5]}
//         position={pos || [0, 1, 1]}
//         rotation={ang || [Math.PI / 5, 0, 0]}
//       >
//         <instances.Blackmetal rotation={[Math.PI / 2, 0, 0]} />
//         <instances.Block rotation={[Math.PI / 2, 0, 0]} />
//         <instances.Brickwall rotation={[Math.PI / 2, 0, 0]} />
//         <instances.Concretea rotation={[Math.PI / 2, 0, 0]} />
//         <instances.Concreteb rotation={[Math.PI / 2, 0, 0]} />
//         <instances.Concretec rotation={[Math.PI / 2, 0, 0]} />
//         <instances.Cooperroof rotation={[Math.PI / 2, 0, 0]} />
//         <instances.Dirt rotation={[Math.PI / 2, 0, 0]} />
//         <instances.Glass rotation={[Math.PI / 2, 0, 0]} />
//         <instances.Painteddoor rotation={[Math.PI / 2, 0, 0]} />
//         <instances.Roof rotation={[Math.PI / 2, 0, 0]} />
//         <instances.Wall rotation={[Math.PI / 2, 0, 0]} />
//         <instances.Windowframe rotation={[Math.PI / 2, 0, 0]} />
//         <instances.Windowframea rotation={[Math.PI / 2, 0, 0]} />
//         <instances.Wood rotation={[Math.PI / 2, 0, 0]} />
//         <instances.Woodenwall rotation={[Math.PI / 2, 0, 0]} />
//       </group>
//       <BakeShadows />
//     </>
//   );
// }

export default function NftApp() {
  const [origin, setOrigin] = useState(null); // NFT 마커의 위치(원점)
  const [cameraPosition, setCameraPosition] = useState(new THREE.Vector3());
  const [objectPosition, setObjectPosition] = useState(new THREE.Vector3());
  useEffect(() => {
    requestCameraPermission();
  }, []);
  return (
    <>
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
        <Back style={{}} />
      </button>
      <div style={{
        position: "absolute",
        zIndex: 9999,
        top: "10px",
        right: "10px",
        background: "rgba(0,0,0,0.6)",
        padding: "10px",
        borderRadius: "8px",
        color: "white",
        fontSize: "14px",
      }}>
        <p>📍 <b>카메라 위치:</b> {cameraPosition.x.toFixed(2)}, {cameraPosition.y.toFixed(2)}, {cameraPosition.z.toFixed(2)}</p>
        <p>🟦 <b>오브젝트 위치:</b> {objectPosition.x.toFixed(2)}, {objectPosition.y.toFixed(2)}, {objectPosition.z.toFixed(2)}</p>
      </div>
      <ARCanvas interpolationFactor={30} id='three-canvas'>
        <Suspense fallback={null}>
          {/* NFT 마커 감지 */}
          <Instances url={"../data/marker/marker"} setOrigin={setOrigin} />

          {/* 카메라 이동 추적 및 거리 기반 오브젝트 배치 */}
          {origin && <CameraTracker origin={origin} setCameraPosition={setCameraPosition} setObjectPosition={setObjectPosition} />}
        </Suspense>
      </ARCanvas>
    </>
  );
}

// useGLTF.preload('data/mp.glb');
