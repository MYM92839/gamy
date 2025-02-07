import { useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as THREE from 'three';
import { Box } from './ArApp';
import Back from './assets/icons/Back';
import { AlvaARConnectorTHREE } from './libs/alvaConnector';
import ARCanvas from './libs/arnft/arnft/components/arCanvas';
import { requestCameraPermission } from './libs/util';
import { useARNft, useNftMarker } from './libs/XRProvider';

const m = new THREE.Matrix4()
const r = new THREE.Quaternion()
const t = new THREE.Vector3();


// const context = createContext(undefined);
// const currentCameraPosition = new THREE.Vector3();
// const objectPosition = new THREE.Vector3()
export function Instances({ url, setOrigin }: any) {
  const ref = useNftMarker(url);
  const { arEnabled, arnft } = useARNft();
  const markerTracked = useRef(false); // ✅ 마커 감지 여부 추적

  useEffect(() => {
    if (!arnft || !arEnabled || !ref.current) return;

    // 이미 한번 설정했다면 재할당 안 함
    if (markerTracked.current) return;

    const pre = arnft.onOriginDetected
    // 정말 "최초 1회"만
    arnft.onOriginDetected = (adjustedOrigin: THREE.Vector3) => {
      if (!markerTracked.current) {
        if (pre) pre()
        // 여기서 markerTracked.current = true를 세팅해주면
        markerTracked.current = true;
        console.log("✅ `onOriginDetected()` 호출됨, 원점 설정:", adjustedOrigin);
        setOrigin(adjustedOrigin);
      }
    };
  }, [arnft, arEnabled]);

  return <group ref={ref} />;
}

const CameraTracker = ({ originRef, setAniStarted, setCameraPosition }: { originRef: any; setAniStarted: any; setCameraPosition: any; setObjectPosition: any }) => {
  const { alvaAR } = useARNft();
  const [searchParams] = useSearchParams()
  const meter = searchParams.get('meter') ? parseInt(searchParams.get('meter')!) : 10
  const scale = searchParams.get('scale') ? parseInt(searchParams.get('scale')!) : 1
  const x = searchParams.get('x') ? parseInt(searchParams.get('x')!) : 0
  const y = searchParams.get('x') ? parseInt(searchParams.get('y')!) : 0
  const z = searchParams.get('x') ? parseInt(searchParams.get('z')!) : 0
  // const [objectColor] = useState("red");
  const [objectPlaced, setObjectPlaced] = useState(false);
  const [objectVisible, setObjectVisible] = useState(false);
  const objectRef = useRef<THREE.Group>(null);
  const applyPose = useRef<any>(null);
  const objectPosition = useRef(new THREE.Vector3());
  /** ✅ 원점 감지 시 오브젝트 위치 설정 */

  /** ✅ AlvaAR SLAM 활성화 */
  useEffect(() => {
    if (alvaAR) {
      applyPose.current = AlvaARConnectorTHREE.Initialize(THREE);
      console.log("✅ AlvaAR SLAM 활성화됨!");
    }
  }, [alvaAR]);

  /** ✅ useFrame 루프 */
  useFrame(({ camera, gl, scene }) => {
    if (originRef.current && !objectPlaced) {
      console.log("🔄 원점 감지! 초기 오브젝트 위치 설정:", originRef.current);
      objectPosition.current.copy(originRef.current); // ✅ 원점 한 번만 설정
      setObjectPlaced(true); // ✅ 최초 배치 이후 더 이상 변경되지 않음
    }

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

    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    /** ✅ AlvaAR로 SLAM pose 추출 */
    const pose = alvaAR.findCameraPose(imageData);
    if (pose) {


      //////

      applyPose.current(pose, camera.quaternion, camera.position);
      console.log("📍 AlvaAR 카메라 위치 업데이트:", camera.position);

      // 오브젝트
      if (objectRef.current) {


        m.fromArray(pose);
        r.setFromRotationMatrix(m);
        t.set(pose[12], pose[13], pose[14]);

        // (objectRef.current.quaternion !== null) && objectRef.current.quaternion.set(r.x, -r.y, -r.z, r.w);
        // (objectRef.current.position !== null) && objectRef.current.position.set(-t.x, t.y, t.z);

        // applyPose로 오브젝트 위치 업데이트
        // applyPose.current(pose, objectRef.current.quaternion, objectRef.current.position);
        // 오브젝트 위치 반전 (좌우, 앞뒤)


        console.log("🟦 오브젝트 위치 업데이트 (반전됨):", objectRef.current.position);
      }


      // 카메라와 오브젝트 간 거리 계산
      const distance = camera.position.distanceTo(objectPosition.current);
      console.log("카메라와 오브젝트 간 거리:", distance);

      // 3미터 이상 떨어졌을 때 Box 배치
      if (distance >= meter && objectPlaced) {
        console.log("✅ 카메라가 3미터 이상 떨어짐. 오브젝트 배치 시작");
        setAniStarted(true)
        setObjectVisible(true);
      } else {
        setAniStarted(false)
        setObjectVisible(false);

      }


      setCameraPosition(camera.position.clone());
    } else {
      console.warn("⚠️ AlvaAR에서 pose를 찾을 수 없음!");
    }

    gl.autoClear = true
    gl.render(scene, camera)
  });

  // ✅ objectPlaced가 true이면 오브젝트 계속 유지!
  return (
    // objectPlaced && (
    // <mesh ref={objectRef} position={[0, 0, 0]} visible={true}>
    //   <boxGeometry args={[1, 1, 1]} />
    //   <meshStandardMaterial color={objectColor} />
    // </mesh>
    objectVisible && (<group ref={objectRef} scale={scale} position={[x, y, z]} visible={true}>
      <Box onRenderEnd={() => { }} on={true} sposition={[0, 0, 0]} oposition={[0, 0, 0]} />
    </group>)
    //)
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
  const [aniStarted, setAniStarted] = useState(false)
  const originRef = useRef(null)
  useEffect(() => {
    requestCameraPermission();
  }, []);
  useEffect(() => {
    if (origin) {
      originRef.current = origin
    }
  }, [origin])
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
      {!origin && <div
        style={{
          position: "absolute",
          zIndex: 9999,
          top: "50%",
          right: "50%",
          background: "rgba(0,0,0,0.6)",
          padding: "10px",
          borderRadius: "8px",
          color: "white",
          fontSize: "14px",
        }}
      >
        <p>안내판의 QR코드를 비춰주세요</p>
      </div>}
      {!aniStarted && origin && <div
        style={{
          position: "absolute",
          zIndex: 9999,
          top: "50%",
          right: "50%",
          background: "rgba(0,0,0,0.6)",
          padding: "10px",
          borderRadius: "8px",
          color: "white",
          fontSize: "14px",
        }}
      >
        <p>뒤쪽 안내발판으로 천천히 이동후 달 조형물을 비춰보세요</p>
      </div>}
      <ARCanvas interpolationFactor={30} id='three-canvas'>
        <Suspense fallback={null}>
          {/* NFT 마커 감지 */}
          <Instances url={"../data/marker/marker"} setOrigin={setOrigin} />

          {/* 카메라 이동 추적 및 거리 기반 오브젝트 배치 */}
          {origin && <CameraTracker setAniStarted={setAniStarted} originRef={originRef} setCameraPosition={setCameraPosition} setObjectPosition={setObjectPosition} />}
          <ambientLight />
          <directionalLight position={[100, 100, 0]} />
        </Suspense>
      </ARCanvas>
    </>
  );
}

// useGLTF.preload('data/mp.glb');
