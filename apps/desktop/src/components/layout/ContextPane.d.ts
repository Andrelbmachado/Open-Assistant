import React from "react";
import "./ContextPane.css";
interface ContextPaneProps {
    isCollapsed: boolean;
    onToggle: () => void;
    currentView?: string;
}
export declare function ContextPane({ isCollapsed, onToggle, currentView }: ContextPaneProps): React.JSX.Element;
export {};
