import { Outlet } from "react-router-dom";

export default function Layout() {
  return (
    <div id="layout" className="w-dvw h-dvh mx-auto relative bg-[#344173] font-pretendard overflow-y-hidden overscroll-contain touch-manipulation">
      <Outlet />
    </div>)
}