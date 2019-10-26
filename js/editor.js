/*
 * Editor for custom road definition
 */
var scene, camera, renderer;
var container, stats;
var step = 1; // generate point in step 1m for spiral curve, later apply to arc generation

init();
animate();

function init() {

	container = document.createElement('div');
	document.body.appendChild(container);

	scene = new THREE.Scene();

	/** Setting up camera */
	camera = new THREE.PerspectiveCamera(100, window.innerWidth / window.innerHeight, 0.05, 10000);
	camera.position.set(0, 0, 200);
	scene.add(camera);

	/** Setting up light */
	scene.add(new THREE.AmbientLight(0xf0f0f0));

	/** Settting up Plane with Grid Helper */
	var planeGeometry = new THREE.PlaneGeometry(10000, 10000);
	var planeMaterial = new THREE.ShadowMaterial();
	planeMaterial.opacity = 0.2;
	var plane = new THREE.Mesh(planeGeometry, planeMaterial);
	plane.receiveShadow = true;
	scene.add(plane);

	var helper = new THREE.GridHelper(1000, 100);
	helper.rotateX(- Math.PI / 2);
	helper.position.y = 0;
	helper.material.opacity = 0.25;
	helper.material.transparent = true;
	scene.add(helper);

	/** Settign up renderer */
	renderer = new THREE.WebGLRenderer( {antialias: true} );
	renderer.setClearColor(0xf0f0f0);
	renderer.setPixelRatio(window.devicePixelRatio);
	renderer.setSize(window.innerWidth, window.innerHeight);
	renderer.shadowMap.enabled = true;
	container.appendChild(renderer.domElement);

	/** Setting up controls */
	controls = new THREE.OrbitControls(camera, renderer.domElement);

	/** Setting up Stats */
	stats = new Stats();
	container.appendChild(stats.dom);

	/** Setting up window resize */
	window.addEventListener( 'resize', onWindowResize, false );
}

function animate() {
	requestAnimationFrame(animate);
	render();
	stats.update();
	controls.update();
}

function render() {
	renderer.render( scene, camera );
}

function onWindowResize() {
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize( window.innerWidth, window.innerHeight );
}

/*
 * Map class, sub class deal with paving roads, drawing UIs
 */
 var MapBuilder = {};

/*
 * A road only has one laneSection and one kind of geometry, due to the reason that
 * laneSegment is the minimum unit inside a map
 */
MapBuilder.DefaultRoad = function() {

	var defaultRoad = {

		geometry: [{
			s: 0,
			type: 'line',
			sx: 0,
			sy: 0,
			heading: 0,
			length: 10,
			spiral: {curvStart:0, curvEnd: 0.1},
			arc: {curvature: 0.1},
			offset: {a: 0, b: 0, c: 0, d: 0}
		}],
		elevation: [{
			s: 0,
			a: 0,
			b: 0,
			c: 0,
			d: 0,
		}],
		laneSection: [{
			s: 0,
			lane: [
				{
					id: 0,
					roadMark: {type: 'solid', weight: 'standard', color: 'yellow', width: 0.13}
				},
				{
					id: -1,
					width: {s: 0, a: 3.25, b: 0, c: 0, d: 0},
					roadMark: {type: 'broken', weight: 'standard', color: 'standard', width: 0.13}
				},
				{
					id: -2,
					width: {s: 0, a: 3.25, b: 0, c: 0, d: 0},
					roadMark: {type: 'broken', weight: 'standard', color: 'standard', width: 0.13}
				},
				{
					id: -3,
					width: {s: 0, a: 3.25, b: 0, c: 0, d: 0},
					roadMark: {type: 'solid', weight: 'standard', color: 'standard', width: 0.13}
				}
			]
		}],
		signals: [],
		objects: [],
	}

	return defaultRoad;
}

MapBuilder.Lane = function(data) {

	this.id = data.id;
	this.width = data.width;
	this.roadMark = data.roadMark;

	this.centralPoints = [];
	this.outerBorder = [];
	// this.leftBorder = [];	// left and right is in accordance with actual lane diection,
	// this.rightBorder = [];	// meaning right lanes direction the same as road geometry direction
}

MapBuilder.Lane.prototype.pave = function(roadMesh, elevation, innerGeometry) {
	// body...

	var color = 0xCFCFCF;

	if (this.id == 0) {
		// width and border is not allowed for center lane. center lane only needs to draw the mark
		this.drawRoadMark(this.id, roadMesh, elevation, innerGeometry);

		switch(innerGeometry.type) {
			case 'line':
				this.outerBorder = generateCubicPoints(0, innerGeometry.length, elevation, innerGeometry.sx, innerGeometry.sy, innerGeometry.heading, innerGeometry.offset);
				break;
			case 'spiral':
				this.outerBorder = generateSpiralPoints(innerGeometry.length, elevation, innerGeometry.sx, innerGeometry.sy, innerGeometry.heading, innerGeometry.spiral.curvStart, innerGeometry.spiral.curvEnd, innerGeometry.offset).points;
				break;
			case 'arc':
				this.outerBorder = generateArcPoints(innerGeometry.length, elevation, innerGeometry.sx, innerGeometry.sy, innerGeometry.heading, innerGeometry.arc.curvature, innerGeometry.offset).points;
				break;
		}
		
		return;
	}

	// return oGeometry as current lane's outer border and as next lane's inner border
	var oGeometry = JSON.parse(JSON.stringify(innerGeometry));
	if (!oGeometry.offset) oGeometry.offset = {};
	oGeometry.offset.a = innerGeometry.offset.a + Math.sign(this.id) * this.width.a;
	oGeometry.offset.b = innerGeometry.offset.b + Math.sign(this.id) * this.width.b;
	oGeometry.offset.c = innerGeometry.offset.c + Math.sign(this.id) * this.width.c;
	oGeometry.offset.d = innerGeometry.offset.d + Math.sign(this.id) * this.width.d;

	// since all seg starts with an offset 0 and remains the same throughout the seg, mid offset is calculated easily as below
	var midGeometry = JSON.parse(JSON.stringify(innerGeometry));
	if (!midGeometry.offset) midGeometry.offset = {};
	midGeometry.offset.a = (innerGeometry.offset.a + oGeometry.offset.a) * 0.5;
	midGeometry.offset.b = (innerGeometry.offset.b + oGeometry.offset.b) * 0.5;
	midGeometry.offset.c = (innerGeometry.offset.c + oGeometry.offset.c) * 0.5;
	midGeometry.offset.d = (innerGeometry.offset.d + oGeometry.offset.d) * 0.5;

	switch(innerGeometry.type) {

		case 'line':
			
			if (!(this.width.a == 0 && this.width.b == 0 && this.width.c == 0 && this.width.d == 0)) {
			
				// get inner border spline points
				iBorderPoints = generateCubicPoints(0, innerGeometry.length, elevation, innerGeometry.sx, innerGeometry.sy, innerGeometry.heading, innerGeometry.offset);
				// get outer border spline points
				oBorderPoints = generateCubicPoints(0, oGeometry.length, elevation, oGeometry.sx, oGeometry.sy, oGeometry.heading, oGeometry.offset);
				// get center of the lane
				centralPoints = generateCubicPoints(0, midGeometry.length, elevation, midGeometry.sx, midGeometry.sy, midGeometry.heading, midGeometry.offset);

				this.centralPoints = centralPoints;
				this.outerBorder = oBorderPoints;
				if (this.id < 0) {
					// this.leftBorder = iBorderPoints;
					// this.rightBorder = oBorderPoints;
					laneBase = createCustomFaceGeometry(iBorderPoints, oBorderPoints);
				} else if (this.id > 0) {
					// this.leftBorder = oBorderPoints;
					// this.rightBorder = iBorderPoints;
					laneBase = createCustomFaceGeometry(oBorderPoints, iBorderPoints);
				}

			}
			break;
		case 'spiral':
			
			// generate spline points
			if (!(this.width.a == 0 && this.width.b == 0 && this.width.c == 0 && this.width.d == 0)) {

				// get inner border spline points
				iBorderPoints = generateSpiralPoints(innerGeometry.length, elevation, innerGeometry.sx, innerGeometry.sy, innerGeometry.heading, innerGeometry.spiral.curvStart, innerGeometry.spiral.curvEnd, innerGeometry.offset).points;
				// get outer border spline points
				oBorderPoints = generateSpiralPoints(oGeometry.length, elevation, oGeometry.sx, oGeometry.sy, oGeometry.heading, oGeometry.spiral.curvStart, oGeometry.spiral.curvEnd, oGeometry.offset).points;
				// get center of the lane
				centralPoints = generateSpiralPoints(midGeometry.length, elevation, midGeometry.sx, midGeometry.sy, midGeometry.heading, midGeometry.spiral.curvStart, midGeometry.spiral.curvEnd, midGeometry.offset).points;
			
				this.centralPoints = centralPoints;
				this.outerBorder = oBorderPoints;
				if (this.id < 0) {
					laneBase = createCustomFaceGeometry(iBorderPoints, oBorderPoints);
				}
				if (this.id > 0) {
					laneBase = createCustomFaceGeometry(oBorderPoints, iBorderPoints);
				}
			}
			break;
		case 'arc':
			
			// generate spline points
			if (!(this.width.a == 0 && this.width.b == 0 && this.width.c == 0 && this.width.d == 0)) {

				// get inner border spline points
				iBorderPoints = generateArcPoints(innerGeometry.length, elevation, innerGeometry.sx, innerGeometry.sy, innerGeometry.heading, innerGeometry.arc.curvature, innerGeometry.offset).points;
				// get outer border spline points
				oBorderPoints = generateArcPoints(oGeometry.length, elevation, oGeometry.sx, oGeometry.sy, oGeometry.heading, oGeometry.arc.curvature, oGeometry.offset).points;
				// get center of the lane
				centralPoints = generateArcPoints(midGeometry.length, elevation, midGeometry.sx, midGeometry.sy, midGeometry.heading, midGeometry.arc.curvature, midGeometry.offset).points;
				
				this.centralPoints = centralPoints;
				this.outerBorder = oBorderPoints;
				if (this.id < 0) {
					laneBase = createCustomFaceGeometry(iBorderPoints, oBorderPoints);
				}
				if (this.id > 0) {
					laneBase = createCustomFaceGeometry(oBorderPoints, iBorderPoints);
				}
			}
			break;
	}

	var baseMesh = new THREE.Mesh(laneBase, new THREE.MeshBasicMaterial({color: color}));
	roadMesh.add(baseMesh);

	this.drawRoadMark(this.id, roadMesh, elevation, oGeometry);

	return oGeometry;

};

MapBuilder.Lane.prototype.drawRoadMark = function(laneId, roadMesh, elevation, outerGeometry) {
	// body...

	if (!this.roadMark) return;

	if (this.roadMark.type == 'none') return;

	// road mark color info
	var colorMaterial = {};
	colorMaterial.standard = new THREE.MeshBasicMaterial({color: 0xFFFFFF});
	colorMaterial.blue = new THREE.MeshBasicMaterial({color: 0x0000FF});
	colorMaterial.green = new THREE.MeshBasicMaterial({color: 0x00FF00});
	colorMaterial.red = new THREE.MeshBasicMaterial({color: 0xFF0000});
	colorMaterial.white = new THREE.MeshBasicMaterial({color: 0xFFFFFF});
	colorMaterial.yellow = new THREE.MeshBasicMaterial({color: 0xFFD700});

	var offsetA = outerGeometry.offset.a;
	var offsetB = outerGeometry.offset.b;
	var offsetC = outerGeometry.offset.c;
	var offsetD = outerGeometry.offset.d;

	var sOffset = 0;
	var width = this.roadMark.width;
	var length = outerGeometry.length;

	var lBorderPoints, rBorderPoints;
	var llBorderPoints, lrBorderPoints, rlBorderPoints, rrBorderPoints;
	var geometry, lgeometry, rgeometry, mesh;

	switch(outerGeometry.type) {

		case 'line':

			var lateralOffset;
			var sx = outerGeometry.sx;
			var sy = outerGeometry.sy;

			if (this.roadMark.type.split(' ').length == 1) {
				lateralOffset = {a: offsetA - width / 2, b: offsetB, c: offsetC, d: offsetD};
				rBorderPoints = generateCubicPoints(sOffset, length, elevation, sx, sy, outerGeometry.heading, lateralOffset);
				
				lateralOffset = {a: offsetA + width / 2, b: offsetB, c: offsetC, d: offsetD};
				lBorderPoints = generateCubicPoints(sOffset, length, elevation, sx, sy, outerGeometry.heading, lateralOffset);
			}
			
			if (this.roadMark.type.split(' ').length == 2) {
				lateralOffset = {a: offsetA - 0.75 * width - width / 2, b: offsetB, c: offsetC, d: offsetD};
				rrBorderPoints = generateCubicPoints(sOffset, length, elevation, sx, sy, outerGeometry.heading, lateralOffset);
				
				lateralOffset = {a: offsetA - 0.75 * width + width / 2, b: offsetB, c: offsetC, d: offsetD};
				rlBorderPoints = generateCubicPoints(sOffset, length, elevation, sx, sy, outerGeometry.heading, lateralOffset);

				lateralOffset = {a: offsetA + 0.75 * width - width / 2, b: offsetB, c: offsetC, d: offsetD};
				lrBorderPoints = generateCubicPoints(sOffset, length, elevation, sx, sy, outerGeometry.heading, lateralOffset);
				
				lateralOffset = {a: offsetA + 0.75 * width + width / 2, b: offsetB, c: offsetC, d: offsetD};
				llBorderPoints = generateCubicPoints(sOffset, length, elevation, sx, sy, outerGeometry.heading, lateralOffset);
			}
			break;
		case 'spiral':

			var lateralOffset;
			var sx = outerGeometry.sx;
			var sy = outerGeometry.sy;

			if (this.roadMark.type.split(' ').length == 1) {
				lateralOffset = {a: offsetA - width / 2, b: offsetB, c: offsetC, d: offsetD};
				rBorderPoints = generateSpiralPoints(outerGeometry.length, elevation, sx, sy, outerGeometry.heading, outerGeometry.spiral.curvStart, outerGeometry.spiral.curvEnd, lateralOffset).points;
				//drawCustomLine(rBorderPoints, 0xFF6666);

				lateralOffset = {a: offsetA + width / 2, b: offsetB, c: offsetC, d: offsetD};
				lBorderPoints = generateSpiralPoints(outerGeometry.length, elevation, sx, sy, outerGeometry.heading, outerGeometry.spiral.curvStart, outerGeometry.spiral.curvEnd, lateralOffset).points;
				//drawCustomLine(lBorderPoints, 0x6666FF);
			}

			if (this.roadMark.type.split(' ').length == 2) {
				lateralOffset = {a: offsetA - 0.75 * width - width / 2, b: offsetB, c: offsetC, d: offsetD};
				rrBorderPoints = generateSpiralPoints(outerGeometry.length, elevation, sx, sy, outerGeometry.heading, outerGeometry.spiral.curvStart, outerGeometry.spiral.curvEnd, lateralOffset).points;

				lateralOffset = {a: offsetA - 0.75 * width + width / 2, b: offsetB, c: offsetC, d: offsetD};
				rlBorderPoints = generateSpiralPoints(outerGeometry.length, elevation, sx, sy, outerGeometry.heading, outerGeometry.spiral.curvStart, outerGeometry.spiral.curvEnd, lateralOffset).points;

				lateralOffset = {a: offsetA + 0.75 * width - width / 2, b: offsetB, c: offsetC, d: offsetD};
				lrBorderPoints = generateSpiralPoints(outerGeometry.length, elevation, sx, sy, outerGeometry.heading, outerGeometry.spiral.curvStart, outerGeometry.spiral.curvEnd, lateralOffset).points;

				lateralOffset = {a: offsetA + 0.75 * width + width / 2, b: offsetB, c: offsetC, d: offsetD};
				llBorderPoints = generateSpiralPoints(outerGeometry.length, elevation, sx, sy, outerGeometry.heading, outerGeometry.spiral.curvStart, outerGeometry.spiral.curvEnd, lateralOffset).points;
			}
			break;
		case 'arc':

			var lateralOffset;
			var sx = outerGeometry.sx;
			var sy = outerGeometry.sy;

			if (this.roadMark.type.split(' ').length == 1) {
				lateralOffset = {a: offsetA - width / 2, b: offsetB, c: offsetC, d: offsetD};
				rBorderPoints = generateArcPoints(outerGeometry.length, elevation, sx, sy, outerGeometry.heading, outerGeometry.arc.curvature, lateralOffset).points;
				
				lateralOffset = {a: offsetA + width / 2, b: offsetB, c: offsetC, d: offsetD};
				lBorderPoints = generateArcPoints(outerGeometry.length, elevation, sx, sy, outerGeometry.heading, outerGeometry.arc.curvature, lateralOffset).points;
			}

			if (this.roadMark.type.split(' ').length == 2) {
				lateralOffset = {a: offsetA - 0.75 * width - width / 2, b: offsetB, c: offsetC, d: offsetD};
				rrBorderPoints = generateArcPoints(outerGeometry.length, elevation, sx, sy, outerGeometry.heading, outerGeometry.arc.curvature, lateralOffset).points;
				
				lateralOffset = {a: offsetA - 0.75 * width + width / 2, b: offsetB, c: offsetC, d: offsetD};
				rlBorderPoints = generateArcPoints(outerGeometry.length, elevation, sx, sy, outerGeometry.heading, outerGeometry.arc.curvature, lateralOffset).points;

				lateralOffset = {a: offsetA + 0.75 * width - width / 2, b: offsetB, c: offsetC, d: offsetD};
				lrBorderPoints = generateArcPoints(outerGeometry.length, elevation, sx, sy, outerGeometry.heading, outerGeometry.arc.curvature, lateralOffset).points;
				
				lateralOffset = {a: offsetA + 0.75 * width + width / 2, b: offsetB, c: offsetC, d: offsetD};
				llBorderPoints = generateArcPoints(outerGeometry.length, elevation, sx, sy, outerGeometry.heading, outerGeometry.arc.curvature, lateralOffset).points;
			}
			break;
	}

	if (this.roadMark.type == 'broken')
		geometry = createDiscontiniousMeshGeometry(lBorderPoints, rBorderPoints)
	if (this.roadMark.type == 'solid')
		geometry = createCustomFaceGeometry(lBorderPoints, rBorderPoints)
	if (this.roadMark.type == 'solid solid') {
		lgeometry = createCustomFaceGeometry(llBorderPoints, lrBorderPoints)
		rgeometry = createCustomFaceGeometry(rlBorderPoints, rrBorderPoints)
	}
	if (this.roadMark.type == 'broken broken') {
		lgeometry = createDiscontiniousMeshGeometry(llBorderPoints, lrBorderPoints)
		rgeometry = createDiscontiniousMeshGeometry(rlBorderPoints, rrBorderPoints)
	}
	if (this.roadMark.type == 'solid broken') {
		if (laneId > 0) {
			lgeometry = createDiscontiniousMeshGeometry(llBorderPoints, lrBorderPoints)
			rgeometry = createCustomFaceGeometry(rlBorderPoints, rrBorderPoints)
		} else {
			lgeometry = createCustomFaceGeometry(llBorderPoints, lrBorderPoints)
			rgeometry = createDiscontiniousMeshGeometry(rlBorderPoints, rrBorderPoints)
		}
	}
	if (this.roadMark.type == 'broken solid') {
		if (laneId > 0) {
			lgeometry = createCustomFaceGeometry(llBorderPoints, lrBorderPoints)
			rgeometry = createDiscontiniousMeshGeometry(rlBorderPoints, rrBorderPoints)
		} else {
			lgeometry = createDiscontiniousMeshGeometry(llBorderPoints, lrBorderPoints)
			rgeometry = createCustomFaceGeometry(rlBorderPoints, rrBorderPoints)
		}
	}

	if (geometry) {
		mesh = new THREE.Mesh(geometry, colorMaterial[this.roadMark.color]);
	}
	else {
		mesh = new THREE.Mesh();
		mesh.add(new THREE.Mesh(lgeometry, colorMaterial[this.roadMark.color]));
		mesh.add(new THREE.Mesh(rgeometry, colorMaterial[this.roadMark.color]));
	}

	mesh.position.set(0,0,0.002);
	mesh.updateMatrixWorld();

	roadMesh.add(mesh);
};

