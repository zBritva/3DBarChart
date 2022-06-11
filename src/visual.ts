/*
*  Power BI Visual CLI
*
*  Copyright (c) Microsoft Corporation
*  All rights reserved.
*  MIT License
*
*  Permission is hereby granted, free of charge, to any person obtaining a copy
*  of this software and associated documentation files (the ""Software""), to deal
*  in the Software without restriction, including without limitation the rights
*  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
*  copies of the Software, and to permit persons to whom the Software is
*  furnished to do so, subject to the following conditions:
*
*  The above copyright notice and this permission notice shall be included in
*  all copies or substantial portions of the Software.
*
*  THE SOFTWARE IS PROVIDED *AS IS*, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
*  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
*  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
*  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
*  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
*  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
*  THE SOFTWARE.
*/

"use strict";
import "core-js/stable";
import "./../style/visual.less";
import powerbi from "powerbi-visuals-api";
import IVisual = powerbi.extensibility.IVisual;
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import VisualUpdateType = powerbi.VisualUpdateType;
import DataView = powerbi.DataView;
import PrimitiveValue = powerbi.PrimitiveValue;
import EnumerateVisualObjectInstancesOptions = powerbi.EnumerateVisualObjectInstancesOptions;
import VisualObjectInstance = powerbi.VisualObjectInstance;
import VisualObjectInstanceEnumerationObject = powerbi.VisualObjectInstanceEnumerationObject;

import { TextGeometry } from "three/examples/jsm/geometries/TextGeometry";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
// import { Font, FontLoader } from "three/examples/jsm/loaders/FontLoader";
// import { Geometry } from "three/examples/jsm/deprecated/Geometry";
import * as THREE from "three";


import { VisualSettings, CameraPosition as SettingsCameraPosition }from "./settings";
import { CameraControl } from "./cameraControl"
import { Bar3DChartDataModel, Bar3D, CategoryIndex } from "./interfaces";
import { BAR_SIZE, BAR_SIZE_HEIGHT, COLOR_WHITE } from "./constants";

// import ColorHelper = powerbi.extensibility.utils.color.ColorHelper;
import IColorPalette = powerbi.extensibility.IColorPalette;

import * as _ from "lodash-es";
import { scaleLinear, ScaleLinear } from "d3-scale";

interface BarMeshParams {
    width: number;
    height: number;
    depth: number;
    x: number;
    y: number;
    z?: number;
    color?: string;
}

interface CameraPosition {
    x: number;
    y: number;
    z: number;
    rotationX: number;
    rotationY: number;
    rotationZ: number;
}

enum Axis {
    X,
    Y,
    Z
}

export class Visual implements IVisual {
    private target: HTMLElement;
    private settings: VisualSettings;

    private cameraControl: CameraControl;
    private controls: OrbitControls | undefined;
    private scene: THREE.Scene;
    private camera: THREE.Camera;
    private renderer: THREE.Renderer;
    private parent3D: THREE.Object3D;
    private colorPalette: IColorPalette;

    public static CategoryXIndex: number = 1;
    public static CategoryYIndex: number = 0;
    public static DataViewIndex: number = 0;
    public static ValuesIndex: number = 0;
    private static CameraDefaultPosition: CameraPosition = <CameraPosition>{
        z: 10,
        x: 5,
        y: 0,
        rotationX: 0,
        rotationY: 0,
        rotationZ: 0
    };

    private dataPassedFlag: boolean;
    private host: IVisualHost;

    private test() {
        var scene = new THREE.Scene();
        var camera = new THREE.PerspectiveCamera( 75, window.innerWidth/window.innerHeight, 0.1, 1000 );

        var renderer = new THREE.WebGLRenderer();
        renderer.setSize( window.innerWidth, window.innerHeight );
        this.target.appendChild(renderer.domElement);

        var geometry = new THREE.BoxGeometry( 1, 1, 1 );
        var material = new THREE.MeshBasicMaterial( { color: 0x00ff00 } );
        var cube = new THREE.Mesh( geometry, material );
        this.scene.add( cube );

        camera.position.z = 5;

        var animate = function () {
            requestAnimationFrame( animate );

            cube.rotation.x += 0.01;
            cube.rotation.y += 0.01;

            renderer.render( scene, camera );
        };

        animate();
        return true;
    }


