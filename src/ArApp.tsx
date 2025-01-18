// import { useFrame } from '@react-three/fiber';
import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import * as THREE from 'three';
import Back from './assets/icons/Back';
import Capture from './assets/icons/Capture';
// import { useARNft, useNftMarker } from './libs/arnft/arnft/arnftContext';
// import { Effects } from './libs/arnft/arnft/components/Effects';
import { Environment, Merged, useAnimations, useGLTF } from '@react-three/drei';
import Modal from 'react-modal';
import { DRACOLoader } from 'three-stdlib';
// import { Effects } from './libs/arnft/arnft/components/Effects';
import Spinner from './components/Spinner.js';
import { ARAnchor, ARView } from './libs/react-three-mind.js';

import { GLTF } from 'three-stdlib';

type NODE = {
  [key: string]: JSX.IntrinsicElements['mesh'];
};

type GLTFResult = GLTF & {
  nodes: {
    Brow_GEO001: THREE.SkinnedMesh;
    Incisor_GEO001: THREE.SkinnedMesh;
    L_EyeBall_GEO001: THREE.SkinnedMesh;
    L_EyeHighLight_GEO001: THREE.SkinnedMesh;
    Lower_gum_GEO001: THREE.SkinnedMesh;
    Lower_Teeth_GEO001: THREE.SkinnedMesh;
    R_EyeBall_GEO001: THREE.SkinnedMesh;
    R_EyeHighLight_GEO001: THREE.SkinnedMesh;
    Rabbit_Xgen_GEO001: THREE.SkinnedMesh;
    Tongue_GEO001: THREE.SkinnedMesh;
    Upper_gum_GEO001: THREE.SkinnedMesh;
    Upper_Teeth_GEO001: THREE.SkinnedMesh;
    L_Iris_GEO001: THREE.Mesh;
    R_Iris_GEO001: THREE.Mesh;
    Root_M: THREE.Bone;
  };
  materials: {
    ['Motion_aa_Eyelash_M_LMBT.001']: THREE.MeshStandardMaterial;
    ['Motion_Mouth_M_BLNN.001']: THREE.MeshStandardMaterial;
    ['Motion_Eye_M_LMBT.001']: THREE.MeshStandardMaterial;
    ['Motion_EyeHighLight_M_LMBT.001']: THREE.MeshStandardMaterial;
    ['Motion_aa_Body_M_BLNN.001']: THREE.MeshStandardMaterial;
    ['Motion_Iris_M_BLNN.001']: THREE.MeshStandardMaterial;
  };
};

const context = createContext<any>(null);
export function Instances({ children, ...props }: PropsWithChildren) {
  const { nodes } = useGLTF('/moon.glb') as GLTFResult;
  const instances = useMemo(
    () =>
      ({
        BrowGEO: nodes.Brow_GEO001,
        IncisorGEO: nodes.Incisor_GEO001,
        LEyeBallGEO: nodes.L_EyeBall_GEO001,
        LEyeHighLightGEO: nodes.L_EyeHighLight_GEO001,
        LowergumGEO: nodes.Lower_gum_GEO001,
        LowerTeethGEO: nodes.Lower_Teeth_GEO001,
        REyeBallGEO: nodes.R_EyeBall_GEO001,
        REyeHighLightGEO: nodes.R_EyeHighLight_GEO001,
        RabbitXgenGEO: nodes.Rabbit_Xgen_GEO001,
        TongueGEO: nodes.Tongue_GEO001,
        UppergumGEO: nodes.Upper_gum_GEO001,
        UpperTeethGEO: nodes.Upper_Teeth_GEO001,
        LIrisGEO: nodes.L_Iris_GEO001,
        RIrisGEO: nodes.R_Iris_GEO001,
      } as unknown as NODE),
    [nodes]
  );
  return (
    <Merged meshes={instances} {...props}>
      {(instances: NODE) => <context.Provider value={instances} children={children} />}
    </Merged>
  );
}

const customStyles = {
  overlay: {
    zIndex: 999,
  },
  content: {
    top: '50%',
    left: '50%',
    right: 'auto',
    bottom: 'auto',
    marginRight: '-50%',
    borderRadius: '16px',
    width: '100dvw',
    height: '100dvh',
    padding: '8px',
    transform: 'translate(-50%, -50%)',
    zIndex: 999,
  },
};

Modal.setAppElement('#root');

