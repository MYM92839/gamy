import { Link } from "react-router-dom";

interface IButtonProps {
  title: string;
  onClick?: () => void
  href?: string;
  disabled?: boolean
  className?: string
}
export default function Button({ title, className, onClick, href, disabled }: IButtonProps) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`w-full text-[#344173] font-bold text-[20px] leading-[20px] py-[13px] text-center flex gap-x-[8px] bg-white border-[3px] border-white rounded-[25px] backdrop-blur-sm drop-shadow-md active:text-[#4967DF] disabled:text-[#595959] disabled:bg-[#C9C9C9] disabled:border-[#D8D4D4] items-center justify-center ${className}`}>
      {href ? <Link to={href}>{title}</Link> : <div>{title}</div>}
      <svg width="10" height="16" viewBox="0 0 10 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M2 2L8 8L2 14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>
  )
}