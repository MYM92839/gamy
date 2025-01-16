import { Link } from "react-router-dom";
import Button from "../components/Button";
import PhotoPara from "../components/photo/PhotoPara";

export default function PhotoTree() {
  return (
    <div className="w-full h-full relative">
      <PhotoPara title={`보호수를 배경으로 강원 관찰사와 함께 \n 사진을 찍을 수 있어요!`} >
        <Link to={'/ar/tree'}> <Button title="시작" className="w-[232px] mx-auto mt-[162px]" /></Link>
      </PhotoPara>
    </div>
  )
}