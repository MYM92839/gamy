import * as THREE from "three";

/**
 * AlvaAR와 Three.js를 연결하는 헬퍼 클래스
 * - AlvaAR의 pose 데이터를 Three.js의 카메라에 적용
 */
class AlvaARConnectorTHREE {
  static Initialize(THREE: any) {
    return (pose: number[], rotationQuaternion: THREE.Quaternion, translationVector: THREE.Vector3) => {
      const m = new THREE.Matrix4().fromArray(pose);
      const r = new THREE.Quaternion().setFromRotationMatrix(m);
      const t = new THREE.Vector3(pose[12], pose[13], pose[14]);

      if (rotationQuaternion) {
        rotationQuaternion.set(-r.x, r.y, r.z, r.w);
      }
      if (translationVector) {
        translationVector.set(t.x, -t.y, -t.z);
      }
    };
  }
}

export { AlvaARConnectorTHREE };
