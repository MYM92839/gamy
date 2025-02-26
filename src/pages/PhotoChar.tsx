import { Link, useSearchParams } from 'react-router-dom';
import Button from '../components/Button';
import PhotoPara from '../components/photo/PhotoPara';

export default function PhotoChar() {
  const [searchParams] = useSearchParams();
  const ox = searchParams.get('ox') ? parseFloat(searchParams.get('ox')!) : 0;
  const oy = searchParams.get('oy') ? parseFloat(searchParams.get('oy')!) : 0;
  const oz = searchParams.get('oz') ? parseFloat(searchParams.get('oz')!) : 0;
  const cx = searchParams.get('cx') ? parseFloat(searchParams.get('cx')!) : 0;
  const cy = searchParams.get('cy') ? parseFloat(searchParams.get('cy')!) : 0;
  const cz = searchParams.get('cz') ? parseFloat(searchParams.get('cz')!) : 0;
  const sx = searchParams.get('sx') ? parseFloat(searchParams.get('sx')!) : 0;
  const sy = searchParams.get('sy') ? parseFloat(searchParams.get('sy')!) : 0;
  const sz = searchParams.get('sz') ? parseFloat(searchParams.get('sz')!) : 0;
  const ss = searchParams.get('ss') ? parseFloat(searchParams.get('ss')!) : 1;
  const cs = searchParams.get('cs') ? parseFloat(searchParams.get('cs')!) : 1;

  const cv = searchParams.get('cv');

  const requestDeviceOrientation = async () => {
    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      try {
        const response = await (DeviceOrientationEvent as any).requestPermission();
        if (response === 'granted') {
          // setOrientationEnabled(true);
          // props.logDebug('DeviceOrientation permission granted (iOS).');
        } else {
          // props.logDebug('DeviceOrientation permission not granted.');
        }
      } catch (err) {
        console.error('DeviceOrientation permission error:', err);
      }
    } else {
      // setOrientationEnabled(true);
    }
  };

  return (
    <div className="w-full h-full relative">
      <PhotoPara title={`원주의 캐릭터와 함께 \n 사진을 찍을 수 있어요!`}>
        <Link to={'/frame/kokoang'}>
          <Button title="코코앙과 찍기" className="w-[232px] mx-auto mt-[94px]" />
        </Link>
        <Link to={'/frame/cat'}>
          <Button title="고양이와 찍기" className="w-[232px] mx-auto mt-[22px]" />
        </Link>
        <Link
          to={`/t/trees?f=true&ox=${ox}&oy=${oy}&oz=${oz}&cx=${cx}&cy=${cy}&cz=${cz}&sx=${sx}&sy=${sy}&sz=${sz}&ss=${ss}&cs=${cs}${
            cv ? '&cv=true' : ''
          }`}
        >
          <Button title="관찰사와 찍기" className="w-[232px] mx-auto mt-[22px]" onClick={requestDeviceOrientation} />
        </Link>
        <Link
          to={`/t/moons?f=true&ox=${ox}&oy=${oy}&oz=${oz}&cx=${cx}&cy=${cy}&cz=${cz}&sx=${sx}&sy=${sy}&sz=${sz}&ss=${ss}&cs=${cs}${
            cv ? '&cv=true' : ''
          }`}
        >
          <Button title="토끼와 찍기" className="w-[232px] mx-auto mt-[22px]" onClick={requestDeviceOrientation} />
        </Link>
      </PhotoPara>
    </div>
  );
}