    constructor(options: VisualConstructorOptions) {
        try{
            console.log('Visual constructor', options);
            this.target = options.element;
            this.host = options.host;
            // if (this.test()) {
            //     return;
            // }

            this.scene = new THREE.Scene();
            this.configureCamera();
            this.renderer = new THREE.WebGLRenderer({
                alpha: true
            });
            // this.renderer.setClearColor( 0x000000, 0 ); // the default
            this.target.appendChild(this.renderer.domElement);
            this.colorPalette = options.host.colorPalette;

            let timeout: number = 0;
            if ((typeof OrbitControls) !== "undefined") {
                console.log('OrbitControls enabled');
                this.controls = new OrbitControls( this.camera, this.target );
                this.controls.enabled = true;
                this.controls.addEventListener("change", () => {
                    if (!this.settings) {
                        return;
                    }
                    this.settings.cameraPosition.positionX = this.camera.position.x;
                    this.settings.cameraPosition.positionY = this.camera.position.y;
                    this.settings.cameraPosition.positionZ = this.camera.position.z;

                    this.settings.cameraPosition.rotationX = this.camera.rotation.x;
                    this.settings.cameraPosition.rotationY = this.camera.rotation.y;
                    this.settings.cameraPosition.rotationZ = this.camera.rotation.z;
                    // for prevent ddosing host
                    if (timeout === 0) {
                        timeout = (setTimeout as any)(() => {
                            this.persistCameraSettings(this.camera.position, this.camera.rotation);
                            timeout = 0;
                        }, 3000) as number;
                    }
                })
                this.controls?.update();
            }
            // this.cameraControl = new CameraControl(this.renderer, <THREE.PerspectiveCamera>this.camera, () => {
            //     // you might want to rerender on camera update if you are not rerendering all the time
            //     window.requestAnimationFrame(() => this.renderer.render(this.scene, this.camera));
            // })
            this.dataPassedFlag = false;
        } catch(e) {
            console.error(e);
        }
    }

    private persistCameraSettings(position: THREE.Vector3, rotation: THREE.Euler) {
        console.log('persist', position, rotation);
        const instance: powerbi.VisualObjectInstance = {
            objectName: "cameraPosition",
            selector: undefined,
            properties: {
                positionX: position.x,
                positionY: position.y,
                positionZ: position.z,
                rotationX: rotation.x,
                rotationY: rotation.y,
                rotationZ: rotation.z
            }
        };

        this.host.persistProperties({
            merge: [
                instance
            ]
        });
    }

    public clearScene(): void {
        while (this.scene.children.length > 0) {
            this.scene.remove(this.scene.children[0]);
        }
    }

    public update(options: VisualUpdateOptions) {
        console.log('VisualUpdateOptions', options);
        if (
            options.type === VisualUpdateType.Data ||
            options.type === VisualUpdateType.All
        ) {
            this.clearScene();
        }
        if (!this.checkDataView(options.dataViews)) {
            this.dataPassedFlag = false;
            return;
        }

        this.settings = Visual.parseSettings(options && options.dataViews && options.dataViews[0]);
        let model = this.convertData(options.dataViews);
        if (model == null) {
            return;
        }

        this.configureCamera();

        if (
            options.type === VisualUpdateType.Resize ||
            options.type === VisualUpdateType.All ||
            !this.dataPassedFlag // correct data passed to the visual first time, the visual should configure the viewport
        ) {
            let width = options.viewport.width;
            let height = options.viewport.height;
            this.renderer.setSize( width, height);
        }
        this.dataPassedFlag = true;

        if (
            options.type === VisualUpdateType.Data ||
            options.type === VisualUpdateType.All
        ) {
            this.configureLights();

            this.drawBars(model);
            // this.create2DLabels(model, Axis.X);
            // this.create2DLabels(model, Axis.Y);
        }

        let render = () => {
            requestAnimationFrame( render );
            this.renderer.render( this.scene, this.camera );
            this.controls?.update();
        };
        render();
    }

    private createBar(params: BarMeshParams, includeToScene: boolean = false): THREE.Mesh {
        params.color = params.color || "red";
        params.y = params.y || 0;
        params.height = params.height || 0.001;
        let boxGeometry = new THREE.BoxGeometry(params.width, params.height, params.depth);
        let material = new THREE.MeshLambertMaterial( {
            color: params.color
        });
        let cube = new THREE.Mesh(boxGeometry, material);
        cube.position.x = params.x;
        cube.position.y = params.y;
        cube.position.z = params.z;
        if (includeToScene) {
            this.scene.add(cube);
        }
        return cube;
    }

