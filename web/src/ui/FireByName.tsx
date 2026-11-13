import { Crosshair } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { parseCell } from "@/lib/utils";

interface FireByNameProps {
  readonly disabled: boolean;
  readonly onFire: (index: number) => void;
}

export function FireByName({ disabled, onFire }: FireByNameProps) {
  const id = useId();
  const [value, setValue] = useState("");
  const cell = parseCell(value);
  const submit = (e: FormEvent): void => {
    e.preventDefault();
    if (cell === null || disabled) return;
    onFire(cell);
    setValue("");
  };
  return (
    <form onSubmit={submit} aria-label="Fire by cell name" className="sr-only flex items-center gap-1.5 rounded-xl border border-line bg-glass p-1 pl-2.5 backdrop-blur-md focus-within:not-sr-only">
      <label htmlFor={id} className="text-xs text-muted">
        Target
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="B7"
        maxLength={3}
        autoComplete="off"
        spellCheck={false}
        className="w-12 rounded-md bg-transparent px-1 py-1 font-mono text-sm uppercase outline-none placeholder:text-muted/60 focus-visible:ring-2 focus-visible:ring-brass"
      />
      <Button size="sm" variant="brass" type="submit" disabled={disabled || cell === null}>
        <Crosshair aria-hidden />
        Fire
      </Button>
    </form>
  );
}