MapBuilder.Signal = function(data) {
	// body...
	this.id = data.id;
	this.s = data.s;
	this.t = data.t;
	this.dynamic = data.dynamic;
	this.orientation = data.orientation;
	this.code = data.code;

	this.point = undefined;
	if (this.dynamic == 'no') {
		this.text = '';
	}
};

MapBuilder.Signal.prototype.place = function(roadMesh, geometry, elevation) {
	// body...
	var mesh;
	var transform = track2Inertial(geometry, elevation, this.s, this.t, 0);
	var position = transform.position;
	var rotation = transform.rotation;

	this.point = transform.position;
	this.hdg = rotation.z;
	this.roll = rotation.x;
	this.pitch = rotation.y;

	// traffic signals' mesh use from outside, need to provide such an interface (signalType - signalMesh)
	// for now, use a simple self generated one
	if (this.dynamic == 'yes')
		mesh = generateDefaultSignalMesh();
	else
		mesh = generateDefaultSignMesh();
	mesh.position.set(position.x, position.y, position.z);	
	mesh.rotation.set(rotation.x, rotation.y, rotation.z + Math.PI / 2);

	if (this.orientation == '+') {
		mesh.rotateZ(Math.PI);
	}

	mesh.updateMatrixWorld();

	//drawSphereAtPoint(position, 0.08, 0xFF0000)
	//drawLineAtPoint(position, mesh.rotation.z - Math.PI / 2, 1, 0xFF0000)

	roadMesh.add(mesh);
};

MapBuilder.Object = function(data) {
	// Object along roads other than static and dynamic signals
	this.id = data.id;
	this.s = data.s;
	this.t = data.t;
	this.length = data.length;
	this.width = data.width;
	this.height = data.height;
	this.point = undefined;
	this.hdg = undefined;
	this.pitch = undefined;
	this.roll = undefined;

	this.type = data.type || 'default';
	this.material = {
		default: new THREE.MeshBasicMaterial( {color: 0xA020F0 } )	// purple
	}
}

MapBuilder.Object.prototype.place = function(roadMesh, geometry, elevation) {
	// body...
	var mesh;
	var transform = track2Inertial(geometry, elevation, this.s, this.t, 0);
	var position = transform.position;
	var rotation = transform.rotation;

	this.point = transform.position;
	this.hdg = rotation.z;
	this.roll = rotation.x;
	this.pitch = rotation.y;

	var boxGeometry = new THREE.BoxBufferGeometry( this.length, this.width, this.height );
	mesh = new THREE.Mesh(boxGeometry, this.material[this.type]);

	mesh.position.set(this.point.x, this.point.y, this.point.z + this.height / 2);
	mesh.rotation.set(this.roll, this.pitch, this.hdg);

	mesh.updateMatrixWorld();

	roadMesh.add(mesh);
};

MapBuilder.Road = function(parent, data) {

	this.geometryRaw = JSON.parse(JSON.stringify(data.geometry[0]));	// a single element of geometry
	this.elevationRaw = JSON.parse(JSON.stringify(data.elevation[0]));	// a single element of elevation
	this.laneRaw = JSON.parse(JSON.stringify(data.laneSection[0].lane));	// an array of lane
	this.lanes = [];	// array holding actual Lane class paved in this road
	this.signalRaw = JSON.parse(JSON.stringify(data.signals));	// an array of signals
	this.signals = [];	// array holding actual Signal class placed in this road
	this.objectRaw = JSON.parse(JSON.stringify(data.objects || []));
	this.objects = [];

	this.roadMesh = new THREE.Mesh();

	this.parent = parent;

	this.sz = data.sz || 0;

	this.ex = 0;
	this.ey = 0;
	this.ez = 0;
	this.endHeading = 0;

	// record each lane's central points and their borders' point
}

MapBuilder.Road.prototype.build = function() {
	// body...
	this.parent.add(this.roadMesh);
	// put signals before lanes due to generateSpiral error when subOffset is the whole length
	this.generateAllLanes();
	this.placeAllSignals();
	this.placeAllObjects();
};

MapBuilder.Road.prototype.unbuild = function() {
	// body...
	this.parent.remove(this.roadMesh);
	this.roadMesh.dispose();

};

MapBuilder.Road.prototype.generateAllLanes = function() {
	// body...

	function compareLane(laneA, laneB) {
		// a < b by some ordering criterion
		if (Math.abs(laneA.id) < Math.abs(laneB.id)) {
			return -1;
		}
		// a > b by some ordering criterion
		if (Math.abs(laneA.id) > Math.abs(laneB.id)) {
			return 1;
		}
		// a == b
		return 0;
	}

	var centralLane, leftLanes = [], rightLanes = [];

	for (var i = 0; i < this.laneRaw.length; i++) {
		var lane = this.laneRaw[i];
		if (lane.id > 0) 
			leftLanes.push(lane);
		else if (lane.id < 0)
			rightLanes.push(lane);
		else
			centralLane = lane;
	}

	// sort leftLanes and rightLanes in ascending order by Math.abs(lane.id)
	leftLanes.sort(compareLane);
	rightLanes.sort(compareLane);

	// Assume there is only one width offset in one lane segment
	var currentLane = [0];
	var innerGeometries = [this.geometryRaw];

	// left Lanes
	while (innerGeometries.length) {

		var laneId = currentLane.pop();
		var innerGeometry = innerGeometries.pop();

		for (var j = laneId; j < leftLanes.length; j++) {
			
			if (j != laneId) {
				innerGeometry = innerGeometries.pop();
				currentLane.pop();
			}

			try {
				var oGeometry = this.generateLane(innerGeometry, leftLanes[j]);
				if (j != leftLanes.length - 1) {
					innerGeometries.push(oGeometry);
					currentLane.push(j + 1);
				}
			} catch(e) {
				console.info('paving error: road# ? '+ ' lane#' + leftLanes[j].id);
				console.error(e.stack)
			}
		}
	}

	innerGeometries = [this.geometryRaw];
	currentLane = [0];

	while (innerGeometries.length) {

		var laneId = currentLane.pop();
		var innerGeometry = innerGeometries.pop();

		for (var j = laneId; j < rightLanes.length; j++) {
			
			if (j != laneId) {
				innerGeometry = innerGeometries.pop();
				currentLane.pop();
			}

			try {
				var oGeometry = this.generateLane(innerGeometry, rightLanes[j]);
				if (j != rightLanes.length - 1) {
					innerGeometries.push(oGeometry);
					currentLane.push(j + 1);
				}
			} catch(e) {
				console.info('paving error: road# ? ' + ' lane#' + rightLanes[j].id);
				console.error(e.stack)
			}
		}
	}

	// central lanes - draw on top of right/left lanes to be seen
	try {
		this.generateLane(this.geometryRaw, centralLane);
	} catch(e) {
		console.info('paving error: road# ? ' + ' lane#' + centralLane.id);
		console.error(e.stack)
	}

};

MapBuilder.Road.prototype.generateLane = function(innerGeometry, laneData) {
	// body...
	// console.log(laneData.id);

	var lane = new MapBuilder.Lane(laneData);
	
	var oGeometry = lane.pave(this.roadMesh, this.elevationRaw, innerGeometry);
	// new Lane in here

	// synthesize lanes under the road after paving the lanes
	this.lanes.push(lane);

	// return the outer geometry of this lane
	return oGeometry;
};

MapBuilder.Road.prototype.calculateEnd = function() {
	// body...

	// get points of reference line, use the points at the end to calculate endPosition and endHdg
	var geometry = this.geometryRaw;
	var elevation = this.elevationRaw;

	this.ez = cubicPolynomial(geometry.length, elevation.a, elevation.b, elevation.c, elevation.d);

	switch(geometry.type) {

		case 'line':
			this.endHeading = geometry.heading;
			this.ex = geometry.sx + geometry.length * Math.cos(geometry.heading);
			this.ey = geometry.sy + geometry.length * Math.sin(geometry.heading);
			break;
		case 'spiral':
			var centralSample = generateSpiralPoints(geometry.length, elevation, geometry.sx, geometry.sy, geometry.heading, geometry.spiral.curvStart, geometry.spiral.curvEnd, null);
			this.ex = centralSample.points[centralSample.points.length - 1].x;
			this.ey = centralSample.points[centralSample.points.length - 1].y;
			this.endHeading = centralSample.heading[centralSample.heading.length - 1];
			break;
		case 'arc':
			var curvature = geometry.arc.curvature;
			var radius = 1 / Math.abs(curvature);
			var theta = geometry.length * curvature;
			var rotation = geometry.heading - Math.sign(curvature) * Math.PI / 2;
			this.ex = geometry.sx - radius * Math.cos(rotation) + radius * Math.cos(rotation + theta);
			this.ey = geometry.sy - radius * Math.sin(rotation) + radius * Math.sin(rotation + theta);
			this.endHeading = geometry.heading + theta;
			break;
	}
};

MapBuilder.Road.prototype.placeAllSignals = function() {
	// body...
	for (var i = 0; i < this.signalRaw.length; i++) {
		var signal = this.signalRaw[i];
		this.placeSignal(signal);
	}
};

MapBuilder.Road.prototype.placeSignal = function(signalData) {
	// body...
	var signal = new MapBuilder.Signal(signalData);
	signal.place(this.roadMesh, this.geometryRaw, this.elevationRaw);
	
	this.signals.push(signal);
};

MapBuilder.Road.prototype.placeAllObjects = function() {
	// body...
	for (var i = 0; i < this.objectRaw.length; i++) {
		var object = this.objectRaw[i];
		this.placeObject(object);
	}
};

MapBuilder.Road.prototype.placeObject = function(objectData) {
	// body...
	var object = new MapBuilder.Object(objectData);
	object.place(this.roadMesh, this.geometryRaw, this.elevationRaw);

	this.objects.push(object);
};

MapBuilder.Road.prototype.refresh = function(newData) {
	// body...

	this.geometryRaw = JSON.parse(JSON.stringify(newData.geometry[0]));
	this.elevationRaw = JSON.parse(JSON.stringify(newData.elevation[0]));
	this.laneRaw = JSON.parse(JSON.stringify(newData.laneSection[0].lane));

	this.refreshMesh();
};

MapBuilder.Road.prototype.refreshMesh = function() {
	// body...

	// must remove from scene first, render error if only dispose the children leaving the roadMesh around for future
	this.parent.remove(this.roadMesh);
	this.roadMesh.dispose();

	this.roadMesh = new THREE.Mesh();
	this.parent.add(this.roadMesh);

	this.generateAllLanes();
	this.placeAllSignals();
	this.placeAllObjects();
};

/*
 * Map is a collection of Roads, also containing formats to be written to the map standard json 
 */
MapBuilder.Map = function() {

	this.constructionX = 0;
	this.constructionY = 0;
	this.constructionZ = 0;
	this.currentHeading = 0;
	this.roads = [];
	this.mesh = new THREE.Mesh();
	this.json = {};
}

MapBuilder.Map.prototype.build = function() {
	// body...
	scene.add(this.mesh);
};

MapBuilder.Map.prototype.buildRoad = function(roadData) {
	// body...
	roadData.geometry[0].sx = this.constructionX;
	roadData.geometry[0].sy = this.constructionY;
	roadData.sz = this.constructionZ;
	roadData.elevation[0].a = roadData.sz;
	roadData.geometry[0].heading = this.currentHeading;

	var road = new MapBuilder.Road(this.mesh, roadData);
	// road.build(this.mesh);
	road.build();

	this.roads.push(road);

	road.calculateEnd();
	this.constructionX = road.ex;
	this.constructionY = road.ey;
	this.constructionZ = road.ez;
	this.currentHeading = road.endHeading;
};

MapBuilder.Map.prototype.undo = function() {
	// body...
	if (this.roads.length) {
		var road = this.roads.pop();
		this.constructionX = road.geometryRaw.sx;
		this.constructionY = road.geometryRaw.sy;
		this.constructionZ = road.sz;	// in doubt, since elevationRaw.a is exposed to user editing and should be only associated to previous elevation
		this.currentHeading = road.geometryRaw.heading;
		road.unbuild(this.mesh);
	}
};

MapBuilder.Map.prototype.refreshCurrentRoad = function(roadData) {
	// body...
	this.undo();
	this.buildRoad(roadData);
};

MapBuilder.Map.prototype.clear = function() {
	// body...
	while (this.roads.length) {
		this.undo();
	}
};

/*
 * Potential Bug: deal with central lane when it comes to "lanes", but keep it when "vertical_lane_marking"
 */
