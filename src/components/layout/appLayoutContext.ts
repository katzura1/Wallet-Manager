import { useOutletContext } from "react-router-dom";

export interface AppLayoutContext {
  openChat: () => void;
}

export function useAppLayout() {
  return useOutletContext<AppLayoutContext>();
}
