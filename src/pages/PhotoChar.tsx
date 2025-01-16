import { Link } from "react-router-dom";
import Button from "../components/Button";
import PhotoPara from "../components/photo/PhotoPara";

export default function PhotoChar() {
  return (
    <div className="w-full h-full relative">
      <PhotoPara title={`원주의 캐릭터와 함께 \n 사진을 찍을 수 있어요!`} >
        <Link to={'/frame/kokoang'}><Button title="코코앙과 찍기" className="w-[232px] mx-auto mt-[124px]" /></Link>
        <Link to={'/frame/cat'}> <Button title="고양이와 찍기" className="w-[232px] mx-auto mt-[22px]" /></Link>
      </PhotoPara>
    </div>
  )
}