function Tree() {
  const modelRef = useRef<THREE.Group>(null);
  const { nodes, materials, animations } = useGLTF('/walk_f.glb', false, false, (loader) => {
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('/draco/');
    loader.setDRACOLoader(dracoLoader);
  });
  const { actions } = useAnimations(animations, modelRef);

  useEffect(() => {
    if (actions) {
      for (const i in actions) {
        actions[i]?.setLoop(THREE.LoopRepeat, Infinity);
        actions[i]?.reset().play();
      }
    }
  }, [actions]);

  // Parse the Base64 model and set nodes and materials

  const [ang] = useState<[number, number, number]>([0, 0, 0]);
  const [pos] = useState<[number, number, number]>([0, 0, 0]);

  return (
    nodes && (
      <>
        <group dispose={null} scale={[15, 15, 15]} position={pos || [0, 0, 0]} rotation={ang || [0, 0, 0]}>
          <group name="Scene" ref={modelRef}>
            <group name="Bip001" position={[0, 0, 0]} rotation={[-3.106, -1.323, 3.097]} scale={0.01}>
              {/* <group name="Bip001" position={[0.031, 0.963, -0.054]} rotation={[-3.106, -1.323, 3.097]} scale={0.01}> */}
              <group name="Bip001_Footsteps" position={[7.636, -96.125, -0.842]} rotation={[-2.83, 1.31, 2.829]} />
              <skinnedMesh
                name="down"
                geometry={(nodes.down as THREE.Mesh).geometry}
                material={materials['Material #0']}
                skeleton={(nodes.down as THREE.SkinnedMesh).skeleton}
              />
              <skinnedMesh
                name="down001"
                geometry={(nodes.down001 as THREE.Mesh).geometry}
                material={materials['Material #0']}
                skeleton={(nodes.down001 as THREE.SkinnedMesh).skeleton}
              />
              <skinnedMesh
                name="hair"
                geometry={(nodes.hair as THREE.Mesh).geometry}
                material={materials.hair}
                skeleton={(nodes.hair as THREE.SkinnedMesh).skeleton}
              />
              <skinnedMesh
                name="hat"
                geometry={(nodes.hat as THREE.Mesh).geometry}
                material={materials.hat}
                skeleton={(nodes.hat as THREE.SkinnedMesh).skeleton}
              />
              <skinnedMesh
                name="head"
                geometry={(nodes.head as THREE.Mesh).geometry}
                material={materials['08 - Default']}
                skeleton={(nodes.head as THREE.SkinnedMesh).skeleton}
              />
              <skinnedMesh
                name="headwear"
                geometry={(nodes.headwear as THREE.Mesh).geometry}
                material={materials.hat}
                skeleton={(nodes.headwear as THREE.SkinnedMesh).skeleton}
              />
              <skinnedMesh
                name="Object001"
                geometry={(nodes.Object001 as THREE.Mesh).geometry}
                material={materials['Material #0']}
                skeleton={(nodes.Object001 as THREE.SkinnedMesh).skeleton}
              />
              <skinnedMesh
                name="up"
                geometry={(nodes.up as THREE.Mesh).geometry}
                material={materials.up}
                skeleton={(nodes.up as THREE.SkinnedMesh).skeleton}
              />
              <primitive object={nodes.Bip001_Pelvis} />
            </group>
          </group>
        </group>
      </>
    )
  );
}

