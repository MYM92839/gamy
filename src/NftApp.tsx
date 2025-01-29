import { useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import Back from './assets/icons/Back';
import { useARNft, useNftMarker } from './libs/arnft/arnft/arnftContext';
import ARCanvas from './libs/arnft/arnft/components/arCanvas';
import { requestCameraPermission } from './libs/util';
import { AlvaARConnectorTHREE } from './libs/alvaConnector';

// const context = createContext(undefined);
// const currentCameraPosition = new THREE.Vector3();


export function Instances({ url, setOrigin }: any) {
  const ref = useNftMarker(url);
  const { arEnabled, arnft } = useARNft();
  const markerTracked = useRef(false); // ✅ 마커 감지 여부 추적

  useEffect(() => {
    if (!arnft || !arEnabled || !ref.current) return;

    if (!markerTracked.current) {
      // ✅ 마커 감지 시 실행되는 콜백 설정 (최초 1회)
      arnft.onOriginDetected = (adjustedOrigin: THREE.Vector3) => {
        console.log("✅ `onOriginDetected()` 호출됨, 원점 설정:", adjustedOrigin);
        setOrigin(adjustedOrigin); // 원점 저장
        markerTracked.current = true; // ✅ 이후 다시 실행되지 않도록 설정
      };
    }
  }, [arEnabled, ref, arnft, setOrigin]); // `arEnabled`가 변경될 때만 실행

  return <group ref={ref} />;
}


const CameraTracker = () => {
  const { alvaAR } = useARNft();
  const rotationQuaternion = new THREE.Quaternion();
  const translationVector = new THREE.Vector3();
  const applyPose = AlvaARConnectorTHREE.Initialize(THREE);

  useFrame(() => {
    if (!alvaAR) return;

    const videoCanvas = document.createElement("canvas");
    const ctx = videoCanvas.getContext("2d");
    const video = document.querySelector("video") as HTMLVideoElement;

    if (!ctx || !video) return;
    videoCanvas.width = video.videoWidth;
    videoCanvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);

    const imageData = ctx.getImageData(0, 0, video.videoWidth, video.videoHeight);
    const pose = alvaAR.findCameraPose(imageData);

    if (pose) {
      applyPose(pose, rotationQuaternion, translationVector);
      console.log("📍 SLAM 위치 업데이트:", translationVector);
    }
  });

  return null;
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

      <ARCanvas interpolationFactor={30}>
        <Suspense fallback={null}>
          {/* NFT 마커 감지 */}
          <Instances url={"../data/marker/marker"} setOrigin={setOrigin} />

          {/* 카메라 이동 추적 및 거리 기반 오브젝트 배치 */}
          {origin && <CameraTracker />}
        </Suspense>
      </ARCanvas>
    </>
  );
}

// useGLTF.preload('data/mp.glb');