    private drawBars(model: Bar3DChartDataModel): void {
        // let bar1 = this.createBar({ width: 1, height: 1, depth: 1, x: 1, y: 1, z: 0, color: "blue" });
        let scale: ScaleLinear<number, number> = scaleLinear().domain([model.minLocal, model.maxLocal]).range([0, BAR_SIZE_HEIGHT]);
        model.bars.forEach((bar: Bar3D) => {
            let barMesh = this.createBar({
                width: BAR_SIZE,
                height: scale(bar.value),
                depth: BAR_SIZE,
                x: bar.x,
                z: bar.z,
                y: scale(bar.value) / 2,
                color: bar.color
            });
            this.scene.add(barMesh);
        });
    }

    private shiftCameraToCenterOfChart(model: Bar3DChartDataModel) {
        // TODO fix
    }

    public static degRad(deg: number): number {
        return deg * Math.PI / 180;
    }

    private configureCamera(): void {
        if (!this.camera) {
            this.camera = new THREE.PerspectiveCamera( 75, 800 / 600, 0.1, 1000 );
        }
        let defaultCameraSettings = new SettingsCameraPosition();

        let positions = this.settings && this.settings.cameraPosition || defaultCameraSettings;
        this.camera.position.set(positions.positionX, positions.positionY, positions.positionZ);
        this.camera.rotation.set(positions.rotationX, positions.rotationY, positions.rotationZ);
    }

    private configureLights(): void {
        let hemiLight = new THREE.HemisphereLight( new THREE.Color("white"), new THREE.Color("white"), 0.6 );
        hemiLight.color.setHSL( 0.6, 0.75, 0.5 );
        hemiLight.groundColor.setHSL( 0.095, 0.5, 0.5 );
        hemiLight.position.set( 0, 500, 0 );
        this.scene.add( hemiLight );

        let dirLight = new THREE.DirectionalLight( new THREE.Color("white"), 1 );
        dirLight.position.set( 5, -5, 8 );
        dirLight.position.multiplyScalar( 50);
        dirLight.name = "dirlight";
        // dirLight.shadowCameraVisible = true;

        this.scene.add( dirLight );

        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = dirLight.shadow.mapSize.height = 1024 * 2;

        let d = 300;

        dirLight.shadow.camera.left = -d;
        dirLight.shadow.camera.right = d;
        dirLight.shadow.camera.top = d;
        dirLight.shadow.camera.bottom = -d;

        dirLight.shadow.camera.far = 3500;
        dirLight.shadow.bias = -0.0001;
        // dirLight.shadowDarkness = 0.35;
    }

    private configureParentObject() {
    }

    private static parseSettings(dataView: DataView): VisualSettings {
        return VisualSettings.parse(dataView) as VisualSettings;
    }

    private checkDataView(dataViews: DataView[]): boolean {
        if (!dataViews
        || !dataViews[Visual.DataViewIndex]
        || !dataViews[Visual.DataViewIndex].categorical
        || !dataViews[Visual.DataViewIndex].categorical.categories
        || !dataViews[Visual.DataViewIndex].categorical.categories[Visual.CategoryXIndex].source
        || !dataViews[Visual.DataViewIndex].categorical.categories[Visual.CategoryYIndex].source
        || !dataViews[Visual.DataViewIndex].categorical.values)
            return false;

        return true;
    }

    private convertData(dataViews: DataView[]): Bar3DChartDataModel {
        if (!this.checkDataView(dataViews)) {
            return null;
        }

        let categorical = dataViews[Visual.DataViewIndex].categorical;
        let categoryX = categorical.categories[Visual.CategoryXIndex];
        let categoryY = categorical.categories[Visual.CategoryYIndex];
        let dataValue = categorical.values[Visual.ValuesIndex];

        let xCategoryIndex: CategoryIndex = {};
        let yCategoryIndex: CategoryIndex = {};

        _.uniq(categoryX.values).forEach( (category, index) => {
            if (category === null) {
                category = "null";
            }
            xCategoryIndex[<string>category] = index;
        });
        _.uniq(categoryY.values).forEach( (category, index) => {
            if (category === null) {
                category = "null";
            }
            yCategoryIndex[<string>category] = index;
        });

        let bars: Bar3D[] = [];
        for (let valueIndex = 0; valueIndex < dataValue.values.length; valueIndex++) {
            let bar: Bar3D = <Bar3D>{
                categoryX: categoryX.values[valueIndex],
                categoryY: categoryY.values[valueIndex],
                value: dataValue.values[valueIndex],
                x: xCategoryIndex[<string>categoryX.values[valueIndex]],
                z: yCategoryIndex[<string>categoryY.values[valueIndex]],
                color: this.settings.dataPoint.defaultColor || this.colorPalette.getColor(valueIndex.toString()).value
            };

            bars.push(bar);
        }

        // TODO sort bars by X and Y and indexes by value
        return <Bar3DChartDataModel>{
            bars: bars,
            categoryIndexX: xCategoryIndex,
            categoryIndexY: yCategoryIndex,
            minLocal: dataValue.minLocal,
            maxLocal: dataValue.maxLocal
        };
    }