MapBuilder.Map.prototype.exportJSON = function() {
	// body...

	// tidy up roads containing lane info to standard format as defined
	this.json.lanes = [];
	this.json.roads = [];
	this.json.lane_vertical_markings = [];
	this.json.traffic_signs = [];
	this.json.traffic_lights = [];
	this.json.objects = [];

	this.rawJSON = [];	// json recording raw geometry and raw lanesection etc. to generate xml opendrive

	var roadID = 0, laneID = 0, verticalLaneMarkID = 0, trafficSignID = 0, trafficLightID = 0, objectID = 0;

	for (var i = 0; i < this.roads.length; i++) {
		
		this.json.roads[i] = {};
		this.json.roads[i].id = roadID
		this.json.roads[i].lanes = [];

		this.rawJSON[i] = {};

		var road = this.roads[i];

		for (var j = 0; j < road.lanes.length; j++) {

			var lane = road.lanes[j];
			var roadMark = lane.roadMark;

			if (lane.id != 0) {
				// done with roads, with both roadID and containing laneIDs
				this.json.roads[i].lanes.push(laneID);

				// "lanes"
				this.json.lanes[laneID] = {};
				this.json.lanes[laneID].id = laneID;
				this.json.lanes[laneID].points = [];
				// populate this.json.lanes[laneID].points in lane's near-far direction, inverse points of left lanes due to their opposite direction of central refrence line
				if (lane.id > 0) {
					// left lanes, reverse points
					reversePoints(lane.centralPoints);
				}
				// populate lane central ponits if it is not a central lane
				for (var k = 0; k < lane.centralPoints.length; k++) {
					var point = lane.centralPoints[k];
					var lla = towgs84(point);
					this.json.lanes[laneID].points.push(lla.lon);
					this.json.lanes[laneID].points.push(lla.lat);
					this.json.lanes[laneID].points.push(lla.z);
				}

				laneID += 1;
			}

			// "lane_vertical_markings"
			this.json.lane_vertical_markings[verticalLaneMarkID] = {};
			this.json.lane_vertical_markings[verticalLaneMarkID].id = verticalLaneMarkID;
			if (roadMark.color == 'yellow')
				this.json.lane_vertical_markings[verticalLaneMarkID].color = 1;	// 1 for yellow
			else
				this.json.lane_vertical_markings[verticalLaneMarkID].color = 0; // 0 for white
			if (roadMark.type == 'broken')
				this.json.lane_vertical_markings[verticalLaneMarkID].type = 0;	
			if (roadMark.type == 'solid')
				this.json.lane_vertical_markings[verticalLaneMarkID].type = 2;
			if (roadMark.type == 'solid solid') {
				this.json.lane_vertical_markings[verticalLaneMarkID].type = 3;
			}
			if (roadMark.type == 'broken broken') {
				this.json.lane_vertical_markings[verticalLaneMarkID].type = 1;
			}
			if (roadMark.type == 'solid broken') {
				this.json.lane_vertical_markings[verticalLaneMarkID].type = 5;
			}
			if (roadMark.type == 'broken solid') {
				this.json.lane_vertical_markings[verticalLaneMarkID].type = 4;
			}
			this.json.lane_vertical_markings[verticalLaneMarkID].points = [];
			for (var k = 0; k < lane.outerBorder.length; k++) {
				var point = lane.outerBorder[k];

				var lla = towgs84(point);
				this.json.lane_vertical_markings[verticalLaneMarkID].points.push(lla.lon);
				this.json.lane_vertical_markings[verticalLaneMarkID].points.push(lla.lat);
				this.json.lane_vertical_markings[verticalLaneMarkID].points.push(lla.z);
			}

			verticalLaneMarkID += 1;
		}

		for (var j = 0; j < road.signals.length; j++) {

			var signal = road.signals[j];

			if (signal.dynamic == 'yes') {

				this.json.traffic_lights[trafficLightID] = {};
				this.json.traffic_lights[trafficLightID].id = trafficLightID;
				this.json.traffic_lights[trafficLightID].road_segment_id = roadID;
				this.json.traffic_lights[trafficLightID].code = signal.code;
				this.json.traffic_lights[trafficLightID].hdg = signal.hdg;
				this.json.traffic_lights[trafficLightID].roll = signal.roll;
				this.json.traffic_lights[trafficLightID].pitch = signal.pitch;
				this.json.traffic_lights[trafficLightID].point = [];
				var lla = towgs84(signal.point);
				this.json.traffic_lights[trafficLightID].point.push(lla.lon);
				this.json.traffic_lights[trafficLightID].point.push(lla.lat);
				this.json.traffic_lights[trafficLightID].point.push(lla.z);

				trafficLightID += 1;
			} else {

				this.json.traffic_signs[trafficSignID] = {};
				this.json.traffic_signs[trafficSignID].id = trafficLightID;
				this.json.traffic_signs[trafficSignID].road_segment_id = roadID;
				this.json.traffic_signs[trafficSignID].code = signal.code;
				this.json.traffic_signs[trafficSignID].hdg = signal.hdg;
				this.json.traffic_signs[trafficSignID].roll = signal.roll;
				this.json.traffic_signs[trafficSignID].pitch = signal.pitch;
				this.json.traffic_signs[trafficSignID].text = signal.text;
				this.json.traffic_signs[trafficSignID].point = [];
				var lla = towgs84(signal.point);
				this.json.traffic_signs[trafficSignID].point.push(lla.lon);
				this.json.traffic_signs[trafficSignID].point.push(lla.lat);
				this.json.traffic_signs[trafficSignID].point.push(lla.z);

				trafficSignID += 1;
			}	
		}

		for (var j = 0; j < road.objects.length; j++) {
			
			var object = road.objects[j];

			this.json.objects[objectID] = {};
			this.json.objects[objectID].id = objectID;
			this.json.objects[objectID].road_segment_id = roadID;
			this.json.objects[objectID].type = object.type;
			this.json.objects[objectID].hdg = object.hdg;
			this.json.objects[objectID].roll = object.roll;
			this.json.objects[objectID].pitch = object.pitch;
			this.json.objects[objectID].length = object.length;
			this.json.objects[objectID].width = object.width;
			this.json.objects[objectID].height = object.height;
			this.json.objects[objectID].point = [];
			var lla = towgs84(object.point);
			this.json.objects[objectID].point.push(lla.lon);
			this.json.objects[objectID].point.push(lla.lat);
			this.json.objects[objectID].point.push(lla.z);
		}

		this.rawJSON[i].id = roadID;
		this.rawJSON[i].length = road.geometryRaw.length;
		this.rawJSON[i].geometries = [];
		this.rawJSON[i].geometries.push(road.geometryRaw);
		this.rawJSON[i].elevations = [];
		this.rawJSON[i].elevations.push(road.elevationRaw);
		this.rawJSON[i].laneSections = [];
		this.rawJSON[i].laneSections.push(road.laneRaw);
		this.rawJSON[i].signals = road.signalRaw;
		this.rawJSON[i].objects = road.objectRaw;

		roadID += 1;
	}

	saveFile(this.json, 'map.json');
	saveFile(this.rawJSON, 'map_raw.json');
};

MapBuilder.UI = function(map) {

	this.map = map;
	this.map.build();
	this.defaultRoad = new MapBuilder.DefaultRoad();

	this.gui = new dat.GUI({width: 300});

	this.exportFolder = this.gui.addFolder('Map Exporter');
	this.exportMenu = {
		saveAsJSON: (function() { this.map.exportJSON(); }.bind(this) )
	}
	this.exportFolder.add(this.exportMenu, 'saveAsJSON');

	this.editorFolder = this.gui.addFolder('Map Editor');

	// by default one segment of road is first built for start
	// this.map.buildRoad(this.defaultRoad);
	this.popEditions();
}

MapBuilder.UI.prototype.popEditions = function() {
	// body...
	this.roadDetailFolder = this.editorFolder.addFolder('Detail');
	this.roadDetailFolder.open();

	this.startFolder = this.roadDetailFolder.addFolder('Start');
	this.startUI = {
		startX: 0,
	}
	this.startFolder.add(this.startUI, 'startX').onChange(function(value) {
		this.map.constructionX = value;
		this.map.refreshCurrentRoad(this.defaultRoad);
	}.bind(this));

	this.geometryFolder = this.roadDetailFolder.addFolder('Geometry');
	this.geometryFolder.open();
	this.fillGeometryFolder(this.defaultRoad.geometry, this.geometryFolder);

	// elevation is simplified to only a slope percentage(the value of elevation.b): how many meters elevated per 100 meters in track s
	// may also need to specify elevation.a if it is a downward road without going under sealevel
	this.slopeFolder = this.roadDetailFolder.addFolder('Slope');
	this.slopeFolder.open();
	this.fillSlopeFolder(this.defaultRoad.elevation, this.slopeFolder);

	this.laneSectionFolder = this.roadDetailFolder.addFolder('Lanes');
	this.laneSectionFolder.open();
	this.fillLaneSectionFolder(this.defaultRoad.laneSection, this.laneSectionFolder);

	this.laneOperationUI = {
		addLeftLane: (function() { this.addLeftLane(); }.bind(this)),
		addRightLane: (function() { this.addRightLane(); }.bind(this)),
		removeLeftLane: (function() { this.removeLeftLane(); }.bind(this)),
		removeRightLane: (function() { this.removeRightLane(); }.bind(this)),
	}
	this.laneSectionFolder.add(this.laneOperationUI, 'addLeftLane');
	this.laneSectionFolder.add(this.laneOperationUI, 'addRightLane');
	this.laneSectionFolder.add(this.laneOperationUI, 'removeLeftLane');
	this.laneSectionFolder.add(this.laneOperationUI, 'removeRightLane');

	this.signalFolder = this.roadDetailFolder.addFolder('Signals');
	this.signalFolder.open();
	this.fillSignalFolder(this.defaultRoad.signals, this.signalFolder);
	
	this.signalOperationUI = {
		addNewSignal: (function() { this.addNewSignal(); }.bind(this)),
		removeSignal: (function() { this.removeSignal(); }.bind(this)),
	}
	this.signalFolder.add(this.signalOperationUI, 'addNewSignal');
	this.signalFolder.add(this.signalOperationUI, 'removeSignal');

	this.objectFolder = this.roadDetailFolder.addFolder('Objects');
	this.objectFolder.open();
	this.fillObjectFolder(this.defaultRoad.objects, this.objectFolder);

	this.objectOperationUI = {
		addNewObject: (function() { this.addNewObject(); }.bind(this)),
		removeObject: (function() { this.removeObject(); }.bind(this)),
	}
	this.objectFolder.add(this.objectOperationUI, 'addNewObject');
	this.objectFolder.add(this.objectOperationUI, 'removeObject');

	// this.editorMenu is initially defined in this.UI
	this.editorMenu = {
		addNewRoad: (function() { this.defaultRoad.signals.splice(0); this.map.buildRoad(this.defaultRoad); this.refreshDefaultData(); }.bind(this) ),
		undo: (function() { this.map.undo(); this.refreshDefaultData(); }.bind(this))
	}

	this.newRoadButton = this.editorFolder.add(this.editorMenu, 'addNewRoad');
	this.undoButton = this.editorFolder.add(this.editorMenu, 'undo');
};

MapBuilder.UI.prototype.closeEditions = function() {
	// body...
	this.editorFolder.removeFolder('Detail');
	this.editorFolder.remove(this.newRoadButton);
	this.editorFolder.remove(this.undoButton);
};

MapBuilder.UI.prototype.popGeometry2Folder = function(geometry, folder) {
	// body...
	this.geometryUI = {
		type: geometry.type,
		length: geometry.length,
		offset: {a: geometry.offset.a, b: geometry.offset.b, c: geometry.offset.c, d: geometry.offset.d},
	}

	if (geometry.type == 'spiral') {
		this.geometryUI.curvStart = geometry.spiral.curvStart;
		this.geometryUI.curvEnd = geometry.spiral.curvEnd;
	}
	if (geometry.type == 'arc') {
		this.geometryUI.curvature = geometry.arc.curvature;
	}

	folder.add(this.geometryUI, 'type', ['line', 'spiral', 'arc']).onChange( function(value) {
		geometry.type = value;
		this.closeEditions();
		this.popEditions();
		this.map.refreshCurrentRoad(this.defaultRoad);
	}.bind(this));

	folder.add(this.geometryUI, 'length').onChange(function(value) {
		geometry.length = value;
		this.map.refreshCurrentRoad(this.defaultRoad);
	}.bind(this));

	if (geometry.type == 'spiral') {
		folder.add(this.geometryUI, 'curvStart').onChange(function(value) {
			geometry.spiral.curvStart = value;
			this.map.refreshCurrentRoad(this.defaultRoad);
		}.bind(this));
		folder.add(this.geometryUI, 'curvEnd').onChange(function(value) {
			geometry.spiral.curvEnd = value;
			this.map.refreshCurrentRoad(this.defaultRoad);
		}.bind(this));
	}

	if (geometry.type == 'arc') {
		folder.add(this.geometryUI, 'curvature').onChange(function(value) {
			geometry.arc.curvature = value;
			this.map.refreshCurrentRoad(this.defaultRoad);
		}.bind(this));
	}

	var offsetFolder = folder.addFolder('Lane Offset');
	offsetFolder.add(this.geometryUI.offset, 'a').onChange(function(value) {
		geometry.offset.a = value;
		this.map.refreshCurrentRoad(this.defaultRoad);
	}.bind(this));
	offsetFolder.add(this.geometryUI.offset, 'b').onChange(function(value) {
		geometry.offset.b = value;
		this.map.refreshCurrentRoad(this.defaultRoad);
	}.bind(this));
	offsetFolder.add(this.geometryUI.offset, 'c').onChange(function(value) {
		geometry.offset.c = value;
		this.map.refreshCurrentRoad(this.defaultRoad);
	}.bind(this));
	offsetFolder.add(this.geometryUI.offset, 'd').onChange(function(value) {
		geinetrt.offset.d = value;
		this.map.refreshCurrentRoad(this.defaultRoad);
	}.bind(this));
	
};

MapBuilder.UI.prototype.fillGeometryFolder = function(geometries, geometryFolder) {
	// body...
	if (geometries.length == 1) {
		this.popGeometry2Folder(geometries[0], geometryFolder);
	} else {
		for (var i = 0; i < geometries.length; i++) {
			this.popGeometry2Folder(geometries[i], geometryFolder.addFolder('Geometry ' + (i + 1)));
		}
	}
};

MapBuilder.UI.prototype.popElevation2Folder = function(elevation, slopeFolder) {
	// body...
	this.slopeUI = {
		// by default, only elevation's slope and its initial elevation are exposed to user definition, 
		// thus the angle of slope is between (-Math.PI/2, Math.PI/2), b is tan(angle) which belongs to
		// [-Infinity, +Infinity]
		initialHeight: elevation.a,
		slope: elevation.b,
	}

	slopeFolder.add(this.slopeUI, 'initialHeight').onChange(function(value) {
		elevation.a = value;
		console.log('new initial elevation is ' + value);
		this.map.refreshCurrentRoad(this.defaultRoad);
	}.bind(this));
	slopeFolder.add(this.slopeUI, 'slope').onChange(function(value) {
		elevation.b = value;
		console.log('new slope is ' + value);
		this.map.refreshCurrentRoad(this.defaultRoad);
	}.bind(this));
};

MapBuilder.UI.prototype.fillSlopeFolder = function(elevations, slopeFolder) {
	// body...
	if (elevations.length == 1) {
		this.popElevation2Folder(elevations[0], slopeFolder);
	} else {
		for (var i = 0; i < elevations.length; i++) {
			this.popElevation2Folder(elevations[i], slopeFolder.addFolder('Slope ' + (i + 1)));
		}
	}
};

MapBuilder.UI.prototype.popLaneSectoin2Folder = function(laneSection, folder) {
	// body...
	laneSection.lane.sort(function(laneA, laneB) { if (laneA.id > laneB.id) return - 1; if (laneA.id < laneB.id) return 1; if (laneA.id == laneB.id) return 0} );
	
	for (var i = 0; i < laneSection.lane.length; i++) {

		var lane = laneSection.lane[i];

		var laneFolder = folder.addFolder('Lane ' + lane.id);

		if (lane.width) {
			var widthFolder = laneFolder.addFolder('Width');
			this.fillWidthFolder(lane.width, widthFolder);
		}

		if (lane.roadMark) {
			var roadMarkFolder = laneFolder.addFolder('Roadmark');
			this.fillRoadMarkFolder(lane.roadMark, roadMarkFolder);
		}
	}
};

