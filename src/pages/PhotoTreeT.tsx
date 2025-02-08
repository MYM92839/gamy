import { Link, useSearchParams } from 'react-router-dom';
import Button from '../components/Button';
import PhotoPara from '../components/photo/PhotoPara';

export default function PhotoTreeT() {
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

  return (
    <div className="w-full h-full relative">
      <PhotoPara title={`보호수를 배경으로 강원 관찰사와 함께 \n 사진을 찍을 수 있어요!`}>
        <Link to={`/pl/trees?ox=${ox}&oy=${oy}&oz=${oz}&ox=${cx}&cx=${cx}&cy=${cy}&cz=${cz}&sx=${sx}&sy=${sy}&sz=${sz}`}>
          <Button title="시작" className="w-[232px] mx-auto mt-[162px]" onClick={() => {}} />
        </Link>
      </PhotoPara>
    </div>
  );
}
