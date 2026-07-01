import { SearchableSelect } from "@/components/ui/searchable-select";

type CondominioOption = {
  id: string;
  nome: string;
  administradora: string | null;
};

export function CondominioSearchSelect({
  name,
  id,
  options,
  selectedId,
  className,
  inputClassName = "mt-2",
  defaultToFirst = true,
  required = false,
}: {
  name: string;
  id?: string;
  options: CondominioOption[];
  selectedId?: string | null;
  className?: string;
  inputClassName?: string;
  defaultToFirst?: boolean;
  required?: boolean;
}) {
  return (
    <SearchableSelect
      name={name}
      id={id}
      options={options.map((option) => ({ value: option.id, label: option.nome }))}
      selectedValue={selectedId}
      placeholder="Digite parte do nome do condomínio"
      className={className}
      inputClassName={inputClassName}
      defaultToFirst={defaultToFirst}
      required={required}
    />
  );
}