MapBuilder.UI.prototype.fillLaneSectionFolder = function(laneSections, laneSectionFolder) {
	// body...
	if (laneSections.length == 1) {
		this.popLaneSectoin2Folder(laneSections[0], laneSectionFolder);
	} else {
		for (var i = 0; i < laneSections.length; i++) {
			this.popLaneSectoin2Folder(laneSections[i], laneSectionFolder.addFolder('Section ' + (i + 1)));
		}
	}
};

MapBuilder.UI.prototype.popWidth2Folder = function(width, folder) {
	// body...
	this.widthUI = {
		a: width.a,
		b: width.b,
		c: width.c,
		d: width.d,
	}

	folder.add(this.widthUI, 'a').onChange(function(value) {
		width.a = value;
		this.map.refreshCurrentRoad(this.defaultRoad);
	}.bind(this));
	folder.add(this.widthUI, 'b').onChange(function(value) {
		width.b = value;
		this.map.refreshCurrentRoad(this.defaultRoad);
	}.bind(this));
	folder.add(this.widthUI, 'c').onChange(function(value) {
		width.c = value;
		this.map.refreshCurrentRoad(this.defaultRoad);
	}.bind(this));
	folder.add(this.widthUI, 'd').onChange(function(value) {
		width.d = value;
		this.map.refreshCurrentRoad(this.defaultRoad);
	}.bind(this));
};

MapBuilder.UI.prototype.fillWidthFolder = function(width, widthFolder) {
	// body...
	this.popWidth2Folder(width, widthFolder);
};

MapBuilder.UI.prototype.popRoadMark2Folder = function(roadMark, folder) {
	// body...
	this.roadMarkUI = {
		// sOffset: roadMark.sOffset,
		type: roadMark.type,
		weight: roadMark.weight,
		color: roadMark.color,
		width: roadMark.width,
		material: roadMark.material,
		laneChange: roadMark.laneChange,
		height: roadMark.height,
	}
	folder.add(this.roadMarkUI, 'type', ['none', 'broken', 'solid', 'solid solid', 'broken broken', 'solid broken', 'broken solid']).onChange(function(value) {
		roadMark.type = value;
		this.map.refreshCurrentRoad(this.defaultRoad);
	}.bind(this));
	folder.add(this.roadMarkUI, 'color', ['standard', 'white', 'yellow']).onChange(function(value) {
		roadMark.color = value;
		this.map.refreshCurrentRoad(this.defaultRoad);
	}.bind(this));
	folder.add(this.roadMarkUI, 'width').onChange(function(value) {
		roadMark.width = value; 
		this.map.refreshCurrentRoad(this.defaultRoad);
	}.bind(this));
};

MapBuilder.UI.prototype.fillRoadMarkFolder = function(roadMark, roadMarkFolder) {
	// body...
	this.popRoadMark2Folder(roadMark, roadMarkFolder);
};

MapBuilder.UI.prototype.popSignal2Folder = function(signal, folder) {
	// body...
	this.signalUI = {
		name: signal.name,
		s: signal.s,
		t: signal.t,
		dynamic: signal.dynamic,
		orientation: signal.orientation,
		code: signal.code,
	}

	folder.add(this.signalUI, 's', 0, this.defaultRoad.geometry[0].length).onChange(function(value) {
		signal.s = value;
		this.map.refreshCurrentRoad(this.defaultRoad);
	}.bind(this));
	folder.add(this.signalUI, 't').onChange(function(value) {
		signal.t = value;
		this.map.refreshCurrentRoad(this.defaultRoad);
	}.bind(this));
	folder.add(this.signalUI, 'dynamic', ['yes', 'no']).onChange(function(value) {
		signal.dynamic = value;
		if (value == 'yes') signal.code = 302001; // default dynamic signal - vertical lights
		else signal.code = 202037;	// default static sign - speed limit
		this.map.refreshCurrentRoad(this.defaultRoad);
		this.closeEditions();
		this.popEditions();
	}.bind(this));
	folder.add(this.signalUI, 'orientation', ['+', '-']).onChange(function(value) {
		signal.orientation = value;
		this.map.refreshCurrentRoad(this.defaultRoad);
	}.bind(this));
	folder.add(this.signalUI, 'code').onChange(function(value) {
		signal.code = value;
		this.map.refreshCurrentRoad(this.defaultRoad);
	}.bind(this));

	if (signal.dynamic == 'no') {
		this.signalUI.text = '';
		folder.add(this.signalUI, 'text').onChange(function(value) {
			signal.text = value;
		}.bind(this));
	}
};

MapBuilder.UI.prototype.fillSignalFolder = function(signals, signalFolder) {
	// body...
	for (var i = 0; i < signals.length; i++) {
		this.popSignal2Folder(signals[i], signalFolder.addFolder('Signal ' + (i + 1)));
	}
};

MapBuilder.UI.prototype.addNewSignal = function() {
	// body...
	var newSignalRaw;

	if (this.defaultRoad.signals.length > 0) {
		// if already has signals in store, use the last one as template for the new one
		newSignalRaw = JSON.parse(JSON.stringify(this.defaultRoad.signals[this.defaultRoad.signals.length - 1]));
		newSignalRaw.id += 1;
	} else {
		// if no signals in default road, create a default new signal
		newSignalRaw = {
			id: 0,
			s: 0,
			t: 0,
			dynamic: 'yes',
			orientation: '-',
			type: '',
			code: 302001,
			text: '',
		}
	}
	this.defaultRoad.signals.push(newSignalRaw);
	this.map.refreshCurrentRoad(this.defaultRoad);
	this.closeEditions();
	this.popEditions();
};

MapBuilder.UI.prototype.removeSignal = function() {
	// body...
	if (this.defaultRoad.signals.length > 0) {
		this.defaultRoad.signals.splice(this.defaultRoad.signals.length - 1);
	}
	this.map.refreshCurrentRoad(this.defaultRoad);
	this.closeEditions();
	this.popEditions();
};

MapBuilder.UI.prototype.popObject2Folder = function(object, folder) {
	// body...
	this.objectUI = {
		s: object.s,
		t: object.t,
		length: object.length,
		width: object.width,
		height: object.height,
	}

	folder.add(this.objectUI, 's', 0, this.defaultRoad.geometry[0].length).onChange(function(value) {
		object.s = value;
		this.map.refreshCurrentRoad(this.defaultRoad);
	}.bind(this));
	folder.add(this.objectUI, 't').onChange(function(value) {
		object.t = value;
		this.map.refreshCurrentRoad(this.defaultRoad);
	}.bind(this));
	folder.add(this.objectUI, 'length').onChange(function(value) {
		object.length = value;
		this.map.refreshCurrentRoad(this.defaultRoad);
	}.bind(this));
	folder.add(this.objectUI, 'width').onChange(function(value) {
		object.width = value;
		this.map.refreshCurrentRoad(this.defaultRoad);
	}.bind(this));
	folder.add(this.objectUI, 'height').onChange(function(value) {
		object.height = value;
		this.map.refreshCurrentRoad(this.defaultRoad);
	}.bind(this));
};

MapBuilder.UI.prototype.fillObjectFolder = function(objects, objectFolder) {
	// body...
	for (var i = 0; i < objects.length; i++) {
		this.popObject2Folder(objects[i], objectFolder.addFolder('Object ' + (i + 1)));
	}
};

MapBuilder.UI.prototype.addNewObject = function() {
	// body...
	var newObjectRaw;

	if (this.defaultRoad.objects.length > 0) {
		// if already has objects in store, use the last one as template for the new one
		newObjectRaw = JSON.parse(JSON.stringify(this.defaultRoad.objects[this.defaultRoad.objects.length - 1]));
		newObjectRaw.id += 1;
	} else {
		// if no signals in default road, create a default new signal
		newObjectRaw = {
			id: 0,
			s: 0,
			t: 0,
			length: 20,
			width: 0.17,
			height: 1.4
		}
	}
	this.defaultRoad.objects.push(newObjectRaw);
	this.map.refreshCurrentRoad(this.defaultRoad);
	this.closeEditions();
	this.popEditions();
};

MapBuilder.UI.prototype.removeObject = function() {
	// body...
	if (this.defaultRoad.objects.length > 0) {
		this.defaultRoad.objects.splice(this.defaultRoad.objects.length - 1);
	}
	this.map.refreshCurrentRoad(this.defaultRoad);
	this.closeEditions();
	this.popEditions();
};

MapBuilder.UI.prototype.refreshDefaultData = function() {
	// body...
	// make sure current UI is coherent with current road after undo a road seg
	if (this.map.roads.length == 0) {
		this.defaultRoad.signals.splice(0);	// coherent with this.editorMenu.addNewRoad();
		this.defaultRoad.objects.splice(0);
	} else {
		var currentRoad = this.map.roads[this.map.roads.length - 1];	
		this.defaultRoad.geometry[0] = JSON.parse(JSON.stringify(currentRoad.geometryRaw));
		this.defaultRoad.elevation[0] = JSON.parse(JSON.stringify(currentRoad.elevationRaw));
		this.defaultRoad.laneSection[0].lane = JSON.parse(JSON.stringify(currentRoad.laneRaw));
		this.defaultRoad.signals = JSON.parse(JSON.stringify(currentRoad.signalRaw));
		this.defaultRoad.objects = JSON.parse(JSON.stringify(currentRoad.objectRaw));
	}
	this.closeEditions();
	this.popEditions();
};

MapBuilder.UI.prototype.addLeftLane = function() {
	// body...
	function compareLane(laneA, laneB) {
		// a < b by some ordering criterion
		if (Math.abs(laneA.id) < Math.abs(laneB.id)) {
			return -1;
		}
		// a > b by some ordering criterion
		if (Math.abs(laneA.id) > Math.abs(laneB.id)) {
			return 1;
		}
		// a == b
		return 0;
	}

	var leftLanes = [];
	for (var i = 0; i < this.defaultRoad.laneSection[0].lane.length; i++) {
		if (this.defaultRoad.laneSection[0].lane[i].id > 0) {
			leftLanes.push(this.defaultRoad.laneSection[0].lane[i]);
		}
	}

	leftLanes.sort(compareLane);

	var newLaneData;

	if (leftLanes.length > 0) {
		newLaneData = JSON.parse(JSON.stringify(leftLanes[leftLanes.length - 1]));
		newLaneData.id += 1;
	} else {
		newLaneData = {
			id: 1,
			width: {s: 0, a: 3.25, b: 0, c: 0, d: 0},
			roadMark: {type: 'broken', weight: 'standard', color: 'standard', width: 0.13}
		}
	}

	this.defaultRoad.laneSection[0].lane.push(newLaneData);
	this.map.refreshCurrentRoad(this.defaultRoad);
	this.closeEditions();
	this.popEditions();
};

MapBuilder.UI.prototype.removeLeftLane = function() {
	// body...
	function compareLane(laneA, laneB) {
		// a < b by some ordering criterion
		if (Math.abs(laneA.id) < Math.abs(laneB.id)) {
			return -1;
		}
		// a > b by some ordering criterion
		if (Math.abs(laneA.id) > Math.abs(laneB.id)) {
			return 1;
		}
		// a == b
		return 0;
	}

	var leftLanes = [];
	for (var i = 0; i < this.defaultRoad.laneSection[0].lane.length; i++) {
		if (this.defaultRoad.laneSection[0].lane[i].id > 0) {
			leftLanes.push(this.defaultRoad.laneSection[0].lane[i]);
		}
	}

	if (leftLanes.length > 0) {

		leftLanes.sort(compareLane);
		var targetLaneID = leftLanes[leftLanes.length - 1].id;

		for (var i = 0; i < this.defaultRoad.laneSection[0].lane.length; i++) {
			if (this.defaultRoad.laneSection[0].lane[i].id == targetLaneID) {
				this.defaultRoad.laneSection[0].lane.splice(i, 1);
				break;
			}
		}

		this.map.refreshCurrentRoad(this.defaultRoad);
		this.closeEditions();
		this.popEditions();
	}
};

MapBuilder.UI.prototype.addRightLane = function() {
	// body...
	function compareLane(laneA, laneB) {
		// a < b by some ordering criterion
		if (Math.abs(laneA.id) < Math.abs(laneB.id)) {
			return -1;
		}
		// a > b by some ordering criterion
		if (Math.abs(laneA.id) > Math.abs(laneB.id)) {
			return 1;
		}
		// a == b
		return 0;
	}

	var rightLanes = [];
	for (var i = 0; i < this.defaultRoad.laneSection[0].lane.length; i++) {
		if (this.defaultRoad.laneSection[0].lane[i].id < 0) {
			rightLanes.push(this.defaultRoad.laneSection[0].lane[i]);
		}
	}

	rightLanes.sort(compareLane);

	var newLaneData;

	if (rightLanes.length > 0) {
		newLaneData = JSON.parse(JSON.stringify(rightLanes[rightLanes.length - 1]));
		newLaneData.id -= 1;
	} else {
		newLaneData = {
			id: -1,
			width: {s: 0, a: 3.25, b: 0, c: 0, d: 0},
			roadMark: {type: 'broken', weight: 'standard', color: 'standard', width: 0.13}
		}
	}

	this.defaultRoad.laneSection[0].lane.push(newLaneData);
	this.map.refreshCurrentRoad(this.defaultRoad);
	this.closeEditions();
	this.popEditions();
};

MapBuilder.UI.prototype.removeRightLane = function() {
	// body...
	function compareLane(laneA, laneB) {
		// a < b by some ordering criterion
		if (Math.abs(laneA.id) < Math.abs(laneB.id)) {
			return -1;
		}
		// a > b by some ordering criterion
		if (Math.abs(laneA.id) > Math.abs(laneB.id)) {
			return 1;
		}
		// a == b
		return 0;
	}

	var rightLanes = [];
	for (var i = 0; i < this.defaultRoad.laneSection[0].lane.length; i++) {
		if (this.defaultRoad.laneSection[0].lane[i].id < 0) {
			rightLanes.push(this.defaultRoad.laneSection[0].lane[i]);
		}
	}

	if (rightLanes.length > 0) {

		rightLanes.sort(compareLane);
		var targetLaneID = rightLanes[rightLanes.length - 1].id;

		for (var i = 0; i < this.defaultRoad.laneSection[0].lane.length; i++) {
			if (this.defaultRoad.laneSection[0].lane[i].id == targetLaneID) {
				this.defaultRoad.laneSection[0].lane.splice(i, 1);
				break;
			}
		}

		this.map.refreshCurrentRoad(this.defaultRoad);
		this.closeEditions();
		this.popEditions();
	}
};

