import { Outlet } from 'react-router-dom';

export default function Photo() {
  return (
    <div
      className="w-full h-full min-h-[904px] overflow-y-scroll relative"
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
      <Outlet />
    </div>
  );
}
