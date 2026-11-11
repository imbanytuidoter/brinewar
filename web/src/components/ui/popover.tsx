import { Popover as P } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const Popover = P.Root;
export const PopoverTrigger = P.Trigger;

export function PopoverContent({ className, sideOffset = 8, ...props }: ComponentProps<typeof P.Content>) {
  return (
    <P.Portal>
      <P.Content
        sideOffset={sideOffset}
        className={cn("z-50 w-80 max-w-[calc(100vw-32px)] rounded-xl border border-line bg-[#0d2633]/95 p-3 text-xs text-muted shadow-2xl backdrop-blur-md", className)}
        {...props}
      />
    </P.Portal>
  );
}