function parseXML(xmlFile) {
	
	try {
		// Internet Explorer
		xmlDoc = new ActiveXObject("Microsoft.XMLDOM");
		xmlDoc.async = false;
		xmlDoc.load(xmlFile);
	} catch (e) {
		// Chrome
		xmlHttp = new window.XMLHttpRequest();
		xmlHttp.open("GET", xmlFile, false);
		xmlHttp.overrideMimeType('text/xml');
		xmlHttp.send(null);
		xmlDoc = xmlHttp.responseXML;
	}

	// road records 1+
	var roadNodes = xmlDoc.getElementsByTagName('road');
	var roads = {};
	
	// signals are defined per road, but store them separately for controllers (controllers' control refer to signalId), 
	// id may be duplicate in different roads, reassemble signalId as roadId.signalId if no name is given
	var signals = {};

	for ( var i=0 ; i < roadNodes.length; i++ )
	{
		var roadNode = roadNodes[i];
		var id = roadNode.id;	// road id type string

		roads[id] = {};
		roads[id].id = id;
		roads[id].name = roadNode.getAttribute('name');
		roads[id].length = parseFloat(roadNode.getAttribute('length'));
		roads[id].junction =roadNode.getAttribute('junction');	// belonging junction id, =-1 for none

		roads[id].geometry = [];
		roads[id].laneSection = [];

		if (roadNode.children[0].nodeName == 'link') {

			var roadLinkNode = roadNode.children[0];

			var predecessorNodes = roadLinkNode.getElementsByTagName('predecessor');
			if (predecessorNodes.length == 1) {
				roads[id].predecessor = {};
				roads[id].predecessor.elementType = predecessorNodes[0].getAttribute('elementType');
				roads[id].predecessor.elementId = predecessorNodes[0].getAttribute('elementId');
				roads[id].predecessor.contactPoint = predecessorNodes[0].getAttribute('contactPoint');
			}
			var successorNodes = roadLinkNode.getElementsByTagName('successor');
			if (successorNodes.length == 1) {
				roads[id].successor = {};
				roads[id].successor.elementType = successorNodes[0].getAttribute('elementType');
				roads[id].successor.elementId = successorNodes[0].getAttribute('elementId');
				roads[id].successor.contactPoint = successorNodes[0].getAttribute('contactPoint');
			}
			var neighborNodes = roadLinkNode.getElementsByTagName('neighbor');
			if (neighborNodes.length) {
				roads[id].neighbor = [];
				for (var j=0; j < neighborNodes.length; j++) {
					var neighborNode = neighborNodes[j];
					roads[id].neighbor[j] = {};
					roads[id].neighbor[j].side = neighborNode.getAttribute('side');
					roads[id].neighbor[j].elementId = neighborNode.getAttribute('elementId');
					roads[id].neighbor[j].direction = neighborNode.getAttribute('direction');
				}
			}
		}

		var geometryNodes = roadNode.getElementsByTagName('geometry');
		for (var j=0; j < geometryNodes.length; j++) {
		
			var geometryNode = geometryNodes[j];

			roads[id].geometry[j] = {};
			roads[id].geometry[j].s = parseFloat(geometryNode.getAttribute('s'));
			roads[id].geometry[j].x = parseFloat(geometryNode.getAttribute('x'));
			roads[id].geometry[j].y = parseFloat(geometryNode.getAttribute('y'));
			roads[id].geometry[j].hdg = parseFloat(geometryNode.getAttribute('hdg'));
			roads[id].geometry[j].length = parseFloat(geometryNode.getAttribute('length'));

			var geometryType = geometryNode.firstElementChild.nodeName;
			var geometryTypeNode = geometryNode.firstElementChild;
			roads[id].geometry[j].type = geometryType;

			switch(geometryType) {
				case 'line':
					break;
				case 'spiral':
					roads[id].geometry[j][geometryType] = {};
					roads[id].geometry[j][geometryType].curvStart = parseFloat(geometryTypeNode.getAttribute('curvStart'));
					roads[id].geometry[j][geometryType].curvEnd = parseFloat(geometryTypeNode.getAttribute('curvEnd'));
					break;
				case 'arc':
					roads[id].geometry[j][geometryType] = {};
					roads[id].geometry[j][geometryType].curvature = parseFloat(geometryTypeNode.getAttribute('curvature'));
					break;
				default:
					throw new Error('invalid geometry type!')
			}
		}

		// elevationProfile 0...1
		var elevationProfileNodes = roadNode.getElementsByTagName('elevationProfile');
		if (elevationProfileNodes.length) {
		
			// elevation nodes 1+
			var elevationNodes = roadNode.getElementsByTagName('elevation');
			if (elevationNodes.length) roads[id].elevation = [];
			for (var j=0; j < elevationNodes.length; j++) {

				var elevationNode = elevationNodes[j];
				roads[id].elevation[j] = {};
				roads[id].elevation[j].s = parseFloat(elevationNode.getAttribute('s'));
				roads[id].elevation[j].a = parseFloat(elevationNode.getAttribute('a'));
				roads[id].elevation[j].b = parseFloat(elevationNode.getAttribute('b'));
				roads[id].elevation[j].c = parseFloat(elevationNode.getAttribute('c'));
				roads[id].elevation[j].d = parseFloat(elevationNode.getAttribute('d'));
			}
		}

		// superelevation 0+
		var superelevationNodes = roadNode.getElementsByTagName('superelevation');
		if (superelevationNodes.length) roads[id].superelevation = [];

		for (var j=0; j < superelevationNodes.length; j++) {

			var superelevationNode = superelevationNodes[j];

			roads[id].superelevation[j] = {};
			roads[id].superelevation[j].s = parseFloat(superelevationNode.getAttribute('s'));
			roads[id].superelevation[j].a = parseFloat(superelevationNode.getAttribute('a'));
			roads[id].superelevation[j].b = parseFloat(superelevationNode.getAttribute('b'));
			roads[id].superelevation[j].c = parseFloat(superelevationNode.getAttribute('c'));
			roads[id].superelevation[j].d = parseFloat(superelevationNode.getAttribute('d'));
		}

		// crossfall 0+ (available xodr shows no examples)
		var crossfallNodes = roadNode.getElementsByTagName('crossfall');
		if (crossfallNodes.length) roads[id].crossfall = [];

		for (var j=0; j < crossfallNodes.length; j++) {

			var crossfallNode = crossfallNodes[j];

			roads[id].crossfall[j] = {};
			roads[id].crossfall[j].side = crossfallNode.getAttribute('side');
			roads[id].crossfall[j].s = parseFloat(crossfallNode.getAttribute('s'));
			roads[id].crossfall[j].a = parseFloat(crossfallNode.getAttribute('a'));
			roads[id].crossfall[j].b = parseFloat(crossfallNode.getAttribute('b'));
			roads[id].crossfall[j].c = parseFloat(crossfallNode.getAttribute('c'));
			roads[id].crossfall[j].d = parseFloat(crossfallNode.getAttribute('d'));
		}

		// shape 0+ (available xodr shows no examples)
		var shapeNodes = roadNode.getElementsByTagName('shape');
		if (shapeNodes.length) roads[id].shape = [];

		for (var j=0; j < shapeNodes.length; j++) {

			var shapeNode = shapeNodes[j];

			roads[id].shape[j] = {};
			roads[id].shape[j].s = parseFloat(shapeNode.getAttribute('s'));
			roads[id].shape[j].t = parseFloat(shapeNode.getAttribute('t'));
			roads[id].shape[j].a = parseFloat(shapeNode.getAttribute('a'));
			roads[id].shape[j].b = parseFloat(shapeNode.getAttribute('b'));
			roads[id].shape[j].c = parseFloat(shapeNode.getAttribute('c'));
			roads[id].shape[j].d = parseFloat(shapeNode.getAttribute('d'));
		}

		// laneOffset 0+
		var laneOffsetNodes = roadNode.getElementsByTagName('laneOffset');
		if (laneOffsetNodes.length) {

			roads[id].laneOffset = [];
			
			for (var j=0; j < laneOffsetNodes.length; j++) {

				var laneOffsetNode = laneOffsetNodes[j];

				roads[id].laneOffset[j] = {};
				roads[id].laneOffset[j].s = parseFloat(laneOffsetNode.getAttribute('s'));
				roads[id].laneOffset[j].a = parseFloat(laneOffsetNode.getAttribute('a'));
				roads[id].laneOffset[j].b = parseFloat(laneOffsetNode.getAttribute('b'));
				roads[id].laneOffset[j].c = parseFloat(laneOffsetNode.getAttribute('c'));
				roads[id].laneOffset[j].d = parseFloat(laneOffsetNode.getAttribute('d'));
			}
		}

		// laneSection 1+
		var laneSectionNodes = roadNode.getElementsByTagName('laneSection');
		for (var j=0; j < laneSectionNodes.length; j++) {

			var laneSectionNode = laneSectionNodes[j];

			roads[id].laneSection[j] = {};
			roads[id].laneSection[j].s = parseFloat(laneSectionNode.getAttribute('s'));
			roads[id].laneSection[j].singleSide = laneSectionNode.getAttribute('singleSide') || "false";
			roads[id].laneSection[j].lane = [];

			var laneNodes = laneSectionNode.getElementsByTagName('lane');
			for (var k=0; k < laneNodes.length; k++) {

				var laneNode = laneNodes[k];

				roads[id].laneSection[j].lane[k] = {};
				roads[id].laneSection[j].lane[k].id = parseInt(laneNode.getAttribute('id'));
				roads[id].laneSection[j].lane[k].type = laneNode.getAttribute('type');
				roads[id].laneSection[j].lane[k].level = laneNode.getAttribute('level');

				// 0..1 lane predecessor
				var lanePredecessorNodes = laneNode.getElementsByTagName('predecessor');
				if (lanePredecessorNodes.length == 1) {
					roads[id].laneSection[j].lane[k].predecessor = parseInt(lanePredecessorNodes[0].getAttribute('id'));
				}

				// 0..1 lane successor
				var laneSuccessorNodes = laneNode.getElementsByTagName('successor');
				if (laneSuccessorNodes.length == 1) {
					roads[id].laneSection[j].lane[k].successor = parseInt(laneSuccessorNodes[0].getAttribute('id'));
				}

				// 1+ if no <border> entry is present - not allowed for center lane
				var widthNodes = laneNode.getElementsByTagName('width');
				if (widthNodes.length) roads[id].laneSection[j].lane[k].width = [];

				// 1+ if no <width> entry is present - not allowed for center lane
				var borderNodes = laneNode.getElementsByTagName('border');
				if (borderNodes.width) roads[id].laneSection[j].lane[k].border = [];

				// 0+
				var roadMarkNodes = laneNode.getElementsByTagName('roadMark');
				if (roadMarkNodes.length) roads[id].laneSection[j].lane[k].roadMark = {};		

				// 0+ not allowed for center lane
				var materialNodes = laneNode.getElementsByTagName('material');
				if (materialNodes.length) roads[id].laneSection[j].lane[k].material = [];		
				
				// 0+ not allowed for center lane
				var visibilityNodes = laneNode.getElementsByTagName('visibility');
				if (visibilityNodes.length) roads[id].laneSection[j].lane[k].visibility = [];

				// 0+ not allowed for center lane
				var speedNodes = laneNode.getElementsByTagName('speed');
				if (speedNodes.length) roads[id].laneSection[j].lane[k].speed = [];
				
				// 0+ not allowed for center lane
				var accessNodes = laneNode.getElementsByTagName('access');
				if (accessNodes.length) roads[id].laneSection[j].lane[k].access = [];

				// 0+ not allowed for center lane
				var heightNodes = laneNode.getElementsByTagName('height');
				if (heightNodes.length) roads[id].laneSection[j].lane[k].height = [];

				// 0+ not allowed for center lane
				var ruleNodes = laneNode.getElementsByTagName('rule');
				if (ruleNodes.length) roads[id].laneSection[j].lane[k].rule = [];

				// get Lane Width Record 1+ - not allowed for center lane (laneId=0)
				for (var l=0; l < widthNodes.length; l++) {

					var widthNode = widthNodes[l];

					roads[id].laneSection[j].lane[k].width[l] = {};
					roads[id].laneSection[j].lane[k].width[l].sOffset = parseFloat(widthNode.getAttribute('sOffset'));
					roads[id].laneSection[j].lane[k].width[l].a = parseFloat(widthNode.getAttribute('a'));
					roads[id].laneSection[j].lane[k].width[l].b = parseFloat(widthNode.getAttribute('b'));
					roads[id].laneSection[j].lane[k].width[l].c = parseFloat(widthNode.getAttribute('c'));
					roads[id].laneSection[j].lane[k].width[l].d = parseFloat(widthNode.getAttribute('d'));
				}

				// get Lane Border Record 1+ - if both <width> and <border> is defined, <width> prevails
				for (var l=0; l < borderNodes.length; l++) {

					var borderNode = borderNodes[l];

					roads[id].laneSection[j].lane[k].border[l] = {};
					roads[id].laneSection[j].lane[k].border[l].sOffset = parseFloat(borderNode.getAttribute('sOffset'));
					roads[id].laneSection[j].lane[k].border[l].a = parseFloat(borderNode.getAttribute('a'));
					roads[id].laneSection[j].lane[k].border[l].b = parseFloat(borderNode.getAttribute('b'));
					roads[id].laneSection[j].lane[k].border[l].c = parseFloat(borderNode.getAttribute('c'));
					roads[id].laneSection[j].lane[k].border[l].d = parseFloat(borderNode.getAttribute('d'));
				}

				// get Lane Roadmark 0+
				// road mark's centerline is always positioned on the respective lane's outer border line
				for (var l=0; l < roadMarkNodes.length; l++) {

					var roadMarkNode = roadMarkNodes[l];

					roads[id].laneSection[j].lane[k].roadMark.sOffset = parseFloat(roadMarkNode.getAttribute('sOffset'));
					roads[id].laneSection[j].lane[k].roadMark.type = roadMarkNode.getAttribute('type');
					roads[id].laneSection[j].lane[k].roadMark.weight = roadMarkNode.getAttribute('weight');
					roads[id].laneSection[j].lane[k].roadMark.color = roadMarkNode.getAttribute('color');
					roads[id].laneSection[j].lane[k].roadMark.material = roadMarkNode.getAttribute('material');
					roads[id].laneSection[j].lane[k].roadMark.width = parseFloat(roadMarkNode.getAttribute('width'));
					roads[id].laneSection[j].lane[k].roadMark.laneChange = roadMarkNode.getAttribute('laneChange') ? roadMarkNode.getAttribute('laneChange') : "both";
					roads[id].laneSection[j].lane[k].roadMark.height = parseFloat(roadMarkNode.getAttribute('height') ? roadMarkNode.getAttribute('height') : "0");
					break;
				}

				// get Lane Material Record 0+ - not allowed for center lane (laneId=0)
				for (var l=0; l < materialNodes.length; l++) {
					
					var materialNode = materialNodes[l];

					roads[id].laneSection[j].lane[k].material[l] = {};
					roads[id].laneSection[j].lane[k].material[l].sOffset = parseFloat(materialNode.getAttribute('sOffset'));
					roads[id].laneSection[j].lane[k].material[l].surface = materialNode.getAttribute('surface');
					roads[id].laneSection[j].lane[k].material[l].friction = parseFloat(materialNode.getAttribute('friction'));
					roads[id].laneSection[j].lane[k].material[l].roughness = parseFloat(materialNode.getAttribute('roughness'));
				}

				// get Lane Visibility Record - not allowed for center lane (laneId=0)
				for (var l=0; l < visibilityNodes.length; l++) {

					var visibilityNode = visibilityNodes[l];

					roads[id].laneSection[j].lane[k].visibility[l] = {};
					roads[id].laneSection[j].lane[k].visibility[l].sOffset = parseFloat(visibilityNode.getAttribute('sOffset'));
					roads[id].laneSection[j].lane[k].visibility[l].forward = parseFloat(visibilityNode.getAttribute('forward'));
					roads[id].laneSection[j].lane[k].visibility[l].back = parseFloat(visibilityNode.getAttribute('back'));
					roads[id].laneSection[j].lane[k].visibility[l].left = parseFloat(visibilityNode.getAttribute('left'));
					roads[id].laneSection[j].lane[k].visibility[l].right = parseFloat(visibilityNode.getAttribute('right'));
				}

				// get Lane Speed Record - not allowed for center lane (laneId=0)
				for (var l=0; l < speedNodes.length; l++) {

					var speedNode = speedNodes[l];

					roads[id].laneSection[j].lane[k].speed[l] = {};
					roads[id].laneSection[j].lane[k].speed[l].sOffset = parseFloat(speedNode.getAttribute('sOffset'));
					roads[id].laneSection[j].lane[k].speed[l].max = parseFloat(speedNode.getAttribute('max'));
					roads[id].laneSection[j].lane[k].speed[l].unit = speedNode.getAttribute('unit') ? speedNode.getAttribute('unit') : 'm/s';
				}

				// get Lane Access Record - not allowed for center lane (laneId=0)
				for (var l=0; l < accessNodes.length; l++) {

					var accessNode = accessNodes[l];

					roads[id].laneSection[j].lane[k].access[l] = {};
					roads[id].laneSection[j].lane[k].access[l].sOffset = parseFloat(accessNode.getAttribute('sOffset'));
					roads[id].laneSection[j].lane[k].access[l].restriction = accessNode.getAttribute('restriction');
				}

				// get Lane Height Record 0+ - not allowed for center lane (laneId=0)
				for (var l=0; l < heightNodes.length; l++) {

					var heightNode = heightNodes[l];

					roads[id].laneSection[j].lane[k].height[l] = {};
					roads[id].laneSection[j].lane[k].height[l].sOffset = parseFloat(heightNode.getAttribute('sOffset'));
					roads[id].laneSection[j].lane[k].height[l].inner = parseFloat(heightNode.getAttribute('inner') || 0);
					roads[id].laneSection[j].lane[k].height[l].outer = parseFloat(heightNode.getAttribute('outer') || 0);
				}

				// get Lane Rule Record 0+ - not allowed for center lane (laneId=0)
				for (var l=0; l < ruleNodes.length; l++) {

					var ruleNode = ruleNodes[l];

					roads[id].laneSection[j].lane[k].rule[l] = {};
					roads[id].laneSection[j].lane[k].rule[l].sOffset = parseFloat(ruleNode.getAttribute('sOffset'));
					roads[id].laneSection[j].lane[k].rule[l].value = ruleNode.getAttribute('value');
				}
			}
		}

		// signal 0+
		// NOTE: signal's data structure may need to be extended to work with outside signal system's definition!
		// For example, type - mesh
		var signalNodes = roadNode.getElementsByTagName('signal');
		if (signalNodes.length) roads[id].signals = [];

		for (var j=0; j < signalNodes.length; j++) {

			var signalNode = signalNodes[j];
			// road may contain a signalId the same as one in another road (but shouldn't), re-assemble signalId as roadId.signalId if no name entry provided
			var signalId = signalNode.id;
			var name = signalNode.getAttribute('name');
			if (name.trim() == "") signalId = id + '.' + signalId;

			// road only refer to signal id
			roads[id].signals.push(signalId);

			signals[signalId] = {};
			signals[signalId].name = name;
			signals[signalId].id = signalId;
			signals[signalId].road = id;
			signals[signalId].s = parseFloat(signalNode.getAttribute('s'));
			signals[signalId].t = parseFloat(signalNode.getAttribute('t'));
			signals[signalId].dynamic = signalNode.getAttribute('dynamic');	// yes / no
			signals[signalId].orientation = signalNode.getAttribute('orientation');	// + / - / none
			signals[signalId].zOffset = parseFloat(signalNode.getAttribute('zOffset'));
			signals[signalId].country = signalNode.getAttribute('country');
			signals[signalId].type = signalNode.getAttribute('type');
			signals[signalId].subtype = signalNode.getAttribute('subtype');
			signals[signalId].value = parseFloat(signalNode.getAttribute('value'));
			if (signalNode.getAttribute('unit'))
				signals[signalId].unit = signalNode.getAttribute('unit');	// optional
			if (signalNode.getAttribute('height'))
				signals[signalId].height = parseFloat(signalNode.getAttribute('height'));
			if (signalNode.getAttribute('width'))
				signals[signalId].width = parseFloat(signalNode.getAttribute('width'));
			if (signalNode.getAttribute('text'))
				signals[signalId].text = signalNode.getAttribute('text');
			if (signalNode.getAttribute('hOffset'))
				signals[signalId].hOffset = parseFloat(signalNode.getAttribute('hOffset')); // heading offset from orientation
			if (signalNode.getAttribute('pitch'))
				signals[signalId].pitch = parseFloat(signalNode.getAttribute('pitch'));
			if (signalNode.getAttribute('roll'))
				signals[signalId].roll = parseFloat(signalNode.getAttribute('roll'));

			// lane validity records 0+
			var validityNodes = signalNode.getElementsByTagName('validity');
			if (validityNodes.length) signals[signalId].validity = [];
			for (var k=0; k < validityNodes.length; k++) {

				var validityNode = validityNodes[k];

				signals[signalId].validity[k] = {};
				signals[signalId].validity[k].fromLane = parseInt(validityNode.getAttribute('fromLane'));
				signals[signalId].validity[k].toLane = parseInt(validityNode.getAttribute('toLane'));
			}

			// signal dependency records 0+
			var dependencyNodes = signalNode.getElementsByTagName('dependency');
			if (dependencyNodes.length) signals[signalId].dependency = {};
			for (var k=0; k < dependencyNodes.length; k++) {

				var dependencyNode = dependencyNodes[k];
				var controlledSignalId = dependencyNode.id;

				signals[signalId].dependency[controlledSignalId] = {};
				signals[signalId].dependency[controlledSignalId].id = controlledSignalId;
				signals[signalId].dependency[controlledSignalId].type = dependencyNode.getAttribute('type');
			}
		}

		// signalRerence 0+ - different refer to the same sign from multiple roads
		var signalReferenceNodes = roadNode.getElementsByTagName('signalReference');
		if (signalReferenceNodes.length) roads[id].signalReference = [];

		for (var j=0; j < signalReferenceNodes.length; j++) {

			var signalReferenceNode = signalReferenceNodes[j];

			roads[id].signalReference[j] = {};
			roads[id].signalReference[j].s = parseFloat(signalReferenceNode.getAttribute('s'));
			roads[id].signalReference[j].t = parseFloat(signalReferenceNode.getAttribute('t'));
			roads[id].signalReference[j].id = signalReferenceNode.getAttribute('id');
			roads[id].signalReference[j].orientation = signalReferenceNode.getAttribute('orientation');

			// lane validity records 0+
			var validityNodes = signalReferenceNode.getElementsByTagName('validity');
			if (validityNodes.length) roads[id].signalReference[j].validity = [];
			for (var k=0; k < validityNodes.length; k++) {

				var validityNode = validityNodes[k];

				roads[id].signalReference[j].validity[k] = {};
				roads[id].signalReference[j].validity[k].fromLane = parseInt(validityNode.getAttribute('fromLane'));
				roads[id].signalReference[j].validity[k].toLane = parseInt(validityNode.getAttribute('toLane'));
			}
		}

		// test
		//if (id == '514') console.log(roads[id]);
	}

	// controller records 0+
	var controllerNodes = [];
	for (var i=0; i < xmlDoc.firstElementChild.children.length; i++) 
	{
		if (xmlDoc.firstElementChild.children[i].nodeName == 'controller') {
			controllerNodes.push(xmlDoc.firstElementChild.children[i]);
		}
	}
	
	if (controllerNodes.length) 
	{
		var controllers = {};
		
		for (var i=0; i < controllerNodes.length; i++) 
		{

			var controllerNode = controllerNodes[i];
			var id = controllerNode.id;		// controller id type string

			controllers[id] = {};
			controllers[id].id = id;
			controllers[id].name = controllerNode.getAttribute('name');
			controllers[id].sequence = parseInt(controllerNode.getAttribute('sequence') || -1);	// uint32_t [0, +oo], -1 for none
			controllers[id].control = [];

			var controlNodes = controllerNode.getElementsByTagName('control');
			for (var j=0; j < controlNodes.length; j++) {

				var controlNode = controlNodes[j];
				var signalId = controlNode.getAttribute('signalId');
				
				controllers[id].control[signalId] = {};
				controllers[id].control[signalId].signalId = signalId;
				controllers[id].control[signalId].type = controlNode.getAttribute('type');
			}
		}
	}

	// junction records 0+
	var junctionNodes = xmlDoc.getElementsByTagName('junction');

	if (junctionNodes.length) 
	{
		var junctions = {};

		for (var i=0; i < junctionNodes.length; i++) 
		{
			var junctionNode = junctionNodes[i];
			var id = junctionNode.id;	// junction id type string

			junctions[id] = {};
			junctions[id].id = id;
			junctions[id].name = junctionNode.getAttribute('name');
			junctions[id].connection = {};

			var connectionNodes = junctionNode.getElementsByTagName('connection');
			for (var j=0; j < connectionNodes.length; j++) {

				var connectionNode = connectionNodes[j];
				var connectionId = connectionNode.id;

				junctions[id].connection[connectionId] = {};
				junctions[id].connection[connectionId].id = connectionId;
				junctions[id].connection[connectionId].incomingRoad = connectionNode.getAttribute('incomingRoad');
				junctions[id].connection[connectionId].connectingRoad = connectionNode.getAttribute('connectingRoad');
				junctions[id].connection[connectionId].contactPoint = connectionNode.getAttribute('contactPoint');

				var laneLinkNodes = connectionNode.getElementsByTagName('laneLink');
				if (laneLinkNodes.length) junctions[id].connection[j].laneLink = [];
				
				// laneLink 0+ 'from' is incoming lane Id, 'to' is connection lane
				for (var k=0; k < laneLinkNodes.length; k++) {

					var laneLinkNode = laneLinkNodes[k];

					junctions[id].connection[j].laneLink[k] = {};
					junctions[id].connection[j].laneLink[k].from = parseInt(laneLinkNode.getAttribute('from'));
					junctions[id].connection[j].laneLink[k].to = parseInt(laneLinkNode.getAttribute('to'));
				}
			}

			var priorityNodes = junctionNode.getElementsByTagName('priority');
			if (priorityNodes.length) junctions[id].priority = [];
			for (var j=0; j < priorityNodes.length; j++) {

				var priorityNode = priorityNodes[j];
				
				junctions[id].priority[j] = {};
				junctions[id].priority[j].high = priorityNode.getAttribute('high');
				junctions[id].priority[j].low = priorityNode.getAttribute('low');
			}

			var controllerNodes = junctionNode.getElementsByTagName('controller');
			if (controllerNodes.length) junctions[id].controller = [];
			for (var j=0; j < controllerNodes.length; j++) {

				var controllerNode = controllerNodes[j];

				junctions[id].controller[j] = {};
				junctions[id].controller[j].id = controllerNode.getAttribute('id');
				junctions[id].controller[j].type = controllerNode.getAttribute('type');
				junctions[id].controller[j].sequence = parseInt(controllerNode.getAttribute('sequence') || -1);	// uint32_t [0, +oo], -1 for none
			}
		}
	}

	// junction group records 0+
	var junctionGroupNodes = xmlDoc.getElementsByTagName('junctionGroup');
	
	if (junctionGroupNodes.length) {
	
		var junctionGroups = {};

		for (var i=0; i < junctionGroupNodes.length; i++) 
		{

			var junctionGroupNode = junctionGroupNodes[i];

			var id = junctionGroupNode.id;
			junctionGroups[id] = {};
			junctionGroups[id].id = id;
			junctionGroups[id].name = junctionGroupNode.getAttribute('name');
			junctionGroups[id].type = junctionGroupNode.getAttribute('type');
			junctionGroups[id].junctionReference = [];

			var junctionReferenceNodes = junctionGroupNode.getElementsByTagName('junctionReference');
			for (var j=0; j < junctionReferenceNodes.length; j++) {

				var junctionReferenceNode = junctionReferenceNodes[j];
				junctionGroups[id].junctionReference[j] = {};
				junctionGroups[id].junctionReference[j].junction = junctionReferenceNode.getAttribute('junction');	// ID of the junction
			}
		}
	}

	return {roads:roads, signals: signals, controllers:controllers, junctions:junctions, junctionGroups:junctionGroups};
}

