import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * State that lives in the URL (filters, tabs, pages), so views can be shared and survive reloads.
 * Setting a value equal to its default removes the parameter.
 */
export function useUrlState(key: string, defaultValue = ""): [string, (next: string) => void] {
  const [params, setParams] = useSearchParams();
  const value = params.get(key) ?? defaultValue;
  const set = useCallback(
    (next: string) => {
      setParams(
        (prev) => {
          const copy = new URLSearchParams(prev);
          if (next === defaultValue || next === "") copy.delete(key);
          else copy.set(key, next);
          return copy;
        },
        { replace: true },
      );
    },
    [key, defaultValue, setParams],
  );
  return [value, set];
}
