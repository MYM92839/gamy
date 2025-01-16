import { useEffect, useRef, useState } from "react";
import Capture from "./assets/icons/Capture";
import Back from "./assets/icons/Back";
import { useParams } from "react-router-dom";
import Modal from "react-modal";

const customStyles = {
  content: {
    top: "50%",
    left: "50%",
    right: "auto",
    bottom: "auto",
    marginRight: "-50%",
    borderRadius: "16px",
    width: "80%",
    height: "auto",
    padding: "8px",
    transform: "translate(-50%, -50%)",
  },
};

Modal.setAppElement("#root");

interface FrameAppProps {
  frameOpacity?: number;
  borderWidth?: number;
  borderColor?: string;
}

const FrameApp: React.FC<FrameAppProps> = () => {
  const { char } = useParams();
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayVideoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string>("");
  const [dimensions, setDimensions] = useState({
    width: document.documentElement.clientWidth,
    height: document.documentElement.clientHeight,
  });
  const [modalIsOpen, setIsOpen] = useState(false);
  const [foto, setFoto] = useState<Blob | null>(null);
  const [fotoUrl, setFotoUrl] = useState<string>("");

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

  useEffect(() => {
    const startCamera = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("getUserMedia가 지원되지 않는 브라우저입니다.");
        return;
      }

      try {
        const constraints = {
          video: { facingMode: "environment" },
          audio: false,
        };

        const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        setStream(mediaStream);

        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          videoRef.current.play().catch((err) => {
            console.error("Error playing camera video:", err);
          });
        }
      } catch (err) {
        setError("카메라 초기화 실패.");
        console.error("Camera initialization error:", err);
      }
    };

    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    const handleResize = () => {
      const parentDiv = videoRef.current?.parentElement;
      if (parentDiv) {
        setDimensions({
          width: parentDiv.clientWidth,
          height: parentDiv.clientHeight,
        });
      }

      if (videoRef.current && stream) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch((err) => {
          console.error("Error playing camera video after resize:", err);
        });
      }

      if (overlayVideoRef.current) {
        overlayVideoRef.current.play().catch((err) => {
          console.error("Error playing overlay video after resize:", err);
        });
      }
    };

    handleResize();

    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
    };
  }, [stream]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        if (videoRef.current && stream) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch((err) => {
            console.error("Error playing camera video on visibility change:", err);
          });
        }

        if (overlayVideoRef.current) {
          overlayVideoRef.current.play().catch((err) => {
            console.error("Error playing overlay video on visibility change:", err);
          });
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [stream]);

  const shareOrDownloadImage = (blob: Blob): void => {
    if (navigator.canShare && navigator.canShare({ files: [new File([blob], "test.png", { type: blob.type })] })) {
      const file = new File([blob], `camera-frame-${new Date().getTime()}.png`, {
        type: "image/png",
      });

      navigator
        .share({
          files: [file],
          title: "My Captured Image",
          text: "Check out this captured photo!",
        })
        .catch((error) => {
          console.error("Sharing failed:", error);
        });
    } else {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.download = `camera-frame-${new Date().getTime()}.png`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
    }
  };

  const captureImage = async (): Promise<void> => {
    const container = videoRef.current?.parentElement; // 최상위 렌더링 컨테이너
    const cameraVideo = videoRef.current;
    const overlayVideo = overlayVideoRef.current;
    const canvas = canvasRef.current;

    if (!container || !cameraVideo || !canvas) {
      console.warn("Required elements not ready");
      return;
    }

    // 컨테이너의 렌더링 크기 가져오기
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    // DevicePixelRatio 적용
    const devicePixelRatio = window.devicePixelRatio || 1;
    canvas.width = containerWidth * devicePixelRatio;
    canvas.height = containerHeight * devicePixelRatio;

    const context = canvas.getContext("2d");
    if (context) {
      // 고해상도 지원
      context.scale(devicePixelRatio, devicePixelRatio);

      const calculateDrawParams = (
        video: HTMLVideoElement,
        objectFit: "cover" | "contain",
        bottomOffset?: number
      ) => {
        const videoWidth = video.videoWidth;
        const videoHeight = video.videoHeight;

        if (videoWidth === 0 || videoHeight === 0) return null;

        const videoAspectRatio = videoWidth / videoHeight;
        const containerAspectRatio = containerWidth / containerHeight;

        let drawWidth = containerWidth;
        let drawHeight = containerHeight;
        let offsetX = 0;
        let offsetY = 0;

        if (objectFit === "cover") {
          if (videoAspectRatio > containerAspectRatio) {
            drawWidth = containerHeight * videoAspectRatio;
            offsetX = (containerWidth - drawWidth) / 2; // 가로 중심 정렬
          } else {
            drawHeight = containerWidth / videoAspectRatio;
            offsetY = (containerHeight - drawHeight) / 2; // 세로 중심 정렬
          }
        } else if (objectFit === "contain") {
          if (videoAspectRatio > containerAspectRatio) {
            drawHeight = containerWidth / videoAspectRatio;
            offsetY = (containerHeight - drawHeight) / 2; // 세로 중심 정렬
          } else {
            drawWidth = containerHeight * videoAspectRatio;
            offsetX = (containerWidth - drawWidth) / 2; // 가로 중심 정렬
          }
        }

        if (bottomOffset) {
          offsetY = containerHeight - drawHeight - bottomOffset;
        }

        return { drawWidth, drawHeight, offsetX, offsetY };
      };

      // 카메라 비디오 그리기
      const cameraParams = calculateDrawParams(cameraVideo, "cover");
      if (cameraParams) {
        context.drawImage(
          cameraVideo,
          cameraParams.offsetX,
          cameraParams.offsetY,
          cameraParams.drawWidth,
          cameraParams.drawHeight
        );
      }

      // 오버레이 비디오 그리기
      if (overlayVideo && overlayVideo.readyState >= 2) {
        const computedStyle = window.getComputedStyle(overlayVideo);
        const bottom = parseFloat(computedStyle.bottom) || 0;

        const overlayParams = calculateDrawParams(overlayVideo, "contain", bottom);
        if (overlayParams) {
          context.drawImage(
            overlayVideo,
            overlayParams.offsetX,
            overlayParams.offsetY,
            overlayParams.drawWidth,
            overlayParams.drawHeight
          );
        }
      }

      // 캡처 이미지 다운로드 또는 공유
      canvas.toBlob((blob) => {
        if (blob) {
          setFoto(blob);
        }
      }, "image/png");
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

  if (error) {
    return <div className="text-red-500 p-4">{error}</div>;
  }

  return (
    <div className="relative w-full h-full flex flex-col justify-center items-center">
      <Modal isOpen={modalIsOpen} onRequestClose={closeModal} style={customStyles} contentLabel="사진확인">
        <div className="w-full h-full max-w-full max-h-full flex flex-col gap-y-2 p-2">
          <div className="flex-1 rounded-sm overflow-hidden">
            {fotoUrl && <img className="flex-1 object-contain" src={fotoUrl} />}
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

      <div className="relative w-full h-full">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          controls={false}
          className="absolute inset-0 w-auto h-full object-cover bg-black"
        />
        {dimensions.width > 0 && dimensions.height > 0 && (
          <video
            ref={overlayVideoRef}
            playsInline
            muted
            loop
            autoPlay
            preload="metadata"
            controls={false}
            crossOrigin="anonymous"
            className="absolute w-full h-auto bottom-32 object-cover pointer-events-none"
          >
            <source
              src={`/gamyoungar/${char}.mp4`}
              type="video/mp4"
              onError={(e) => {
                console.error("Overlay video error:", e);
              }}
            />
          </video>
        )}
      </div>

      <canvas ref={canvasRef} style={{ display: "none" }} />

      {!modalIsOpen && (
        <>
          <button className="fixed bottom-16 left-4 bg-transparent p-4 z-50" onClick={() => window.history.back()}>
            <Back />
          </button>
          <button className="fixed bottom-12 left-1/2 transform -translate-x-1/2 bg-transparent p-4 z-50" onClick={openModal}>
            <Capture />
          </button>
        </>
      )}
    </div>
  );
};

export default FrameApp;
