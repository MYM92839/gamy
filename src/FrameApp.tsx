import { useEffect, useRef, useState } from 'react';
import Capture from './assets/icons/Capture';
import Back from './assets/icons/Back';
import { useParams } from 'react-router-dom';
import Modal from 'react-modal';

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

const STYLE_MODE: { [key: string]: string } = {
  landscape: 'left-0 bottom-20 w-1/2 h-auto',
  portrait: 'left-0 bottom-10 w-1/2 h-auto',
};

Modal.setAppElement('#root');
const isIOS = /(iPad|iPhone|iPod)/.test(navigator.userAgent);

interface FrameAppProps {
  frameOpacity?: number;
  borderWidth?: number;
  borderColor?: string;
}

const FrameApp: React.FC<FrameAppProps> = () => {
  const { char } = useParams();
  const videoRef = useRef<HTMLVideoElement>(null);
  const animVideoRef = useRef<HTMLVideoElement>(null);
  const idleVideoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string>('');
  const [dimensions, setDimensions] = useState({
    width: document.documentElement.clientWidth,
    height: document.documentElement.clientHeight,
  });
  const [modalIsOpen, setIsOpen] = useState(false);
  const [foto, setFoto] = useState<Blob | null>(null);
  const [fotoUrl, setFotoUrl] = useState<string>('');
  const [init, setInit] = useState(false);
  const [orientation, setOrientation] = useState('portrait');
  // 크로스페이드 상태 (false: anim video 보임, true: idle video 보임)
  const [isCrossfade, setIsCrossfade] = useState(false);

  // 기존 open/close, captureImage, shareOrDownloadImage 등 함수들은 그대로 둡니다.
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

  const requestFullScreen = () => {
    const element = document.documentElement; // 또는 전체 앱의 최상위 요소
    if (element.requestFullscreen) {
      element.requestFullscreen();
    } else if ((element as any).webkitRequestFullscreen) {
      // Safari 대응
      (element as any).webkitRequestFullscreen();
    } else if ((element as any).msRequestFullscreen) {
      // IE11 대응
      (element as any).msRequestFullscreen();
    }
    setInit(true);
  };

  useEffect(() => {
    const startCamera = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('getUserMedia가 지원되지 않는 브라우저입니다.');
        return;
      }

      try {
        const constraints = {
          video: { facingMode: 'environment' },
          audio: false,
        };

        const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        setStream(mediaStream);

        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          videoRef.current.play().catch((err) => {
            console.error('Error playing camera video:', err);
          });
        }
      } catch (err) {
        setError('카메라 초기화 실패.');
        console.error('Camera initialization error:', err);
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
          console.error('Error playing camera video after resize:', err);
        });
      }

      // idle, anim video도 재생 시도
      if (animVideoRef.current) {
        animVideoRef.current.play().catch((err) => {
          console.error('Error playing anim video after resize:', err);
        });
      }
      if (idleVideoRef.current) {
        idleVideoRef.current.play().catch((err) => {
          console.error('Error playing idle video after resize:', err);
        });
      }
    };

    handleResize();

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, [stream]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        if (videoRef.current && stream) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch((err) => {
            console.error('Error playing camera video on visibility change:', err);
          });
        }

        if (animVideoRef.current) {
          animVideoRef.current.play().catch((err) => {
            console.error('Error playing anim video on visibility change:', err);
          });
        }

        if (idleVideoRef.current) {
          idleVideoRef.current.play().catch((err) => {
            console.error('Error playing idle video on visibility change:', err);
          });
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [stream]);

  const shareOrDownloadImage = (blob: Blob): void => {
    if (
      isIOS &&
      navigator.canShare &&
      navigator.canShare({ files: [new File([blob], 'test.png', { type: blob.type })] })
    ) {
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
  const captureImage = async (): Promise<void> => {
    // 부모 컨테이너 (카메라 비디오와 오버레이 영상이 포함된 영역)를 기준으로 함
    const container = videoRef.current?.parentElement;
    const cameraVideo = videoRef.current;
    const animVideo = animVideoRef.current;
    const canvas = canvasRef.current;

    if (!container || !cameraVideo || !animVideo || !canvas) {
      console.warn('Required elements not ready');
      return;
    }

    // container의 실제 크기를 가져옴 (getBoundingClientRect()를 사용)
    const containerRect = container.getBoundingClientRect();
    const containerWidth = containerRect.width;
    const containerHeight = containerRect.height;
    const devicePixelRatio = window.devicePixelRatio || 1;
    canvas.width = containerWidth * devicePixelRatio;
    canvas.height = containerHeight * devicePixelRatio;

    const context = canvas.getContext('2d');
    if (!context) return;
    // CSS 픽셀 단위에 맞춰 스케일 적용
    context.scale(devicePixelRatio, devicePixelRatio);

    // 1. 카메라 비디오 캡쳐 (object-cover 효과 모방)
    const videoWidth = cameraVideo.videoWidth;
    const videoHeight = cameraVideo.videoHeight;
    const videoAspectRatio = videoWidth / videoHeight;
    const containerAspectRatio = containerWidth / containerHeight;

    let drawWidth = containerWidth;
    let drawHeight = containerHeight;
    let offsetX = 0;
    let offsetY = 0;

    if (videoAspectRatio > containerAspectRatio) {
      drawWidth = containerHeight * videoAspectRatio;
      offsetX = (containerWidth - drawWidth) / 2;
    } else {
      drawHeight = containerWidth / videoAspectRatio;
      offsetY = (containerHeight - drawHeight) / 2;
    }
    context.drawImage(cameraVideo, offsetX, offsetY, drawWidth, drawHeight);

    // 2. 오버레이(애니메이션) 영상 캡쳐: 실제 렌더링된 크기와 위치 사용
    const animRect = animVideo.getBoundingClientRect();
    // container 기준 좌표 계산
    const containerLeft = containerRect.left;
    const containerTop = containerRect.top;
    const animOffsetX = animRect.left - containerLeft;
    const animOffsetY = animRect.top - containerTop;
    const animWidth = animRect.width;
    const animHeight = animRect.height;

    context.drawImage(animVideo, animOffsetX, animOffsetY, animWidth, animHeight);

    // Blob으로 캡쳐된 이미지 생성
    canvas.toBlob((blob) => {
      if (blob) {
        setFoto(blob);
      }
    }, 'image/png');
  };

  // 화면 크기/방향 변경 감지
  useEffect(() => {
    const updateOrientation = () => {
      setOrientation(window.innerWidth > window.innerHeight ? 'landscape' : 'portrait');
    };

    window.addEventListener('resize', updateOrientation);
    window.addEventListener('orientationchange', updateOrientation);

    return () => {
      window.removeEventListener('resize', updateOrientation);
      window.removeEventListener('orientationchange', updateOrientation);
    };
  }, []);

  useEffect(() => {
    if (foto) {
      const reader = new FileReader();
      reader.onload = () => {
        setFotoUrl(reader.result as string);
      };
      reader.readAsDataURL(foto);
    }
  }, [foto]);

  // 애니메이션 영상(anim video)이 끝났을 때 크로스페이드 시작
  const handleAnimVideoEnded = () => {
    // 상태 변경으로 anim video의 opacity를 0, idle video의 opacity를 1로 전환
    setIsCrossfade(true);
    idleVideoRef.current?.play().catch((err) => console.error('Idle video play error:', err));
  };

  if (error) {
    return <div className="text-red-500 p-4">{error}</div>;
  }

  return (
    <div className="relative w-full h-full flex flex-col justify-center items-center">
      {!init &&
        !isIOS &&
        o(
          <button className="fixed z-50 p-4 bg-transparent top-4 right-4" onClick={requestFullScreen}>
            전체화면
          </button>
        )}
      <Modal isOpen={modalIsOpen} onRequestClose={closeModal} style={customStyles} contentLabel="사진확인">
        <div className="w-full h-full max-w-full max-h-full flex flex-col gap-y-2 p-2">
          <div className="flex-1 rounded-sm overflow-hidden">
            {fotoUrl && <img className="flex-1 object-contain" src={fotoUrl} alt="captured" />}
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
        {/* 카메라 영상 */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          controls={false}
          className="absolute inset-0 w-full h-full object-cover bg-black" // 또는 object-contain
        />

        {/* 애니메이션 영상 (anim video) */}
        {dimensions.width > 0 && dimensions.height > 0 && (
          <>
            <video
              ref={animVideoRef}
              playsInline
              muted
              autoPlay
              preload="auto"
              controls={false}
              crossOrigin="anonymous"
              className={'absolute pointer-events-none' + STYLE_MODE[orientation]}
              style={{ opacity: isCrossfade ? 0 : 1 }}
              onEnded={handleAnimVideoEnded}
              onLoadedMetadata={() => {
                if (animVideoRef.current && char === 'cat') {
                  // 예: 영상 시작 시간을 3초로 설정
                  animVideoRef.current.currentTime = 0.1;
                }
              }}
              onSeeked={() => {
                // seek가 완료되면 즉시 재생
                animVideoRef.current?.play().catch((err) => console.error('Error playing anim video after seek:', err));
              }}
            >
              <source
                src={isIOS ? `/${char}_anim.mp4` : `/${char}_anim.webm`}
                type={isIOS ? 'video/mp4' : 'video/webm'}
                onError={(e) => {
                  console.error('Anim video error:', e);
                }}
              />
            </video>

            {/* idle 영상 (preload="auto", loop) */}
            <video
              ref={idleVideoRef}
              playsInline
              muted
              autoPlay
              preload="auto"
              controls={false}
              loop
              crossOrigin="anonymous"
              className={'absolute pointer-events-none' + STYLE_MODE[orientation]}
              style={{ opacity: isCrossfade ? 1 : 0 }}
            >
              <source
                src={isIOS ? `/${char}_idle.mp4` : `/${char}_idle.webm`}
                type={isIOS ? 'video/mp4' : 'video/webm'}
                onError={(e) => {
                  console.error('Idle video error:', e);
                }}
              />
            </video>
          </>
        )}
      </div>

      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {!modalIsOpen && (
        <>
          <button className="fixed bottom-16 left-4 bg-transparent p-4 z-50" onClick={() => window.history.back()}>
            <Back />
          </button>
          <button
            className="fixed bottom-12 left-1/2 transform -translate-x-1/2 bg-transparent p-4 z-50"
            onClick={openModal}
          >
            <Capture />
          </button>
        </>
      )}
    </div>
  );
};

export default FrameApp;
