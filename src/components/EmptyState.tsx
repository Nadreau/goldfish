import { Plus, Search, Sparkles, Clipboard, ArrowRight } from 'lucide-react';

interface Props {
  hasSearch: boolean;
  onAddMemory: () => void;
}

export default function EmptyState({ hasSearch, onAddMemory }: Props) {
  if (hasSearch) {
    return (
      <div className="flex flex-col items-center justify-center py-16 animate-fade-in">
        <div className="w-14 h-14 rounded-2xl bg-[#18181b] border border-[#27272a] flex items-center justify-center mb-4">
          <Search size={24} className="text-[#52525b]" />
        </div>
        <h3 className="text-[15px] font-medium text-white mb-1">No results found</h3>
        <p className="text-[13px] text-[#71717a] text-center max-w-xs">
          Try adjusting your search or add a new memory that matches.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-12 animate-fade-in">
      {/* Hero illustration */}
      <div className="relative mb-6">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 border border-violet-500/20 flex items-center justify-center">
          <Sparkles size={32} className="text-violet-400" />
        </div>
        <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
          <div className="w-2 h-2 rounded-full bg-emerald-400" />
        </div>
      </div>

      <h3 className="text-lg font-semibold text-white mb-2">Welcome to ContextBridge</h3>
      <p className="text-[13px] text-[#71717a] text-center max-w-sm mb-8 leading-relaxed">
        Your AI memory starts here. Save important context, and every AI you use will remember it.
      </p>

      {/* Getting started steps */}
      <div className="w-full max-w-md space-y-3 mb-8">
        <div className="group flex items-center gap-4 p-4 rounded-xl bg-[#18181b] border border-[#27272a] hover:border-violet-500/30 transition-all cursor-pointer" onClick={onAddMemory}>
          <div className="w-10 h-10 rounded-lg bg-violet-500/10 flex items-center justify-center flex-shrink-0">
            <Plus size={18} className="text-violet-400" />
          </div>
          <div className="flex-1">
            <p className="text-[13px] font-medium text-white mb-0.5">Add your first memory</p>
            <p className="text-[12px] text-[#52525b]">Save something important you want AI to remember</p>
          </div>
          <ArrowRight size={16} className="text-[#52525b] group-hover:text-violet-400 transition-colors" />
        </div>

        <div className="flex items-center gap-4 p-4 rounded-xl bg-[#18181b] border border-[#27272a]">
          <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
            <Clipboard size={18} className="text-amber-400" />
          </div>
          <div className="flex-1">
            <p className="text-[13px] font-medium text-white mb-0.5">Copy anything to clipboard</p>
            <p className="text-[12px] text-[#52525b]">Auto-captures when monitoring is enabled</p>
          </div>
        </div>
      </div>

      {/* CTA */}
      <button
        onClick={onAddMemory}
        className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-[13px] font-medium transition-all shadow-lg shadow-violet-500/20"
      >
        <Plus size={16} />
        Add Your First Memory
      </button>
    </div>
  );
}
