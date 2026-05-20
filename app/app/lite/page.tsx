
import { InboxOnboardingTip } from '@/components/onboarding/inbox-onboarding-tip'
import { LiteEmptyState } from '@/components/feedback/lite-empty-state'
import { LiteSkeletonCard } from '@/components/feedback/lite-skeleton-card'

export default function LiteFinalPage() {
  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border bg-slate-950 p-6 text-white shadow-sm">
        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#d7eef5]">
          GKLI-Cob Lite Final
        </span>

        <h1 className="mt-4 text-4xl font-semibold tracking-tight">
          Workspace operacional premium
        </h1>

        <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-300">
          O GKLI-Cob Lite consolida operação, gestão e inteligência operacional
          em uma experiência contínua, leve e contextual.
        </p>
      </section>

      <InboxOnboardingTip />

      <section className="grid gap-4 md:grid-cols-3">
        <LiteSkeletonCard />
        <LiteSkeletonCard />
        <LiteSkeletonCard />
      </section>

      <LiteEmptyState
        title="Tudo pronto para operar"
        description="A experiência Lite reduz complexidade operacional sem remover potência funcional."
      />
    </div>
  )
}