/*
* Generate sample points for a cubic polynomial
*
* @Param offset where does horizontal axis begin (before transformation)
* @Param length the distance between start and end points along the horizontal axis (before the transformation)
* @Param elevation the elevation of the segment
* @Param sx,sy the starting position of the actual 'horizontal' axis (central reference line)
* @Param hdg the heading of the starting point
* @Param lateralOffset a,b,c,d the parameters of the cubic polynomial
* @Rerturn sample points
*/
function generateCubicPoints(offset, length, elevation, sx, sy, hdg, lateralOffset) {

	var x, y, z;
	var points = [];
	var tOffset = [];
	var sOffset = [];	// each point's s distance from the begining of the cubic curve

	var ds = 0;

	do {

		if (ds > length || Math.abs(ds - length) < 1E-4) {
			ds = length;
		}

		x = sx + (ds + offset) * Math.cos(hdg);
		y = sy + (ds + offset) * Math.sin(hdg);
		z = cubicPolynomial(ds + offset, elevation.a, elevation.b, elevation.c, elevation.d);

		points.push(new THREE.Vector3(x, y, z));
		sOffset.push(ds + offset);
		if (lateralOffset) tOffset.push(cubicPolynomial(ds + offset, lateralOffset.a, lateralOffset.b, lateralOffset.c, lateralOffset.d));
	
		ds += step;
	
	} while(ds < length + step);

	if (lateralOffset) {

		for (var i = 0; i < points.length; i++) {
		
			var point = points[i];
			var t = tOffset[i];
			var ds = sOffset[i];

			svector = new THREE.Vector3(1, 0, 0);
			svector.applyAxisAngle(new THREE.Vector3(0, 0, 1), hdg);
			tvector = svector.clone();
			tvector.cross(new THREE.Vector3(0, 0, -1));
			hvector = svector.clone();
			hvector.cross(tvector);

			tvector.multiplyScalar(t);
			hvector.multiplyScalar(0);	// no height

			point.x += tvector.x + hvector.x;
			point.y += tvector.y + hvector.y;
			point.z += tvector.z + hvector.z;
		}
	}

	return points;
}

function cubicPolynomial(ds, a, b, c, d) {

	return a + b * ds + c * Math.pow(ds, 2) + d * Math.pow(ds, 3);	
}

/*
* Create sample points ane heading of an Eular-Spiral connecting points (sx, sy) to (ex, ey)
*
* @Param length length of the curve
* @Param elevation elevatio of the segment
* @Param sx, sy the starting point of the spiral
* @Param hdg heading direction (rotation of z axis) at start of the road
* @Param curvStart the curvature at the starting point - obslete (can delete)
* @Param curvEnd curvature of the ending point
* @Param lateralOffset {a, b, c, d} cubic polynomial coeffients of offset away from central clothoid (used to draw paralell curve to clothoid)
*
* NOTE: the following two pameters are only used when calculating track coordinate to inertial coordinate
*
* @Param subOffset given the paramters of a whole segment of Eular-Spiral, the sub-segment's start sOffset from the start of the spiral (sx, sy)
* @Param subLength given the parameters of a while segment of Eular-Spiral, the sub-segemetn's run-through length
*
* @Return sample points and heading for each sample points (returned heading is used only in split geometry on spiral in getGeometry function)
*/
function generateSpiralPoints(length, elevation, sx, sy, hdg, curvStart, curvEnd, lateralOffset, subOffset, subLength) {

	var points = [];
	var heading = [];
	var tOffset = [];
	var sOffset = [];	// sOffset from the beginning of the curve
	var k = (curvEnd - curvStart) / length;

	var theta = hdg; 	// current heading direction

	if (!elevation) {
		elevation = {s:0,a:0,b:0,c:0,d:0};
	}

	// s ranges between [0, length]
	var s = 0;
	var preS = 0;
	
	var point, x, y, z;

	do {

		if (s == 0) {
			points.push(new THREE.Vector3(sx, sy, elevation.a));
			heading.push(theta);
			if (lateralOffset) tOffset.push(lateralOffset.a);
			sOffset.push(s);
			s += step;
			continue;
		}

		if (s > length || Math.abs(s - length) < 1E-4) {
			s = length;
		}

		var curvature = (s + preS) * 0.5 * k + curvStart;
		var prePoint = points[points.length - 1];
		
		x = prePoint.x + (s - preS) * Math.cos(theta + curvature * (s - preS) / 2);
		y = prePoint.y + (s - preS) * Math.sin(theta + curvature * (s - preS) / 2);
		z = cubicPolynomial(s, elevation.a, elevation.b, elevation.c, elevation.d);

		theta += curvature * (s - preS);
		preS = s;
		s += step;
		
		points.push(new THREE.Vector3(x, y, z));
		heading.push(theta);
		if (lateralOffset) tOffset.push(cubicPolynomial(preS, lateralOffset.a, lateralOffset.b, lateralOffset.c, lateralOffset.d));
		sOffset.push(preS);

	} while (s < length + step);

	// apply lateralOffset if any
	if (lateralOffset) {

		var svector, tvector, hvector;

		// shift points at central clothoid by tOffset to get the parallel curve points
		for (var i = 0; i < points.length; i++) {

			var point = points[i];
			var currentHeading = heading[i];
			var t = tOffset[i];
			var ds = sOffset[i];

			svector = new THREE.Vector3(1, 0, 0);
			svector.applyAxisAngle(new THREE.Vector3(0, 0, 1), currentHeading);
			tvector = svector.clone();
			tvector.cross(new THREE.Vector3(0, 0, -1));

			hvector = svector.clone();
			hvector.cross(tvector);

			tvector.multiplyScalar(t);
			hvector.multiplyScalar(0);	// no height

			point.x += tvector.x + hvector.x;
			point.y += tvector.y + hvector.y;
			point.z += tvector.z + hvector.z;
		}
	}

	// BUG: when subOffset == length, p2 will be undefined
	if (typeof subOffset == 'number' && typeof subLength == 'number') {

		var p1, p2;
		var startPoint, endPoint;
		var startIndex, endIndex, startIndexDiff, endIndexDiff;

		// bug, when subOffset is at the end of the geometry, p2 is undefined		
		startIndex = Math.floor(subOffset / step);
		startIndexDiff = subOffset / step - Math.floor(subOffset / step);

		endIndex = Math.floor((subOffset + subLength) / step);
		endIndexDiff = (subOffset + subLength) / step - Math.floor((subOffset + subLength) / step);

		// extract points from startIndex + diff to endIndex + diff
		if (startIndexDiff > 0) {
			p1 = points[startIndex];
			p2 = points[startIndex + 1];
						
			startPoint = new THREE.Vector3(p1.x + startIndexDiff / step * (p2.x - p1.x), p1.y + startIndexDiff / step * (p2.y - p1.y), p1.z + startIndexDiff / step * (p2.z - p1.z));
			points[startIndex] = startPoint;
			heading[startIndex] = heading[startIndex] + (heading[startIndex + 1] - heading[startIndex]) * startIndexDiff / step;
		}

		if (endIndexDiff > 0) {
			p1 = points[endIndex];
			p2 = points[endIndex + 1];
			endPoint = new THREE.Vector3(p1.x + endIndexDiff / step * (p2.x - p1.x), p1.y + endIndexDiff / step * (p2.y - p1.y), p1.z + endIndexDiff / step * (p2.z - p1.z));
			endIndex = endIndex + 1;
			points[endIndex] = endPoint;
			heading[endIndex] = heading[endIndex + 1] ? heading[endIndex] + (heading[endIndex + 1] - heading[endIndex]) * endIndexDiff / step : heading[endIndex];
		}

		points.splice(endIndex + 1);
		points.splice(0, startIndex);
		heading.splice(endIndex + 1);
		heading.splice(0, startIndex);
	}

	return {points: points, heading: heading};
}

