import { useThree } from '@react-three/fiber';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ARNft } from './arnft/arnft/arnft';
import * as THREE from 'three'
import { AlvaAR } from './alva/alva';

// const constraints = {
//   audio: false,
//   video: {
//     facingMode: 'environment',
//     width: 640,
//     height: 480,
//   },
// };

const ARNftContext = createContext({});

const ARNftProvider = ({ children, video, interpolationFactor, arEnabled }: any) => {
  const { gl, camera } = useThree();
  const [arnft, setARNft] = useState(null);
  const markersRef = useRef([]);
  const arnftRef = useRef<any>();
  const [alvaAR, setAlvaAR] = useState<AlvaAR | null>(null); // ✅ AlvaAR 상태 추가
  const alvaARRef = useRef<AlvaAR | null>(null); // ✅ AlvaAR 참조 추가
  const [alvaInitialized, setAlvaInitialized] = useState(false); // ✅ AlvaAR 초기화 여부

  const onLoaded = () => {
    console.log("✅ ARNft가 로드됨!", arnftRef.current);
    setARNft(arnftRef.current as any);
  }

  useEffect(() => {
    async function init() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: 640, height: 480 },
        });
        video.current.srcObject = stream;
        video.current.onloadedmetadata = async () => {
          console.log("🎥 카메라 메타데이터 로드 완료");

          video.current.play();
          gl.domElement.width = video.current.videoWidth;
          gl.domElement.height = video.current.videoHeight;
          gl.domElement.style.objectFit = "cover";
          camera.rotation.reorder('YXZ');
          camera.updateProjectionMatrix();

          try {
            console.log("🎯 ARNft 객체 생성 중...");
            const arnft = new ARNft("../data/camera_para.dat", video.current, gl, camera, onLoaded, interpolationFactor);

            if (!arnft) {
              console.error("🚨 ARNft 객체 생성 실패!");
              return;
            }

            arnftRef.current = arnft;
            console.log("✅ ARNft 객체 생성 완료");

            if (arnftRef.current) {
              // ✅ AlvaAR 초기화 로직 추가 (마커 감지 후)
              arnftRef.current.onOriginDetected = async (adjustedOrigin: THREE.Vector3) => {
                console.log("✅ `onOriginDetected()` 호출됨, 원점 설정:", adjustedOrigin);
                // ✅ AlvaAR가 이미 초기화되었는지 확인
                if (alvaInitialized) {
                  console.log("🚀 AlvaAR는 이미 초기화됨, 다시 실행하지 않음.");
                  return;
                }
                let videoWidth = video.current.videoWidth;
                let videoHeight = video.current.videoHeight;

                // ✅ 비디오 크기가 0이면 500ms 기다렸다가 다시 확인
                if (videoWidth === 0 || videoHeight === 0) {
                  console.warn("⚠️ 비디오 크기가 0임! 500ms 후 다시 확인...");
                  await new Promise((resolve) => setTimeout(resolve, 500));
                  videoWidth = video.current.videoWidth;
                  videoHeight = video.current.videoHeight;
                }

                if (videoWidth === 0 || videoHeight === 0) {
                  console.error("🚨 비디오 크기가 0이므로 AlvaAR 초기화 불가능!");
                  return;
                }

                try {
                  console.log("🚀 AlvaAR 초기화 중... width:", videoWidth, "height:", videoHeight);
                  let alva = await AlvaAR.Initialize(videoWidth, videoHeight);

                  if (!alva) {
                    console.error("🚨 AlvaAR 초기화 실패!");
                    return;
                  }

                  alvaARRef.current = alva;
                  setAlvaAR(alva);
                  console.log("✅ AlvaAR SLAM 활성화 완료!");
                  setAlvaInitialized(true); // ✅ 한 번 초기화되면 다시 실행 안 함

                } catch (error) {
                  console.error("🚨 AlvaAR 초기화 중 오류 발생:", error);
                }
              };
            } else {
              console.warn("⚠️ ARNft가 아직 초기화되지 않음! onOriginDetected를 설정할 수 없음.");
            }
          } catch (error) {
            console.error("🚨 ARNft 객체 생성 중 오류 발생:", error);
          }
        };
      } catch (error) {
        console.error("🚨 비디오 스트림 초기화 실패:", error);
      }
    }

    if (arEnabled) {
      console.log("🔹 AR 모드 활성화됨! 초기화 시작...");
      init();
    } else {
      console.warn("⚠️ AR 모드가 활성화되지 않음.");
    }
  }, [arEnabled]);

  useEffect(() => {
    if (!arnftRef.current) {
      console.warn("⚠️ ARNft가 아직 초기화되지 않음!");
      return;
    }
    console.log("📌 마커 로드 시작...");
    arnftRef.current.loadMarkers(markersRef.current);
  }, [arnft]);

  const value = { arnft, alvaAR, markersRef, arEnabled };

  return <ARNftContext.Provider value={value}>{children}</ARNftContext.Provider>;
};

const useARNft = () => {
  const arValue = useContext(ARNftContext);
  return useMemo(() => ({ ...arValue } as any), [arValue]);
};

const useNftMarker = (url: string) => {
  const ref = useRef();

  const { markersRef } = useARNft();

  useEffect(() => {
    const newMarkers = [...markersRef.current, { url, root: ref.current }];

    markersRef.current = newMarkers;
  }, []);

  return ref as any;
};

export { ARNftContext, ARNftProvider, useARNft, useNftMarker };
