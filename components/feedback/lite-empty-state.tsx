
import { Sparkles } from 'lucide-react'

type Props = {
  title: string
  description: string
}

export function LiteEmptyState({ title, description }: Props) {
  return (
    <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-[#edf8fb] text-[#04799a]">
        <Sparkles size={24} />
      </div>

      <h2 className="mt-5 text-lg font-semibold text-slate-950">
        {title}
      </h2>

      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
        {description}
      </p>
    </div>
  )
}
