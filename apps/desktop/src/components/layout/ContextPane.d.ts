import React from "react";
import "./ContextPane.css";
interface ContextPaneProps {
    isCollapsed: boolean;
    onToggle: () => void;
    currentView?: string;
    position?: 'right' | 'bottom' | 'floating';
    onPositionChange?: (pos: 'right' | 'bottom' | 'floating') => void;
    onClose?: () => void;
}
export declare function ContextPane({ isCollapsed, onToggle, currentView, position, onPositionChange, onClose }: ContextPaneProps): React.JSX.Element;
export {};
