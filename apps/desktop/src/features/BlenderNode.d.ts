import React from 'react';
export interface BlenderNodeData {
    title: string;
    headerColor: string;
    type: string;
    inputs: {
        id: string;
        label: string;
        color?: string;
    }[];
    outputs: {
        id: string;
        label: string;
        color?: string;
    }[];
    prompt?: string;
}
export declare function BlenderNode({ id, data }: {
    id: string;
    data: BlenderNodeData;
}): React.JSX.Element;
