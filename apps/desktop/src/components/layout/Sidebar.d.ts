import React from "react";
interface SidebarProps {
    currentView: string;
    onNavigate: (view: string) => void;
    isCollapsed: boolean;
    onToggle: () => void;
}
export declare function Sidebar({ currentView, onNavigate, isCollapsed, onToggle }: SidebarProps): React.JSX.Element;
export {};
