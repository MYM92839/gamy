import { Bloom, EffectComposer } from '@react-three/postprocessing';

export function Effects() {
  return (
    <EffectComposer enableNormalPass={false}>
      <Bloom luminanceThreshold={0.2} mipmapBlur luminanceSmoothing={0} intensity={1.75} />
    </EffectComposer>
  );
}
