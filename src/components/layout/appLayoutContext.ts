import { useEffect, useLayoutEffect, useRef } from "react";
import { useOutletContext } from "react-router-dom";

export interface PageAction {
  label: string;
  onClick: () => void;
}

export interface RegisteredPageAction {
  label: string;
  onClick: () => void;
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
    });
    return () => registerPageAction(null);
  }, [action?.label, registerPageAction]);
}
