/* eslint-disable camelcase */
import { Camera } from '@react-three/fiber';
import * as THREE from 'three';
import { isMobile, setMatrix } from './utils';

const workerScript = '/js/arnft.worker.js';

export class ARNft {
  inputWidth: any;
  inputHeight: any;
  cameraParamUrl: string;
  video: { videoWidth: any; videoHeight: any };
  renderer: THREE.WebGLRenderer;
  camera: Camera & { manual?: boolean | undefined };
  onLoaded: (msg: any) => void;
  markers: any[];
  canvasProcess: HTMLCanvasElement;
  contextProcess: any;
  markerTracked: boolean = false;
  worker: Worker;
  pw: any;
  ph: any;
  w!: number;
  h!: number;
  ox!: number;
  oy!: number;
  onOriginDetected: any;
  constructor(
    cameraParamUrl: string,
    video: { videoWidth: any; videoHeight: any },
    renderer: THREE.WebGLRenderer,
    camera: Camera & { manual?: boolean | undefined },
    onLoaded: (msg: any) => void,
    interpolationFactor: any
  ) {
    this.inputWidth = video.videoWidth;
    this.inputHeight = video.videoHeight;

    this.cameraParamUrl = cameraParamUrl;
    this.video = video;
    this.renderer = renderer;
    this.camera = camera;
    this.onLoaded = onLoaded;

    this.camera.matrixAutoUpdate = false;

    this.markers = [];

    this.canvasProcess = document.createElement('canvas');
    this.contextProcess = this.canvasProcess.getContext('2d', { willReadFrequently: true });

    this.initRenderer();

    this.worker = new Worker(workerScript);
    this.worker.onmessage = (e: any) => this.onWorkerMessage(e);
    this.worker.postMessage({
      type: 'load',
      pw: this.pw,
      ph: this.ph,
      cameraParamUrl: this.cameraParamUrl,
      interpolationFactor,
    });
    this.onOriginDetected = null; // ✅ onOriginDetected를 기본적으로 null로 설정
  }

  initRenderer() {
    const pScale = 320 / Math.max(this.inputWidth, (this.inputHeight / 3) * 4);
    const sScale = isMobile() ? window.outerWidth / this.inputWidth : 1;

    const sw = this.inputWidth * sScale;
    const sh = this.inputHeight * sScale;

    this.w = this.inputWidth * pScale;
    this.h = this.inputHeight * pScale;

    this.pw = Math.max(this.w, (this.h / 3) * 4);
    this.ph = Math.max(this.h, (this.w / 4) * 3);

    this.ox = (this.pw - this.w) / 2;
    this.oy = (this.ph - this.h) / 2;

    (this.canvasProcess.style as any).clientWidth = this.pw + 'px';
    (this.canvasProcess.style as any).clientHeight = this.ph + 'px';
    this.canvasProcess.width = this.pw;
    this.canvasProcess.height = this.ph;

    console.log('processCanvas:', this.canvasProcess.width, this.canvasProcess.height);

    this.renderer.setSize(sw, sh, false); // false -> do not update css styles
  }

  loadMarkers(markers: any[]) {
    markers.forEach((marker: { root: { matrixAutoUpdate: boolean } }) => (marker.root.matrixAutoUpdate = false));

    this.markers = markers;
    this.worker.postMessage({
      type: 'loadMarkers',
      markers: markers.map((marker: { url: any }) => marker.url),
    });
  }

  process() {
    this.contextProcess.fillStyle = 'black';
    this.contextProcess.fillRect(0, 0, this.pw, this.ph);
    this.contextProcess.drawImage(
      this.video,
      0,
      0,
      this.inputWidth,
      this.inputHeight,
      this.ox,
      this.oy,
      this.w,
      this.h
    );

    const imageData = this.contextProcess.getImageData(0, 0, this.pw, this.ph);
    this.worker.postMessage({ type: 'process', imagedata: imageData }, [imageData.data.buffer]);
  }

  onWorkerMessage(e: { data: any }) {
    const msg = e.data;
    switch (msg.type) {
      case 'loaded': {
        const proj = JSON.parse(msg.proj);
        const ratioW = this.pw / this.w;
        const ratioH = this.ph / this.h;
        const f = 2000.0;
        const n = 0.1;

        proj[0] *= ratioW;
        proj[5] *= ratioH;
        proj[10] = -(f / (f - n));
        proj[14] = -((f * n) / (f - n));

        setMatrix(this.camera.projectionMatrix, proj);

        this.onLoaded(msg);
        break;
      }
      case 'markersLoaded': {
        if (msg.end === true) {
          console.log(msg);
        }
        this.process();
        break;
      }
      case 'markerInfos': {
        this.onMarkerInfos(msg.markers);
        break;
      }
      case 'found': {
        // console.log('found', msg);
        this.onFound(msg);
        break;
      }
      case 'lost': {
        //   console.log('lost', msg);
        this.onLost();
        break;
      }
      case 'processNext': {
        this.process();
        break;
      }
    }
  }

  onMarkerInfos(markerInfos: any[]) {
    console.log('markerInfos', markerInfos, this.markers);
    markerInfos.forEach((markerInfo: { id: string | number; width: number; dpi: number; height: number }) => {
      this.markers[markerInfo.id as any].root.children[0].position.x =
        ((markerInfo.width / markerInfo.dpi) * 2.54 * 10) / 2.0;
      this.markers[markerInfo.id as any].root.children[0].position.y =
        ((markerInfo.height / markerInfo.dpi) * 2.54 * 10) / 2.0;
    });
  }

  onFound(msg: { matrixGL_RH: string; index: string }) {
    if (this.markerTracked) return; // ✅ 마커가 이미 감지되었다면 실행 안 함

    console.log('FOUND');
    const matrix = JSON.parse(msg.matrixGL_RH);
    const index = JSON.parse(msg.index);

    // ✅ 마커의 행렬 설정
    setMatrix(this.markers[index].root.matrix, matrix);

    // ✅ 마커의 `visible` 상태 업데이트
    this.markers.forEach((marker: { root: { visible: boolean } }, i: number) => {
      marker.root.visible = i === index;
    });

    // ✅ 마커의 월드 위치 가져오기
    const markerPosition = new THREE.Vector3();
    this.markers[index].root.getWorldPosition(markerPosition);
    console.log('✅ 마커 감지됨, 원점 위치 설정:', markerPosition);

    // ✅ 초기 카메라 위치 가져오기 (WebXR 대응)
    const cameraPosition = new THREE.Vector3();
    if (this.renderer.xr.isPresenting) {
      cameraPosition.setFromMatrixPosition(this.camera.matrixWorld);
    } else {
      this.camera.getWorldPosition(cameraPosition);
    }

    console.log('✅ 감지 시점의 카메라 위치:', cameraPosition);

    // ✅ 카메라 기준으로 원점 보정
    const adjustedOrigin = new THREE.Vector3().subVectors(markerPosition, cameraPosition);
    console.log('✅ 보정된 원점 설정:', adjustedOrigin);

    // ✅ 마커가 감지되었음을 표시하여 중복 실행 방지
    this.markerTracked = true;

    // ✅ `onOriginDetected()` 호출하여 외부에서 원점 설정 가능하도록 함
    if (typeof this.onOriginDetected === 'function') {
      this.onOriginDetected(adjustedOrigin);
    }
  }

  onLost() {
    this.markers.forEach((marker: { root: { visible: boolean } }) => {
      marker.root.visible = false;
    });
  }
}
