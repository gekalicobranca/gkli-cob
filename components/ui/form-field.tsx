type FormFieldProps = {
  label: string
  children: React.ReactNode
  hint?: string
}

export function FormField({ label, children, hint }: FormFieldProps) {
  return (
    <div>
      <label className="text-[13px] font-medium text-slate-700">{label}</label>
      <div className="mt-2">{children}</div>
      {hint ? <p className="mt-1 text-xs leading-5 text-slate-500">{hint}</p> : null}
    </div>
  )
}
