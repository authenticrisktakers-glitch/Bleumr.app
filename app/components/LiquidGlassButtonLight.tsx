import { Globe } from 'lucide-react';

export default function LiquidGlassButtonLight({ className, onClick }: { className?: string; onClick?: () => void }) {
  return (
    <div 
      className={className || "h-[282px] inline-flex relative rounded-[225px] hover:scale-105 active:scale-95 transition-transform duration-300 cursor-pointer"} 
      onClick={onClick}
      role="button"
      tabIndex={0}
    >
      <div aria-hidden="true" className="absolute backdrop-blur-[75px] inset-0 mix-blend-plus-lighter pointer-events-none rounded-[225px]" style={{ backgroundImage: "url('data:image/svg+xml;utf8,<svg viewBox=\\'0 0 642 282\\' xmlns=\\'http://www.w3.org/2000/svg\\' preserveAspectRatio=\\'none\\'><rect x=\\'0\\' y=\\'0\\' height=\\'100%\\' width=\\'100%\\' fill=\\'url(%23grad)\\' opacity=\\'0.10000000149011612\\'/><defs><radialGradient id=\\'grad\\' gradientUnits=\\'userSpaceOnUse\\' cx=\\'0\\' cy=\\'0\\' r=\\'10\\' gradientTransform=\\'matrix(36.721 15.304 -34.842 16.13 85.715 46.242)\\'><stop stop-color=\\'rgba(255,255,255,1)\\' offset=\\'0\\'/><stop stop-color=\\'rgba(255,255,255,0)\\' offset=\\'1\\'/></radialGradient></defs></svg>')" }} />
      <div className="flex flex-row items-center size-full">
        <div className="content-stretch flex gap-[30px] h-full items-center overflow-clip px-[94px] py-[67px] relative">
          <div className="absolute blur-[4px] inset-[0_-0.5px_0_-1px]" data-name="Lenses">
            <div className="absolute backdrop-blur-[50px] bg-[rgba(255,255,255,0.01)] inset-0 rounded-[1000px]" data-name="0" />
            <div className="absolute backdrop-blur-[25px] bg-[rgba(255,255,255,0.01)] inset-[3px_2.07px] rounded-[1000px]" data-name="1" />
            <div className="absolute backdrop-blur-[12.5px] bg-[rgba(255,255,255,0.01)] inset-[9px_6.2px] rounded-[1000px]" data-name="2" />
            <div className="absolute backdrop-blur-[5px] bg-[rgba(255,255,255,0.01)] inset-[19px_13.09px] rounded-[1000px]" data-name="3" />
            <div className="absolute backdrop-blur-[1px] bg-[rgba(255,255,255,0.01)] inset-[39px_26.86px] rounded-[1000px]" data-name="4" />
          </div>
          <div className="relative shrink-0 size-[110px]" data-name="Icon - Figma">
             <Globe className="absolute block size-full text-white" strokeWidth={1} />
          </div>
          <p className="font-['SF_Pro_Display:Medium',sans-serif] leading-[147px] not-italic relative shrink-0 text-[100px] text-center text-white tracking-[-4.2px] whitespace-nowrap">AI Assist</p>
        </div>
      </div>
      <div className="absolute inset-0 pointer-events-none rounded-[inherit] shadow-[inset_29.816px_29.816px_4.969px_-34.785px_rgba(255,255,255,0.5),inset_19.877px_19.877px_9.939px_-19.877px_#b3b3b3,inset_-19.877px_-19.877px_9.939px_-19.877px_#b3b3b3,inset_0px_0px_0px_9.939px_#999,inset_0px_0px_218.65px_0px_rgba(242,242,242,0.5)]" />
      <div aria-hidden="true" className="absolute border-2 border-solid border-white/40 inset-0 pointer-events-none rounded-[225px]" />
    </div>
  );
}