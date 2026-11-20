import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

/** Tables, not cards: horizontal rules only, sentence-case heads, scrolls sideways on small screens. */
export function Table({
  children,
  caption,
  className,
}: {
  children: ReactNode;
  caption: string;
  className?: string;
}) {
  return (
    <div className="w-full max-w-full overflow-x-auto">
      <table className={cn("w-full border-collapse text-left text-sm", className)}>
        <caption className="visually-hidden">{caption}</caption>
        {children}
      </table>
    </div>
  );
}

export const TH = ({ className, ...p }: ThHTMLAttributes<HTMLTableCellElement>) => (
  <th scope="col" className={cn("border-b border-rule-2 py-2 pr-4 font-medium whitespace-nowrap text-muted", className)} {...p} />
);

export const TD = ({ className, ...p }: TdHTMLAttributes<HTMLTableCellElement>) => (
  <td className={cn("border-b border-rule py-2.5 pr-4 align-middle", className)} {...p} />
);
