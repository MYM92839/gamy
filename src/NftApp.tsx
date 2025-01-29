import { useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import Back from './assets/icons/Back';
import { useARNft, useNftMarker } from './libs/arnft/arnft/arnftContext';
import ARCanvas from './libs/arnft/arnft/components/arCanvas';
import { requestCameraPermission } from './libs/util';

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

const CameraTracker = ({ origin }: { origin: THREE.Vector3 }) => {
  const [objectColor, setObjectColor] = useState('red')
  const [, setObjectVisible] = useState(false);
  const [objectPlaced, setObjectPlaced] = useState(false);
  const threshold = 0.1;
  const frustum = useRef(new THREE.Frustum());
  const { arnft } = useARNft();

  useFrame(({ camera }) => {
    if (!origin) return; // ✅ 원점(origin) 없으면 실행 X

    // ✅ 현재 카메라 위치는 항상 (0,0,0) → AR.js 기본 동작 방식 반영
    const cameraPosition = new THREE.Vector3(0, 0, 0);

    // ✅ 마커와 카메라의 거리 계산
    const distance = cameraPosition.distanceTo(origin);
    console.log("📏 현재 거리:", distance, "원점 위치:", origin);

    // ✅ 카메라의 시야 영역(Frustum) 업데이트
    const matrix = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.current.setFromProjectionMatrix(matrix);

    // ✅ 원점이 카메라의 뷰포트 안에 있는지 확인
    const isOriginVisible = frustum.current.containsPoint(origin);
    console.log("👀 isOriginVisible:", isOriginVisible);

    setObjectVisible(isOriginVisible);

    // ✅ 오브젝트가 처음 배치되지 않았다면 시야 내에서 배치
    if (!objectPlaced && isOriginVisible) {
      console.log("✅ 마커 감지됨! 오브젝트 배치 시작");
      setObjectPlaced(true);
    }

    // ✅ 거리 기반으로 오브젝트 색상 변경
    const newColor = distance > threshold ? "red" : "blue";

    setObjectColor(newColor);
  });

  useEffect(() => {
    arnft.onTrackingLost = () => {
      console.log("❌ 마커 손실 감지됨! 하지만 원점은 유지됨.");
      // 마커가 손실되었어도 objectPlaced 상태를 유지
      setObjectPlaced((prev) => prev || true);
    };
  }, [arnft])

  // ✅ `objectPlaced`가 true이면 오브젝트 계속 유지!
  return objectPlaced ? (
    <mesh position={[origin.x, origin.y + 1, origin.z]} visible={true}>
      <boxGeometry args={[0.5, 0.5, 0.5]} />
      <meshStandardMaterial color={objectColor} />
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