function Box({ onRenderEnd, ...props }: JSX.IntrinsicElements['group'] & { onRenderEnd: () => void }) {
  const modelRef = useRef<THREE.Group>(null);
  const instances = useContext(context);

  // const { nodes, animations } = useGLTF('/moon_f.glb', false, false, (loader) => {
  //   const dracoLoader = new DRACOLoader();
  //   dracoLoader.setDecoderPath('/draco/');
  //   loader.setDRACOLoader(dracoLoader);
  // }) as GLTFResult;
  const { nodes, animations } = useGLTF('/moon_f.glb') as GLTFResult;
  const { actions } = useAnimations(animations, modelRef);

  useEffect(() => {
    console.log('ACTIONS', actions);
    if (actions) {
      for (const i in actions) {
        actions[i]?.setLoop(THREE.LoopRepeat, Infinity);
        actions[i]?.reset().play();
      }
    }
  }, [actions]);

  useEffect(() => {
    if (nodes) onRenderEnd();
  }, [nodes]);

  console.log('NODES', nodes);
  if (nodes && nodes.Root_M) {
    const p = new THREE.Vector3();
    nodes.Root_M.getWorldPosition(p);
    console.log('LNODDD', p);
  }

  return (
    nodes &&
    instances && (
      <group ref={modelRef} {...props} dispose={null}>
        <group name="Scene">
          <group name="Group001">
            <group name="DeformationSystem001">
              <instances.BrowGEO name="Brow_GEO001" />
              <instances.IncisorGEO name="Incisor_GEO001" />
              <instances.LEyeBallGEO name="L_EyeBall_GEO001" />
              <instances.LEyeHighLightGEO name="L_EyeHighLight_GEO001" />
              <instances.LowergumGEO name="Lower_gum_GEO001" />
              <instances.LowerTeethGEO name="Lower_Teeth_GEO001" />
              <instances.REyeBallGEO name="R_EyeBall_GEO001" />
              <instances.REyeHighLightGEO name="R_EyeHighLight_GEO001" />
              <instances.RabbitXgenGEO name="Rabbit_Xgen_GEO001" />
              <instances.TongueGEO name="Tongue_GEO001" />
              <instances.UppergumGEO name="Upper_gum_GEO001" />
              <instances.UpperTeethGEO name="Upper_Teeth_GEO001" />
              <primitive object={nodes.Root_M} />
            </group>
            <group name="Geometry001" scale={0.1}>
              <group name="Rabbit_GEO_GRP001">
                <group name="Brow_GRP001" />
                <group name="Eye_GRP001">
                  <group name="L_Eyeball_GEO001">
                    <instances.LIrisGEO name="L_Iris_GEO001" scale={10} />
                  </group>
                  <group name="R_Eyeball_GEO001">
                    <instances.RIrisGEO name="R_Iris_GEO001" scale={10} />
                  </group>
                </group>
                <group name="Mouth_GRP001" />
              </group>
            </group>
            <group name="MotionSystem001" scale={0.1}>
              <group name="MainSystem001">
                <group name="MainExtra2001">
                  <group name="MainExtra1001">
                    <group name="Main001" />
                  </group>
                </group>
              </group>
            </group>
          </group>
        </group>
      </group>
    )
  );
}

