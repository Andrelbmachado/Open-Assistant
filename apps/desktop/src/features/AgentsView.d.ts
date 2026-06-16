import React from "react";
import "./AgentsView.css";
export interface Agent {
    id: string;
    name: string;
    description: string;
    updatedAt: string;
}
export declare function AgentsView(): React.JSX.Element;
