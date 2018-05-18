module powerbi.extensibility.visual {
    export interface Bar3D {
        x: number;
        z: number;
        value: number;
        color: string;
        categoryX: string;
        categoryY: string;
        valueDescription: string;
    }

    export interface CategoryIndex {
        [index: string]: number;
    }

    export class Bar3DChartDataModel {
        categoryIndexX: CategoryIndex;
        categoryIndexY: CategoryIndex;
        bars: Bar3D[];
        minLocal: number;
        maxLocal: number;
    }
}