export default function ArApp() {
  const { char } = useParams();
  const [modalIsOpen, setIsOpen] = useState(false);
  const [foto, setFoto] = useState<Blob | null>(null);
  const [fotoUrl, setFotoUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);

  function openModal() {
    setIsOpen(true);
    captureImage();
  }

  function closeModal() {
    setIsOpen(false);
  }

  function closeSaveModal() {
    if (foto) shareOrDownloadImage(foto);
    setIsOpen(false);
  }

  const shareOrDownloadImage = (blob: Blob): void => {
    if (navigator.canShare && navigator.canShare({ files: [new File([blob], 'test.png', { type: blob.type })] })) {
      const file = new File([blob], `camera-frame-${new Date().getTime()}.png`, {
        type: 'image/png',
      });

      navigator
        .share({
          files: [file],
          title: 'My Captured Image',
          text: 'Check out this captured photo!',
        })
        .catch((error) => {
          console.error('Sharing failed:', error);
        });
    } else {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `camera-frame-${new Date().getTime()}.png`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
    }
  };

  // const captureImage = async () => {
  //   const videoElement: HTMLVideoElement | null = document.querySelector('#ar-video'); // 비디오 요소
  //   const threeCanvas: HTMLCanvasElement | null = document.querySelector('#three-canvas')?.children[0]
  //     .children[0]! as HTMLCanvasElement; // Three.js 캔버스
  //   const container = videoElement?.parentElement || null; // 최상위 렌더링 컨테이너

  //   if (!container || !videoElement || !threeCanvas) {
  //     console.warn('Required elements not ready');
  //     return;
  //   }

  //   // 캔버스 크기 설정
  //   const containerWidth = container.clientWidth;
  //   const containerHeight = container.clientHeight;
  //   const devicePixelRatio = window.devicePixelRatio || 1;

  //   const offscreenCanvas = document.createElement('canvas');
  //   offscreenCanvas.width = containerWidth * devicePixelRatio;
  //   offscreenCanvas.height = containerHeight * devicePixelRatio;

  //   const context = offscreenCanvas.getContext('2d');
  //   if (!context) {
  //     console.error('Failed to create canvas context.');
  //     return;
  //   }

  //   // 고해상도 지원
  //   context.scale(devicePixelRatio, devicePixelRatio);

  //   // Helper function to calculate draw parameters
  //   const calculateDrawParams = (element: HTMLVideoElement | HTMLCanvasElement, objectFit: 'cover' | 'contain') => {
  //     const elementWidth = element instanceof HTMLVideoElement ? element.videoWidth : element.width;
  //     const elementHeight = element instanceof HTMLVideoElement ? element.videoHeight : element.height;

  //     if (elementWidth === 0 || elementHeight === 0) return null;

  //     const elementAspectRatio = elementWidth / elementHeight;
  //     const containerAspectRatio = containerWidth / containerHeight;

  //     let drawWidth = containerWidth;
  //     let drawHeight = containerHeight;
  //     let offsetX = 0;
  //     let offsetY = 0;

  //     if (objectFit === 'cover') {
  //       if (elementAspectRatio > containerAspectRatio) {
  //         drawWidth = containerHeight * elementAspectRatio;
  //         offsetX = (containerWidth - drawWidth) / 2; // 가로 중심 정렬
  //       } else {
  //         drawHeight = containerWidth / elementAspectRatio;
  //         offsetY = (containerHeight - drawHeight) / 2; // 세로 중심 정렬
  //       }
  //     } else if (objectFit === 'contain') {
  //       if (elementAspectRatio > containerAspectRatio) {
  //         drawHeight = containerWidth / elementAspectRatio;
  //         offsetY = (containerHeight - drawHeight) / 2; // 세로 중심 정렬
  //       } else {
  //         drawWidth = containerHeight * elementAspectRatio;
  //         offsetX = (containerWidth - drawWidth) / 2; // 가로 중심 정렬
  //       }
  //     }

  //     return { drawWidth, drawHeight, offsetX, offsetY };
  //   };

  //   try {
  //     // Step 1: 비디오를 캔버스에 그리기
  //     const videoParams = calculateDrawParams(videoElement, 'cover');
  //     if (videoParams) {
  //       context.drawImage(
  //         videoElement,
  //         videoParams.offsetX,
  //         videoParams.offsetY,
  //         videoParams.drawWidth,
  //         videoParams.drawHeight
  //       );
  //     }

  //     // Step 2: Three.js WebGL 캔버스를 캔버스에 그리기
  //     const threeParams = calculateDrawParams(threeCanvas, 'cover');
  //     if (threeParams) {
  //       context.drawImage(
  //         threeCanvas,
  //         threeParams.offsetX,
  //         threeParams.offsetY,
  //         threeParams.drawWidth,
  //         threeParams.drawHeight
  //       );
  //     }

  //     // Step 3: 최종 이미지를 PNG로 저장
  //     offscreenCanvas.toBlob((blob) => {
  //       if (blob) {
  //         setFoto(blob);
  //       }
  //     }, 'image/png');
  //   } catch (error) {
  //     console.error('Error capturing image:', error);
  //   }
  // };

  const captureImage = async () => {
    const threeCanvas: HTMLCanvasElement | null = document.querySelector('#three-canvas')?.children[0]
      .children[0]! as HTMLCanvasElement; // Three.js 캔버스
    console.log('THREE,', threeCanvas, document.querySelector('#three-canvas')?.children[0]);
    if (!threeCanvas) {
      console.warn('Three.js canvas is not ready');
      return;
    }

    // 캔버스 크기와 해상도 설정
    const canvasWidth = threeCanvas.width;
    const canvasHeight = threeCanvas.height;
    const devicePixelRatio = window.devicePixelRatio || 1; // 고해상도 지원을 위한 비율

    const offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = canvasWidth * devicePixelRatio; // 고해상도 캔버스 폭
    offscreenCanvas.height = canvasHeight * devicePixelRatio; // 고해상도 캔버스 높이

    const context = offscreenCanvas.getContext('2d');
    if (!context) {
      console.error('Failed to create canvas context.');
      return;
    }

    // 고해상도 설정
    context.scale(devicePixelRatio, devicePixelRatio);

    try {
      // Three.js WebGL 캔버스를 캔버스에 그리기
      context.drawImage(threeCanvas, 0, 0, canvasWidth, canvasHeight);

      // 최종 이미지를 PNG로 저장
      offscreenCanvas.toBlob((blob) => {
        console.log('BLOB', blob);
        if (blob) {
          setFoto(blob); // 캡처된 이미지를 상태로 저장
        }
      }, 'image/png');
    } catch (error) {
      console.error('Error capturing image:', error);
    }
  };

  useEffect(() => {
    if (foto) {
      const reader = new FileReader();
      reader.onload = () => {
        setFotoUrl(reader.result as string);
      };
      reader.readAsDataURL(foto);
    }
  }, [foto]);

  const handleLoading = () => {
    if (loading) setLoading(false);
  };

  return (
    <>
      <Modal isOpen={modalIsOpen} onRequestClose={closeModal} style={customStyles} contentLabel="사진확인">
        <div className="w-full h-full max-w-full max-h-full flex flex-col gap-y-2 p-2">
          <div className="flex-1 rounded-sm overflow-hidden z-[999] isolate">
            {fotoUrl && <img className="flex-1 object-contain z-[999]" src={fotoUrl} />}
          </div>
          <div className="w-full flex gap-x-2 font-semibold">
            <button className="flex-1 rounded-[8px] p-2 border border-[#344173] text-[#344173]" onClick={closeModal}>
              다시찍기
            </button>
            <button className="flex-1 rounded-[8px] p-2 text-white bg-[#344173]" onClick={closeSaveModal}>
              저장하기
            </button>
          </div>
        </div>
      </Modal>
      {!modalIsOpen && (
        <>
          <button
            style={{
              zIndex: 999,
              position: 'fixed',
              width: 'fit-content',
              height: 'fit-content',
              border: 0,
              bottom: '65px',
              left: '24px',
              backgroundColor: 'transparent',
              padding: '1rem',
            }}
            onClick={() => {
              window.history.back();
            }}
          >
            <Back style={{}} />
          </button>
          <button
            style={{
              zIndex: 999,
              position: 'fixed',
              width: 'fit-content',
              height: 'fit-content',
              border: 0,
              backgroundColor: 'transparent',
              padding: '1rem',
              bottom: '48px',
              left: '50%',
              transform: 'translateX(-50%)',
              marginLeft: 'auto',
            }}
            onClick={openModal}
          >
            <Capture style={{}} />
          </button>
        </>
      )}

      {loading && <Spinner className="fixed top-[calc(50%-15px)] left-[calc(50%-15px)] w-8 h-8 z-[9999] isolate" />}
      {/* @ts-ignore */}
      <ARView
        imageTargets={char === 'moon' ? '/moon.mind' : char === 'moons' ? '/moons.mind' : '/tree.mind'}
        autoplay
        flipUserCamera={false} // Prevents automatic flipping of the user camera
        maxTrack={1} // Maximum number of targets tracked simultaneously
        filterMinCF={0.7} // 신뢰도를 더 유연하게
        filterBeta={500} // 필터 반응 속도 조정
        missTolerance={5} // 트래킹 유지를 위해 증가
        warmupTolerance={0} // 초기 트래킹 허용 범위 조정
        id="three-canvas"
        style={{
          width: '100%',
          height: '100%',
          position: 'absolute',
          zIndex: 100,
        }}
        camera={{
          position: [0, 0, 300],
          near: 0.001,
          far: 100000,
        }}
      >
        {/* <FrameH /> */}

        {char === 'moon' ||
          (char === 'moons' && (
            // @ts-ignore
            <ARAnchor
              target={0}
              onAnchorFound={() => {
                console.log('RABBIT found');
              }}
              onAnchorLost={() => {
                console.log('RABBIT lost');
              }}
            >
              <Box onRenderEnd={handleLoading} />
            </ARAnchor>
          ))}
        {/* <Box onRenderEnd={handleLoading} /> */}
        {char === 'tree' && (
          // @ts-ignore
          <ARAnchor
            target={0}
            onAnchorFound={() => {
              console.log('tree found');
            }}
          >
            <Tree />
          </ARAnchor>
        )}

        <Environment files="/HDRI_01.exr" preset={undefined} />
        {/* <Effects /> */}
      </ARView>
    </>
  );
}

// const FrameH = function () {
//   useFrame(({ camera, gl }) => {
//     if (camera && gl) {
//       const container = document.querySelector('#layout');
//       if (container) {
//         const aspect = container.clientWidth / container.clientHeight;
//         (camera as any).aspect = aspect;
//         camera.updateProjectionMatrix();
//         gl.setSize(container.clientWidth, container.clientHeight);
//       }
//     }
//   });
//   return null;
// };
