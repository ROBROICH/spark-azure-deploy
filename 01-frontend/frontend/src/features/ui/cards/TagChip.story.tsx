import { ChevronDown } from 'lucide-react';

type TagChipProps = {
  label: string;
  borderColor: string;
};

export const TagChip = (props: TagChipProps) => (
  <span
    className={`flex items-center rounded-[4px] border-[0.5px] ${props.borderColor} bg-white`}
  >
    <span className="px-2 py-[5px] text-[11px] leading-[1.27] font-medium tracking-[0.02em] text-slate-600">
      {props.label}
    </span>
    <span
      className={`flex items-center justify-center border-l-[0.5px] ${props.borderColor} p-1`}
    >
      <ChevronDown className="size-4 text-slate-600" aria-hidden="true" />
    </span>
  </span>
);
