// import { useFrame } from '@react-three/fiber';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import * as THREE from 'three';
import Back from './assets/icons/Back';
import Capture from './assets/icons/Capture';
// import { useARNft, useNftMarker } from './libs/arnft/arnft/arnftContext';
// import { Effects } from './libs/arnft/arnft/components/Effects';
import { Environment, Mask, useAnimations, useGLTF, useMask } from '@react-three/drei';
import Modal from 'react-modal';
// import { Effects } from './libs/arnft/arnft/components/Effects';
import Spinner from './components/Spinner.js';
import { ARAnchor, ARView } from './libs/react-three-mind.js';

import { GLTF } from 'three-stdlib';

type GLTFResult3 = GLTF & {
  nodes: {
    down: THREE.SkinnedMesh;
    down001: THREE.SkinnedMesh;
    hair: THREE.SkinnedMesh;
    hat: THREE.SkinnedMesh;
    head: THREE.SkinnedMesh;
    headwear: THREE.SkinnedMesh;
    Object001: THREE.SkinnedMesh;
    up: THREE.SkinnedMesh;
    Bip001_Pelvis: THREE.Bone;
  };
  materials: {
    down: THREE.MeshPhysicalMaterial;
    hair: THREE.MeshPhysicalMaterial;
    hat: THREE.MeshPhysicalMaterial;
    ['08 - Default']: THREE.MeshPhysicalMaterial;
    up: THREE.MeshPhysicalMaterial;
  };
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

type GLTFResult2 = GLTF & {
  nodes: {
    Mesh028_instance_0: THREE.Mesh;
    Mesh028_instance_1: THREE.Mesh;
    Mesh035_instance_0: THREE.Mesh;
    Mesh035_instance_1: THREE.Mesh;
    Mesh039: THREE.Mesh;
    Mesh040: THREE.Mesh;
    Mesh038: THREE.Mesh;
    Mesh033_instance_0: THREE.Mesh;
    Mesh033_instance_1: THREE.Mesh;
    Mesh041: THREE.Mesh;
    Mesh032: THREE.Mesh;
    Mesh030: THREE.Mesh;
    Mesh031: THREE.Mesh;
    cramp: THREE.Mesh;
  };
  materials: {
    hammer: THREE.MeshPhysicalMaterial;
    side_arm_01: THREE.MeshPhysicalMaterial;
    side_ear_01: THREE.MeshPhysicalMaterial;
    side_head: THREE.MeshPhysicalMaterial;
    side_leg: THREE.MeshPhysicalMaterial;
    side_tail: THREE.MeshPhysicalMaterial;
    side_body: THREE.MeshPhysicalMaterial;
    side_foot: THREE.MeshPhysicalMaterial;
    cramp: THREE.MeshPhysicalMaterial;
  };
};

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

const CircularMask = () => (
  <group scale={[1, 1, 1]} position={[0.35, 0.48, -0.017]}>
    <Mask id={1} colorWrite={false} depthWrite={false}>
      <planeGeometry args={[0.6, 1]} />
    </Mask>
  </group>
);

function Tree({
  onRenderEnd,
  on,
  ...props
}: JSX.IntrinsicElements['group'] & { onRenderEnd: () => void; on: boolean }) {
  const modelRef = useRef<THREE.Group>(null);
  const { nodes, materials, animations } = useGLTF('/tree_f.glb') as GLTFResult3;
  const stencil = useMask(1, true);

  const { actions } = useAnimations(animations, modelRef);

  useEffect(() => {
    if (actions && on) {
      for (const i in actions) {
        actions[i]?.setLoop(THREE.LoopRepeat, Infinity);
        actions[i]?.reset().play();
      }
    }
  }, [on]);

  useEffect(() => {
    if (nodes) onRenderEnd();
  }, [nodes]);

  useEffect(() => {
    if (stencil && modelRef.current) {
      modelRef.current.traverse((m) => {
        if ((m as THREE.Mesh).isMesh) {
          ((m as THREE.Mesh).material as THREE.Material).stencilFail = stencil.stencilFail;
          ((m as THREE.Mesh).material as THREE.Material).stencilFunc = stencil.stencilFunc;
          ((m as THREE.Mesh).material as THREE.Material).stencilRef = stencil.stencilRef;
          ((m as THREE.Mesh).material as THREE.Material).stencilWrite = stencil.stencilWrite;
          ((m as THREE.Mesh).material as THREE.Material).stencilZFail = stencil.stencilZFail;
          ((m as THREE.Mesh).material as THREE.Material).stencilZPass = stencil.stencilZPass;
        }
      });
    }
  }, [stencil]);
  return (
    <group
      ref={modelRef}
      scale={[0.5, 0.5, 0.5]}
      position={[0.35, 0, 0]}
      rotation={[0, 0, 0]}
      {...props}
      dispose={null}
    >
      <group name="Scene">
        <group name="Bip001" position={[0.031, 0.963, -0.054]} rotation={[-3.106, -1.323, 3.097]} scale={0.01}>
          <group name="Bip001_Footsteps" position={[7.636, -96.125, -0.842]} rotation={[-2.83, 1.31, 2.829]} />
          <skinnedMesh
            name="down"
            geometry={nodes.down.geometry}
            material={materials.down}
            skeleton={nodes.down.skeleton}
          />
          <skinnedMesh
            name="down001"
            geometry={nodes.down001.geometry}
            material={materials.down}
            skeleton={nodes.down001.skeleton}
          />
          <skinnedMesh
            name="hair"
            geometry={nodes.hair.geometry}
            material={materials.hair}
            skeleton={nodes.hair.skeleton}
          />
          <skinnedMesh
            name="hat"
            geometry={nodes.hat.geometry}
            material={materials.hat}
            skeleton={nodes.hat.skeleton}
          />
          <skinnedMesh
            name="head"
            geometry={nodes.head.geometry}
            material={materials['08 - Default']}
            skeleton={nodes.head.skeleton}
          />
          <skinnedMesh
            name="headwear"
            geometry={nodes.headwear.geometry}
            material={materials.hat}
            skeleton={nodes.headwear.skeleton}
          />
          <skinnedMesh
            name="Object001"
            geometry={nodes.Object001.geometry}
            material={materials.down}
            skeleton={nodes.Object001.skeleton}
          />
          <skinnedMesh name="up" geometry={nodes.up.geometry} material={materials.up} skeleton={nodes.up.skeleton} />
          <primitive object={nodes.Bip001_Pelvis} />
        </group>
      </group>
    </group>
  );
}

function Box({ onRenderEnd, on, ...props }: JSX.IntrinsicElements['group'] & { onRenderEnd: () => void; on: boolean }) {
  const modelRef = useRef<THREE.Group>(null);
  const shadowRef = useRef<THREE.Group>(null);
  const [{ nodes, materials, animations }, { nodes: snodes, materials: smaterials, animations: sanimations }] = useGLTF(
    ['/moon_f.glb', '/smash_f.glb']
  ) as [GLTFResult, GLTFResult2];
  const { actions, mixer } = useAnimations(animations, modelRef);
  const { actions: sactions, mixer: smixer } = useAnimations(sanimations, shadowRef);

  useEffect(() => {
    if (actions && sactions && on) {
      if (sactions.Scene) {
        if (shadowRef.current) shadowRef.current.visible = true;
        if (modelRef.current) modelRef.current.visible = false;
        sactions.Scene.reset().play();
        sactions.Scene?.setLoop(THREE.LoopOnce, 1);
        sactions.Scene.clampWhenFinished = true;
        smixer.addEventListener('finished', () => {
          if (shadowRef.current) shadowRef.current.visible = false;
          if (modelRef.current) modelRef.current.visible = true;
          if (actions.jump) {
            actions.jump.reset().play();
            actions.jump?.setLoop(THREE.LoopOnce, 1);
            actions.jump.clampWhenFinished = true;
            mixer.addEventListener('finished', () => {
              if (actions.loop) {
                actions.loop.reset().play();
                actions.loop?.setLoop(THREE.LoopRepeat, 1);
              }
            });
          }
        });
      }
    }
  }, [on]);

  useEffect(() => {
    if (nodes) onRenderEnd();
  }, [nodes]);

  return (
    <group {...props} position={[0, 0, 0]} dispose={null}>
      <group
        name="Scene"
        ref={shadowRef}
        dispose={null}
        scale={[0.01, 0.01, 0.01]}
        position={[0.1, -0.2, 0]}
        rotation={[0, Math.PI / 3, 0]}
      >
        <group name="rabbit_silhouette" scale={0.1}>
          <group name="hammer" position={[-9.004, -49.831, 0]} scale={0}>
            <mesh
              name="Mesh028_instance_0"
              castShadow
              receiveShadow
              geometry={snodes.Mesh028_instance_0.geometry}
              material={smaterials.hammer}
              position={[0, 16.908, 0]}
              scale={237.178}
            />
          </group>
          <group name="side_body" position={[130.715, -232.759, 0]}>
            <group name="side_arm_01" position={[-23.36, 187.798, 0]} rotation={[0, 0, 0.217]}>
              <group name="hammer_2" position={[-114.686, 20.255, 0]} rotation={[0, 0, -0.417]}>
                <mesh
                  name="Mesh028_instance_1"
                  castShadow
                  receiveShadow
                  geometry={snodes.Mesh028_instance_1.geometry}
                  material={smaterials.hammer}
                  position={[0, 16.908, 0]}
                  scale={237.178}
                />
              </group>
              <mesh
                name="Mesh035_instance_0"
                castShadow
                receiveShadow
                geometry={snodes.Mesh035_instance_0.geometry}
                material={smaterials.side_arm_01}
                position={[-57.806, -36.703, 0]}
                scale={82.498}
              />
            </group>
            <group name="side_arm_02" position={[-13.721, 182.62, 0]} rotation={[0, 0, -0.53]}>
              <mesh
                name="Mesh035_instance_1"
                castShadow
                receiveShadow
                geometry={snodes.Mesh035_instance_1.geometry}
                material={smaterials.side_arm_01}
                position={[-57.806, -36.703, 0]}
                scale={82.498}
              />
            </group>
            <group name="side_head" position={[-32.802, 208.305, 0]}>
              <group name="side_ear_01" position={[7.607, 217.067, 0]}>
                <mesh
                  name="Mesh039"
                  castShadow
                  receiveShadow
                  geometry={snodes.Mesh039.geometry}
                  material={smaterials.side_ear_01}
                  position={[-41.29, 86.251, 0]}
                  scale={99.619}
                />
              </group>
              <group name="side_ear_02" position={[-21.755, 217.067, 0]}>
                <mesh
                  name="Mesh040"
                  castShadow
                  receiveShadow
                  geometry={snodes.Mesh040.geometry}
                  material={smaterials.side_ear_01}
                  position={[-40.946, 75.98, 0]}
                  scale={87.756}
                />
              </group>
              <mesh
                name="Mesh038"
                castShadow
                receiveShadow
                geometry={snodes.Mesh038.geometry}
                material={smaterials.side_head}
                position={[-8.617, 100.709, 0]}
                scale={128.569}
              />
            </group>
            <group name="side_leg" position={[20.683, 35.483, 0]}>
              <mesh
                name="Mesh033_instance_0"
                castShadow
                receiveShadow
                geometry={snodes.Mesh033_instance_0.geometry}
                material={smaterials.side_leg}
                position={[-20.186, -20.186, 0]}
                scale={70.98}
              />
            </group>
            <group name="side_leg_2" position={[35.364, 35.483, 0]} rotation={[0, 0, 0.472]}>
              <mesh
                name="Mesh033_instance_1"
                castShadow
                receiveShadow
                geometry={snodes.Mesh033_instance_1.geometry}
                material={smaterials.side_leg}
                position={[-20.186, -20.186, 0]}
                scale={70.98}
              />
            </group>
            <group name="side_tail" position={[79.32, 49.651, 0]}>
              <mesh
                name="Mesh041"
                castShadow
                receiveShadow
                geometry={snodes.Mesh041.geometry}
                material={smaterials.side_tail}
                position={[26.389, 17.234, 0]}
                scale={35.273}
              />
            </group>
            <mesh
              name="Mesh032"
              castShadow
              receiveShadow
              geometry={snodes.Mesh032.geometry}
              material={smaterials.side_body}
              position={[0, 104.627, 0]}
              scale={130.714}
            />
          </group>
          <group name="side_foot" position={[73.215, -313.132, 0]}>
            <mesh
              name="Mesh030"
              castShadow
              receiveShadow
              geometry={snodes.Mesh030.geometry}
              material={smaterials.side_foot}
              position={[30.47, 23.182, 0]}
              scale={47.63}
            />
          </group>
          <group name="side_foot_2" position={[125.638, -317.857, 0]}>
            <mesh
              name="Mesh031"
              castShadow
              receiveShadow
              geometry={snodes.Mesh031.geometry}
              material={smaterials.side_foot}
              position={[31.789, 23.182, 0]}
              scale={47.63}
            />
          </group>
        </group>
        <mesh
          name="cramp"
          castShadow
          receiveShadow
          geometry={snodes.cramp.geometry}
          material={smaterials.cramp}
          position={[-7.799, -23.038, 0]}
          scale={10.177}
        />
      </group>
      {/*  ////// */}
      <group
        name="Scene"
        ref={modelRef}
        visible={true}
        scale={[0.015, 0.015, 0.015]}
        position={[-0.45, -0.72, -1]}
        rotation={[0, Math.PI / 4, 0]}
      >
        <group name="Group001">
          <group name="DeformationSystem001">
            <skinnedMesh
              name="Brow_GEO001"
              geometry={nodes.Brow_GEO001.geometry}
              material={materials['Motion_aa_Eyelash_M_LMBT.001']}
              skeleton={nodes.Brow_GEO001.skeleton}
            />
            <skinnedMesh
              name="Incisor_GEO001"
              geometry={nodes.Incisor_GEO001.geometry}
              material={materials['Motion_Mouth_M_BLNN.001']}
              skeleton={nodes.Incisor_GEO001.skeleton}
            />
            <skinnedMesh
              name="L_EyeBall_GEO001"
              geometry={nodes.L_EyeBall_GEO001.geometry}
              material={materials['Motion_Eye_M_LMBT.001']}
              skeleton={nodes.L_EyeBall_GEO001.skeleton}
            />
            <skinnedMesh
              name="L_EyeHighLight_GEO001"
              geometry={nodes.L_EyeHighLight_GEO001.geometry}
              material={materials['Motion_EyeHighLight_M_LMBT.001']}
              skeleton={nodes.L_EyeHighLight_GEO001.skeleton}
            />
            <skinnedMesh
              name="Lower_gum_GEO001"
              geometry={nodes.Lower_gum_GEO001.geometry}
              material={materials['Motion_Mouth_M_BLNN.001']}
              skeleton={nodes.Lower_gum_GEO001.skeleton}
            />
            <skinnedMesh
              name="Lower_Teeth_GEO001"
              geometry={nodes.Lower_Teeth_GEO001.geometry}
              material={materials['Motion_Mouth_M_BLNN.001']}
              skeleton={nodes.Lower_Teeth_GEO001.skeleton}
            />
            <skinnedMesh
              name="R_EyeBall_GEO001"
              geometry={nodes.R_EyeBall_GEO001.geometry}
              material={materials['Motion_Eye_M_LMBT.001']}
              skeleton={nodes.R_EyeBall_GEO001.skeleton}
            />
            <skinnedMesh
              name="R_EyeHighLight_GEO001"
              geometry={nodes.R_EyeHighLight_GEO001.geometry}
              material={materials['Motion_EyeHighLight_M_LMBT.001']}
              skeleton={nodes.R_EyeHighLight_GEO001.skeleton}
            />
            <skinnedMesh
              name="Rabbit_Xgen_GEO001"
              geometry={nodes.Rabbit_Xgen_GEO001.geometry}
              material={materials['Motion_aa_Body_M_BLNN.001']}
              skeleton={nodes.Rabbit_Xgen_GEO001.skeleton}
            />
            <skinnedMesh
              name="Tongue_GEO001"
              geometry={nodes.Tongue_GEO001.geometry}
              material={materials['Motion_Mouth_M_BLNN.001']}
              skeleton={nodes.Tongue_GEO001.skeleton}
            />
            <skinnedMesh
              name="Upper_gum_GEO001"
              geometry={nodes.Upper_gum_GEO001.geometry}
              material={materials['Motion_Mouth_M_BLNN.001']}
              skeleton={nodes.Upper_gum_GEO001.skeleton}
            />
            <skinnedMesh
              name="Upper_Teeth_GEO001"
              geometry={nodes.Upper_Teeth_GEO001.geometry}
              material={materials['Motion_Mouth_M_BLNN.001']}
              skeleton={nodes.Upper_Teeth_GEO001.skeleton}
            />
            <primitive object={nodes.Root_M} />
          </group>
        </group>
        <mesh
          name="L_Iris_GEO001"
          castShadow
          receiveShadow
          geometry={nodes.L_Iris_GEO001.geometry}
          material={materials['Motion_Iris_M_BLNN.001']}
          position={[0, 26.939, 1.844]}
          scale={7.71}
        />
      </group>
    </group>
  );
}

export default function ArApp() {
  const { char } = useParams();
  const [modalIsOpen, setIsOpen] = useState(false);
  const [foto, setFoto] = useState<Blob | null>(null);
  const [fotoUrl, setFotoUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [on, setOn] = useState(false);
  const [settings, setSettings] = useState({
    filterMinCF: 0.01,
    filterBeta: 0.02,
    detectionScale: 1.0,
  });
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

  const captureImage = async () => {
    const videoElement: HTMLVideoElement | null = document.querySelector('#three-video'); // 비디오 요소
    const threeCanvas: HTMLCanvasElement | null = document.querySelector('#three-canvas')?.children[0]
      .children[0]! as HTMLCanvasElement; // Three.js 캔버스
    const container = videoElement?.parentElement || null; // 최상위 렌더링 컨테이너

    if (!container || !videoElement || !threeCanvas) {
      console.warn('Required elements not ready');
      return;
    }

    // 캔버스 크기 설정
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    const devicePixelRatio = window.devicePixelRatio || 1;

    const offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = containerWidth * devicePixelRatio;
    offscreenCanvas.height = containerHeight * devicePixelRatio;

    const context = offscreenCanvas.getContext('2d');
    if (!context) {
      console.error('Failed to create canvas context.');
      return;
    }

    // 고해상도 지원
    context.scale(devicePixelRatio, devicePixelRatio);

    // Helper function to calculate draw parameters
    const calculateDrawParams = (element: HTMLVideoElement | HTMLCanvasElement, objectFit: 'cover' | 'contain') => {
      const elementWidth = element instanceof HTMLVideoElement ? element.videoWidth : element.width;
      const elementHeight = element instanceof HTMLVideoElement ? element.videoHeight : element.height;

      if (elementWidth === 0 || elementHeight === 0) return null;

      const elementAspectRatio = elementWidth / elementHeight;
      const containerAspectRatio = containerWidth / containerHeight;

      let drawWidth = containerWidth;
      let drawHeight = containerHeight;
      let offsetX = 0;
      let offsetY = 0;

      if (objectFit === 'cover') {
        if (elementAspectRatio > containerAspectRatio) {
          drawWidth = containerHeight * elementAspectRatio;
          offsetX = (containerWidth - drawWidth) / 2; // 가로 중심 정렬
        } else {
          drawHeight = containerWidth / elementAspectRatio;
          offsetY = (containerHeight - drawHeight) / 2; // 세로 중심 정렬
        }
      } else if (objectFit === 'contain') {
        if (elementAspectRatio > containerAspectRatio) {
          drawHeight = containerWidth / elementAspectRatio;
          offsetY = (containerHeight - drawHeight) / 2; // 세로 중심 정렬
        } else {
          drawWidth = containerHeight * elementAspectRatio;
          offsetX = (containerWidth - drawWidth) / 2; // 가로 중심 정렬
        }
      }

      return { drawWidth, drawHeight, offsetX, offsetY };
    };

    try {
      // Step 1: 비디오를 캔버스에 그리기
      const videoParams = calculateDrawParams(videoElement, 'cover');
      if (videoParams) {
        context.drawImage(
          videoElement,
          videoParams.offsetX,
          videoParams.offsetY,
          videoParams.drawWidth,
          videoParams.drawHeight
        );
      }

      // Step 2: Three.js WebGL 캔버스를 캔버스에 그리기
      const threeParams = calculateDrawParams(threeCanvas, 'cover');
      if (threeParams) {
        context.drawImage(
          threeCanvas,
          threeParams.offsetX,
          threeParams.offsetY,
          threeParams.drawWidth,
          threeParams.drawHeight
        );
      }

      // Step 3: 최종 이미지를 PNG로 저장
      offscreenCanvas.toBlob((blob) => {
        if (blob) {
          setFoto(blob);
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

  useEffect(() => {
    // 브라우저 감지 및 설정
    const userAgent = navigator.userAgent.toLowerCase();
    const isSafari = /^((?!chrome|android).)*safari/i.test(userAgent);

    const newSettings = isSafari
      ? { filterMinCF: 0.03, filterBeta: 0.05, detectionScale: 0.8 }
      : { filterMinCF: 0.01, filterBeta: 0.02, detectionScale: 1.0 };

    setSettings(newSettings);
    console.log('Applied settings:', newSettings);
  }, []);
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
        imageTargets={char === 'moon' ? '/moons1.mind' : char === 'moons' ? '/moons1.mind' : '/tree.mind'}
        autoplay
        flipUserCamera={false} // Prevents automatic flipping of the user camera
        maxTrack={1} // 동시에 추적할 타겟 수
        // filterMinCF={settings.filterMinCF} // 동적으로 설정된 값 적용
        // filterBeta={settings.filterBeta} // 동적으로 설정된 값 적용
        detectionScale={settings.detectionScale} // 동적으로 설정된 값 적용
        // missTolerance={5} // 트래킹 실패 허용 시간
        // warmupTolerance={7} // 초기 트래킹 유연성
        // filterMinCF={1}
        filterBeta={0.05}
        missTolerance={5}
        warmupTolerance={5}
        id="three-canvas"
        style={{
          width: '100%',
          height: '100%',
          position: 'absolute',
          zIndex: 100,
        }}
        camera={{
          position: [0, 0, 100],
        }}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance',
          stencil: true,
        }}
        onCameraStream={() => {
          // 카메라 해상도 설정
          navigator.mediaDevices.getUserMedia({
            video: {
              width: 1280,
              height: 720,
              frameRate: { ideal: 30, max: 60 },
            },
          });
        }}
      >
        {/* <FrameH /> */}
        {/* <Plane args={[1, 1, 1]}>
          <meshBasicMaterial color={'red'} />
        </Plane>*/}
        {/* <Box onRenderEnd={handleLoading} /> */}
        {(char === 'moon' || char === 'moons') && (
          // @ts-ignore
          <ARAnchor
            target={0}
            onAnchorFound={() => {
              console.log('RABBIT found');
              setOn(true);
            }}
            onAnchorLost={() => {
              console.log('RABBIT lost');
              //setOn(false);
            }}
          >
            <Box onRenderEnd={handleLoading} on={on} />
          </ARAnchor>
        )}
        {/* <Box onRenderEnd={handleLoading} on={on} /> */}

        {char === 'trees' && (
          // @ts-ignore
          <ARAnchor
            target={0}
            onAnchorFound={() => {
              console.log('TREE found');
              setOn(true);
            }}
            onAnchorLost={() => {
              console.log('TREE lost');
              //setOn(false);
            }}
          >
            <CircularMask />
            <Tree on={on} onRenderEnd={handleLoading} />
          </ARAnchor>
        )}
        {/* <Tree on={on} onRenderEnd={handleLoading} /> */}
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
