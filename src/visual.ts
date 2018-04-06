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

module powerbi.extensibility.visual {
    "use strict";

    // import ColorHelper = powerbi.extensibility.utils.color.ColorHelper;
    import IColorPalette = powerbi.extensibility.IColorPalette;

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
            rotationX: -45,
            rotationY: 0,
            rotationZ: -45
        };

        constructor(options: VisualConstructorOptions) {
            console.log('Visual constructor', options);
            this.target = options.element;

            this.scene = new THREE.Scene();
            this.configureCamera();
            this.renderer = new THREE.WebGLRenderer({
                alpha: true
            });
            // this.renderer.setClearColor( 0x000000, 0 ); // the default
            this.target.appendChild(this.renderer.domElement);
            this.colorPalette = options.host.colorPalette;
        }

        public clearScene(): void {
            while (this.scene.children.length > 0) {
                this.scene.remove(this.scene.children[0]);
            }
        }

        public update(options: VisualUpdateOptions) {
            if (
                options.type === VisualUpdateType.Data ||
                options.type === VisualUpdateType.All
            ) {
                this.clearScene();
            }
            if (!this.checkDataView(options.dataViews)) {
                return;
            }

            let model = this.convertData(options.dataViews);
            if (model == null) {
                return;
            }

            this.settings = Visual.parseSettings(options && options.dataViews && options.dataViews[0]);

            if (
                options.type === VisualUpdateType.Resize ||
                options.type === VisualUpdateType.All
            ) {
                let width = options.viewport.width;
                let height = options.viewport.height;
                this.renderer.setSize( width, height);
            }

            if (
                options.type === VisualUpdateType.Data ||
                options.type === VisualUpdateType.All
            ) {
                this.configureLights();

                this.drawBars(model);
                this.create2DLabels(options.dataViews[0].categorical.categories[0], Axis.X);
                this.create2DLabels(options.dataViews[0].categorical.categories[1], Axis.Y);
                this.shiftCameraToCenterOfChart(model);
            }

            let this_ = this;
            function render() {
                requestAnimationFrame( render );
                this_.renderer.render( this_.scene, this_.camera );
            }
            render();
        }

        private createBar(params: BarMeshParams, includeToScene: boolean = false): THREE.Mesh {
            params.color = params.color || "red";
            params.z = params.z || 0;
            let boxGeometry = new THREE.BoxGeometry(params.width, params.height, params.depth);
            boxGeometry.translate(0, 0 , params.depth / 2.0);
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
            let scale: d3.scale.Linear<number, number> = d3.scale.linear().domain([0, model.maxLocal]).range([0, BAR_SIZE_HEIGHT]);
            model.bars.forEach((bar: Bar3D) => {
                let barMesh = this.createBar({
                    width: BAR_SIZE,
                    height: BAR_SIZE,
                    depth: scale(bar.value),
                    x: bar.x,
                    y: bar.y,
                    z: 0,
                    color: bar.color
                });
                this.scene.add(barMesh);
            });
        }

        private shiftCameraToCenterOfChart(model: Bar3DChartDataModel) {
            // let cameraX = (d3.max(model.bars, (data: Bar3D, index: number) => data.x) + BAR_SIZE / 2) / 2;
            // let cameraY = (d3.max(model.bars, (data: Bar3D, index: number) => data.y) + BAR_SIZE / 2) / 2;
            let cameraX = 0;
            let cameraY = 0;
            console.log("Camera position", cameraX, cameraY);
            this.camera.position.set(cameraX || Visual.CameraDefaultPosition.x, cameraY || Visual.CameraDefaultPosition.y, Visual.CameraDefaultPosition.z);
        }

        public static degRad(deg: number): number {
            return deg * Math.PI / 180;
        }

        private configureCamera(): void {
            this.camera = new THREE.PerspectiveCamera( 75, 800 / 600, 0.1, 1000 );
            this.camera.position.z = Visual.CameraDefaultPosition.z;
            this.camera.position.x = Visual.CameraDefaultPosition.x;
            this.camera.position.y = Visual.CameraDefaultPosition.y;
            this.scene.rotateX(Visual.degRad(Visual.CameraDefaultPosition.rotationX));
            this.scene.rotateY(Visual.degRad(Visual.CameraDefaultPosition.rotationY));
            this.scene.rotateZ(Visual.degRad(Visual.CameraDefaultPosition.rotationZ));
        }

        private configureLights(): void {
            let hemiLight = new THREE.HemisphereLight( COLOR_WHITE, COLOR_WHITE, 0.6 );
            hemiLight.color.setHSL( 0.6, 0.75, 0.5 );
            hemiLight.groundColor.setHSL( 0.095, 0.5, 0.5 );
            hemiLight.position.set( 0, 500, 0 );
            this.scene.add( hemiLight );

            let dirLight = new THREE.DirectionalLight( COLOR_WHITE, 1 );
            dirLight.position.set( 5, -5, 8 );
            dirLight.position.multiplyScalar( 50);
            dirLight.name = "dirlight";
            // dirLight.shadowCameraVisible = true;

            this.scene.add( dirLight );

            dirLight.castShadow = true;
            dirLight.shadowMapWidth = dirLight.shadowMapHeight = 1024 * 2;

            let d = 300;

            dirLight.shadowCameraLeft = -d;
            dirLight.shadowCameraRight = d;
            dirLight.shadowCameraTop = d;
            dirLight.shadowCameraBottom = -d;

            dirLight.shadowCameraFar = 3500;
            dirLight.shadowBias = -0.0001;
            // dirLight.shadowDarkness = 0.35;
        }

        private configureParentObject() {
            // this.parent3D = new THREE.Object3D();
            // this.scene.add(this.parent3D);
            // this.parent3D.position.x = 1;
            // this.parent3D.position.y = 1;
            // this.parent3D.position.z = 0;
            // this.parent3D.rotateZ(15);
        }

        private static parseSettings(dataView: DataView): VisualSettings {
            return VisualSettings.parse(dataView) as VisualSettings;
        }

        // private getColor(
        //     properties: DataViewObjectPropertyIdentifier,
        //     defaultColor: string,
        //     objects: DataViewObjects): string {

        //     const colorHelper: ColorHelper = new ColorHelper(
        //         this.colorPalette,
        //         properties,
        //         defaultColor);

        //     return colorHelper.getColorForMeasure(objects, "");
        // }

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
                    y: yCategoryIndex[<string>categoryY.values[valueIndex]],
                    color: this.colorPalette.getColor(valueIndex.toString()).value
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

        private create2DLabels(category: DataViewCategoryColumn, axis: Axis): void {
            let loader = new THREE.FontLoader();
            let labelsShift = category.values.length * BAR_SIZE;
            loader.load('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/fonts/helvetiker_regular.typeface.json', ( font ) => {
                category.values.forEach( (value: PrimitiveValue, index: number) => {
                    debugger;
                    let categoryLabel: THREE.TextGeometry = new THREE.TextGeometry( (value || "").toString(), {
                        font: new THREE.Font((<any>font).data),
                        height: 0.0001,
                        size: BAR_SIZE / 2.1,
                        bevelEnabled: false,
                        bevelSize: 1,
                        bevelThickness: 1
                    });
                    let material = new THREE.MeshLambertMaterial( {
                        color: "black"
                    });

                    let textMesh = new THREE.Mesh(categoryLabel, material);
                    if (axis === Axis.X) {
                        textMesh.position.x = labelsShift;
                        textMesh.position.y = index - (1 - BAR_SIZE) * 2;
                        textMesh.position.z = 0;
                    }
                    if (axis === Axis.Y) {
                        textMesh.position.y = labelsShift;
                        textMesh.position.x = index + (1 - BAR_SIZE) * 2;
                        textMesh.position.z = 0;

                        textMesh.rotation.z = Visual.degRad(90);
                    }
                    this.scene.add(textMesh);
                });
            });
        }

        /**
         * This function gets called for each of the objects defined in the capabilities files and allows you to select which of the
         * objects and properties you want to expose to the users in the property pane.
         *
         */
        public enumerateObjectInstances(options: EnumerateVisualObjectInstancesOptions): VisualObjectInstance[] | VisualObjectInstanceEnumerationObject {
            return VisualSettings.enumerateObjectInstances(this.settings || VisualSettings.getDefault(), options);
        }
    }
}