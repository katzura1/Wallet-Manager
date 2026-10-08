import { useEffect, useLayoutEffect, useRef } from "react";
import { useOutletContext } from "react-router-dom";
import type { LucideIcon } from "lucide-react";

export interface QuickAction {
  label: string;
  description: string;
  icon: LucideIcon;
  onClick: () => void;
}

export interface PageAction {
  label: string;
  onClick: () => void;
  mobileActions?: QuickAction[];
}

export interface RegisteredPageAction {
  label: string;
  onClick: () => void;
  getMobileActions: () => QuickAction[];
}

export interface AppLayoutContext {
  registerPageAction: (action: RegisteredPageAction | null) => void;
  openChat: () => void;
}

export function useAppLayout() {
  return useOutletContext<AppLayoutContext>();
}

export function usePageAction(action: PageAction | null) {
  const { registerPageAction } = useAppLayout();
  const actionRef = useRef(action);

  useLayoutEffect(() => {
    actionRef.current = action;
  });

  useEffect(() => {
    if (!action?.label) return;
    registerPageAction({
      label: action.label,
      onClick: () => actionRef.current?.onClick(),
      getMobileActions: () => actionRef.current?.mobileActions ?? [],
    });
    return () => registerPageAction(null);
  }, [action?.label, registerPageAction]);
}