/*
* Create sample points for a cicular arc (step is 1m)
*
* @Param length the length of arc
* @Param elevation elevatio of the segment
* @Param sx, sy the start of the arc
* @Param hdg heading diretion at start of the arc (rotation of z axis)
* @Param curvature curvature of the arc
* @Param lateralOffset offset along t axis with a, b, c, d as cubic polynomial coefficiants
* @Return sample points
*/
function generateArcPoints(length, elevation, sx, sy, hdg, curvature, lateralOffset) {

	var points = [];
	var heading = [];
	var tOffset = [];
	var sOffset = [];	// sOffset from the beginning of the curve, used for distribute error
	var currentHeading = hdg;
	var prePoint, x, y, z;

	if (!elevation) {
		elevation = {s:0,a:0,b:0,c:0,d:0};
	}

	// s ranges between [0, length]
	var s = 0;
	var preS = 0;

	do {
		
		if (s == 0) {
			points.push(new THREE.Vector3(sx, sy, elevation.a));		
			heading.push(currentHeading);
			if (lateralOffset) tOffset.push(lateralOffset.a);
			sOffset.push(s);
			s += step;
			continue;
		}

		if (s > length || Math.abs(s - length) < 1E-4) {		
			s = length;
		}

		prePoint = points[points.length - 1];

		x = prePoint.x + (s - preS) * Math.cos(currentHeading + curvature * (s - preS) / 2);
		y = prePoint.y + (s - preS) * Math.sin(currentHeading + curvature * (s - preS) / 2);
		z = cubicPolynomial(s, elevation.a, elevation.b, elevation.c, elevation.d);

		currentHeading += curvature * (s - preS);
		
		preS = s;
		s += step;

		points.push(new THREE.Vector3(x, y, z));
		heading.push(currentHeading);
		if (lateralOffset) tOffset.push(cubicPolynomial(preS, lateralOffset.a, lateralOffset.b, lateralOffset.c, lateralOffset.d));
		sOffset.push(preS);

	} while (s < length + step);

	// apply lateral offset along t, and apply superelevation, crossfalls if any
	if (lateralOffset) {

		var svector, tvector, hvector;

		// shift points at central clothoid by tOffset to get the parallel curve points
		for (var i = 0; i < points.length; i++) {

			var point = points[i];
			var t = tOffset[i];
			var currentHeading = heading[i];
			var ds = sOffset[i];

			svector = new THREE.Vector3(1, 0, 0);
			svector.applyAxisAngle(new THREE.Vector3(0, 0, 1), currentHeading);
			tvector = svector.clone();
			tvector.cross(new THREE.Vector3(0, 0, -1));

			hvector = svector.clone();
			hvector.cross(tvector);

			tvector.multiplyScalar(t);
			hvector.multiplyScalar(0);	// no height

			point.x += tvector.x + hvector.x;
			point.y += tvector.y + hvector.y;
			point.z += tvector.z + hvector.z;
		}
	}

	return {points: points, heading: heading};
}

/*
* Create a custome geometry defined by innerBorder points and outerBorder points
*
* lBorderPoints and rBorderPoints increase towards the same direction (+S), i.e. no reverse needed
*
* @Param lBorderPoints left border in +S
* @Param rBorderPoints right border in +S 
* @Return THREE.BufferGeometry
*/
function createCustomFaceGeometry(lBorderPoints, rBorderPoints)  {

	if (lBorderPoints.length == 0 || rBorderPoints.length == 0) return;

	var geometry = new THREE.BufferGeometry();
	var vertices = [];
	var uvs = [];
	var index = [];

	vertices = vertices.concat([rBorderPoints[0].x, rBorderPoints[0].y, rBorderPoints[0].z]);
	vertices = vertices.concat([lBorderPoints[0].x, lBorderPoints[0].y, lBorderPoints[0].z]);

	uvs = uvs.concat(1, 0)
	uvs = uvs.concat(0, 0)

	// start from iBorder's first point, each loop draw 2 triangles representing the quadralateral iBorderP[i], iBorderP[i+1], oBorder[i+1], oBorder[i] 

	for (var i = 0; i < Math.min(lBorderPoints.length, rBorderPoints.length) - 1; i++) {
		vertices = vertices.concat([rBorderPoints[i + 1].x, rBorderPoints[i + 1].y, rBorderPoints[i + 1].z]);
		vertices = vertices.concat([lBorderPoints[i + 1].x, lBorderPoints[i + 1].y, lBorderPoints[i + 1].z]);

		index = index.concat([2 * i, 2 * i + 2, 2 * i + 3, 2 * i, 2 * i + 3, 2 * i + 1]);

		uvs = uvs.concat(1, (i + 1) / Math.max(lBorderPoints.length, rBorderPoints.length))
		uvs = uvs.concat(0, (i + 1) / Math.max(lBorderPoints.length, rBorderPoints.length))
	}

	if (lBorderPoints.length < rBorderPoints.length) {
1
		var lPoint = lBorderPoints[lBorderPoints.length - 1];

		var lIndex = lBorderPoints.length * 2 - 1;
		for (var i = 0; i < rBorderPoints.length - lBorderPoints.length; i++) {
			vertices = vertices.concat([rBorderPoints[lBorderPoints.length + i].x, rBorderPoints[lBorderPoints.length + i].y, rBorderPoints[lBorderPoints.length + i].z]);
			index = index.concat([lIndex, lIndex - 1, lIndex + i + 1]);

			uvs = uvs.concat(1, (lBorderPoints.length + i) / Math.max(lBorderPoints.length, rBorderPoints.length))
		}
	}

	if (lBorderPoints.length > rBorderPoints.length) {

		var rPoint = rBorderPoints[rBorderPoints.length - 1];
		
		var rIndex = rBorderPoints.length * 2 - 2;
		for (var i = 0; i < lBorderPoints.length - rBorderPoints.length; i++) {
			vertices = vertices.concat([lBorderPoints[rBorderPoints.length + i].x, lBorderPoints[rBorderPoints.length + i].y, lBorderPoints[rBorderPoints.length + i].z]);
			index = index.concat([rIndex, rIndex + 1 + i + 1, rIndex + 1 + i]);

			uvs = uvs.concat(1, (rBorderPoints.length + i) / Math.max(lBorderPoints.length, rBorderPoints.length))
		}
	}

	vertices = Float32Array.from(vertices);
	uvs = Float32Array.from(uvs);
	index = Uint32Array.from(index);
	// itemSize = 3 becuase there are 3 values (components) per vertex
	geometry.addAttribute('position', new THREE.BufferAttribute(vertices, 3));
	geometry.addAttribute('uv', new THREE.BufferAttribute(uvs, 2));
	geometry.setIndex(new THREE.BufferAttribute(index, 1));
	// geometry.computeVertexNormals();

	return geometry;
}

/*
* Helper for drawRoadMark - draw break marks
*
* lBorderPoints and rBorderPoints increase towards the same direction (+S), i.e. no reverse needed
*
* @Param lBorderPoints left border in +S
* @Param rBorderPoints right border in +S
* @Return THREE.BufferGeometry
*/
function createDiscontiniousMeshGeometry(lBorderPoints, rBorderPoints) {

	var dashPnts = 5;
	var gapPnts = 3;

	var geometry = new THREE.BufferGeometry();
	var vertices = [];

	for (var i = 0; i < Math.min(lBorderPoints.length, rBorderPoints.length) - 1; i++) {
 
		// 0 -- 1 -- 2 -- 3 -- 4 -- 5 xx 6 xx 7 xx 8 -- 9 ...
		if (i % (dashPnts + gapPnts) < dashPnts) {
			vertices = vertices.concat([rBorderPoints[i].x, rBorderPoints[i].y, rBorderPoints[i].z]);
			vertices = vertices.concat([rBorderPoints[i + 1].x, rBorderPoints[i + 1].y, rBorderPoints[i + 1].z]);
			vertices = vertices.concat([lBorderPoints[i + 1].x, lBorderPoints[i + 1].y, lBorderPoints[i + 1].z]);

			vertices = vertices.concat([rBorderPoints[i].x, rBorderPoints[i].y, rBorderPoints[i].z]);
			vertices = vertices.concat([lBorderPoints[i + 1].x, lBorderPoints[i + 1].y, lBorderPoints[i + 1].z]);
			vertices = vertices.concat([lBorderPoints[i].x, lBorderPoints[i].y, lBorderPoints[i].z]);
		}
	}

	vertices = Float32Array.from(vertices)
	// itemSize = 3 becuase there are 3 values (components) per vertex
	geometry.addAttribute('position', new THREE.BufferAttribute(vertices, 3));

	return geometry;
}

/*
* Helper function for paving - test iBorder or oBorder
*/
function generateCustomLine(points, color) {

	var geometry = new THREE.Geometry();
	geometry.vertices = points;
	var material = new THREE.MeshBasicMaterial({color: color != undefined ? color : 0x00FF00});
	var mesh = new THREE.Line(geometry, material);

	return  mesh;	
}

function drawCustomLine(points, color) {

	// var geometry = new THREE.Geometry();
	// geometry.vertices = points;
	// var material = new THREE.MeshBasicMaterial({color: color != undefined ? color : 0x00FF00});
	// var mesh = new THREE.Line(geometry, material);
	var mesh = generateCustomLine(points, color);
	scene.add(mesh);
}

/*
* Helper for Map.prototype.exportJSON
* NOTE: passing argumnent points is passed by ptr
*/
function reversePoints(points) {

	for (var i = 0; i < points.length / 2; i++) {
		var tmp = points[i];
		points[i] = points[points.length - 1 - i];
		points[points.length - i - 1] = tmp;
	}
}

function towgs84(point) {
	// console.log('Need to transform xyz to wgs84!');

	var result = {};
	result.lon = point.x;
	result.lat = point.y;
	result.z = point.z;

	var centerWGS84 = {lat: 30.334124384716247, lon: 121.240834693338};
	var centerMerc = proj4('EPSG:3857').forward([centerWGS84.lon, centerWGS84.lat]);	// if only one argument of proj4, it's transforming from wgs84
	// console.log(centerMerc);

	wgs84Coordinate = proj4('EPSG:3857').inverse([centerMerc[0] + point.x, centerMerc[1] + point.y]);
	// console.log(wgs84Coordinate);
	result.lon = wgs84Coordinate[0];
	result.lat = wgs84Coordinate[1];

	return result;
}

function track2Inertial(geometry, elevation, s, t, h) {
	// find x-y on central reference line in x-y plane
	
	var sOffset, tOffset, hdg, roll = 0, pitch = 0;
	var svector, tvector;
	var x, y, z = 0;
	
	sOffset = s - geometry.s;
	switch(geometry.type) {
		case 'line':
			hdg = geometry.heading;
			x = geometry.sx + sOffset * Math.cos(geometry.heading);
			y = geometry.sy + sOffset * Math.sin(geometry.heading);

			tOffset = t + cubicPolynomial(sOffset, geometry.offset.a, geometry.offset.b, geometry.offset.c, geometry.offset.d);

			break;
		case 'spiral':
			//generateSpiralPoints(length, elevationLateralProfile sx, sy, hdg, curvStart, curvEnd, ex, ey, lateralOffset, subOffset, subLength)
			var sample = generateSpiralPoints(geometry.length, null, geometry.sx, geometry.sy, geometry.heading, geometry.spiral.curvStart, geometry.spiral.curvEnd, geometry.offset, sOffset, geometry.length - sOffset);
			hdg = sample.heading[0];
			x = sample.points[0].x;
			y = sample.points[0].y;

			tOffset = t;	// lateral offset introduced by geometry's central line offset has been handled in generateSpiralPoints

			break;
		case 'arc':
			var curvature = geometry.arc.curvature;
			var radius = 1 / Math.abs(curvature);
			var rotation = geometry.heading - Math.sign(curvature) * Math.PI / 2;
			var theta = sOffset * curvature;
			hdg = geometry.heading + theta;
			x = geometry.sx - radius * Math.cos(rotation) + radius * Math.cos(rotation + theta);
			y = geometry.sy - radius * Math.sin(rotation) + radius * Math.sin(rotation + theta);
			
			tOffset = t + cubicPolynomial(sOffset, geometry.offset.a, geometry.offset.b, geometry.offset.c, geometry.offset.d);
			
			break;
	}

	z = cubicPolynomial(sOffset, elevation.a, elevation.b, elevation.c, elevation.d);
	var prez = cubicPolynomial(sOffset - 0.1, elevation.a, elevation.b, elevation.c, elevation.d);
	pitch = Math.atan((z - prez) / 0.1);

	// find x, y, z in s - t - h
	var svector = new THREE.Vector3(1, 0, 0);
	svector.applyAxisAngle(new THREE.Vector3(0, 0, 1), hdg);

	var tvector = svector.clone();
	tvector.cross(new THREE.Vector3(0, 0, -1));
	tvector.applyAxisAngle(svector, roll);

	var hvector = svector.clone();
	hvector.cross(tvector);

	tvector.multiplyScalar(tOffset);
	hvector.multiplyScalar(h);

	x += tvector.x + hvector.x;
	y += tvector.y + hvector.y;
	z += tvector.z + hvector.z;

	return {
		position: new THREE.Vector3(x, y, z),
		rotation: new THREE.Euler(roll, -pitch, hdg, 'XYZ')
	}
}

function generateDefaultSignMesh() {

	var poleRadius = 0.02;
	var poleHeight = 2;
	var signTopWidth = 0.7;
	var signTopHeight = 0.7;
	var signTopThickness = 0.01; 

	var geometry = new THREE.BoxBufferGeometry(signTopWidth, signTopThickness, signTopHeight);
	var material = new THREE.MeshBasicMaterial({color: 0x6F6F6F});
	var signTop = new THREE.Mesh(geometry, material);
	signTop.rotateY(-Math.PI / 4);
	signTop.position.set(0, -poleRadius - signTopThickness / 2, poleHeight - signTopHeight / 2);

	geometry = new THREE.BoxBufferGeometry(2*poleRadius, 2*poleRadius, poleHeight);
	var signPole = new THREE.Mesh(geometry, material);
	signPole.position.set(0, 0, poleHeight / 2);

	signTop.updateMatrixWorld();
	signPole.updateMatrixWorld();

	var sign = new THREE.Mesh();
	sign.add(signTop);
	sign.add(signPole);

	return sign;
}