    // private draw2DLine() {
    //     //create a blue LineBasicMaterial
    //     let material = new THREE.LineBasicMaterial( { color: 0x0000ff } );
    //     let geometry = new THREE.BoxGeometry();
    //     const vertices = [];
    //     vertices.push(new THREE.Vector3( -10, 0, 0) );
    //     vertices.push(new THREE.Vector3( 0, 10, 0) );
    //     vertices.push(new THREE.Vector3( 10, 0, 0) );
    //     geometry.setFromPoints( vertices );
    //     let line = new THREE.Line( geometry, material );
    //     line.position.x = 0;
    //     line.position.y = 0;
    //     line.position.z = 0;
    //     this.scene.add(line);
    // }

    // private create2DLabels(category: Bar3DChartDataModel, axis: Axis): void {
    //     let loader = new FontLoader();
    //     let values: CategoryIndex;
    //     let labelsShift: number;
    //     if (axis === Axis.X) {
    //         values = category.categoryIndexX;
    //         labelsShift = Object.keys(category.categoryIndexY).length * BAR_SIZE;
    //     }
    //     if (axis === Axis.Y) {
    //         values = category.categoryIndexY;
    //         labelsShift = Object.keys(category.categoryIndexX).length * BAR_SIZE;
    //     }
    //     loader.load('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/fonts/helvetiker_regular.typeface.json', ( font ) => {
    //         Object.keys(values).forEach( (value: PrimitiveValue, index: number) => {
    //             let categoryLabel: TextGeometry = new TextGeometry( (value || "").toString(), {
    //                 font: new Font((<any>font).data),
    //                 height: 0.0001,
    //                 size: BAR_SIZE / 2.1,
    //                 bevelEnabled: false,
    //                 bevelSize: 1,
    //                 bevelThickness: 1
    //             });
    //             let material = new THREE.MeshLambertMaterial( {
    //                 color: "black"
    //             });

    //             let textMesh = new THREE.Mesh(categoryLabel, material);
    //             if (axis === Axis.Y) {
    //                 textMesh.position.x = BAR_SIZE + labelsShift;
    //                 textMesh.position.z = index + (1 - BAR_SIZE) + (BAR_SIZE / 2);
    //                 textMesh.position.y = 0;
    //                 textMesh.rotation.x = Visual.degRad(90);
    //                 textMesh.rotation.z = Visual.degRad(180);
    //                 textMesh.rotation.y = Visual.degRad(-180);
    //                 this.scene.add(textMesh);
    //             }
    //             if (axis === Axis.X) {
    //                 textMesh.geometry.computeBoundingBox();
    //                 let size: THREE.Vector3 = textMesh.geometry.boundingBox.max;
    //                 textMesh.position.z = BAR_SIZE + labelsShift + size.x;
    //                 textMesh.position.x = index + (1 - BAR_SIZE) * 2;
    //                 textMesh.position.y = 0;

    //                 textMesh.rotation.z = Visual.degRad(-90);
    //                 textMesh.rotation.x = Visual.degRad(90);
    //                 textMesh.rotation.y = Visual.degRad(180);
    //                 this.scene.add(textMesh);
    //             }
    //             // this.scene.add(textMesh);
    //         });
    //     });
    // }

    /**
     * This function gets called for each of the objects defined in the capabilities files and allows you to select which of the
     * objects and properties you want to expose to the users in the property pane.
     *
     */
    public enumerateObjectInstances(options: EnumerateVisualObjectInstancesOptions): VisualObjectInstance[] | VisualObjectInstanceEnumerationObject {
        return VisualSettings.enumerateObjectInstances(this.settings || VisualSettings.getDefault(), options);
    }
}

