import { Outlet } from "react-router-dom";

export default function Photo() {
  return (<div className="w-full h-full  min-h-[874px] relative">
    <img className="absolute bottom-0 w-full" src={import.meta.env.VITE_PUBLIC_URL + "/imgs/background_image.png"} />
    <div className="absolute inset-0 bg-gradient-to-b from-[#344173] via-[#344173]/60 to-[#344173]/30 via-70%" />
    <Outlet />
  </div>)
}