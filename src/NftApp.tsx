import { BakeShadows, Environment, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Suspense, createContext, useContext, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import Back from './assets/icons/Back';
import { useARNft, useNftMarker } from './libs/arnft/arnft/arnftContext';
import ARCanvas from './libs/arnft/arnft/components/arCanvas';
import { requestCameraPermission } from './libs/util';

const context = createContext(undefined);


export function Instances({ url, setOrigin }: any) {
  const ref = useNftMarker(url);
  const { arEnabled } = useARNft(); // AR 활성화 여부 확인
  const markerTracked = useRef(false); // NFT 마커 감지 여부

  useEffect(() => {
    if (!markerTracked.current && arEnabled && ref.current) {
      // ✅ arEnabled가 true로 전환되었을 때 한 번만 실행
      if (ref.current.visible) {
        // NFT 마커가 감지되었을 때 위치 가져오기
        const markerPosition = new THREE.Vector3();
        ref.current.getWorldPosition(markerPosition);

        console.log("NFT 마커 감지됨, 원점 설정:", markerPosition);
        setOrigin(markerPosition); // 원점 저장
        markerTracked.current = true; // 이후 다시 설정하지 않음
      }
    }
  }, [arEnabled, ref, setOrigin]); // ✅ arEnabled가 변경될 때만 실행

  return <group ref={ref} visible={!markerTracked.current} />;
}

const CameraTracker = ({ origin }: { origin: THREE.Vector3 }) => {
  const [objectVisible, setObjectVisible] = useState(false);
  const [objectPlaced, setObjectPlaced] = useState(false);
  const threshold = 2.0; // 거리 임계값
  const frustum = useRef(new THREE.Frustum()); // 시야(뷰포트) 계산을 위한 Frustum 객체

  useFrame(({ camera }) => {
    if (!origin) return;

    const cameraPosition = new THREE.Vector3();
    camera.getWorldPosition(cameraPosition);

    const distance = cameraPosition.distanceTo(origin);
    console.log("현재 거리:", distance);

    // ✅ 카메라의 시야 영역(Frustum) 업데이트
    const matrix = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.current.setFromProjectionMatrix(matrix);

    // ✅ 원점이 카메라의 뷰포트 안에 있는지 확인
    const isOriginVisible = frustum.current.containsPoint(origin);
    setObjectVisible(isOriginVisible);

    // ✅ 원점이 시야에 있고, 거리가 기준값 이상이면 오브젝트 배치
    if (!objectPlaced && distance > threshold && isOriginVisible) {
      console.log("거리가 임계값 초과 & 원점이 시야 내에 있음, 오브젝트 생성!");
      setObjectPlaced(true);
    }
  });

  return objectPlaced ? (
    <mesh position={origin} visible={objectVisible}>
      <boxGeometry args={[0.5, 0.5, 0.5]} />
      <meshStandardMaterial color="blue" />
    </mesh>
  ) : null;
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
          {/* NFT 마커 감지 후 원점 설정 */}
          <Instances url={"../data/marker/marker"} setOrigin={setOrigin} />

          {/* 카메라 이동 추적 및 거리 기반 오브젝트 배치 */}
          {origin && <CameraTracker origin={origin} />}

          {/* 환경 설정 */}
          <Environment preset="park" />
        </Suspense>
      </ARCanvas>
    </>
  );
}

// useGLTF.preload('data/mp.glb');
