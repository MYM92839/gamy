import { Outlet } from "react-router-dom";

export default function Layout() {
  return (
    <div id="layout" className="w-dvw h-screen mx-auto relative bg-[#344173] font-pretendard overscroll-contain touch-manipulation">
      <Outlet />
    </div>)
}