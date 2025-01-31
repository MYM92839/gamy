import { useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as THREE from 'three';
import { Box } from './ArApp';
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

const CameraTracker = ({ setCameraPosition, clicked }: { clicked: boolean; originRef: any; setAniStarted: any; setCameraPosition: any; setObjectPosition: any }) => {
  const { alvaAR } = useSlam();
  const [searchParams] = useSearchParams()
  // const meter = searchParams.get('meter') ? parseInt(searchParams.get('meter')!) : 10
  const scale = searchParams.get('scale') ? parseInt(searchParams.get('scale')!) : 1
  const x = searchParams.get('x') ? parseInt(searchParams.get('x')!) : 0
  const y = searchParams.get('x') ? parseInt(searchParams.get('y')!) : 0
  const z = searchParams.get('x') ? parseInt(searchParams.get('z')!) : 1
  // const [objectColor] = useState("red");
  const [objectPlaced, setObjectPlaced] = useState(false);
  // const [objectVisible, setObjectVisible] = useState(false);
  const objectRef = useRef<THREE.Group>(null);
  const applyPose = useRef<any>(null);
  const objectPosition = useRef(new THREE.Vector3());
  const sett = useRef(false)
  // const originSet = useRef(false)
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
    // if (originRef.current && !objectPlaced) {
    //   console.log("🔄 원점 감지! 초기 오브젝트 위치 설정:", originRef.current);
    //   objectPosition.current.copy(originRef.current); // ✅ 원점 한 번만 설정
    //   setObjectPlaced(true); // ✅ 최초 배치 이후 더 이상 변경되지 않음
    // }

    if (!objectPlaced && clicked/*  */) {
      objectPosition.current.set(0, 0, 0)
      setObjectPlaced(true)
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


      if (objectRef.current && !sett.current) {
        applyPose.current(pose, objectRef.current.quaternion, objectRef.current.position);
        sett.current = true
      }

      // 오브젝트
      // if (objectRef.current && !originSet.current) {

      //   originSet.current = true
      //   m.fromArray(pose);
      //   r.setFromRotationMatrix(m);
      //   t.set(pose[12], pose[13], pose[14]);

      //   (objectRef.current.quaternion !== null) && objectRef.current.quaternion.set(r.x, -r.y, -r.z, r.w);
      //   (objectRef.current.position !== null) && objectRef.current.position.set(-t.x, t.y, t.z);

      //   // applyPose로 오브젝트 위치 업데이트
      //   // applyPose.current(pose, objectRef.current.quaternion, objectRef.current.position);
      //   // 오브젝트 위치 반전 (좌우, 앞뒤)


      //   console.log("🟦 오브젝트 위치 업데이트 (반전됨):", objectRef.current.position);
      // }


      setCameraPosition(camera.position.clone());
    } else {
      console.warn("⚠️ AlvaAR에서 pose를 찾을 수 없음!");
    }

    gl.autoClear = true
    gl.render(scene, camera)
  });

  // ✅ objectPlaced가 true이면 오브젝트 계속 유지!/*  */
  return (
    clicked && (<group ref={objectRef} scale={scale} position={[x, y, z]} visible={true}>
      <Box onRenderEnd={() => { }} on={true} />
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

export default function NftAppT() {
  // const [origin, setOrigin] = useState(null); // NFT 마커의 위치(원점)
  const [cameraPosition, setCameraPosition] = useState(new THREE.Vector3());
  const [objectPosition, setObjectPosition] = useState(new THREE.Vector3());
  // const [aniStarted, setAniStarted] = useState(false)
  const [clicked, setClicked] = useState(false)
  const originRef = useRef(null)

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
      {
        !clicked && <div
          style={{
            position: "absolute",
            width: '50dvw',
            height: '50dvh',
            top: "50dvh",
            left: '50dvw',
            zIndex: 9999,
            transform: `translate(-${50}%, -${25}%)`

          }}
        > <svg
          width={'200px'}
          height={'200px'}
          viewBox="0 0 50 50"
          fill="none"
        >
            <circle
              cx="25"
              cy="25"
              r="24"
              stroke={"rgba(0,0,0,0.3)"}
              strokeWidth={'2px'}
              fill="none"
            />
          </svg></div>
      }
      {!clicked && <div
        style={{
          position: "absolute",
          zIndex: 9999,
          top: "50dvh",
          left: '50dvw',
          background: "rgba(0,0,0,0.6)",
          padding: "10px",
          borderRadius: "8px",
          color: "white",
          fontSize: "14px",
          transform: `translate(-${50}%, -${50}%)`
        }}
      >

        <p>조형물을 가이드라인 안에 맞춰주세요</p>
      </div>}
      {!clicked && <div
        style={{
          position: "fixed",
          zIndex: 99999999,
          top: "60dvh",
          left: '50dvw',
          background: "rgba(0,0,0,0.6)",
          padding: "10px",
          borderRadius: "8px",
          color: "white",
          fontSize: "14px",
          transform: `translate(-${50}%, -${50}%)`
        }}
      >
        <button style={{ zIndex: 99999 }} onClick={() => { setClicked(true) }}>토끼 부르기</button>
      </div>}

      <SlamCanvas id='three-canvas'>
        <Suspense fallback={null}>
          {/* NFT 마커 감지 */}
          {/* 카메라 이동 추적 및 거리 기반 오브젝트 배치 */}
          <CameraTracker clicked={clicked} setAniStarted={() => {/*  */ }} originRef={originRef} setCameraPosition={setCameraPosition} setObjectPosition={setObjectPosition} />
          <ambientLight />
          <directionalLight position={[100, 100, 0]} />
        </Suspense>
      </SlamCanvas>
    </>
  );
}

// useGLTF.preload('data/mp.glb');