function generateDefaultSignalMesh() {

	var poleRadius = 0.02;
	var poleHeight = 2;
	var signalBoxWidth = 0.2;
	var signalBoxDepth = 0.2;
	var signalBoxHeight = 0.8;
	var signalLightRadius = signalBoxHeight / 10;

	var geometry = new THREE.BoxBufferGeometry(signalBoxWidth, signalBoxDepth, signalBoxHeight);
	var material = new THREE.MeshBasicMaterial({color: 0x6F6F6F});
	var signalBox = new THREE.Mesh(geometry, material);
	signalBox.position.set(0, poleRadius - signalBoxDepth / 2, poleHeight - signalBoxHeight / 2);

	geometry = new THREE.BoxBufferGeometry(2*poleRadius, 2*poleRadius, poleHeight);
	var signalPole = new THREE.Mesh(geometry, material);
	signalPole.position.set(0, 0, poleHeight / 2);

	geometry = new THREE.CircleBufferGeometry(signalLightRadius, 32);
	material = new THREE.MeshBasicMaterial({color: 0xFF0000});
	var redLight = new THREE.Mesh(geometry, material);
	redLight.rotateX(Math.PI / 2);
	redLight.position.set(0, poleRadius - signalBoxDepth - 0.01, poleHeight - signalLightRadius * 2);
	//redLight.position.set(0, - signalBoxDepth / 2 - 0.01, signalBoxHeight / 2 - signalLightRadius * 2);
	
	material = new THREE.MeshBasicMaterial({color: 0xFFFF00});
	var yellowLight = new THREE.Mesh(geometry, material);
	yellowLight.rotateX(Math.PI / 2);
	yellowLight.position.set(0, poleRadius - signalBoxDepth - 0.01, poleHeight - signalLightRadius * 5);
	//yellowLight.position.set(0, - signalBoxDepth / 2 - 0.01, signalBoxHeight / 2 - signalLightRadius * 5);

	material = new THREE.MeshBasicMaterial({color: 0x00CD00, name: 'green'});
	var greenLight = new THREE.Mesh(geometry, material);
	greenLight.rotateX(Math.PI / 2);
	greenLight.position.set(0, poleRadius - signalBoxDepth - 0.01, poleHeight - signalLightRadius * 8);
	//greenLight.position.set(0, - signalBoxDepth / 2 - 1, signalBoxHeight / 2 - signalLightRadius * 8);

	signalBox.add(redLight);
	signalBox.add(yellowLight);
	signalBox.add(greenLight);

	signalBox.updateMatrixWorld();
	signalPole.updateMatrixWorld();
	
	var signal = new THREE.Mesh();
	signal.add(signalBox);
	signal.add(redLight);
	signal.add(yellowLight);
	signal.add(greenLight);
	signal.add(signalPole);

	return signal;
}

function saveFile(data, filename){
    if(!data) {
        //console.error('No data')
        return;
    }

    if(!filename) filename = 'console.json'

    if(typeof data === "object"){
        data = JSON.stringify(data, undefined, 4)
    }

    var blob = new Blob([data], {type: 'text/json'}),
        e    = document.createEvent('MouseEvents'),
        a    = document.createElement('a')

    a.download = filename
    a.href = window.URL.createObjectURL(blob)
    a.dataset.downloadurl =  ['text/json', a.download, a.href].join(':')
    e.initMouseEvent('click', true, false, window, 0, 0, 0, 0, 0, false, false, false, false, 0, null)
    a.dispatchEvent(e)
}

/*************************************************************
**			Additional functions added to lib				**
**************************************************************/
THREE.Mesh.prototype.dispose = function() {
	this.geometry.dispose();
	this.geometry = null;
	this.material.dispose();
	this.material = null;
	this.children.forEach(function(child) {child.dispose()});
	delete this;
}

dat.GUI.prototype.removeFolder = function(name) {
	var folder = this.__folders[name];
	if (!folder) {
		return;
	}
	folder.close();
	this.__ul.removeChild(folder.domElement.parentNode);
	delete this.__folders[name];
	this.onResize();
}

function test() {

	// Test Road and Lane class
	// roadData = MapBuilder.DefaultRoad();
	// road = new MapBuilder.Road(scene, roadData);
	// road.build();
	// road.refresh(roadData);

	var map = new MapBuilder.Map();
	var ui = new MapBuilder.UI(map);
}

function generateCrossing() {
	var width = 7;
	var radius = 8;
	var straightLength = 500;

	// straight line in/out crossing
	var roadDataEast = {
		geometry: [{
			s: 0,
			type: 'line',
			sx: radius + width / 2,
			sy: 0,
			heading: 0,
			length: straightLength,
			offset: {a: 0, b: 0, c: 0, d: 0}
		}],
		laneSection: [{
			s: 0,
			lane: [
				{
					id: 1,
					width: {s: 0, a: 3.5, b: 0, c: 0, d: 0},
					roadMark: {type: 'solid', weight: 'standard', color: 'standard', width: 0.13}
				},
				{
					id: 0,
					roadMark: {type: 'broken', weight: 'standard', color: 'standard', width: 0.13}
				},
				{
					id: -1,
					width: {s: 0, a: 3.5, b: 0, c: 0, d: 0},
					roadMark: {type: 'solid', weight: 'standard', color: 'standard', width: 0.13}
				}
			]
		}],
		signals: []
	}

	var roadDataSouth = {
		geometry: [{
			s: 0,
			type: 'line',
			sx: 0,
			sy: -1 * (radius + width / 2),
			heading: -Math.PI / 2,
			length: straightLength,
			offset: {a: 0, b: 0, c: 0, d: 0}
		}],
		laneSection: [{
			s: 0,
			lane: [
				{
					id: 1,
					width: {s: 0, a: 3.5, b: 0, c: 0, d: 0},
					roadMark: {type: 'solid', weight: 'standard', color: 'standard', width: 0.13}
				},
				{
					id: 0,
					roadMark: {type: 'broken', weight: 'standard', color: 'standard', width: 0.13}
				},
				{
					id: -1,
					width: {s: 0, a: 3.5, b: 0, c: 0, d: 0},
					roadMark: {type: 'solid', weight: 'standard', color: 'standard', width: 0.13}
				}
			]
		}],
		signals: []
	}

	var roadDataWest = {
		geometry: [{
			s: 0,
			type: 'line',
			sx: -1 * (radius + width / 2),
			sy: 0,
			heading: Math.PI,
			length: straightLength,
			offset: {a: 0, b: 0, c: 0, d: 0}
		}],
		laneSection: [{
			s: 0,
			lane: [
				{
					id: 1,
					width: {s: 0, a: 3.5, b: 0, c: 0, d: 0},
					roadMark: {type: 'solid', weight: 'standard', color: 'standard', width: 0.13}
				},
				{
					id: 0,
					roadMark: {type: 'broken', weight: 'standard', color: 'standard', width: 0.13}
				},
				{
					id: -1,
					width: {s: 0, a: 3.5, b: 0, c: 0, d: 0},
					roadMark: {type: 'solid', weight: 'standard', color: 'standard', width: 0.13}
				}
			]
		}],
		signals: []
	}

	var roadDataNorth = {
		geometry: [{
			s: 0,
			type: 'line',
			sx: 0,
			sy: radius + width / 2,
			heading: Math.PI / 2,
			length: straightLength,
			offset: {a: 0, b: 0, c: 0, d: 0}
		}],
		laneSection: [{
			s: 0,
			lane: [
				{
					id: 1,
					width: {s: 0, a: 3.5, b: 0, c: 0, d: 0},
					roadMark: {type: 'solid', weight: 'standard', color: 'standard', width: 0.13}
				},
				{
					id: 0,
					roadMark: {type: 'broken', weight: 'standard', color: 'standard', width: 0.13}
				},
				{
					id: -1,
					width: {s: 0, a: 3.5, b: 0, c: 0, d: 0},
					roadMark: {type: 'solid', weight: 'standard', color: 'standard', width: 0.13}
				}
			]
		}],
		signals: []
	}

	// arc in the crossing - all arc starts from horizontal to vertical
	var roadDataNorthEast = {
		geometry: [{
			s: 0,
			type: 'arc',
			sx: radius + width / 2,
			sy: width / 2,
			heading: Math.PI,
			length: Math.PI / 2 * radius,
			arc: {curvature: -1 / radius},
			offset: {a: 0, b: 0, c: 0, d: 0}
		}],
		laneSection: [{
			s: 0,
			lane: [
				{
					id: 0,
					roadMark: {type: 'solid', weight: 'standard', color: 'standard', width: 0.13}
				}
			]
		}],
		signals: []
	}

	var roadDataSouthEast = {
		geometry: [{
			s: 0,
			type: 'arc',
			sx: radius + width / 2,
			sy: -width / 2,
			heading: Math.PI,
			length: Math.PI / 2 * radius,
			arc: {curvature: 1 / radius},
			offset: {a: 0, b: 0, c: 0, d: 0}
		}],
		laneSection: [{
			s: 0,
			lane: [
				{
					id: 0,
					roadMark: {type: 'solid', weight: 'standard', color: 'standard', width: 0.13}
				}
			]
		}],
		signals: []
	}

	var roadDataSouthWest = {
		geometry: [{
			s: 0,
			type: 'arc',
			sx: -1 * (radius + width / 2),
			sy: -width / 2,
			heading: 0,
			length: Math.PI / 2 * radius,
			arc: {curvature: -1 / radius},
			offset: {a: 0, b: 0, c: 0, d: 0}
		}],
		laneSection: [{
			s: 0,
			lane: [
				{
					id: 0,
					roadMark: {type: 'solid', weight: 'standard', color: 'standard', width: 0.13}
				}
			]
		}],
		signals: []
	}

	var roadDataNorthWest = {
		geometry: [{
			s: 0,
			type: 'arc',
			sx: -1 * (radius + width / 2),
			sy: width / 2,
			heading: 0,
			length: Math.PI / 2 * radius,
			arc: {curvature: 1 / radius},
			offset: {a: 0, b: 0, c: 0, d: 0}
		}],
		laneSection: [{
			s: 0,
			lane: [
				{
					id: 0,
					roadMark: {type: 'solid', weight: 'standard', color: 'standard', width: 0.13}
				}
			]
		}],
		signals: []
	}

	var map = new MapBuilder.Map();
	map.build();

	var roadEast = new MapBuilder.Road(map.mesh, roadDataEast);
	roadEast.build();
	map.roads.push(roadEast);
	var roadSouth = new MapBuilder.Road(map.mesh, roadDataSouth);
	roadSouth.build();
	map.roads.push(roadSouth);
	var roadWest = new MapBuilder.Road(map.mesh, roadDataWest);
	roadWest.build();
	map.roads.push(roadWest);
	var roadNorth = new MapBuilder.Road(map.mesh, roadDataNorth);
	roadNorth.build();
	map.roads.push(roadNorth);

	var roadNE = new MapBuilder.Road(map.mesh, roadDataNorthEast);
	roadNE.build();
	map.roads.push(roadNE);
	var roadSE = new MapBuilder.Road(map.mesh, roadDataSouthEast);
	roadSE.build();
	map.roads.push(roadSE);
	var roadSW = new MapBuilder.Road(map.mesh, roadDataSouthWest);
	roadSW.build();
	map.roads.push(roadSW);
	var roadNW = new MapBuilder.Road(map.mesh, roadDataNorthWest);
	roadNW.build();
	map.roads.push(roadNW);
	
	// map.exportJSON();
}

function generateCrossingNoCurve() {
	var width = 6;
	var straightLength = 100 - width / 2;

	// straight line in/out crossing
	var roadDataEast = {
		geometry: [{
			s: 0,
			type: 'line',
			sx: width / 2,
			sy: 0,
			heading: 0,
			length: straightLength,
			offset: {a: width / 2, b: 0, c: 0, d: 0}
		}],
		laneSection: [{
			s: 0,
			lane: [
				{
					id: 0,
					roadMark: {type: 'solid', weight: 'standard', color: 'standard', width: 0.13}
				},
				{
					id: -1,
					width: {s: 0, a: 6, b: 0, c: 0, d: 0},
					roadMark: {type: 'solid', weight: 'standard', color: 'standard', width: 0.13}
				}
			]
		}],
		signals: [],
		objects: [],
	}

	var roadDataSouth = {
		geometry: [{
			s: 0,
			type: 'line',
			sx: 0,
			sy: -width / 2,
			heading: -Math.PI / 2,
			length: straightLength,
			offset: {a: width / 2, b: 0, c: 0, d: 0}
		}],
		laneSection: [{
			s: 0,
			lane: [
				{
					id: 0,
					roadMark: {type: 'solid', weight: 'standard', color: 'standard', width: 0.13}
				},
				{
					id: -1,
					width: {s: 0, a: 6, b: 0, c: 0, d: 0},
					roadMark: {type: 'solid', weight: 'standard', color: 'standard', width: 0.13}
				}
			]
		}],
		signals: [],
		objects: [],
	}

	var roadDataWest = {
		geometry: [{
			s: 0,
			type: 'line',
			sx: -width / 2,
			sy: 0,
			heading: Math.PI,
			length: straightLength,
			offset: {a: width / 2, b: 0, c: 0, d: 0}
		}],
		laneSection: [{
			s: 0,
			lane: [
				{
					id: 0,
					roadMark: {type: 'solid', weight: 'standard', color: 'standard', width: 0.13}
				},
				{
					id: -1,
					width: {s: 0, a: 6, b: 0, c: 0, d: 0},
					roadMark: {type: 'solid', weight: 'standard', color: 'standard', width: 0.13}
				}
			]
		}],
		signals: [],
		objects: [
			{
				s: 10,
				t: 0.38,
				length: 20,
				width: 0.76,
				height: 2
			},
		],
	}

	var roadDataNorth = {
		geometry: [{
			s: 0,
			type: 'line',
			sx: 0,
			sy: width / 2,
			heading: Math.PI / 2,
			length: straightLength,
			offset: {a: width / 2, b: 0, c: 0, d: 0}
		}],
		laneSection: [{
			s: 0,
			lane: [
				{
					id: 0,
					roadMark: {type: 'solid', weight: 'standard', color: 'standard', width: 0.13}
				},
				{
					id: -1,
					width: {s: 0, a: 6, b: 0, c: 0, d: 0},
					roadMark: {type: 'solid', weight: 'standard', color: 'standard', width: 0.13}
				}
			]
		}],
		signals: [],
		objects: [],
	}

	var map = new MapBuilder.Map();
	map.build();

	var roadEast = new MapBuilder.Road(map.mesh, roadDataEast);
	roadEast.build();
	map.roads.push(roadEast);
	var roadSouth = new MapBuilder.Road(map.mesh, roadDataSouth);
	roadSouth.build();
	map.roads.push(roadSouth);
	var roadWest = new MapBuilder.Road(map.mesh, roadDataWest);
	roadWest.build();
	map.roads.push(roadWest);
	var roadNorth = new MapBuilder.Road(map.mesh, roadDataNorth);
	roadNorth.build();
	map.roads.push(roadNorth);

	map.exportJSON();
}

function generateCircle() {
	// Default circle start from heading 0 in editor, need to set the center of circle at (R, 0, 0) instead of (0, R, 0)
	var radius = 30;
	var arcLength = 2 * Math.PI * radius;
	var heading = -Math.PI / 2;
	var curvature = 1 / radius;

	var roadData = {
		geometry: [{
			s: 0,
			type: 'arc',
			sx: 0,
			sy: 0,
			heading: heading,
			length: arcLength,
			arc: {curvature: curvature},
			offset: {a: 0, b: 0, c: 0, d: 0}
		}],
		laneSection: [{
			s: 0,
			lane: [
				{
					id: 1,
					width: {s: 0, a: 3.5, b: 0, c: 0, d: 0},
					roadMark: {type: 'solid', weight: 'standard', color: 'standard', width: 0.13}
				},
				{
					id: 0,
					roadMark: {type: 'broken', weight: 'standard', color: 'standard', width: 0.13}
				},
				{
					id: -1,
					width: {s: 0, a: 3.5, b: 0, c: 0, d: 0},
					roadMark: {type: 'solid', weight: 'standard', color: 'standard', width: 0.13}
				}
			]
		}],
		signals: [],
		objects: [],
	}

	var map = new MapBuilder.Map();
	map.build();

	var road = new MapBuilder.Road(map.mesh, roadData);
	road.build();
	map.roads.push(road);

	map.exportJSON();

}

function buildFromFile() {

	var file = '../data/test.xodr';
	var roads = parseXML(file).roads;
	
	var map = new MapBuilder.Map();
	map.build();

	for (var id in roads) {
		var roadData = roads[id];
		if (!roadData.geometry[0].offset) roadData.geometry[0].offset = {a:0, b:0, c:0, d:0};
		var road = new MapBuilder.Road(map.mesh, roadData);
		console.log(road)
		road.build();
		map.roads.push(road);
	}
}

test();
// generateCrossing();
// generateCrossingNoCurve();
// generateCircle();
// buildFromFile();