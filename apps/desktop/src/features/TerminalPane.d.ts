import React from "react";
import "xterm/css/xterm.css";
import "./TerminalPane.css";
export declare function TerminalPane({ onOpenAiTerminal, isAiTerminalOpen }: {
    onOpenAiTerminal?: () => void;
    isAiTerminalOpen?: boolean;
}): React.JSX.Element;
