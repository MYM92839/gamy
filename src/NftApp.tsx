import { useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import Back from './assets/icons/Back';
import { useARNft, useNftMarker } from './libs/arnft/arnft/arnftContext';
import ARCanvas from './libs/arnft/arnft/components/arCanvas';
import { requestCameraPermission } from './libs/util';

// const context = createContext(undefined);


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

const CameraTracker = ({ origin }: { origin: THREE.Vector3 }) => {
  const objectVisible = useRef(false); // ✅ `useState` 대신 `useRef` 사용하여 리렌더링 방지
  const [objectPlaced, setObjectPlaced] = useState(false);
  const threshold = 0.1; // ✅ 거리 임계값
  const frustum = useRef(new THREE.Frustum());
  const { arnft } = useARNft();

  useFrame(({ camera, gl }) => {
    if (!origin || !arnft.initialCameraPosition) return;

    // ✅ 현재 카메라 위치 가져오기
    const currentCameraPosition = new THREE.Vector3();
    if (gl.xr.isPresenting) {
      currentCameraPosition.setFromMatrixPosition(camera.matrixWorld);
    } else {
      camera.getWorldPosition(currentCameraPosition);
    }

    // ✅ 📏 보정된 카메라 위치 계산 (현재 위치 - 최초 위치)
    const adjustedCameraPosition = new THREE.Vector3().subVectors(currentCameraPosition, arnft.initialCameraPosition);
    console.log("📍 보정된 카메라 위치:", adjustedCameraPosition);

    // ✅ 거리 계산 (보정된 카메라 위치 기준)
    const distance = adjustedCameraPosition.distanceTo(origin);
    console.log("📏 현재 거리:", distance, "카메라 위치:", adjustedCameraPosition, "원점 위치:", origin);

    // ✅ 카메라의 시야 영역(Frustum) 업데이트
    camera.updateMatrixWorld(true); // ✅ 최신 상태 유지
    const matrix = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.current.setFromProjectionMatrix(matrix);

    // ✅ 원점이 카메라의 뷰포트 안에 있는지 확인
    const isOriginVisible = frustum.current.containsPoint(origin);

    if (objectVisible.current !== isOriginVisible) {
      objectVisible.current = isOriginVisible;
      console.log("👀 isOriginVisible:", isOriginVisible);
    }

    // ✅ 원점이 시야 내에 있고, 거리가 기준값 이상이면 오브젝트 배치
    if (!objectPlaced && distance > threshold && isOriginVisible) {
      console.log("✅ 거리가 임계값 초과 & 원점이 시야 내에 있음, 오브젝트 생성!");
      setObjectPlaced(true);
    }
  });

  return objectPlaced ? (
    <mesh position={[origin.x, origin.y + 1, origin.z]} visible={true}>
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
          {/* NFT 마커 감지 */}
          <Instances url={"../data/marker/marker"} setOrigin={setOrigin} />

          {/* 카메라 이동 추적 및 거리 기반 오브젝트 배치 */}
          {origin && <CameraTracker origin={origin} />}
        </Suspense>
      </ARCanvas>
    </>
  );
}

// useGLTF.preload('data/mp.glb');
