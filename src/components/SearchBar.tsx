import { Search, Zap, X } from 'lucide-react';

interface Props {
  value: string;
  onChange: (v: string) => void;
  onCapture?: () => void;
}

export default function SearchBar({ value, onChange, onCapture }: Props) {
  return (
    <div className="flex gap-2">
      <div className="flex-1 relative group">
        <Search 
          size={16} 
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#52525b] group-focus-within:text-[#71717a] transition-colors" 
        />
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="Search your memories..."
          className="w-full pl-10 pr-20 py-2.5 rounded-lg bg-[#18181b] border border-[#27272a] text-[13px] text-white placeholder-[#52525b] focus:outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/10 transition-all"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
          {value && (
            <button
              onClick={() => onChange('')}
              className="p-1 rounded hover:bg-[#27272a] text-[#52525b] hover:text-[#a1a1aa] transition-colors"
            >
              <X size={14} />
            </button>
          )}
          {!value && (
            <kbd className="hidden sm:flex">⌘F</kbd>
          )}
        </div>
      </div>
      {onCapture && (
        <button
          onClick={onCapture}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#18181b] border border-[#27272a] hover:border-amber-500/40 hover:bg-amber-500/5 text-amber-400 text-[13px] font-medium transition-all group"
          title="Capture clipboard now (⌘⇧V)"
        >
          <Zap size={15} className="group-hover:animate-pulse" />
          <span className="hidden sm:inline">Capture</span>
        </button>
      )}
    </div>
  );
}
