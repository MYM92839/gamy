import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useThree } from "@react-three/fiber";
import { ARNft } from "./arnft/arnft/arnft";
import { AlvaARConnectorTHREE } from "./alvaConnector";
import * as THREE from "three";
import { AlvaAR } from './alva/alva';

const ARNftContext = createContext({});

const ARNftProvider = ({ children, video, interpolationFactor, arEnabled }: any) => {
  const { gl, camera } = useThree();
  const [arnft, setARNft] = useState(null);
  const [alvaAR, setAlvaAR] = useState<AlvaAR | null>(null);
  const markersRef = useRef([]);
  const arnftRef = useRef<any>();
  const alvaARRef = useRef<any>();

  const onLoaded = () => {
    console.log("✅ ARNft가 로드됨!", arnftRef.current);
    setARNft(arnftRef.current as any);
  };

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
          camera.updateProjectionMatrix();

          try {
            console.log("🎯 ARNft 객체 생성 중...");
            const arnft = new ARNft("../data/camera_para.dat", video.current, gl, camera, onLoaded, interpolationFactor);
            arnftRef.current = arnft;
            console.log("✅ ARNft 객체 생성 완료");

            // ✅ NFT 마커 감지 후 AlvaAR SLAM 활성화
            arnft.onOriginDetected = async (adjustedOrigin: THREE.Vector3) => {
              console.log("✅ `onOriginDetected()` 호출됨, 원점 설정:", adjustedOrigin);

              // 📌 AlvaAR 초기화
              const alva = await AlvaAR.Initialize({
                width: video.current.videoWidth,
                height: video.current.videoHeight,
              });

              alvaARRef.current = alva;
              setAlvaAR(alva);
              console.log("🚀 AlvaAR SLAM 활성화 완료!");
            };
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

  return <ARNftContext.Provider value={{ arnft, alvaAR, markersRef, arEnabled }}>{children}</ARNftContext.Provider>;
};

const useARNft = () => {
  const arValue = useContext(ARNftContext);
  return useMemo(() => ({ ...arValue } as any), [arValue]);
};

export { ARNftProvider, useARNft };
