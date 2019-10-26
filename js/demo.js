var scene, camera, renderer;
var container, stats;
var step = 1; // generate point in step 1m for spiral curve, later apply to arc generation

var group = {road: [], roadMark: [], referenceLine: [], signal: []};	// remember added mesh for GUI to hide mesh
var roadsMesh = {};		// store mesh of road only by road Id, use for generating bb and exporting to .obj by road
var targetEngineMatrix = new THREE.Matrix3();	// make sure the target engine's axis is coherent with openDirve's

var map;
//var map = parseXML("../data/Crossing8Course.xodr");
//var map = parseXML("../data/CrossingComplex8Course.xodr");	// lane lateral shift cause incontinious
//var map = parseXML("../data/Roundabout8Course.xodr");			// error - taken as a rare case when spiral ends a geometry
//var map = parseXML("../data/CulDeSac.xodr");
//var map = parseXML("../data/Country.xodr");					// dead loop due to extremly short E-14 laneSection length, when generating cubic points using for loop
//var map = parseXML("../data/test.xodr");

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

	/** Setting up GUI */
	initGUI();

	if (map) test();
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
				if (roadMarkNodes.length) roads[id].laneSection[j].lane[k].roadMark = [];		

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

					roads[id].laneSection[j].lane[k].roadMark[l] = {};
					roads[id].laneSection[j].lane[k].roadMark[l].sOffset = parseFloat(roadMarkNode.getAttribute('sOffset'));
					roads[id].laneSection[j].lane[k].roadMark[l].type = roadMarkNode.getAttribute('type');
					roads[id].laneSection[j].lane[k].roadMark[l].weight = roadMarkNode.getAttribute('weight');
					roads[id].laneSection[j].lane[k].roadMark[l].color = roadMarkNode.getAttribute('color');
					roads[id].laneSection[j].lane[k].roadMark[l].material = roadMarkNode.getAttribute('material');
					roads[id].laneSection[j].lane[k].roadMark[l].width = parseFloat(roadMarkNode.getAttribute('width'));
					roads[id].laneSection[j].lane[k].roadMark[l].laneChange = roadMarkNode.getAttribute('laneChange') ? roadMarkNode.getAttribute('laneChange') : "both";
					roads[id].laneSection[j].lane[k].roadMark[l].height = parseFloat(roadMarkNode.getAttribute('height') ? roadMarkNode.getAttribute('height') : "0");
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
		if (signalNodes.length) roads[id].signal = [];

		for (var j=0; j < signalNodes.length; j++) {

			var signalNode = signalNodes[j];
			// road may contain a signalId the same as one in another road (but shouldn't), re-assemble signalId as roadId.signalId if no name entry provided
			var signalId = signalNode.id;
			var name = signalNode.getAttribute('name');
			if (name.trim() == "") signalId = id + '.' + signalId;

			// road only refer to signal id
			roads[id].signal.push(signalId);

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

function parseJSON(jsonFile) {

	// Chrome
	xmlHttp = new window.XMLHttpRequest();
	xmlHttp.open("GET", jsonFile, false);
	xmlHttp.overrideMimeType('application/json');
	xmlHttp.send(null);
	jsonDoc = xmlHttp.responseText;

	return JSON.parse(jsonDoc);
}

/*
* Find the successor geometry's start, as the actual end point of current geometry
*
* @Param road the road that possess current geometry
* @Param geometryId the index of current geometry in the road.geometry array
* @Return {ex, ey} the actual end point in x-y planeMaterial - if return Vector2, ex ey == null will generate a point (0, 0) (Vector2's contructor default)
*/
function getGeometryEndPosition(road, geometryId) {

	var ex = null;
	var ey = null;

	if (geometryId < road.geometry.length - 1) {

		ex = road.geometry[geometryId + 1].x;
		ey = road.geometry[geometryId + 1].y;

	} else if (road.successor) {
		// geometryId is already the end of the road
		/** NOTE: 
			- A road's successor may be a junction, but in this situtation, the geometry must be a line
			without offset curve (not sure if there can be a offset.a), can ignore the ex, ey when paving;
			- Besides, if a road is isolated witout a successor, ex, ey is also OK to ignore.
		 */
		if (road.successor.elementType == 'road') {

			var nextGeometry = map.roads[road.successor.elementId].geometry[0];
			if (road.successor.contactPoint == 'start') {
				ex = nextGeometry.x;
				ey = nextGeometry.y;
			} else if (road.successor.contactPoint == 'end') {
				
			} else {
				throwError('invalid road successor contactPoint');
			}
			
		}
	}

	return {ex: ex, ey: ey};
}

/*
* Sub-Diveide a road's geometries based on road laneOffset record
*
* NOTE: POTENTIAL BUG EXITS! (only works when laneOffset happens only on 'line' geometry) - added, but not tested yet
*
* @Param road
* @Return geometries array of sub-divided geometries of the road
*/
function subDivideRoadGeometry(road) {

 	if (!road.laneOffset) {
		return road.geometry;
	}

	var geometries = road.geometry;
	var newGeometries = [];

	var laneOffsetId = 0;
	for (var i = 0; i < geometries.length; i++) {

		var geometry = geometries[i];
		var foundHead = false;
	
		if (geometry.type != 'line') {
			console.warn('Divide Lane Offset geometry error: not surpport laneOffset on spiral or arc yet');
			//newGeometries.push(geometry);
			//continue;
		}

		for (var j = laneOffsetId; j < road.laneOffset.length; j++) {

			var laneOffset = road.laneOffset[j];
			var nextLaneOffsetS = road.laneOffset[j + 1] ? road.laneOffset[j + 1].s : geometries[geometries.length - 1].s + geometries[geometries.length - 1].length;

			if (geometry.s + geometry.length <= laneOffset.s) {

				if (!foundHead)
					newGeometries.push(geometry);
				break;

			} else if (laneOffset.s > geometry.s) {

				if (!foundHead) {
					foundHead = true;
					var subGeometry1 = {};
					subGeometry1.s = geometry.s;
					subGeometry1.hdg = geometry.hdg;
					subGeometry1.type = geometry.type;
					subGeometry1.length = laneOffset.s - geometry.s;
					subGeometry1.x = geometry.x;
					subGeometry1.y = geometry.y;

					if (geometry.type == 'spiral') {
						subGeometry1.spiral = {};
						subGeometry1.spiral.curvStart = geometry.spiral.curvStart;
						subGeometry1.spiral.curvEnd = geometry.spiral.curvStart + subGeometry1.length * (geometry.spiral.curvEnd - geometry.spiral.curvStart) / geometry.length;
					}

					if (geometry.type == 'arc') {
						subGeometry1.arc = {curvature: geometry.arc.curvature};
					}

					newGeometries.push(subGeometry1);
				}
				
				var subGeometry2 = {};
				subGeometry2.s = laneOffset.s;				
				subGeometry2.type = geometry.type;
				subGeometry2.length = Math.min(geometry.s + geometry.length, nextLaneOffsetS) - laneOffset.s;

				if (geometry.type == 'line') {
					subGeometry2.hdg = geometry.hdg;
					subGeometry2.x = geometry.x + (laneOffset.s - geometry.s) * Math.cos(geometry.hdg);
					subGeometry2.y = geometry.y + (laneOffset.s - geometry.s) * Math.sin(geometry.hdg);
				}

				if (geometry.type == 'spiral') {
					// since subdivide happens before preProcessing, no ex, ey is available for fixing errors, thus introducing errors if split on spiral
					var sample = generateSpiralPoints(geometry.length, null, null, geometry.x, geometry.y, geometry.hdg, geometry.spiral.curvStart, geometry.spiral.curvEnd, null, null, null, laneOffset.s - geometry.s, geometry.length - laneOffset.s + geometry.s);
					subGeometry2.hdg = sample.heading[0];
					subGeometry2.x = sample.points[0].x;
					subGeometry2.y = sample.points[0].y;
					subGeometry2.spiral = {};
					subGeometry2.spiral.curvStart = geometry.spiral.curvStart + (laneOffset.s - geometry.s) * (geometry.spiral.curvEnd - geometry.spiral.curvStart) / geometry.length;
					subGeometry2.spiral.curvEnd = geometry.spiral.curvStart + (subGeometry2.length + laneOffset.s - geometry.s) * (geometry.spiral.curvEnd - geometry.spiral.curvStart) / geometry.length;
				}

				if (geometry.type == 'arc') {
					var curvature = geometry.arc.curvature;
					var radius = 1 / Math.abs(curvature);
					var rotation = geometry.hdg - Math.sign(curvature) * Math.PI / 2;
					var theta = (laneOffset.s - geometry.s) * curvature;
					subGeometry2.hdg = geometry.hdg + theta;
					subGeometry2.x = geometry.x - radius * Math.cos(rotation) + radius * Math.cos(rotation + theta);
					subGeometry2.y = geometry.y - radius * Math.sin(rotation) + radius * Math.sin(rotation + theta); 
				}

				if (laneOffset.a != 0 || laneOffset.b != 0 || laneOffset.c != 0 || laneOffset.d != 0) {
					subGeometry2.offset = {};
					subGeometry2.offset.a = laneOffset.a;
					subGeometry2.offset.b = laneOffset.b;
					subGeometry2.offset.c = laneOffset.c;
					subGeometry2.offset.d = laneOffset.d;
				}

				newGeometries.push(subGeometry2);
				// current LaneOffsetId is done
				if (nextLaneOffsetS <= geometry.s + geometry.length) laneOffsetId++;

			} else if (laneOffset.s == geometry.s){

				if (!foundHead) foundHead = true;

				var subGeometry = {};
				subGeometry.s = geometry.s;
				subGeometry.hdg = geometry.hdg;
				subGeometry.type = geometry.type;
				subGeometry.length = Math.min(geometry.s + geometry.length, nextLaneOffsetS) - laneOffset.s;
				subGeometry.x = geometry.x;
				subGeometry.y = geometry.y;

				if (geometry.type == 'spiral') {
					subGeometry.spiral = {};
					subGeometry.spiral.curvStart = geometry.spiral.curvStart;
					subGeometry.spiral.curvEnd = geometry.spiral.curvStart + subGeometry.length * (geometry.spiral.curvEnd - geometry.spiral.curvStart) / geometry.length;
				}

				if (geometry.type == 'arc') {
					subGeometry.arc = {curvature: geometry.arc.curvature};
				}

				if (laneOffset.a != 0 || laneOffset.b != 0 || laneOffset.c != 0 || laneOffset.d != 0) {
					subGeometry.offset = {};
					subGeometry.offset.a = laneOffset.a;
					subGeometry.offset.b = laneOffset.b;
					subGeometry.offset.c = laneOffset.c;
					subGeometry.offset.d = laneOffset.d;
				}

				newGeometries.push(subGeometry);
				// current LaneOffsetId is done
				if (nextLaneOffsetS <= geometry.s + geometry.length) laneOffsetId++;

			} else if (laneOffset.s < geometry.s && nextLaneOffsetS > geometry.s) {

				if (!foundHead) {
					foundHead = true;
					var subGeometry1 = {};
					subGeometry1.s = geometry.s;
					subGeometry1.hdg = geometry.hdg;
					subGeometry1.type = geometry.type;
					subGeometry1.length = Math.min(geometry.s + geometry.length, nextLaneOffsetS) - geometry.s;
					subGeometry1.x = geometry.x;
					subGeometry1.y = geometry.y;

					if (geometry.type == 'spiral') {
						subGeometry1.spiral = {};
						subGeometry1.spiral.curvStart = geometry.spiral.curvStart;
						subGeometry1.spiral.curvEnd = geometry.spiral.curvStart + subGeometry1.length * (geometry.spiral.curvEnd - geometry.spiral.curvStart) / geometry.length;
					}

					if (geometry.type == 'arc') {
						subGeometry1.arc = {curvature: geometry.arc.curvature};
					}

					if (laneOffset.a != 0 || laneOffset.b != 0 || laneOffset.c != 0 || laneOffset.d != 0) {
						var sOffset = geometry.s - laneOffset.s;
						subGeometry1.offset = {};
						subGeometry1.offset.a = laneOffset.a + laneOffset.b * sOffset + laneOffset.c * Math.pow(sOffset, 2) + laneOffset.d * Math.pow(sOffset, 3);
						subGeometry1.offset.b = laneOffset.b + 2 * laneOffset.c * sOffset + 3 * laneOffset.d * Math.pow(sOffset, 2);
						subGeometry1.offset.c = laneOffset.c + 3 * laneOffset.d * sOffset;
						subGeometry1.offset.d = laneOffset.d;
						
					}

					newGeometries.push(subGeometry1);
				}

				if (nextLaneOffsetS <= geometry.s + geometry.length) laneOffsetId++;
				
			} else {
				break;
			}
		}

	}

	return newGeometries;
}

/*
* Pre-process each road's geometry entries based on laneOffset, making sure in each geometry, there is only one kind of laneOffset
* @Param road
*/
function preProcess(road) {

	// make road.length and geometry entries corespondent
	road.length = Math.min(road.length, road.geometry[road.geometry.length - 1].s + road.geometry[road.geometry.length - 1].length);

	road.geometry = subDivideRoadGeometry(road);

	// assign central reference line's position 
	// and end position for each sub-devided geometry
	for (var j=0; j < road.geometry.length; j++) {
		var geometry = road.geometry[j];
		var endPosition = getGeometryEndPosition(road, j);
		geometry.ex = endPosition.ex;
		geometry.ey = endPosition.ey;
		geometry.centralX = geometry.x;
		geometry.centralY = geometry.y;		
	}
}

function preProcessAll(roads) {

	for (var id in roads) {
		preProcess(roads[id]);
	}
}

function createLine(length, elevationLateralProfile, hOffset, sx, sy, hdg) {

	var material = new THREE.MeshBasicMaterial({color: 0xFF0000});
	var x, y, z;
	var elevations, superelevations, crossfalls;

	if (elevationLateralProfile) {
		elevations = elevationLateralProfile.elevations;
		superelevations = elevationLateralProfile.superelevations;
		crossfalls = elevationLateralProfile.crossfalls;
	}

	var points = [];
	
	if (!elevations)
		elevations = [{s: 0, a: 0, b: 0, c: 0, d: 0}];
	else if (elevations.length == 0)
		elevations = [{s: 0, a: 0, b: 0, c: 0, d: 0}];

	var s0 = elevations[0].s;
	for (var i = 0; i < elevations.length; i++) {

		var s = elevations[i].s;
		var nextS = elevations[i + 1] ? elevations[i + 1].s : s0 + length;
		var elevationLength = nextS - s;

		var ds = 0;

		do {
			if (ds > elevationLength || Math.abs(ds - elevationLength) < 1E-4) ds = elevationLength;
			
			x = sx + (s + ds - s0) * Math.cos(hdg);
			y = sy + (s + ds - s0) * Math.sin(hdg);
			z = cubicPolynomial(ds, elevations[i].a, elevations[i].b, elevations[i].c, elevations[i].d);

			points.push(new THREE.Vector3(x, y, z));

			ds += step;
		} while (ds < elevationLength + step);
	}

	var geometry = new THREE.Geometry();
	geometry.vertices = points;

	var line = new THREE.Line(geometry, material);
	
	return line;
}

/*
* Create sample points ane heading of an Eular-Spiral connecting points (sx, sy) to (ex, ey)
*
* @Param length length of the curve
* @Param elevationLateralProfile covered by the whole geometry, including the height curve, superelevation angle around central reference line, crossfall angle relative to t-axis of the spiral
* @Param heights array of {s, height} the height offset array from track level (for lane height, not allowed for central lane)
* @Param sx, sy the starting point of the spiral
* @Param hdg heading direction (rotation of z axis) at start of the road
* @Param curvStart the curvature at the starting point - obslete (can delete)
* @Param curvEnd curvature of the ending point
* @Param ex, ey the ending point of the spiral
* @Param lateralOffset {a, b, c, d} cubic polynomial coeffients of offset away from central clothoid (used to draw paralell curve to clothoid)
*
* NOTE: the following two pameters are only used when drawing road marks (multiple marks on geometry spiral), and spliting geometry on spiral to get new geometry's connecting start xy position and end xy position
*
* @Param subOffset given the paramters of a whole segment of Eular-Spiral, the sub-segment's start sOffset from the start of the spiral (sx, sy)
* @Param subLength given the parameters of a while segment of Eular-Spiral, the sub-segemetn's run-through length
*
* @Return sample points and heading for each sample points (returned heading is used only in split geometry on spiral in getGeometry function)
*/
function generateSpiralPoints(length, elevationLateralProfile, heights, sx, sy, hdg, curvStart, curvEnd, ex, ey, lateralOffset, subOffset, subLength) {

	var points = [];
	var heading = [];
	var tOffset = [];
	var sOffset = [];	// sOffset from the beginning of the curve
	var k = (curvEnd - curvStart) / length;
	var elevations, superelevations, crossfalls;

	if (elevationLateralProfile) {
		elevations = elevationLateralProfile.elevations;
		superelevations = elevationLateralProfile.superelevations;
		crossfalls = elevationLateralProfile.crossfalls;
	}

	var theta = hdg; 	// current heading direction

	if (!elevations)
		elevations = [{s: 0, a: 0, b: 0, c: 0, d: 0}];
	if (!superelevations)
		superelevations = [{s: 0, a: 0, b: 0, c: 0, d: 0}];
	if (!crossfalls)
		crossfalls = [{s: 0, a: 0, b: 0, c: 0, d: 0}];

	if (!heights)
		heights = [{s: 0, height: 0}];
	else if (heights.length == 0)
		heights = [{s: 0, height: 0}];

	// s ranges between [0, length]
	var s = 0;
	var preS = 0;
	var elevationS0 = elevations[0].s;
	
	var point, x, y, z;

	for (var i = 0; i < elevations.length; i++) {

		var elevationS = elevations[i].s;
		var nextElevationS = elevations[i + 1] ? elevations[i + 1].s : elevationS0 + length;
		var elevationLength = nextElevationS - elevationS;

		
		var elevationSOffset = elevationS - elevationS0;

		s = elevationSOffset;
		do {

			if (s == 0) {
				points.push(new THREE.Vector3(sx, sy, elevations[0].a));
				heading.push(theta);
				if (lateralOffset) tOffset.push(lateralOffset.a);
				sOffset.push(s);
				s += step;
				continue;
			}

			if (s > elevationSOffset + elevationLength || Math.abs(s - elevationSOffset - elevationLength) < 1E-4) {

				if (Math.abs(elevationSOffset + elevationLength - length) < 1E-4) {
					// if elevation seg reaches the end of the whole spiral, calculate it
					s = elevationSOffset + elevationLength;
				} else {
					// else ends current elevation segment, the next elevation segment's start will be the end of this one
					s += step;
					break;
				}
			}

			var curvature = (s + preS) * 0.5 * k + curvStart;
			var prePoint = points[points.length - 1];
			
			x = prePoint.x + (s - preS) * Math.cos(theta + curvature * (s - preS) / 2);
			y = prePoint.y + (s - preS) * Math.sin(theta + curvature * (s - preS) / 2);
			z = cubicPolynomial(s - elevationSOffset, elevations[i].a, elevations[i].b, elevations[i].c, elevations[i].d);

			theta += curvature * (s - preS);
			preS = s;
			s += step;
			
			points.push(new THREE.Vector3(x, y, z));
			heading.push(theta);
			if (lateralOffset) tOffset.push(cubicPolynomial(preS, lateralOffset.a, lateralOffset.b, lateralOffset.c, lateralOffset.d));
			sOffset.push(preS);

		} while (s < elevationSOffset + elevationLength + step);
	}

	// fix the error by altering the end point to he connecting road's start
	if (typeof ex == 'number' && typeof ey == 'number') {

		var delta = new THREE.Vector3(ex - points[points.length - 1].x, ey - points[points.length - 1].y, 0);
		points[points.length - 1].x = ex;
		points[points.length - 1].y = ey;

		var lastStep = points[points.length - 1].distanceTo(points[points.length - 2]);
		// distrubte error across sample points for central clothoid 		
		for (var i = points.length - 2; i > 0; i--) {
			points[i].x += delta.x * sOffset[i] / length;
			points[i].y += delta.y * sOffset[i] / length;
		}
	}

	// apply lateralOffset if any
	if (lateralOffset) {

		var svector, tvector, hvector;

		var superelevationIndex = 0;
		var crossfallIndex = 0;
		var heightIndex = 0;
		var superelevation = superelevations[superelevationIndex];
		var nextSuperElevation = superelevations[superelevationIndex + 1] || {s: elevationS0 + length};
		var crossfall = crossfalls[crossfallIndex];
		var nextCrossfall = crossfalls[crossfallIndex + 1] || {s: elevationS0 + length};
		var height = heights[heightIndex];
		var nextHeight = heights[heightIndex + 1] || {s: elevationS0 + length};

		// shift points at central clothoid by tOffset to get the parallel curve points
		for (var i = 0; i < points.length; i++) {

			var point = points[i];
			var currentHeading = heading[i];
			var t = tOffset[i];
			var ds = sOffset[i];

			// make sure no over flow happens for superelevations and crossfalls - should not be, since sOffset won't exceeds length
			if (nextSuperElevation.s <= ds + elevationS0 || Math.abs(nextSuperElevation.s - ds - elevationS0) < 1E-4) {

				// if not reaches the end of the cubic line yet
				if (elevationS0 + length - nextSuperElevation.s >= 1E-4) {
					superelevationIndex++;
					superelevation = superelevations[superelevationIndex];
					nextSuperElevation = superelevations[superelevationIndex + 1] || {s: elevationS0 + length};				
				}
			}

			if (nextCrossfall.s <= ds + elevationS0 || Math.abs(nextCrossfall.s - ds - elevationS0) < 1E-4) {

				// if not reaches the end of the cubic line yet
				if (elevationS0 + length - nextCrossfall.s >= 1E-4) {
					crossfallIndex++;
					crossfall = crossfalls[crossfallIndex];
					nextCrossfall = crossfalls[crossfallIndex + 1] || {s: elevationS0 + length};
				}
			}

			if (nextHeight.s <= ds + elevationS0 || Math.abs(nextHeight.s - ds - elevationS0) < 1E-4) {

				// if not reaches the end of the cubic line yet
				if (elevationS0 + length - nextHeight.s >= 1E-4) {
					heightIndex++;
					height = heights[heightIndex];
					nextHeight = heights[heightIndex + 1] || {s: elevationS0 + length};
				}
			}

			svector = new THREE.Vector3(1, 0, 0);
			svector.applyAxisAngle(new THREE.Vector3(0, 0, 1), currentHeading);
			tvector = svector.clone();
			tvector.cross(new THREE.Vector3(0, 0, -1));

			if (t != 0) {
				var superelevationAngle = cubicPolynomial(ds + elevationS0 - superelevation.s, superelevation.a, superelevation.b, superelevation.c, superelevation.d);
				var crossfallAngle = cubicPolynomial(ds + elevationS0 - crossfall.s, crossfall.a, crossfall.b, crossfall.c, crossfall.d);

				tvector.applyAxisAngle(svector, superelevationAngle);

				if (!((t > 0 && crossfall.side == 'right') || (t < 0 && crossfall.side == 'left'))) {
					// Positive crossfall results in a road surface "falling" from the reference line to the outer boundary
					//tvector.applyAxisAngle(svector, crossfallAngle * (- Math.sign(t)));
				}
			}

			hvector = svector.clone();
			hvector.cross(tvector);

			tvector.multiplyScalar(t);
			hvector.multiplyScalar(height.height);

			point.x += tvector.x + hvector.x;
			point.y += tvector.y + hvector.y;
			point.z += tvector.z + hvector.z;
		}
	}

	// if  needs take only part of the segment -- need changing due to introducing multiple elevations
	if (typeof subOffset == 'number' && typeof subLength == 'number') {
		
		var p1, p2;
		var startPoint, endPoint;
		var startIndex, endIndex, startIndexDiff, endIndexDiff;
		var startIndexFound, endIndexFound;

		startIndex = 0;
		endIndex = 0;
		startIndexFound = false;
		endIndexFound = false;

		// extract the sample points for the sub spiral
		for (var i = 0; i < elevations.length; i++) {
			var elevationS = elevations[i].s;
			var nextElevationS = elevations[i + 1] ? elevations[i + 1].s : elevationS0 + length;

			if (!startIndexFound) {
				if (nextElevationS <= elevationS0 + subOffset - 1E-4) {
					startIndex += Math.ceil((nextElevationS - elevationS) / step - 1);
				} else if (Math.abs(elevationS - (elevationS0 + subOffset)) < 1E-4) {
					if (Math.abs(elevationS - elevationS0) < 1E-4) {
						startIndex = 0;
						startIndexDiff = 0;
					} else {
						startIndex += 1;
						startIndexDiff = 0;
					}
					startIndexFound = true;
				} else if (elevationS < elevationS0 + subOffset) {
					startIndex += Math.floor((elevationS0 + subOffset - elevationS) / step);
					startIndexDiff = (elevationS0 + subOffset - elevationS) / step - Math.floor((elevationS0 + subOffset - elevationS) / step);
					startIndexFound = true;
				}
			}

			if (!endIndexFound) {
				if (nextElevationS <= elevationS0 + subOffset + subLength - 1E-4) {
					endIndex += Math.ceil((nextElevationS - elevationS) / step);
				} else if (Math.abs(nextElevationS - (elevationS0 + subOffset + subLength)) < 1E-4) {
					endIndex += Math.ceil((nextElevationS - elevationS) / step);
					endIndexDiff = 0;
					endIndexFound = true;
				} else if (elevationS < elevationS0 + subOffset + subLength) {
					endIndex += Math.floor((elevationS0 + subOffset + subLength - elevationS) / step);
					endIndexDiff = (elevationS0 + subOffset + subLength - elevationS) / step - Math.floor((elevationS0 + subOffset + subLength - elevationS) / step);
					endIndexFound = true;
				} else {
					console.log(elevationS, elevationS0 + subOffset + subLength)
				}
			}

			if (startIndexFound && endIndexFound) break;
		}

		// extract points from startIndex + diff to endIndex + diff
		p1 = points[startIndex];
		p2 = points[startIndex + 1];
		startPoint = new THREE.Vector3(p1.x + startIndexDiff / step * (p2.x - p1.x), p1.y + startIndexDiff / step * (p2.y - p1.y), p1.z + startIndexDiff / step * (p2.z - p1.z));
		points[startIndex] = startPoint;
		heading[startIndex] = heading[startIndex] + (heading[startIndex + 1] - heading[startIndex]) * startIndexDiff / step;

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

function createSpiral(length, elevationLateralProfile, heights, sx, sy, hdg, curvStart, curvEnd, ex, ey, lateralOffset, subOffset, subLength) {

	var material = new THREE.MeshBasicMaterial({color: 0xFFC125});
	var points = generateSpiralPoints(length, elevationLateralProfile, heights, sx, sy, hdg, curvStart, curvEnd, ex, ey, lateralOffset, subOffset, subLength).points;
	var geometry = new THREE.Geometry();
	geometry.vertices = points;	
	var spiral = new THREE.Line(geometry, material);
	
	//drawLineAtPoint(points[0].x, points[0].y, points[0].z, Math.PI / 36, 0xFFC125);
	//drawLineAtPoint(points[points.length - 1].x, points[points.length - 1].y, points[points.length - 1].z, -Math.PI / 36, 0xFFC125)

	return spiral;
}

/*
* Helper function for generateClothoid
*
* Rotate shape about (cx, cy) by hdg degree in x-y plane
* @Param points sample points of the shape
* @Param (cx, cy) the rotation center
* @Param hdg the degree to rotate
*/
function rotate2D(points, cx, cy, hdg) {

	// move (cx, cy) to (0,0)
	for (var i = 0; i < points.length; i++) {
		var point = points[i];
		point.x -= cx;
		point.y -= cy;

		var tmpx = point.x;
		var tmpy = point.y;
		point.x = tmpx * Math.cos(hdg) - tmpy * Math.sin(hdg);
		point.y = tmpx * Math.sin(hdg) + tmpy * Math.cos(hdg);

		point.x += cx;
		point.y += cy;

	}
}

/*
* Helper function for tilting superelevation
*
* Rotate points sample around axis, (axis is a directional vector3 from original to (x, y, z), then transform the axis' from (0,0,0), to (ax, ay, 0))
* @Param points sample points of a geometry
* @Param axis vector3, the axis defined at origin, i.e. before transform to ax, ay
* @Param (ax, ay) the axis' position in x-y plane
* @Param angle the degree to rotate
*/
function rotate3D(points, ax, ay, axis, angle) {

	// move points to (ax, ay, 0) to match the axis' start position
	for (var i = 0; i < points.length; i++) {
		var point = points[i];
		point.x -= ax;
		point.y -= ay;
		point.z -= 0;

		point.applyAxisAngle(axis, angle);

		point.x += ax;
		point.y += ay;
		point.z += 0;
	}
}

/*
* Genereate sample points for a clothoid spiral
*
* @Param length the arc length trhoughtou the curve
* @Param sx, sy the start position of the curve
* @Param hdg the heading direction of the starting point
* @Param curvStart curvature of the starting point
* @Param curvEnd curvature of the ending point
* @Param tOffset the constant offset from clothoid (used to draw paralell curve to clothoid)
* @Return sample points
*/
function generateClothoidPoints(length, sx, sy, hdg, curvStart, curvEnd, tOffset) {

	/* S(x) for small x */
	var sn = [-2.99181919401019853726E3, 7.08840045257738576863E5, -6.29741486205862506537E7, 2.54890880573376359104E9, -4.42979518059697779103E10, 3.18016297876567817986E11];
	var sd = [2.81376268889994315696E2, 4.55847810806532581675E4, 5.17343888770096400730E6, 4.19320245898111231129E8, 2.24411795645340920940E10, 6.07366389490084639049E11];

	/* C(x) for small x */
	var cn = [-4.98843114573573548651E-8, 9.50428062829859605134E-6, -6.45191435683965050962E-4, 1.88843319396703850064E-2, -2.05525900955013891793E-1, 9.99999999999999998822E-1];
	var cd = [3.99982968972495980367E-12, 9.15439215774657478799E-10, 1.25001862479598821474E-7, 1.22262789024179030997E-5, 8.68029542941784300606E-4, 4.12142090722199792936E-2, 1.00000000000000000118E0];

	/* Auxiliary function f(x) */
	var fn = [4.21543555043677546506E-1, 1.43407919780758885261E-1, 1.15220955073585758835E-2, 3.45017939782574027900E-4, 4.63613749287867322088E-6, 3.05568983790257605827E-8, 1.02304514164907233465E-10, 1.72010743268161828879E-13, 1.34283276233062758925E-16, 3.76329711269987889006E-20];
	var fd = [7.51586398353378947175E-1, 1.16888925859191382142E-1, 6.44051526508858611005E-3, 1.55934409164153020873E-4, 1.84627567348930545870E-6, 1.12699224763999035261E-8, 3.60140029589371370404E-11, 5.88754533621578410010E-14, 4.52001434074129701496E-17, 1.25443237090011264384E-20];

	/* Auxiliary function g(x) */
	var gn = [5.04442073643383265887E-1, 1.97102833525523411709E-1, 1.87648584092575249293E-2, 6.84079380915393090172E-4, 1.15138826111884280931E-5, 9.82852443688422223854E-8, 4.45344415861750144738E-10, 1.08268041139020870318E-12, 1.37555460633261799868E-15, 8.36354435630677421531E-19, 1.86958710162783235106E-22];
	var gd = [1.47495759925128324529E0, 3.37748989120019970451E-1, 2.53603741420338795122E-2, 8.14679107184306179049E-4, 1.27545075667729118702E-5, 1.04314589657571990585E-7, 4.60680728146520428211E-10, 1.10273215066240270757E-12, 1.38796531259578871258E-15, 8.39158816283118707363E-19, 1.86958710162783236342E-22];

	function polevl(x, coef, n) {
		var ans = 0;
		for (var i = 0; i <= n; i++) {
			ans = ans * x + coef[i];
		}
		return ans;
	}

	function p1evl(x, coef, n) {
		var ans = x + coef[0];
		for (var i = 0; i < n; i++) {
			ans = ans * x + coef[i];
		}
		return ans;
	}

	function fresnel(xxa) {
		var f, g, cc, ss, c, s, t, u;
		var x, x2;
		var point = new THREE.Vector2();

		x  = Math.abs( xxa );
		x2 = x * x;

		if ( x2 < 2.5625 ) {
			t = x2 * x2;
			ss = x * x2 * polevl (t, sn, 5) / p1evl (t, sd, 6);
			cc = x * polevl (t, cn, 5) / polevl (t, cd, 6);
		} else if ( x > 36974.0 ) {
			cc = 0.5;
			ss = 0.5;
		} else {
			x2 = x * x;
			t = M_PI * x2;
			u = 1.0 / (t * t);
			t = 1.0 / t;
			f = 1.0 - u * polevl (u, fn, 9) / p1evl(u, fd, 10);
			g = t * polevl (u, gn, 10) / p1evl (u, gd, 11);

			t = M_PI * 0.5 * x2;
			c = cos (t);
			s = sin (t);
			t = M_PI * x;
			cc = 0.5 + (f * s - g * c) / t;
			ss = 0.5 - (f * c + g * s) / t;
		}

		if ( xxa < 0.0 ) {
			cc = -cc;
			ss = -ss;
		}

		point.x = cc;
		point.y = ss;

		return point;
	}

	var stepCnt = 100;
	var scalar = Math.sqrt(length / Math.max(Math.abs(curvStart), Math.abs(curvEnd))) * Math.sqrt(Math.PI);
	var startArcLength = length * (Math.min(Math.abs(curvStart), Math.abs(curvEnd)) / Math.abs(curvStart - curvEnd));
	var reverse = false;
	var t = 0, Rt, At, x, y;
	var points = [];

	if (Math.abs(curvEnd) < Math.abs(curvStart)) {
		// the start of the normal spiral should be the end of the resulting curve
		reverse = true;
	}
	
	for (var s = startArcLength; s < startArcLength + length + length/stepCnt; s += length / stepCnt) {

		if (s > startArcLength + length) s  = startArcLength + length;

		t =  s / scalar;
		var point = fresnel(t);
		//Rt = (0.506 * t + 1) / (1.79 * Math.pow(t, 2) + 2.054 * t + Math.sqrt(2));
		//At = 1 / (0.803 * Math.pow(t, 3) + 1.886 * Math.pow(t,2) + 2.524 * t + 2);
		//x = 0.5 - Rt * Math.sin(Math.PI / 2 * (At - Math.pow(t, 2)));
		//y = 0.5 - Rt * Math.cos(Math.PI / 2 * (At - Math.pow(t, 2)));
		if (Math.sign(curvStart + curvEnd) < 0) point.y *= -1;
		point.x *= scalar;
		point.y *= scalar;

		// add offset along normal direction (perpendicular to tangent)
		var curv = s / length * Math.abs(curvEnd - curvStart);
		var theta = s / 2 * curv;
		if (Math.sign(curvStart + curvEnd) <0) theta *= -1;
		point.x += Math.abs(tOffset) * Math.cos(theta + Math.PI / 2 * Math.sign(tOffset));
		point.y += Math.abs(tOffset) * Math.sin(theta + Math.PI / 2 * Math.sign(tOffset));
		if (point.x < 1e-10) point.x = 0;

		points.push(point);
	}

	// transform
	var len = points.length;
	if (reverse) {
		var tmp;
		for (var i = 0; i < len / 2; i++) {
			tmp = points[i].y;
			points[i].y = points[len - 1 - i].y;
			points[len - 1 - i].y = tmp;
		}
	}
	if (startArcLength != 0 || reverse) {
		for (var i = 1; i < len; i++) {
			points[i].x -= points[0].x;
			points[i].y -= (points[0].y - tOffset);
		}
		points[0].x = 0;
		points[0].y = tOffset;
	}
	if (reverse) {
		var alpha = Math.sign(curvStart + curvEnd) * (startArcLength + length) * Math.max(Math.abs(curvStart), Math.abs(curvEnd)) / 2;
		rotate2D(points, points[0].x, points[0].y, alpha);
	}

	rotate2D(points, 0, 0, hdg);

	for (var i = 0; i < points.length; i++) {
		var point = points[i];
		point.x += sx;
		point.y += sy;
	}
	/*
	// calculate length and error
	var s = 0;
	for (var i = 1; i < points.length; i++) {
		s += Math.sqrt(Math.pow(points[i].x - points[i-1].x, 2) + Math.pow(points[i].y - points[i-1].y, 2));
	}
	*/
	return points;
}

function createClothoid(length, sx, sy, hdg, curvStart, curvEnd, tOffset) {

	if (curvStart == curvEnd) {
		console.warn('clothoid error: invalid curvature, use line or arc to draw');
		return;
	}

	var points = generateClothoidPoints(length, sx, sy, hdg, curvStart, curvEnd, tOffset ? tOffset : 0);

	var path = new THREE.Path(points);
	var geometry = path.createPointsGeometry(points.length);
	var material = new THREE.MeshBasicMaterial({color: 0xFFC125});
	var clothoid = new THREE.Line(geometry, material);
	
	return clothoid;
}

/*
* Create sample points for a cicular arc (step is 1m)
*
* @Param length the length of arc
* @Param elevationLateralProfile the height curve, superelevation angle around central reference line, crossfall angle relative to t-axis of the arc
* @Param heights array of {s, height} the height offset array from track level (for lane height, not allowed for central lane)
* @Param sx, sy the start of the arc
* @Param hdg heading diretion at start of the arc (rotation of z axis)
* @Param curvature curvature of the arc
* @Param ex, ey the start of the next connecting point (as end of the arc), used for fixing errors
* @Param lateralOffset offset along t axis with a, b, c, d as cubic polynomial coefficiants
*
* NOTE: the following two pameters are only used when drawing road marks (multiple marks on geometry spiral), and spliting geometry on spiral to get new geometry's connecting start xy position and end xy position
*
* @Param subOffset given the paramters of a whole segment of Eular-Spiral, the sub-segment's start sOffset from the start of the spiral (sx, sy)
* @Param subLength given the parameters of a while segment of Eular-Spiral, the sub-segemetn's run-through length
*
* @Return sample points
*/
function generateArcPoints(length, elevationLateralProfile, heights, sx, sy, hdg, curvature, ex, ey, lateralOffset, subOffset, subLength) {

	var points = [];
	var heading = [];
	var tOffset = [];
	var sOffset = [];	// sOffset from the beginning of the curve, used for distribute error
	var currentHeading = hdg;
	var prePoint, x, y, z;

	var elevations, superelevations, crossfalls;

	if (elevationLateralProfile) {
		elevations = elevationLateralProfile.elevations;
		superelevations = elevationLateralProfile.superelevations;
		crossfalls = elevationLateralProfile.crossfalls;
	}

	if (!elevations)
		elevations = [{s: 0, a: 0, b: 0, c: 0, d: 0}];
	if (!superelevations)
		superelevations = [{s: 0, a: 0, b: 0, c: 0, d: 0}];
	if (!crossfalls)
		crossfalls = [{s: 0, a: 0, b: 0, c: 0, d: 0}];

	if (!heights)
		heights = [{s: 0, height: 0}];
	else if (heights.length == 0)
		heights = [{s: 0, height: 0}];

	// s ranges between [0, length]
	var s = 0;
	var preS = 0;
	var elevationS0 = elevations[0].s;

	for (var i = 0; i < elevations.length; i++) {

		var elevationS = elevations[i].s;
		var nextElevationS = elevations[i + 1] ? elevations[i + 1].s : elevationS0 + length;
		var elevationLength = nextElevationS - elevationS;

		var elevationSOffset = elevationS - elevationS0;
		//console.log('elevation #', i, 'start at', elevationSOffset)
		
		s = elevationSOffset;
		do {
			
			if (s == 0) {
				points.push(new THREE.Vector3(sx, sy, elevations[0].a));		
				heading.push(currentHeading);
				if (lateralOffset) tOffset.push(lateralOffset.a);
				sOffset.push(s);
				s += step;
				continue;
			}

			if (s > elevationSOffset + elevationLength || Math.abs(s - elevationSOffset - elevationLength) < 1E-4) {
			
				if (Math.abs(elevationSOffset + elevationLength - length) < 1E-4) {
					// if elevation seg reaches the end of the whole spiral, calculate it
					s = elevationSOffset + elevationLength;
				} else {
					// else ends current elevation segment, the next elevation segment's start will be the end of this one			
					s += step;
					break;
				}
			}

			prePoint = points[points.length - 1];

			x = prePoint.x + (s - preS) * Math.cos(currentHeading + curvature * (s - preS) / 2);
			y = prePoint.y + (s - preS) * Math.sin(currentHeading + curvature * (s - preS) / 2);
			z = cubicPolynomial(s - elevationSOffset, elevations[i].a, elevations[i].b, elevations[i].c, elevations[i].d);

			currentHeading += curvature * (s - preS);
			
			preS = s;
			s += step;

			points.push(new THREE.Vector3(x, y, z));
			heading.push(currentHeading);
			if (lateralOffset) tOffset.push(cubicPolynomial(preS, lateralOffset.a, lateralOffset.b, lateralOffset.c, lateralOffset.d));
			sOffset.push(preS);

		} while (s < elevationSOffset + elevationLength + step);
	}

	// fix the error by altering the end point to he connecting road's start
	if (typeof ex == 'number' && typeof ey == 'number') {

		var delta = new THREE.Vector3(ex - points[points.length - 1].x, ey - points[points.length - 1].y, 0);
		points[points.length - 1].x = ex;
		points[points.length - 1].y = ey;

		// distrubte error across sample points for central clothoid 		
		for (var i = points.length - 2; i > -1; i--) {
			points[i].x += delta.x * sOffset[i] / length;
			points[i].y += delta.y * sOffset[i] / length;
		}
	}

	// apply lateral offset along t, and apply superelevation, crossfalls if any
	if (lateralOffset) {

		var svector, tvector;

		var superelevationIndex = 0;
		var crossfallIndex = 0;
		var heightIndex = 0;
		var superelevation = superelevations[superelevationIndex];
		var nextSuperElevation = superelevations[superelevationIndex + 1] || {s: elevationS0 + length};
		var crossfall = crossfalls[crossfallIndex];
		var nextCrossfall = crossfalls[crossfallIndex + 1] || {s: elevationS0 + length};
		var height = heights[heightIndex];
		var nextHeight = heights[heightIndex + 1] || {s: elevationS0 + length};

		// shift points at central clothoid by tOffset to get the parallel curve points
		for (var i = 0; i < points.length; i++) {

			var point = points[i];
			var t = tOffset[i];
			var currentHeading = heading[i];
			var ds = sOffset[i];

			// make sure no over flow happens for superelevations and crossfalls - should not be, since sOffset won't exceeds length
			if (nextSuperElevation.s <= ds + elevationS0 || Math.abs(nextSuperElevation.s - ds - elevationS0) < 1E-4) {

				// if not reaches the end of the cubic line yet
				if (elevationS0 + length - nextSuperElevation.s >= 1E-4) {
					superelevationIndex++;
					superelevation = superelevations[superelevationIndex];
					nextSuperElevation = superelevations[superelevationIndex + 1] || {s: elevationS0 + length};
				}
			}

			if (nextCrossfall.s <= ds + elevationS0 || Math.abs(nextCrossfall.s - ds - elevationS0) < 1E-4) {

				// if not reaches the end of the cubic line yet
				if (elevationS0 + length - nextCrossfall.s >= 1E-4) {
					crossfallIndex++;
					crossfall = crossfalls[crossfallIndex];
					nextCrossfall = crossfalls[crossfallIndex + 1] || {s: elevationS0 + length};
				}
			}

			if (nextHeight.s <= ds + elevationS0 || Math.abs(nextHeight.s - ds - elevationS0) < 1E-4) {

				// if not reaches the end of the cubic line yet
				if (elevationS0 + length - nextHeight.s >= 1E-4) {
					heightIndex++;
					height = heights[heightIndex];
					nextHeight = heights[heightIndex + 1] || {s: elevationS0 + length};
				}
			}

			svector = new THREE.Vector3(1, 0, 0);
			svector.applyAxisAngle(new THREE.Vector3(0, 0, 1), currentHeading);
			tvector = svector.clone();
			tvector.cross(new THREE.Vector3(0, 0, -1));

			if (t != 0) {
				var superelevationAngle = cubicPolynomial(ds + elevationS0 - superelevation.s, superelevation.a, superelevation.b, superelevation.c, superelevation.d);
				var crossfallAngle = cubicPolynomial(ds + elevationS0 - crossfall.s, crossfall.a, crossfall.b, crossfall.c, crossfall.d);

				tvector.applyAxisAngle(svector, superelevationAngle);

				if (!((t > 0 && crossfall.side == 'right') || (t < 0 && crossfall.side == 'left'))) {
					// Positive crossfall results in a road surface "falling" from the reference line to the outer boundary
					tvector.applyAxisAngle(svector, crossfallAngle * (- Math.sign(t)));
				}
			}

			hvector = svector.clone();
			hvector.cross(tvector);

			tvector.multiplyScalar(t);
			hvector.multiplyScalar(height.height);

			point.x += tvector.x + hvector.x;
			point.y += tvector.y + hvector.y;
			point.z += tvector.z + hvector.z;
		}
	}

	// if  needs take only part of the segment -- need changing due to introducing multiple elevations
	if (typeof subOffset == 'number' && typeof subLength == 'number') {

		var p1, p2;
		var startPoint, endPoint;
		var startIndex, endIndex, startIndexDiff, endIndexDiff;
		var startIndexFound, endIndexFound;

		startIndex = 0;
		endIndex = 0;
		startIndexFound = false;
		endIndexFound = false;

		// extract the sample points for the sub spiral
		for (var i = 0; i < elevations.length; i++) {
			var elevationS = elevations[i].s;
			var nextElevationS = elevations[i + 1] ? elevations[i + 1].s : elevationS0 + length;

			if (!startIndexFound) {
				if (nextElevationS <= elevationS0 + subOffset - 1E-4) {
					startIndex += Math.ceil((nextElevationS - elevationS) / step - 1);
				} else if (Math.abs(elevationS - (elevationS0 + subOffset)) < 1E-4) {
					if (Math.abs(elevationS - elevationS0) < 1E-4) {
						startIndex = 0;
						startIndexDiff = 0;
					} else {
						startIndex += 1;
						startIndexDiff = 0;
					}
					startIndexFound = true;
				} else if (elevationS < elevationS0 + subOffset) {
					startIndex += Math.floor((elevationS0 + subOffset - elevationS) / step);
					startIndexDiff = (elevationS0 + subOffset - elevationS) / step - Math.floor((elevationS0 + subOffset - elevationS) / step);
					startIndexFound = true;
				}
			}

			if (!endIndexFound) {
				if (nextElevationS + 1E-4 <= elevationS0 + subOffset + subLength) {
					endIndex += Math.ceil((nextElevationS - elevationS) / step);
				} else if (Math.abs(nextElevationS - (elevationS0 + subOffset + subLength)) < 1E-4) {
					endIndex += Math.ceil((nextElevationS - elevationS) / step);
					endIndexDiff = 0;
					endIndexFound = true;
				} else if (elevationS < elevationS0 + subOffset + subLength) {
					endIndex += Math.floor((elevationS0 + subOffset + subLength - elevationS) / step);
					endIndexDiff = (elevationS0 + subOffset + subLength - elevationS) / step - Math.floor((elevationS0 + subOffset + subLength -elevationS ) / step);
					endIndexFound = true;
				}
			}

			if (startIndexFound && endIndexFound) break;
		}
		
		//console.log('extracting arc from', elevationS0 + subOffset, 'to', elevationS0 + subOffset + subLength, '\nstartIndex', startIndex, 'startIndexDiff', startIndexDiff, '\nendIndex', endIndex, 'endIndexDiff', endIndexDiff)
		
		// extract points from startIndex + diff to endIndex + diff
		p1 = points[startIndex];
		p2 = points[startIndex + 1];
		startPoint = new THREE.Vector3(p1.x + startIndexDiff / step * (p2.x - p1.x), p1.y + startIndexDiff / step * (p2.y - p1.y), p1.z + startIndexDiff / step * (p2.z - p1.z));
		points[startIndex] = startPoint;
		heading[startIndex] = heading[startIndex] + (heading[startIndex + 1] - heading[startIndex]) * startIndexDiff / step;

		if (endIndexDiff > 0) {
			p1 = points[endIndex];
			p2 = points[endIndex + 1];
			endPoint = new THREE.Vector3(p1.x + endIndexDiff / step * (p2.x - p1.x), p1.y + endIndexDiff / step * (p2.y - p1.y), p1.z + endIndexDiff / step * (p2.z - p1.z));
			endIndex = endIndex + 1;
			points[endIndex] = endPoint;
			heading[endIndex] = heading[endIndex + 1] ? heading[endIndex] + (heading[endIndex + 1] - heading[endIndex]) * endIndexDiff / step : heading[endIndex];
		}
		
		//console.log('start heading', heading[startIndex], 'end heading', heading[endIndex])
		
		points.splice(endIndex + 1);
		points.splice(0, startIndex);
		heading.splice(endIndex + 1);
		heading.splice(0, startIndex);
	}

	return {points: points, heading: heading};
}

/*
* Create an arc with constant curvature from a starting point with fixed length
*
* @Param length the length of the arc
* @Param elevationLateralProfile the height curve, superelevation angle around central reference line, crossfall angle relative to t-axis of the arc
* @Param heights array of {s, height} the height offset array from track level (for lane height, not allowed for central lane)
* @Param sx, sy the start of the arc
* @Param hdg heading direction at start of the arc (rotation of of z axis)
* @Param lateralOffset offset along t axis with a, b, c, d as cubic polynomial coefficiants
* @Param curvature curvature of the arc
*/
function createArc(length, elevationLateralProfile, heights, sx, sy, hdg, curvature, ex, ey, lateralOffset) {
	
	var material = new THREE.MeshBasicMaterial({color: 0x3A5FCD});
	/*
	var radius = 1 / Math.abs(curvature);
	var rotation = hdg - Math.sign(curvature) * Math.PI / 2;

	var curve = new THREE.EllipseCurve(
		//0, 0,							// ax, ay
		sx - radius * Math.cos(rotation), sy - radius * Math.sin(rotation),
		radius, radius,					// xRadius, yRadius
		0, length * curvature,			// aStartAngle, aEndAngle
		curvature > 0 ? false : true,	// aClockwise
		rotation						// aRotation		
	);

	var path = new THREE.Path(curve.getPoints(50));
	var geometry = path.createPointsGeometry(50);

	// Create the final object to add to the scene
	var ellipse = new THREE.Line(geometry, material);

	return ellipse;
	*/
	var points = generateArcPoints(length, elevationLateralProfile, heights, sx, sy, hdg, curvature, ex, ey, lateralOffset).points;
	var geometry = new THREE.Geometry();
	geometry.vertices = points;
	var arc = new THREE.Line(geometry, material);
	//drawLineAtPoint(points[0].x, points[0].y, points[0].z, Math.PI / 36, 0x0000FF)	
	//drawLineAtPoint(points[points.length - 1].x, points[points.length - 1].y, points[points.length - 1].z, -Math.PI / 36, 0x0000FF)
	return arc;
}

function cubicPolynomial(ds, a, b, c, d) {

	return a + b * ds + c * Math.pow(ds, 2) + d * Math.pow(ds, 3);	
}

/*
* Generate sample points for a cubic polynomial
*
* @Param offset where does horizontal axis begin (before transformation)
* @Param length the distance between start and end points along the horizontal axis (before the transformation)
* @Param elevationLateralProfile the height curve, superelevation angle around central reference line, crossfall angle relative to t-axis of the cubic line
* @Param heights array of {s, height} the height offset from track level (for lane height, not allowed for central lane)
* @Param sx, sy the starting position of the actual 'horizontal' axis (central reference line)
* @Param hdg the heading of the starting point
* @Param lateralOffset a,b,c,d the parameters of the cubic polynomial
* @Rerturn sample points
*/
function generateCubicPoints(offset, length, elevationLateralProfile, heights, sx, sy, hdg, lateralOffset) {

	var x, y, z;
	var points = [];
	var tOffset = [];
	var sOffset = [];	// each point's s distance from the begining of the cubic curve
	var elevations, superelevations, crossfalls;

	if (elevationLateralProfile) {
		elevations = elevationLateralProfile.elevations;
		superelevations = elevationLateralProfile.superelevations;
		crossfalls = elevationLateralProfile.crossfalls;
	}

	if (!elevations)
		elevations = [{s: 0, a: 0, b: 0, c: 0, d: 0}];
	if (!superelevations)
		superelevations = [{s: 0, a: 0, b: 0, c: 0, d: 0}];
	if (!crossfalls)
		crossfalls = [{s: 0, a: 0, b: 0, c: 0, d: 0}];

	if (!heights)
		heights = [{s: 0, height: 0}];
	else if (heights.length == 0)
		heights = [{s: 0, height: 0}];

	var elevationS0 = elevations[0].s;
	for (var i = 0; i < elevations.length; i++) {

		var elevationS = elevations[i].s;
		var nextElevationS = elevations[i + 1] ? elevations[i + 1].s : elevationS0 + length;
		var elevationLength = nextElevationS - elevationS;

		var ds = 0;
		var elevationSOffset = elevationS - elevationS0;

		do {

			if (ds > elevationLength || Math.abs(ds - elevationLength) < 1E-4) {

				if (Math.abs(elevationSOffset + elevationLength - length) < 1E-4) {
					// if it reaches the end of the whole spiral, calculate it
					ds = elevationLength;
				} else {
					// else ends current elevation segment, the next elevation segment's start will be the end of this one
					ds += step;
					break;
				}
			}

			x = sx + (ds + elevationSOffset) * Math.cos(hdg);
			y = sy + (ds + elevationSOffset) * Math.sin(hdg);
			z = cubicPolynomial(ds, elevations[i].a, elevations[i].b, elevations[i].c, elevations[i].d);

			points.push(new THREE.Vector3(x, y, z));
			sOffset.push(ds + elevationSOffset);
			if (lateralOffset) tOffset.push(cubicPolynomial(ds + elevationSOffset + offset, lateralOffset.a, lateralOffset.b, lateralOffset.c, lateralOffset.d));

			ds += step;
		
		} while (ds < elevationLength + step);
	}

	// apply lateral offset along t, and apply superelevation, crossfalls if any; since lane height is not allowed for central lane, if it is defined for a lane, the lateral offset must exist
	if (lateralOffset) {

		var svector, tvector, hvector;

		var superelevationIndex = 0;
		var crossfallIndex = 0;
		var heightIndex = 0;
		var superelevation = superelevations[superelevationIndex];
		var nextSuperElevation = superelevations[superelevationIndex + 1] || {s: elevationS0 + length};
		var crossfall = crossfalls[crossfallIndex];
		var nextCrossfall = crossfalls[crossfallIndex + 1] || {s: elevationS0 + length};
		var height = heights[heightIndex];
		var nextHeight = heights[heightIndex + 1] || {s: elevationS0 + length};

		// shift points at central clothoid by tOffset to get the parallel curve points
		for (var i = 0; i < points.length; i++) {

			var point = points[i];
			var t = tOffset[i];
			var ds = sOffset[i];

			// make sure no over flow happens for superelevations and crossfalls - should not be, since sOffset won't exceeds length
			if (nextSuperElevation.s <= ds + elevationS0 || Math.abs(nextSuperElevation.s - ds - elevationS0) < 1E-4) {

				// if not reaches the end of the cubic line yet
				if (elevationS0 + length - nextSuperElevation.s >= 1E-4) {
					superelevationIndex++;
					superelevation = superelevations[superelevationIndex];
					nextSuperElevation = superelevations[superelevationIndex + 1] || {s: elevationS0 + length};
				}
			}

			if (nextCrossfall.s <= ds + elevationS0 || Math.abs(nextCrossfall.s - ds - elevationS0) < 1E-4) {

				// if not reaches the end of the cubic line yet
				if (elevationS0 + length - nextCrossfall.s >= 1E-4) {
					crossfallIndex++;
					crossfall = crossfalls[crossfallIndex];
					nextCrossfall = crossfalls[crossfallIndex + 1] || {s: elevationS0 + length};
				}
			}

			if (nextHeight.s <= ds + elevationS0 || Math.abs(nextHeight.s - ds - elevationS0) < 1E-4) {

				// if not reaches the end of the cubic line yet
				if (elevationS0 + length - nextHeight.s >= 1E-4) {
					heightIndex++;
					height = heights[heightIndex];
					nextHeight = heights[heightIndex + 1] || {s: elevationS0 + length};
				}
			}

			svector = new THREE.Vector3(1, 0, 0);
			svector.applyAxisAngle(new THREE.Vector3(0, 0, 1), hdg);
			tvector = svector.clone();
			tvector.cross(new THREE.Vector3(0, 0, -1));

			if (t != 0) {
				var superelevationAngle = cubicPolynomial(ds + elevationS0 - superelevation.s, superelevation.a, superelevation.b, superelevation.c, superelevation.d);
				var crossfallAngle = cubicPolynomial(ds + elevationS0 - crossfall.s, crossfall.a, crossfall.b, crossfall.c, crossfall.d);

				tvector.applyAxisAngle(svector, superelevationAngle);

				if (!((t > 0 && crossfall.side == 'right') || (t < 0 && crossfall.side == 'left'))) {
					// Positive crossfall results in a road surface "falling" from the reference line to the outer boundary
					tvector.applyAxisAngle(svector, crossfallAngle * (- Math.sign(t)));
				}
			}

			hvector = svector.clone();
			hvector.cross(tvector);

			tvector.multiplyScalar(t);
			hvector.multiplyScalar(height.height);

			point.x += tvector.x + hvector.x;
			point.y += tvector.y + hvector.y;
			point.z += tvector.z + hvector.z;
		}
	}

	return points;
}

/*
* Create a cubic line (a ploynomial function of third order) with
* t = a + b*ds + c*ds^2 + d*ds^3, ds is the distance along the reference line between the start of the entry (laneSection) and the actual position
*
* @Param length the length of the original reference line (now assume geometry is of only type 'line')
* @Param elevationLateralProfile the height curve, superelevation angle around central reference line, crossfall angle relative to t-axis of the cubic line
* @Param heights array of {s, height} the height offset array from track level (for lane height, not allowed for central lane)
* @Param sx, sy the start of the curve
* @Param hdg heading direction at start of the curve
* @Param lateralOffset a, b, c, d parameters of the cubic polynomial
*/
function createCubic(length, elevationLateralProfile, heights, sx, sy, hdg, lateralOffset) {

	// since geometry is divided on laneOffset, each geometry starts at offset = 0 along a laneOffset (ds starts from 0) if geometry offset exists, when createCubic is called
	var offset = 0;
	var points = generateCubicPoints(offset, length, elevationLateralProfile, heights , sx, sy, hdg, lateralOffset);
	var geometry = new THREE.Geometry();
	geometry.vertices = points;
	var material = new THREE.MeshBasicMaterial({color: 0xFF0000});
	var cubic = new THREE.Line(geometry, material);

	return cubic;
}

/*
* Draw the reference line of a given geometry
* @Param geometry
* @Param elevations elevation info covered by geometry, maybe multiple elevations
*/
function drawReferenceLine(geometry, elevations) {

	var mesh;
	var heights = null;

	switch(geometry.type) {
		case 'line':
			mesh = createCubic(geometry.length, {elevations}, heights, geometry.centralX, geometry.centralY, geometry.hdg, geometry.offset);
			break;
		case 'spiral':
			if (geometry.offset.a || geometry.offset.b || geometry.offset.c || geometry.offset.d) {
				console.warn('reference line error (spiral): not surpport laneOffset on spiral or arc yet');
			}

			try {
				mesh = createSpiral(geometry.length, {elevations}, heights, geometry.x, geometry.y, geometry.hdg, geometry.spiral.curvStart, geometry.spiral.curvEnd, geometry.ex, geometry.ey, geometry.offset);
			} catch(e) {
				console.error(e.stack)
			}
			break;
		case 'arc':
			if (geometry.offset.a || geometry.offset.b || geometry.offset.c || geometry.offset.d) {
				console.warn('reference line error (arc): not surpport laneOffset on spiral or arc yet');
			}

			mesh = createArc(geometry.length, {elevations}, heights, geometry.x, geometry.y, geometry.hdg, geometry.arc.curvature, geometry.ex, geometry.ey, geometry.offset);
			break;
	}

	// referec line's horizontal positon sets to 0.001 (higher than lanes and same as roadMarks' 0.001 to be on top to avoid covering)
	mesh.position.set(0, 0, 0.02);
	scene.add(mesh);
	group.referenceLine.push(mesh);
}

/*
* Draw the reference line of a road
* @Param road road parsed from .xodr
* @Param isElevated neglect elevations height if false
*/
function drawRoad(road, isElevated) {

	// sub divide road's geometry if necessary, i.e when laneOffset record exists
	var geometries = road.geometry;

	for (var i = 0; i < geometries.length; i++) {

		var geometry = geometries[i];
		if (!geometry.offset) geometry.offset = {a: 0, b: 0, c: 0, d: 0};
		
		var elevations = null;
		if (isElevated) {
			elevations = getElevation(road.elevation, geometry.s, geometry.s + geometry.length);
		}

		drawReferenceLine(geometry, elevations);
	}

	//console.log('road#', road.id, 'total sections#', road.laneSection.length, 'superelevations#', road.superelevation ? road.superelevation.length: 0, 'signals#', road.signal ? road.signal.length : 0);
}

function drawRoadByLaneSections(roadId, laneSectionIds, isElevated) {

	var road = map.roads[roadId];
	for (var i = 0; i < laneSectionIds.length; i++) {
		
		var laneSection = road.laneSection[laneSectionIds[i]];
		var nextLaneSectionS = road.laneSection[laneSectionIds[i] + 1] ? road.laneSection[laneSectionIds[i] + 1].s : road.geometry[road.geometry.length - 1].s + road.geometry[road.geometry.length - 1].length;

		var geometries = getGeometry(road, laneSection.s, nextLaneSectionS);
		var superelevations = getSuperElevation(road.elevation, laneSection.s, nextLaneSectionS);
		
		for (var j = 0; j < geometries.length; j++) {

			var geometry = geometries[j];
			if (!geometry.offset) geometry.offset = {a: 0, b: 0, c: 0, d: 0};

			var elevations = null;
			if (isElevated) {
				elevations = getElevation(map.roads[roadId].elevation, geometry.s, geometry.s + geometry.length);
			}

			drawReferenceLine(geometry, elevations);
		}
	}
}

function drawRoadByLaneSectionGeometries(roadId, laneSectionId, geometryIds, isElevated) {

	var road = map.roads[roadId];
	var laneSection = road.laneSection[laneSectionId];
	var nextLaneSectionS = road.laneSection[laneSectionId + 1] ? road.laneSection[laneSectionId + 1].s : road.geometry[road.geometry.length - 1].s + road.geometry[road.geometry.length - 1].length;

	var geometries = getGeometry(road, laneSection.s, nextLaneSectionS);
	var superelevations = getSuperElevation(road.elevation, laneSection.s, nextLaneSectionS);
	console.log('road#', roadId, 'laneSection#', laneSectionId, 'total geometries#', geometries.length, 'superelevations#', superelevations ? superelevations.length : 0);

	if (geometryIds) {

		for (var j = 0; j < geometryIds.length; j++) {

			var geometry = geometries[geometryIds[j]];
			if (!geometry.offset) geometry.offset = {a: 0, b: 0, c: 0, d: 0};

			var elevations = null;
			if (isElevated) {
				elevations = getElevation(map.roads[roadId].elevation, geometry.s, geometry.s + geometry.length);
			}
			drawReferenceLine(geometry, elevations);
		}
	} else {

		for (var j = 0; j < geometries.length; j++) {

			var geometry = geometries[j];
			if (!geometry.offset) geometry.offset = {a: 0, b: 0, c: 0, d: 0};

			var elevations = null;
			if (isElevated) {
				elevations = getElevation(map.roads[roadId].elevation, geometry.s, geometry.s + geometry.length);
			}

			drawReferenceLine(geometry, elevations);
		}
	}
}

function drawRoadByGeometries(roadId, geometryIds, isElevated) {

	for (var i = 0; i < geometryIds.length; i++) {
	
		var geometry = map.roads[roadId].geometry[geometryIds[i]];
		if (!geometry.offset) geometry.offset = {a: 0, b: 0, c: 0, d: 0};

		var elevations = null;
		if (isElevated) {
			elevations = getElevation(map.roads[roadId].elevation, geometry.s, geometry.s + geometry.length);
		}

		drawReferenceLine(geometry, elevations);
	}

}

/*
* Draw the reference line for all roads
*
* NOTE: for the geometry of reference line is defined in plan view, all points are in x-y plane, thus using just 2D points for now (need 3D points for superelevation and crossfall)
*
* @Param roads roads info parsed from .xodr
* @Param isElevated neglect elevations height if false
*/
function drawRoads(roads, isElevated) {
	for (var id in roads) {
		drawRoad(roads[id], isElevated);
	}
}

function drawRoadsByIds(roadIds, isElevated) {
	for (var i=0; i < roadIds.length; i++) {
		var id = roadIds[i];
		drawRoad(map.roads[id], isElevated);
	}
}

/*
* Create a rectangle shape by walking along vertices v1, v2, v3, v4
*
* @Param v1, v2, v3, v4 vertices in 2D Vector
*/
function createRectShape(v1, v2, v3, v4) {

	var shape = new THREE.Shape();
	shape.moveTo(v1.x, v1.y);
	shape.lineTo(v2.x, v2.y);
	shape.lineTo(v3.x, v3.y);
	shape.lineTo(v4.x, v4.y);

	return shape;
}

/*
* Create an arc ring shape given arc center, inner border curvature, length, outer border radius, v1, and v3
*
* @Param center 2D Vector the center of the arc
* @Param v1, v3 2D Vector two of the vertices
* @Param iRadius the radius of the innder border arc
* @Param oRadius the radius of the outer border arc
* @Param rotation the rotation direction of the 
* @Param theta the angle swept by the arc
* @Param isClockwise true if inner border arc is clockwise, false if not
*
*	  ----- v1---- inner border ---v2 ----				v4---------------------v3
*			|						|		or			|						|
*			|						|					|						|
*			v4---------------------v3		 	  ----- v1---- inner border ---v2 ----	 
*/
function createArcShape(center, v1, v3, iRadius, oRadius, rotation, theta, isClockwise) {

	var shape = new THREE.Shape();
	shape.moveTo(v1.x, v1.y);
	shape.absarc(center.x, center.y, iRadius, rotation, rotation + theta, isClockwise);
	shape.lineTo(v3.x, v3.y);
	shape.absarc(center.x, center.y, oRadius, rotation + theta, rotation, !isClockwise);
	//shape.lineTo(v1.x, v1.y);		// if add this line, road#515 geometry#2 lane#-2 won't draw, same error happens to road#517 do not know why
	
	return shape;
}

/*
* Create a custom shape defined by innerBorder points and outerBorder points
*
* NOTE: according to the way of generating sample border points, due to js's caculation error, the last step may just close to length but smaller, thus adding another step to let the step oversize to be clamped to length, this point is very close to the last second one (after reversed generated sample outerBorder, the two problemtic points is oBorder's first two point)
* When drawing road#509 geometry#4 and geometry#5 (bot are 'line'), the above situation causes a triangulate error
* But 3 triangulate errors remain after adding the checking for extremely adjacent points
* No errors happen for crossing8.xodr if handle the adjacent points before create custome line
*
* @Param iBorderPoints spline points for inner border spline
* @Param oBorderPoints spline points for outer border spline
*/
function createCustomShape(iBorderPoints, oBorderPoints) {

	var shape = new THREE.Shape();
	shape.moveTo(iBorderPoints[0].x, iBorderPoints[0].y);
	for (var i = 1; i < iBorderPoints.length; i++) {
		shape.lineTo(iBorderPoints[i].x, iBorderPoints[i].y);
	}
	for (var i = 0; i < oBorderPoints.length; i++) {
		//if (i < oBorderPoints.length - 1 && oBorderPoints[i].distanceTo(oBorderPoints[i + 1]) < 1E-15) {
		//	console.log('oBorderPoints#' + i + ' and #' + (i + 1) + ' too close: distance ' + oBorderPoints[i].distanceTo(oBorderPoints[i + 1]));
		//	continue;
		//}
		shape.lineTo(oBorderPoints[i].x, oBorderPoints[i].y);
	}
	shape.lineTo(iBorderPoints[0].x, iBorderPoints[0].y);

	return shape;
}

/*
* Helper function for paving - reverse oBorder points to connect with iBorder in counter-clockwise or clockwise direction
* NOTE: passing argumnent points is passed by ptr
*/
function reversePoints(points) {

	for (var i = 0; i < points.length / 2; i++) {
		var tmp = points[i];
		points[i] = points[points.length - 1 - i];
		points[points.length - i - 1] = tmp;
	}
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
		//vertices = vertices.concat([rBorderPoints[i].x, rBorderPoints[i].y, rBorderPoints[i].z]);
		//vertices = vertices.concat([rBorderPoints[i + 1].x, rBorderPoints[i + 1].y, rBorderPoints[i + 1].z]);
		//vertices = vertices.concat([lBorderPoints[i + 1].x, lBorderPoints[i + 1].y, lBorderPoints[i + 1].z]);

		//vertices = vertices.concat([rBorderPoints[i].x, rBorderPoints[i].y, rBorderPoints[i].z]);
		//vertices = vertices.concat([lBorderPoints[i + 1].x, lBorderPoints[i + 1].y, lBorderPoints[i + 1].z]);
		//vertices = vertices.concat([lBorderPoints[i].x, lBorderPoints[i].y, lBorderPoints[i].z]);
	}

	for (var i = 0; i < Math.min(lBorderPoints.length, rBorderPoints.length) - 1; i++) {
		vertices = vertices.concat([rBorderPoints[i + 1].x, rBorderPoints[i + 1].y, rBorderPoints[i + 1].z]);
		vertices = vertices.concat([lBorderPoints[i + 1].x, lBorderPoints[i + 1].y, lBorderPoints[i + 1].z]);

		index = index.concat([2 * i, 2 * i + 2, 2 * i + 3, 2 * i, 2 * i + 3, 2 * i + 1]);

		uvs = uvs.concat(1, (i + 1) / Math.max(lBorderPoints.length, rBorderPoints.length))
		uvs = uvs.concat(0, (i + 1) / Math.max(lBorderPoints.length, rBorderPoints.length))
	}

	if (lBorderPoints.length < rBorderPoints.length) {

		var lPoint = lBorderPoints[lBorderPoints.length - 1];

		for (var i = lBorderPoints.length - 1; i < rBorderPoints.length - 1; i++) {
			//vertices = vertices.concat([lPoint.x, lPoint.y, lPoint.z]);
			//vertices = vertices.concat([rBorderPoints[i].x, rBorderPoints[i].y, rBorderPoints[i].z]);
			//vertices = vertices.concat([rBorderPoints[i + 1].x, rBorderPoints[i + 1].y, rBorderPoints[i + 1].z]);
		}

		var lIndex = lBorderPoints.length * 2 - 1;
		for (var i = 0; i < rBorderPoints.length - lBorderPoints.length; i++) {
			vertices = vertices.concat([rBorderPoints[lBorderPoints.length + i].x, rBorderPoints[lBorderPoints.length + i].y, rBorderPoints[lBorderPoints.length + i].z]);
			index = index.concat([lIndex, lIndex - 1, lIndex + i + 1]);

			uvs = uvs.concat(1, (lBorderPoints.length + i) / Math.max(lBorderPoints.length, rBorderPoints.length))
		}
	}

	if (lBorderPoints.length > rBorderPoints.length) {

		var rPoint = rBorderPoints[rBorderPoints.length - 1];
		
		for (var i = rBorderPoints.length - 1; i < lBorderPoints.length - 1; i++) {
			//vertices = vertices.concat([rPoint.x, rPoint.y, rPoint.z]);
			//vertices = vertices.concat([lBorderPoints[i + 1].x, lBorderPoints[i + 1].y, lBorderPoints[i + 1].z]);
			//vertices = vertices.concat([lBorderPoints[i].x, lBorderPoints[i].y, lBorderPoints[i].z]);
		}

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

function drawLineAtPoint(point, hdg, length, color) {

	length = length || 10;
	var points = [new THREE.Vector3(point.x, point.y, point.z), new THREE.Vector3(point.x + length * Math.cos(hdg), point.y + length * Math.sin(hdg), point.z)];
	drawCustomLine(points, color);
}

function drawSphereAtPoint(point, radius, color) {

	var geometry = new THREE.SphereBufferGeometry(radius || 0.08, 16, 16);
	var material = new THREE.MeshBasicMaterial({color: color != undefined ? color : 0x00FF00});
	var mesh = new THREE.Mesh(geometry, material);
	mesh.position.set(point.x, point.y, point.z);
	scene.add(mesh);
}

function drawDirectionalVector(vector3, color) {

	var points = [new THREE.Vector3(), vector3];
	drawCustomLine(points, color);
}

function hermite_getPosition(t, p0, v0, p1, v1) {
	var p;
	p = p0.clone().multiplyScalar(2*t*t*t-3*t*t+1)
	p.add(v0.clone().multiplyScalar((t*t*t - 2*t*t+t) * Math.abs(p1.x - p0.x)))
	p.add(p1.clone().multiplyScalar(-2*t*t*t + 3*t*t))
	p.add(v1.clone().multiplyScalar((t*t*t-t*t) * Math.abs(p1.x - p0.x)))

	return p;
}

function hermite_getSpeed(t, p0, v0, p1, v1) {
	var v;
	v = p0.clone().multiplyScalar((6*t*t-6*t) / Math.abs(p1.x - p0.x))
	v.add(v0.clone().multiplyScalar(3*t*t-4*t+1))
	v.add(p1.clone().multiplyScalar((-6*t*t+6*t) / Math.abs(p1.x - p0.x)))
	v.add(v1.clone().multiplyScalar(3*t*t-2*t))
	return v;
}

/*
* p0, p1 is the start/end position
* v0, v1 is the tangent at start/end position
* samplingRate is the inverse of the uniformed sampling point
*
* BUG: if p0, p0 + v0, p1 +v1 is all in line, inifinite loop happens
*/
function cubicHermitePoints(p0, v0, p1, v1, samplingRate) {
	var rate = samplingRate || 10;
	var step = (p1.x - p0.x) / rate;
	var points = [];
	var p;
	var t = 0, x = p0.x;
	var range = Math.abs(p1.x - p0.x);

	do {
		t = (x - p0.x) / (p1.x - p0.x);
		if (t > 1) t = 1;
		p = p0.clone().multiplyScalar(2*t*t*t-3*t*t+1)
		p.add(v0.clone().multiplyScalar((t*t*t - 2*t*t+t) * range))
		p.add(p1.clone().multiplyScalar(-2*t*t*t + 3*t*t))
		p.add(v1.clone().multiplyScalar((t*t*t-t*t) * range))
		points.push(p);
		// drawSphereAtPoint(p, 0.05, 0xFF6666)
		x += step;
	} while (t < 1);

	drawSphereAtPoint(p0, 0.08, 0x0000FF)
	drawSphereAtPoint(p1, 0.08, 0x00FF00)
	drawCustomLine([p0, p0.clone().add(v0)], 0xFF6666)
	drawCustomLine([p1, p1.clone().add(v1)], 0x6666FF)
	// drawCustomLine(points, 0x000000)

	return points;
}

function cubicHermitePoints_subDivide(p0, v0, p1, v1) {
	// draw by sub-division
	var step = 1;
	var points = [];
	var mid, midv;
	var firstHalf = [], lastHalf = [];

	if (p0.distanceTo(p1) <= step * 2 - 1E-4) {
		points.push(p0);
		points.push(p1);
		return points;
	} else {
		mid = hermite_getPosition(0.5, p0, v0, p1, v1);
		midv = hermite_getSpeed(0.5, p0, v0, p1, v1);
		// drawSphereAtPoint(mid, 0.1, 0xFF0000);
		// drawCustomLine([mid, mid.clone().add(midv)], 0xFF0000);
		
		firstHalf = cubicHermitePoints_subDivide(p0, v0, mid, midv);
		lastHalf = cubicHermitePoints_subDivide(mid, midv, p1, v1);
		lastHalf.splice(0, 1);
		points = points.concat(firstHalf);
		points = points.concat(lastHalf);
	}

	return points;
}

function linearInterpolation(p0, p1, t) {
	var p;
	p = p0.clone().multiplyScalar(1-t);
	p.add(p1.clone().multiplyScalar(t));

	return p;
}

function customLineLength(points) {
	var l = 0;
	for (var i = 1; i < points.length; i++) {
		l += points[i].distanceTo(points[i - 1]);
	}
	return l;
}

function evenDistributePoints(points, step) {

	var length = 0;
	var pointS = [];
	var currentS = 0;
	var index = 0;
	var newPoint;
	var newPoints = [];
	
	for (var i = 0; i < points.length; i++) {
		
		if (i == 0) 
			length = 0;
		else
			length += points[i].distanceTo(points[i - 1]);

		pointS.push(length);
	}

	do {

		if (Math.abs(currentS - length) < 1E-4 || currentS > length) currentS = length;

		while (currentS > 0 && index < points.length && currentS >= pointS[index + 1]) {
			index++;
		}

		if (currentS == length) {
			newPoint = points[points.length - 1];
		} else {
			newPoint = linearInterpolation(points[index], points[index + 1], (currentS - pointS[index]) / (pointS[index + 1] - pointS[index]));
		}

		newPoints.push(newPoint);
		drawSphereAtPoint(newPoint, 0.05, 0x00FF00);

		currentS += step;

	} while(currentS < length + step);

	return newPoints;
}

function slopeLine(length, startSlope, endSlope) {

	var step = 1;
	var s = preS = 0;
	var k = (endSlope - startSlope) / length;
	var point, prePoint;
	var points = [];

	do {

		if (Math.abs(s - length) < 1E-4 || s > length) {
			s = length;
		}

		if (s == 0) {
			points.push(new THREE.Vector3());
			s += step;
			continue;
		}

		prePoint = points[points.length - 1];
		point = prePoint.clone().add(new THREE.Vector3((s - preS),0,0)).add(new THREE.Vector3(0,0,(s - preS) * (k * (s + preS) * 0.5 + startSlope)));

		points.push(point);

		preS = s;
		s += step;

	} while( s < length + step);

	return points;
}

function cubicEaseElevation(length, startSlope, endSlope, deltaZ) {

	var elevation = {a: 0, b: 0, c: 0, d: 0};
	elevation.b = startSlope;
	elevation.c = (3 * deltaZ - 2 * startSlope * length - endSlope * length) / Math.pow(length, 2);
	elevation.d = (startSlope * length + endSlope * length - 2 * deltaZ) / Math.pow(length, 3);

	var step = 1;
	var s = 0;
	var points = [];

	do {

		if (Math.abs(s - length) < 1E-4 || s > length) s == length;

		points.push(new THREE.Vector3(s, 0, cubicPolynomial(s, elevation)));

		s += step;

	} while (s < length + step);

	return points;
}


function squareEaseElevation(length, startSlope, endSlope) {

	var elevation = {a: 0, b: 0, c: 0, d: 0};
	elevation.b = startSlope;
	elevation.c = (- startSlope + endSlope) / 2 / length;

	var step = 1;
	var s = 0;
	var points = [];

	do {

		if (Math.abs(s - length) < 1E-4 || s > length) s == length;

		points.push(new THREE.Vector3(s, 0, cubicPolynomial(s, elevation)));

		s += step;

	} while (s < length + step);

	return points;
}

/*
* Draw road mark given the reference line geometry
*
* NOTE: draw road mark triangulate error for road509 geometry 4/5 as type 'line'. Do not know WHY?
* for this geometry, reversed lBorder's two first elements only differs a distance of ~e-16, get rid of lBorder[1], it's OK <- not a permernant solution. since error won't happen on the symetrically short line on the other side 
*
* @Param laneSectionStart the start position (s-coodinate), used for finding which road mark entries are for the geometry
* @Param laneId the id of the lane which roadMarks belongs to (used only for double roadMark)
* @Param oBorder the outer border line geometry of the lane, it's modified from geometry reference line
* @Param elevationLateralProfile the elevations, superelevations, crossfalls array covered by oBorder
* @Param heights array of {s, height} the height offset array from track level (for lane height, not allowed for central lane)
* @Param roadMarks roadMark array of lane to draw
* 	v1---------------------v2	 t
*	|						|	/|\
*	----- reference line ----	 |
*	|						|	 |______ s 
*	v4---------------------v3			
*/
function drawRoadMark(laneSectionStart, laneId, oBorder, elevationLateralProfile, outerHeights, roadMarks) {

	if (!roadMarks) return;

	if (roadMarks.length == 0) return;

	// road mark color info
	var colorMaterial = {};
	colorMaterial.standard = new THREE.MeshBasicMaterial({color: 0xFFFFFF});
	colorMaterial.blue = new THREE.MeshBasicMaterial({color: 0x0000FF});
	colorMaterial.green = new THREE.MeshBasicMaterial({color: 0x00FF00});
	colorMaterial.red = new THREE.MeshBasicMaterial({color: 0xFF0000});
	colorMaterial.white = new THREE.MeshBasicMaterial({color: 0xFFFFFF});
	colorMaterial.yellow = new THREE.MeshBasicMaterial({color: 0xFFD700});

	// find which roadMarks are covered by this oBorder seg
	var currentMarks = [];
	for (var i = 0; i < roadMarks.length; i++) {
		var roadMark = roadMarks[i];
		var nextRoadMarkS = roadMarks[i + 1] ? roadMarks[i + 1].sOffset + laneSectionStart : oBorder.s + oBorder.centralLength;
		if (nextRoadMarkS <= oBorder.s || Math.abs(nextRoadMarkS - oBorder.s) <= 1E-4) {	
			continue;
		} else if (oBorder.s + oBorder.centralLength <= roadMark.sOffset + laneSectionStart || Math.abs(oBorder.s + oBorder.centralLength - roadMark.sOffset - laneSectionStart) <= 1E-4) {
			break;
		} else {
			currentMarks.push(roadMark);
		}
	}

	for (var i = 0; i < currentMarks.length; i++) {

		var roadMark = currentMarks[i];

		var nextRoadMarkS = currentMarks[i + 1] ? currentMarks[i + 1].sOffset + laneSectionStart : oBorder.s + oBorder.centralLength;

		if (roadMark.type == 'none') continue;

		var sOffset = Math.max(roadMark.sOffset + laneSectionStart - oBorder.s, 0);
		var width = roadMark.width;
		var length = Math.min(nextRoadMarkS, oBorder.s + oBorder.centralLength) - Math.max(roadMark.sOffset + laneSectionStart, oBorder.s);

		var offsetA = oBorder.offset.a + oBorder.offset.b * sOffset + oBorder.offset.c * Math.pow(sOffset, 2) + oBorder.offset.d * Math.pow(sOffset, 3);
		var offsetB = oBorder.offset.b + 2 * oBorder.offset.c * sOffset + 3 * oBorder.offset.d * Math.pow(sOffset, 2);
		var offsetC = oBorder.offset.c + 3 * oBorder.offset.d * sOffset;
		var offsetD = oBorder.offset.d;

		var subElevationLateralProfile = {};
		subElevationLateralProfile.elevations = getElevation(elevationLateralProfile.elevations, Math.max(roadMark.sOffset + laneSectionStart, oBorder.s),  Math.min(nextRoadMarkS, oBorder.s + oBorder.centralLength));
		subElevationLateralProfile.superelevations = getSuperElevation(elevationLateralProfile.superelevations, Math.max(roadMark.sOffset + laneSectionStart, oBorder.s),  Math.min(nextRoadMarkS, oBorder.s + oBorder.centralLength));
		subElevationLateralProfile.crossfalls = getCrossfall(elevationLateralProfile.crossfalls, Math.max(roadMark.sOffset + laneSectionStart, oBorder.s),  Math.min(nextRoadMarkS, oBorder.s + oBorder.centralLength));

		var lBorderPoints, rBorderPoints;
		var llBorderPoints, lrBorderPoints, rlBorderPoints, rrBorderPoints;
		var geometry, lgeometry, rgeometry, mesh;

		switch(oBorder.type) {

			case 'line':

				var sx = oBorder.centralX + sOffset * Math.cos(oBorder.hdg);
				var sy = oBorder.centralY + sOffset * Math.sin(oBorder.hdg);

				var lateralOffset;

				if (roadMark.type.split(' ').length == 1) {
					lateralOffset = {a: offsetA - width / 2, b: offsetB, c: offsetC, d: offsetD};
					rBorderPoints = generateCubicPoints(sOffset, length, subElevationLateralProfile, outerHeights, sx, sy, oBorder.hdg, lateralOffset);
					
					lateralOffset = {a: offsetA + width / 2, b: offsetB, c: offsetC, d: offsetD};
					lBorderPoints = generateCubicPoints(sOffset, length, subElevationLateralProfile, outerHeights, sx, sy, oBorder.hdg, lateralOffset);
				}
				
				if (roadMark.type.split(' ').length == 2) {
					lateralOffset = {a: offsetA - 0.75 * width - width / 2, b: offsetB, c: offsetC, d: offsetD};
					rrBorderPoints = generateCubicPoints(sOffset, length, subElevationLateralProfile, outerHeights, sx, sy, oBorder.hdg, lateralOffset);
					
					lateralOffset = {a: offsetA - 0.75 * width + width / 2, b: offsetB, c: offsetC, d: offsetD};
					rlBorderPoints = generateCubicPoints(sOffset, length, subElevationLateralProfile, outerHeights, sx, sy, oBorder.hdg, lateralOffset);

					lateralOffset = {a: offsetA + 0.75 * width - width / 2, b: offsetB, c: offsetC, d: offsetD};
					lrBorderPoints = generateCubicPoints(sOffset, length, subElevationLateralProfile, outerHeights, sx, sy, oBorder.hdg, lateralOffset);
					
					lateralOffset = {a: offsetA + 0.75 * width + width / 2, b: offsetB, c: offsetC, d: offsetD};
					llBorderPoints = generateCubicPoints(sOffset, length, subElevationLateralProfile, outerHeights, sx, sy, oBorder.hdg, lateralOffset);
				}

				break;
			case 'spiral':

				/* NOTE: multiple roadMarks may happen on geometries besides 'line', e.g. road#91 geometry#1*/
				var lateralOffset;

				if (roadMark.type.split(' ').length == 1) {
					lateralOffset = {a: offsetA - width / 2, b: offsetB, c: offsetC, d: offsetD};
					rBorderPoints = generateSpiralPoints(oBorder.length, subElevationLateralProfile, outerHeights, oBorder.centralX, oBorder.centralY, oBorder.hdg, oBorder.spiral.curvStart, oBorder.spiral.curvEnd, oBorder.ex, oBorder.ey, lateralOffset, sOffset, length).points;
					//drawCustomLine(rBorderPoints, 0xFF6666);

					lateralOffset = {a: offsetA + width / 2, b: offsetB, c: offsetC, d: offsetD};
					lBorderPoints = generateSpiralPoints(oBorder.length, subElevationLateralProfile, outerHeights, oBorder.centralX, oBorder.centralY, oBorder.hdg, oBorder.spiral.curvStart, oBorder.spiral.curvEnd, oBorder.ex, oBorder.ey, lateralOffset, sOffset, length).points;
					//drawCustomLine(lBorderPoints, 0x6666FF);
				}

				if (roadMark.type.split(' ').length == 2) {
					lateralOffset = {a: offsetA - 0.75 * width - width / 2, b: offsetB, c: offsetC, d: offsetD};
					rrBorderPoints = generateSpiralPoints(oBorder.length, subElevationLateralProfile, outerHeights, oBorder.centralX, oBorder.centralY, oBorder.hdg, oBorder.spiral.curvStart, oBorder.spiral.curvEnd, oBorder.ex, oBorder.ey, lateralOffset, sOffset, length).points;

					lateralOffset = {a: offsetA - 0.75 * width + width / 2, b: offsetB, c: offsetC, d: offsetD};
					rlBorderPoints = generateSpiralPoints(oBorder.length, subElevationLateralProfile, outerHeights, oBorder.centralX, oBorder.centralY, oBorder.hdg, oBorder.spiral.curvStart, oBorder.spiral.curvEnd, oBorder.ex, oBorder.ey, lateralOffset, sOffset, length).points;

					lateralOffset = {a: offsetA + 0.75 * width - width / 2, b: offsetB, c: offsetC, d: offsetD};
					lrBorderPoints = generateSpiralPoints(oBorder.length, subElevationLateralProfile, outerHeights, oBorder.centralX, oBorder.centralY, oBorder.hdg, oBorder.spiral.curvStart, oBorder.spiral.curvEnd, oBorder.ex, oBorder.ey, lateralOffset, sOffset, length).points;

					lateralOffset = {a: offsetA + 0.75 * width + width / 2, b: offsetB, c: offsetC, d: offsetD};
					llBorderPoints = generateSpiralPoints(oBorder.length, subElevationLateralProfile, outerHeights, oBorder.centralX, oBorder.centralY, oBorder.hdg, oBorder.spiral.curvStart, oBorder.spiral.curvEnd, oBorder.ex, oBorder.ey, lateralOffset, sOffset, length).points;
				}

				break;
			case 'arc':

				var curvature = oBorder.arc.curvature;
				var radius = 1 / Math.abs(curvature);
				var theta = sOffset * curvature;
				var rotation = oBorder.hdg - Math.sign(curvature) * Math.PI / 2;
				hdg = oBorder.hdg + theta;

				// get the central reference line start point first
				var sx = oBorder.x - radius * Math.cos(rotation) + radius * Math.cos(rotation + theta);
				var sy = oBorder.y - radius * Math.sin(rotation) + radius * Math.sin(rotation + theta);
				
				var ex = oBorder.ex;
				var ey = oBorder.ey;
				if (nextRoadMarkS != oBorder.s + oBorder.centralLength) {
					theta = (sOffset + length) * curvature;
					ex = oBorder.x - radius * Math.cos(rotation) + radius * Math.cos(rotation + theta);
					ey = oBorder.y - radius * Math.sin(rotation) + radius * Math.sin(rotation + theta);
				}

				var lateralOffset;

				if (roadMark.type.split(' ').length == 1) {
					lateralOffset = {a: offsetA - width / 2, b: offsetB, c: offsetC, d: offsetD};
					rBorderPoints = generateArcPoints(length, subElevationLateralProfile, outerHeights, sx, sy, hdg, curvature, ex, ey, lateralOffset).points;
					
					lateralOffset = {a: offsetA + width / 2, b: offsetB, c: offsetC, d: offsetD};
					lBorderPoints = generateArcPoints(length, subElevationLateralProfile, outerHeights, sx, sy, hdg, curvature, ex, ey, lateralOffset).points;
				}

				if (roadMark.type.split(' ').length == 2) {
					lateralOffset = {a: offsetA - 0.75 * width - width / 2, b: offsetB, c: offsetC, d: offsetD};
					rrBorderPoints = generateArcPoints(length, subElevationLateralProfile, outerHeights, sx, sy, hdg, curvature, ex, ey, lateralOffset).points;
					
					lateralOffset = {a: offsetA - 0.75 * width + width / 2, b: offsetB, c: offsetC, d: offsetD};
					rlBorderPoints = generateArcPoints(length, subElevationLateralProfile, outerHeights, sx, sy, hdg, curvature, ex, ey, lateralOffset).points;

					lateralOffset = {a: offsetA + 0.75 * width - width / 2, b: offsetB, c: offsetC, d: offsetD};
					lrBorderPoints = generateArcPoints(length, subElevationLateralProfile, outerHeights, sx, sy, hdg, curvature, ex, ey, lateralOffset).points;
					
					lateralOffset = {a: offsetA + 0.75 * width + width / 2, b: offsetB, c: offsetC, d: offsetD};
					llBorderPoints = generateArcPoints(length, subElevationLateralProfile, outerHeights, sx, sy, hdg, curvature, ex, ey, lateralOffset).points;
				}

				break;
		}

		if (roadMark.type == 'broken')
			geometry = createDiscontiniousMeshGeometry(lBorderPoints, rBorderPoints)
		if (roadMark.type == 'solid')
			geometry = createCustomFaceGeometry(lBorderPoints, rBorderPoints)
		if (roadMark.type == 'solid solid') {
			lgeometry = createCustomFaceGeometry(llBorderPoints, lrBorderPoints)
			rgeometry = createCustomFaceGeometry(rlBorderPoints, rrBorderPoints)
		}
		if (roadMark.type == 'broken broken') {
			lgeometry = createDiscontiniousMeshGeometry(llBorderPoints, lrBorderPoints)
			rgeometry = createDiscontiniousMeshGeometry(rlBorderPoints, rrBorderPoints)
		}
		if (roadMark.type == 'solid broken') {
			if (laneId > 0) {
				lgeometry = createDiscontiniousMeshGeometry(llBorderPoints, lrBorderPoints)
				rgeometry = createCustomFaceGeometry(rlBorderPoints, rrBorderPoints)
			} else {
				lgeometry = createCustomFaceGeometry(llBorderPoints, lrBorderPoints)
				rgeometry = createDiscontiniousMeshGeometry(rlBorderPoints, rrBorderPoints)
			}
		}
		if (roadMark.type == 'broken solid') {
			if (laneId > 0) {
				lgeometry = createCustomFaceGeometry(llBorderPoints, lrBorderPoints)
				rgeometry = createDiscontiniousMeshGeometry(rlBorderPoints, rrBorderPoints)
			} else {
				lgeometry = createDiscontiniousMeshGeometry(llBorderPoints, lrBorderPoints)
				rgeometry = createCustomFaceGeometry(rlBorderPoints, rrBorderPoints)
			}
		}

		if (geometry) {
			mesh = new THREE.Mesh(geometry, colorMaterial[roadMark.color]);
		}
		else {
			mesh = new THREE.Mesh();
			mesh.add(new THREE.Mesh(lgeometry, colorMaterial[roadMark.color]));
			mesh.add(new THREE.Mesh(rgeometry, colorMaterial[roadMark.color]));
		}

		mesh.position.set(0,0,0.002);
		mesh.updateMatrixWorld();
		scene.add(mesh);
		group.roadMark.push(mesh);
	}
}

/*
* Pave a Lane given the reference line geometry of the inner border of the lane
*
* @Param sectionMesh the mesh of laneSection which is the parent of the mesh to be generated
* @Param laneSectionStart the start position (s-coodinate), used for finding which width entry is for the geometry
* @Param geometry the reference line geometry of the inner border of the lane (geometry.offset is the offset from central reference line)
* @Param elevationLateralProfile tehe whole road's, who contains the lane, elevationProfile, superElevationProfile and crossfallProfile
* @Param lane lane to pave
* @Return the outerborder geometry of current lane for paving next lane
*
*	  --------- central geometry ---------
*
* 	  ----- v1---- inner border ---v2 ----				v4---------------------v3
*			|						|			or 		|						|
*			|						|					|						|
*			v4---------------------v3			  ----- v1---- inner border ---v2 ----
*
*												  --------- central geometry ---------
*/

function paveLane(sectionMesh, laneSectionStart, geometry, elevationLateralProfile, lane) {

	if (!geometry || !lane) {
		console.info('pave: invalid lane. skipped. geometry', !!geometry, 'lane', !!lane)
		return;
	}

	var subElevationLateralProfile = {elevations: null, superelevations: null, crossfalls: null};

	if (lane.id == 0) {
		subElevationLateralProfile.elevations = getElevation(elevationLateralProfile.elevations, geometry.s, geometry.s + geometry.length);
		if (!lane.level || lane.level == '1' || lane.level == 'true') {
			subElevationLateralProfile.superelevations = getSuperElevation(elevationLateralProfile.superelevations, geometry.s, geometry.s + geometry.length);
			subElevationLateralProfile.crossfalls = getCrossfall(elevationLateralProfile.crossfalls, geometry.s, geometry.s + geometry.length);
		}
		// width and border is not allowed for center lane. center lane only needs to draw the mark
		drawRoadMark(laneSectionStart, lane.id, geometry, subElevationLateralProfile, null, lane.roadMark);
		return;
	}

	// lane color based on lane type
	var color = {};
	color.default = 0xCFCFCF;
	color.restricted = 0xB3834C;
	color.shoulder = 0x32CD32;
	color.parking = 0x9999FF;

	var x = geometry.x;
	var y = geometry.y;
	var ex = geometry.ex;
	var ey = geometry.ey;
	var centralX = geometry.centralX;
	var centralY = geometry.centralY;
	var hdg = geometry.hdg;
	var length = geometry.length;
	var type = geometry.type;
	var oGeometries = [];	// outer border of current geometry

	// store the relative width entries covered by this sgement of geometry
	var currentWidth = [];
	for (var i = 0; i < lane.width.length; i++) {
		var width = lane.width[i];
		var nextWidthSOffset = lane.width[i + 1] ? lane.width[i + 1].sOffset : geometry.s + geometry.centralLength - laneSectionStart;
		if (nextWidthSOffset + laneSectionStart <= geometry.s) {
			continue;
		} else if (geometry.s + geometry.centralLength <= width.sOffset + laneSectionStart) {
			break;
		} else {
			currentWidth.push(width);
		}
	}

	var iBorderPoints, oBorderPoints, topiBorderPoints, topoBorderPoints;
	// laneBase is lane face geometry without height, the rest 5 are used when lane has height, thus lane has six face geometry
	var laneBase, laneTop, laneInnerSide, laneOuterSide, lanePositiveS, laneNegativeS;
	var mesh;

	for (var i = 0; i < currentWidth.length; i++) {

		var oGeometry = {};
		oGeometry.hdg = hdg;
		oGeometry.type = type;
		
		// offset distance along central geometry (line) from start of the geometry to start of the current width seg
		var width = currentWidth[i];
		var gOffset = Math.max(width.sOffset + laneSectionStart - geometry.s, 0);
		var nextWidthSOffset = currentWidth[i + 1] ? currentWidth[i + 1].sOffset : geometry.s + geometry.centralLength - laneSectionStart;
		
		length = Math.min(nextWidthSOffset + laneSectionStart, geometry.s + geometry.centralLength) - Math.max(width.sOffset + laneSectionStart, geometry.s);

		// generate data for oGeometry
		oGeometry.s = Math.max(width.sOffset + laneSectionStart, geometry.s);
		oGeometry.length = length;
		oGeometry.centralLength = length;

		// width offset distance along central geometry (line) from start of the width entry to start of the current geometry.s
		var wOffset = Math.max(geometry.s - width.sOffset - laneSectionStart, 0);

		/** NOTE: make sure WHICH geometry is used here to generate shifted inner border's coefficients! */
		var innerA = geometry.offset.a + geometry.offset.b * gOffset + geometry.offset.c * Math.pow(gOffset, 2) + geometry.offset.d * Math.pow(gOffset, 3);
		var innerB = geometry.offset.b + 2 * geometry.offset.c * gOffset + 3 * geometry.offset.d * Math.pow(gOffset, 2);
		var innerC = geometry.offset.c + 3 * geometry.offset.d * gOffset;
		var innerD = geometry.offset.d;
		var widthA = width.a + width.b * wOffset + width.c * Math.pow(wOffset, 2) + width.d * Math.pow(wOffset, 3);
		var widthB = width.b + 2 * width.c * wOffset + 3 * width.d * Math.pow(wOffset, 2);
		var widthC = width.c + 3 * width.d * wOffset;
		var widthD = width.d;

		oGeometry.offset = {};
		oGeometry.offset.a = innerA + Math.sign(lane.id) * widthA;
		oGeometry.offset.b = innerB + Math.sign(lane.id) * widthB;
		oGeometry.offset.c = innerC + Math.sign(lane.id) * widthC;
		oGeometry.offset.d = innerD + Math.sign(lane.id) * widthD;

		// elevations covered by this width segment
		subElevationLateralProfile.elevations = getElevation(elevationLateralProfile.elevations, Math.max(width.sOffset + laneSectionStart, geometry.s), Math.min(nextWidthSOffset + laneSectionStart, geometry.s + geometry.centralLength));
		if (!lane.level || lane.level == '0' || lane.level == 'false') {
			subElevationLateralProfile.superelevations = getSuperElevation(elevationLateralProfile.superelevations, Math.max(width.sOffset + laneSectionStart, geometry.s), Math.min(nextWidthSOffset + laneSectionStart, geometry.s + geometry.centralLength));
			subElevationLateralProfile.crossfalls = getCrossfall(elevationLateralProfile.crossfalls, Math.max(width.sOffset + laneSectionStart, geometry.s), Math.min(nextWidthSOffset + laneSectionStart, geometry.s + geometry.centralLength));
		}

		// laneHeights of the current lane covered by this width segment {inner: array of {s, height}, outer: array of {s, height}}
		var laneHeights = getLaneHeight(laneSectionStart, lane.height, Math.max(width.sOffset + laneSectionStart, geometry.s), Math.min(nextWidthSOffset + laneSectionStart, geometry.s + geometry.centralLength));

		switch(type) {
			
			case 'line':
				var sx = centralX + gOffset * Math.cos(hdg);
				var sy = centralY + gOffset * Math.sin(hdg);

				// tOffset of centralLane at start of the current width seg
				var ds = gOffset;
				var tOffset = geometry.offset.a + geometry.offset.b * ds + geometry.offset.c * Math.pow(ds, 2) + geometry.offset.d * Math.pow(ds, 3);

				// tOffset of centralLane at the end of the current width seg
				var ds = gOffset + length;
				var tOffset = geometry.offset.a + geometry.offset.b * ds + geometry.offset.c * Math.pow(ds, 2) + geometry.offset.d * Math.pow(ds, 3);

				ex = sx + length * Math.cos(hdg) + Math.abs(tOffset) * Math.cos(hdg + Math.PI / 2 * Math.sign(tOffset));
				ey = sy + length * Math.sin(hdg) + Math.abs(tOffset) * Math.sin(hdg + Math.PI / 2 * Math.sign(tOffset));
				
				oGeometry.x = sx + Math.abs(oGeometry.offset.a) * Math.cos(hdg + Math.PI / 2 * Math.sign(oGeometry.offset.a));
				oGeometry.y = sy + Math.abs(oGeometry.offset.a) * Math.sin(hdg + Math.PI / 2 * Math.sign(oGeometry.offset.a));
				
				tOffset = oGeometry.offset.a + oGeometry.offset.b * length  + oGeometry.offset.c * Math.pow(length, 2) + oGeometry.offset.d * Math.pow(length, 3);
				oGeometry.ex = ex + Math.abs(tOffset) * Math.cos(hdg + Math.PI / 2 * Math.sign(tOffset));
				oGeometry.ey = ey + Math.abs(tOffset) * Math.sin(hdg + Math.PI / 2 * Math.sign(tOffset));

				oGeometry.centralX = sx;
				oGeometry.centralY = sy;

				// generate spline points
				if (!(width.a == 0 && width.b == 0 && width.c == 0 && width.d == 0)) {

					// get inner border spline points
					iBorderPoints = generateCubicPoints(gOffset, length, subElevationLateralProfile, null, sx, sy, hdg, geometry.offset);
					//drawCustomLine(iBorderPoints, 0xFF6666);

					// get outer border spline points
					oBorderPoints = generateCubicPoints(0, length, subElevationLateralProfile, null, sx, sy, hdg, oGeometry.offset);
					//drawCustomLine(oBorderPoints, 0x6666FF);
					
					if (lane.id < 0)
						laneBase = createCustomFaceGeometry(iBorderPoints, oBorderPoints);
					else if (lane.id > 0)
						laneBase = createCustomFaceGeometry(oBorderPoints, iBorderPoints);

					if (laneHeights.inner.length && laneHeights.outer.length) {

						topiBorderPoints = generateCubicPoints(gOffset, length, subElevationLateralProfile, laneHeights.inner, sx, sy, hdg, geometry.offset);
						topoBorderPoints = generateCubicPoints(0, length, subElevationLateralProfile, laneHeights.outer, sx, sy, hdg, oGeometry.offset);

						if (lane.id < 0) {
							laneTop = createCustomFaceGeometry(topiBorderPoints, topoBorderPoints);
							laneInnerSide = createCustomFaceGeometry(iBorderPoints, topiBorderPoints);
							laneOuterSide = createCustomFaceGeometry(topoBorderPoints, oBorderPoints);
							lanePositiveS = createCustomFaceGeometry([topiBorderPoints[topiBorderPoints.length - 1], iBorderPoints[iBorderPoints.length - 1]], [topoBorderPoints[topoBorderPoints.length - 1], oBorderPoints[oBorderPoints.length - 1]]);
							laneNegativeS = createCustomFaceGeometry([topoBorderPoints[0], oBorderPoints[0]], [topiBorderPoints[0], iBorderPoints[0]]);
						}
						else if (lane.id > 0) {
							laneTop = createCustomFaceGeometry(topoBorderPoints, topiBorderPoints);
							laneInnerSide = createCustomFaceGeometry(topiBorderPoints, iBorderPoints);
							laneOuterSide = createCustomFaceGeometry(oBorderPoints, topoBorderPoints);
							lanePositiveS = createCustomFaceGeometry([topoBorderPoints[topoBorderPoints.length - 1], oBorderPoints[oBorderPoints.length - 1]], [topiBorderPoints[topiBorderPoints.length - 1], iBorderPoints[iBorderPoints.length - 1]]);
							laneNegativeS = createCustomFaceGeometry([topiBorderPoints[0], iBorderPoints[0]], [topoBorderPoints[0], oBorderPoints[0]]);
						}
					}
				}

				break;
			case 'spiral':

				//* ALWAYS use the central clothoid and shift by tOffset to find the border when paving along spiral line

				var centralSample = generateSpiralPoints(geometry.centralLength, null, null, geometry.centralX, geometry.centralY, geometry.hdg, geometry.spiral.curvStart, geometry.spiral.curvEnd, geometry.ex, geometry.ey, null, gOffset, length);
				var sx = centralSample.points[0].x;
				var sy = centralSample.points[0].y;
				hdg = centralSample.heading[0];
				ex = centralSample.points[centralSample.points.length - 1].x;
				ey = centralSample.points[centralSample.points.length - 1].y;

				//* NOTE: for spiral only, all its x,y, ex,ey, curvStart, curvEnd are the same as central reference line, i.e. keeps the same as original geometry when paving across lanes
				oGeometry.x = sx;
				oGeometry.y = sy;
				oGeometry.centralX = sx;
				oGeometry.centralY = sy;
				oGeometry.ex = ex;
				oGeometry.ey = ey;
				oGeometry.hdg = hdg;

				var curvStart = geometry.spiral.curvStart + gOffset * (geometry.spiral.curvEnd - geometry.spiral.curvStart) / geometry.centralLength;
				var curvEnd = geometry.spiral.curvStart + (gOffset + length) * (geometry.spiral.curvEnd - geometry.spiral.curvStart) / geometry.centralLength;

				oGeometry.spiral = {curvStart: curvStart, curvEnd: curvEnd};

				// generate spline points
				if (!(width.a == 0 && width.b == 0 && width.c == 0 && width.d == 0)) {

					// get inner border spline points
					iBorderPoints = generateSpiralPoints(length, subElevationLateralProfile, null, sx, sy, hdg, curvStart, curvEnd, ex, ey, {a: innerA, b: innerB, c: innerC, d: innerD}).points;
					//drawCustomLine(iBorderPoints, 0xFF6666);
					//if (lane.type != 'border' && lane.type != 'none') drawLineAtPoint(iBorderPoints[iBorderPoints.length - 1], geometry.hdg + Math.sign(lane.id) * Math.PI / 4)
					//if (lane.type != 'border' && lane.type != 'none') drawLineAtPoint(iBorderPoints[0], geometry.hdg + Math.sign(lane.id) * Math.PI / 2)	

					// get outer border spline points
					oBorderPoints = generateSpiralPoints(oGeometry.length, subElevationLateralProfile, null, oGeometry.x, oGeometry.y, oGeometry.hdg, oGeometry.spiral.curvStart, oGeometry.spiral.curvEnd, oGeometry.ex, oGeometry.ey, oGeometry.offset).points;
					//drawCustomLine(oBorderPoints, 0x6666FF);
					//if (lane.type != 'border' && lane.type != 'none') drawLineAtPoint(oBorderPoints[oBorderPoints.length - 1], geometry.hdg + Math.sign(lane.id) * Math.PI / 4)
					
					if (lane.id < 0)
						laneBase = createCustomFaceGeometry(iBorderPoints, oBorderPoints);
					if (lane.id > 0)
						laneBase = createCustomFaceGeometry(oBorderPoints, iBorderPoints);

					if (laneHeights.inner.length && laneHeights.outer.length) {

						topiBorderPoints = generateSpiralPoints(geometry.length, subElevationLateralProfile, laneHeights.inner, geometry.x, geometry.y, geometry.hdg, geometry.spiral.curvStart, geometry.spiral.curvEnd, geometry.ex, geometry.ey, geometry.offset, gOffset, length).points;
						topoBorderPoints = generateSpiralPoints(oGeometry.length, subElevationLateralProfile, laneHeights.outer, oGeometry.x, oGeometry.y, oGeometry.hdg, oGeometry.spiral.curvStart, oGeometry.spiral.curvEnd, oGeometry.ex, oGeometry.ey, oGeometry.offset).points;

						if (lane.id < 0) {
							laneTop = createCustomFaceGeometry(topiBorderPoints, topoBorderPoints);
							laneInnerSide = createCustomFaceGeometry(iBorderPoints, topiBorderPoints);
							laneOuterSide = createCustomFaceGeometry(topoBorderPoints, oBorderPoints);
							lanePositiveS = createCustomFaceGeometry([topiBorderPoints[topiBorderPoints.length - 1], iBorderPoints[iBorderPoints.length - 1]], [topoBorderPoints[topoBorderPoints.length - 1], oBorderPoints[oBorderPoints.length - 1]]);
							laneNegativeS = createCustomFaceGeometry([topoBorderPoints[0], oBorderPoints[0]], [topiBorderPoints[0], iBorderPoints[0]]);
						}
						else if (lane.id > 0) {
							laneTop = createCustomFaceGeometry(topoBorderPoints, topiBorderPoints);
							laneInnerSide = createCustomFaceGeometry(topiBorderPoints, iBorderPoints);
							laneOuterSide = createCustomFaceGeometry(oBorderPoints, topoBorderPoints);
							lanePositiveS = createCustomFaceGeometry([topoBorderPoints[topoBorderPoints.length - 1], oBorderPoints[oBorderPoints.length - 1]], [topiBorderPoints[topiBorderPoints.length - 1], iBorderPoints[iBorderPoints.length - 1]]);
							laneNegativeS = createCustomFaceGeometry([topiBorderPoints[0], iBorderPoints[0]], [topoBorderPoints[0], oBorderPoints[0]]);
						}
					}
				}

				break;
			case 'arc':

				//* ALWAYS use the central arc and shift by tOffset to find the border when paving along arc line
				
				var curvature = geometry.arc.curvature;
				var radius = 1 / Math.abs(curvature);
				var rotation = geometry.hdg - Math.sign(curvature) * Math.PI / 2;
				var theta = gOffset * curvature;

				//* NOTE: for arc only, all its x,y, ex,ey, curvStart, curvEnd are the same as central reference line, i.e. keeps the same as original geometry when paving across lanes
				var sx = geometry.x - radius * Math.cos(rotation) + radius * Math.cos(rotation + theta);
				var sy = geometry.y - radius * Math.sin(rotation) + radius * Math.sin(rotation + theta);
				hdg = geometry.hdg + theta;
				theta = (gOffset + length) * curvature;
				ex = geometry.ex;
				ey = geometry.ey;
				if (width.sOffset + laneSectionStart + length + 1E-4 <= geometry.s + geometry.length) {
					ex = geometry.x - radius * Math.cos(rotation) + radius * Math.cos(rotation + theta);
					ey = geometry.y - radius * Math.sin(rotation) + radius * Math.sin(rotation + theta);
				}

				oGeometry.x = sx;
				oGeometry.y = sy;
				oGeometry.centralX = sx;
				oGeometry.centralY = sy;
				oGeometry.ex = ex;
				oGeometry.ey = ey;
				oGeometry.hdg = hdg;
				oGeometry.arc = {curvature: curvature};

				// generate spline points
				if (!(width.a == 0 && width.b == 0 && width.c == 0 && width.d == 0)) {

					// get inner border spline points
					iBorderPoints = generateArcPoints(length, subElevationLateralProfile, null, sx, sy, hdg, curvature, ex, ey, {a: innerA, b: innerB, c: innerC, d: innerD}).points;
					//drawCustomLine(iBorderPoints, 0xFF6666);

					// get outer border spline points
					oBorderPoints = generateArcPoints(length, subElevationLateralProfile, null, sx, sy, hdg, curvature, ex, ey, oGeometry.offset).points;
					//drawCustomLine(oBorderPoints, 0x6666FF);
					
					if (lane.id < 0)
						laneBase = createCustomFaceGeometry(iBorderPoints, oBorderPoints);
					if (lane.id > 0)
						laneBase = createCustomFaceGeometry(oBorderPoints, iBorderPoints);

					if (laneHeights.inner.length && laneHeights.outer.length) {

						topiBorderPoints = generateArcPoints(length, subElevationLateralProfile, laneHeights.inner, sx, sy, hdg, curvature, ex, ey, {a: innerA, b: innerB, c: innerC, d: innerD}).points;
						topoBorderPoints = generateArcPoints(length, subElevationLateralProfile, laneHeights.outer, sx, sy, hdg, curvature, ex, ey, oGeometry.offset).points;

						if (lane.id < 0) {
							laneTop = createCustomFaceGeometry(topiBorderPoints, topoBorderPoints);
							laneInnerSide = createCustomFaceGeometry(iBorderPoints, topiBorderPoints);
							laneOuterSide = createCustomFaceGeometry(topoBorderPoints, oBorderPoints);
							lanePositiveS = createCustomFaceGeometry([topiBorderPoints[topiBorderPoints.length - 1], iBorderPoints[iBorderPoints.length - 1]], [topoBorderPoints[topoBorderPoints.length - 1], oBorderPoints[oBorderPoints.length - 1]]);
							laneNegativeS = createCustomFaceGeometry([topoBorderPoints[0], oBorderPoints[0]], [topiBorderPoints[0], iBorderPoints[0]]);
						}
						else if (lane.id > 0) {
							laneTop = createCustomFaceGeometry(topoBorderPoints, topiBorderPoints);
							laneInnerSide = createCustomFaceGeometry(topiBorderPoints, iBorderPoints);
							laneOuterSide = createCustomFaceGeometry(oBorderPoints, topoBorderPoints);
							lanePositiveS = createCustomFaceGeometry([topoBorderPoints[topoBorderPoints.length - 1], oBorderPoints[oBorderPoints.length - 1]], [topiBorderPoints[topiBorderPoints.length - 1], iBorderPoints[iBorderPoints.length - 1]]);
							laneNegativeS = createCustomFaceGeometry([topiBorderPoints[0], iBorderPoints[0]], [topoBorderPoints[0], oBorderPoints[0]]);
						}
					}
				}

				break;
		}

		oGeometries.push(oGeometry);

		try {
			if (laneBase && lane.type != 'border' && lane.type != 'none') {
				mesh = new THREE.Mesh();
				var baseMesh = new THREE.Mesh(laneBase, new THREE.MeshBasicMaterial({color: color[lane.type]? color[lane.type] : color.default, side: THREE.DoubleSide}));
				mesh.add(baseMesh);
				
				if (laneHeights.inner.length && laneHeights.outer.length) {
					var topMesh = new THREE.Mesh(laneTop, new THREE.MeshBasicMaterial({color: color[lane.Type]? color[lane.type] : color.default, side: THREE.DoubleSide}))
					var innerMesh = new THREE.Mesh(laneInnerSide, new THREE.MeshBasicMaterial({color: color[lane.type]? color[lane.type] : color.default, side: THREE.DoubleSide}));
					var outerMesh = new THREE.Mesh(laneOuterSide, new THREE.MeshBasicMaterial({color: color[lane.type]? color[lane.type] : color.default, side: THREE.DoubleSide}));
					var frontMesh = new THREE.Mesh(lanePositiveS, new THREE.MeshBasicMaterial({color: color[lane.type]? color[lane.type] : color.default, side: THREE.DoubleSide}));
					var backMesh = new THREE.Mesh(laneNegativeS, new THREE.MeshBasicMaterial({color: color[lane.type]? color[lane.type] : color.default, side: THREE.DoubleSide}));
					mesh.add(topMesh);
					mesh.add(innerMesh);
					mesh.add(outerMesh);
					mesh.add(frontMesh);
					mesh.add(backMesh);
				}
				if (!baseMesh.geometry.getAttribute('position')) throw Error(lane.id, 'mesh geometry do not contain vertices')
				scene.add(mesh);
				group.road.push(mesh);
				sectionMesh.add(mesh.clone());
			}
		} catch(e) {
			console.error(type, e.stack)
		}

		// draw road marks
		try {
			if (oGeometry.length > 1E-10)
				drawRoadMark(laneSectionStart, lane.id, oGeometries[i], subElevationLateralProfile, laneHeights.outer, lane.roadMark);
		} catch(e) {
			console.error(e);
		}
	}

	return oGeometries;
}

/*
* Helper for paveLane
*
* Get corresponding elevation profile covered by [s, es] along the reference line
* @Param elevations the elevations array of a whole road or a consecutive part of a whole road
* @Param s start position in s-coordinate
* @Param es end position in s-soordinate
* @Return elevations an array of elevations starting from position s to the end es or elevations itself when undefined
*/
function getElevation(elevations, s, es) {

	if (s >= es + 1E-4) {
		throw Error('getElevation error: start-s >= endS + 1E-4');
	}

	var newElevations = [];
	var found = false;
	
	if (!elevations) {
		return elevations;
	}

	for (var i = 0; i < elevations.length; i++) {
		var elevation = elevations[i];
		var nextElevationS = elevations[i + 1] ? elevations[i + 1].s : es
		
		// if already found the start of the returning elevation, copy the rest of the elevations as the succeeding ones until es
		if (found) {
			if (elevation.s < es) {
				newElevations.push(elevation);
			} else {
				break;
			}
		}

		if (!found) {
			if (nextElevationS <= s) {
				continue;
			}
			if (elevation.s == s) {
				newElevations.push(elevation);
			} else if (elevation.s < s && nextElevationS > s) {
				var sOffset = s - elevation.s;
				var newElevation = {};
				newElevation.s = s;
				newElevation.a = elevation.a + elevation.b * sOffset + elevation.c * Math.pow(sOffset, 2) + elevation.d * Math.pow(sOffset, 3);
				newElevation.b = elevation.b + 2 * elevation.c * sOffset + 3 * elevation.d * Math.pow(sOffset, 2);
				newElevation.c = elevation.c + 3 * elevation.d * sOffset;
				newElevation.d = elevation.d;
				newElevations.push(newElevation);
			} else {
				console.error(elevation.s, s, nextElevationS)
			}
			found = true;
		}
	}

	return newElevations;
}

/*
* Helper for paveLane
*
* Get corresponding superelevation profile covered by [s, es] along the reference line
* @Param superelevations the superelevations array of a whole road or a consecutive part of a whole road
* @Param s start position in s-coordinate
* @Param es end position in s-coordinate
* @Return newSuperelevations an array of superelevations starting from position s to the end es or superelevations itself when undefined
*/
function getSuperElevation(superelevations, s, es) {

	if (s >= es + 1E-4) {
		throw Error('getSuperElevation error: start-s >= endS + 1E-4');
	}

	var newSuperelevations = [];
	var found = false;

	if (!superelevations) {
		return superelevations;
	}

	for (var i = 0; i < superelevations.length; i++) {

		var superelevation = superelevations[i];
		var nextSuperElevationS = superelevations[i + 1] ? superelevations[i + 1].s : es;

		// if already fount the start of the returning superelevation, copy the rest superelevations as the succeeding ones until es
		if (found) {
			if (superelevation.s < es) {
				newSuperelevations.push(superelevation);
			} else {
				break;
			}
		}

		if (!found) {
			if (nextSuperElevationS <= s) {
				continue;
			}
			if (superelevation.s == s) {
				newSuperelevations.push(superelevation);
			} else if (superelevation.s < s && nextSuperElevationS > s) {
				var sOffset = s - superelevation.s;
				var newSuperelevation = {};
				newSuperelevation.s = s;
				newSuperelevation.a = superelevation.a + superelevation.b * sOffset + superelevation.c * Math.pow(sOffset, 2) + superelevation.d * Math.pow(sOffset, 3);
				newSuperelevation.b = superelevation.b + 2 * superelevation.c * sOffset + 3 * superelevation.d * Math.pow(sOffset, 2);
				newSuperelevation.c = superelevation.c + 3 * superelevation.d * sOffset;
				newSuperelevation.d = superelevation.d;
				newSuperelevations.push(newSuperelevation);
			}
			found = true;
		}
	}

	return newSuperelevations;
}

/*
* Helper for paveLane
*
* Get corresponding crossfall profile covered by [s, es] along the reference line
* @Param crossfalls the crossfalls array of a whole road or a consecutive part of a whole road
* @Param s start position in s-coordinate
* @Param es end position in s-coordinate
* @Return newCrossfalls an array of crossfalls starting from position s to the end es or crossfalls itself when undefined
*/
function getCrossfall(crossfalls, s, es) {

	if (s >= es + 1E-4) {
		throw Error('getCrossfall error: start-s >= endS + 1E-4');
	}

	var newCrossfalls = [];
	var found = false;

	if (!crossfalls) {
		return crossfalls;
	}

	for (var i = 0; i < crossfalls.length; i++) {

		var crossfall = crossfalls[i];
		var nextCrossfallS = crossfalls[i + 1] ? crossfalls[i + 1].s : es;

		// if already fount the start of the returning superelevation, copy the rest superelevations as the succeeding ones until es
		if (found) {
			if (crossfall.s < es) {
				newCrossfalls.push(crossfall);
			} else {
				break;
			}
		}

		if (!found) {
			if (nextCrossfallS <= s) {
				continue;
			}
			if (crossfall.s == s) {
				newCrossfalls.push(crossfall);
			} else if (crossfall.s < s && nextCrossfallS > s) {
				var sOffset = s - crossfall.s;
				var newCrossfall = {};
				newCrossfall.s = s;
				newCrossfall.side = crossfall.side;
				newCrossfall.a = crossfall.a + crossfall.b * sOffset + crossfall.c * Math.pow(sOffset, 2) + crossfall.d * Math.pow(sOffset, 3);
				newCrossfall.b = crossfall.b + 2 * crossfall.c * sOffset + 3 * crossfall.d * Math.pow(sOffset, 2);
				newCrossfall.c = crossfall.c + 3 * crossfall.d * sOffset;
				newCrossfall.d = crossfall.d;
				newCrossfalls.push(newCrossfall);
			}
			found = true;
		}
	}

	return newCrossfalls;
}

/*
* Helper for paveLane
*
* Get corresponding inner and outer hOffsets' array of {s, height} in the lane covered by [s, es]
* @Param laneSectionStart 
* @Param laneHeights the crossfalls array of a whole road or a consecutive part of a whole road
* @Param s start position in s-coordinate
* @Param es end position in s-coordinate
* @Return {inner hOffset array, outer hOffset array} inner and outer hOffsets' array of {s, height} starting from position s to the end es or 0-length array
*/
function getLaneHeight(laneSectionStart, laneHeights, s, es) {

	if (s >= es + 1E-4) {
		throw Error('getCrossfall error: start-s >= endS + 1E-4');
	}
	
	var newLaneHeights;
	var innerHeights = [];
	var outerHeights = [];
	var found = false;

	if (!laneHeights) {
		return {inner: innerHeights, outer: outerHeights};
	}

	for (var i = 0; i < laneHeights.length; i++) {

		var laneHeight = laneHeights[i];
		var nextLaneHeightS = laneHeights[i + 1] ? laneHeights[i + 1].sOffset + laneSectionStart : es;

		// if already fount the start of the returning superelevation, copy the rest superelevations as the succeeding ones until es
		if (found) {
			if (laneHeight.s < es) {
				innerHeights.push({s: laneHeight.s, height: laneHeight.inner});
				outerHeights.push({s: laneHeight.s, height: laneHeight.outer});
			} else {
				break;
			}
		}

		if (!found) {
			if (nextLaneHeightS <= s) {
				continue;
			}
			if (laneHeight.sOffset + laneSectionStart == s || (laneHeight.sOffset + laneSectionStart < s && nextLaneHeightS > s)) {
				innerHeights.push({s: laneHeight.sOffset + laneSectionStart, height: laneHeight.inner});
				outerHeights.push({s: laneHeight.sOffset + laneSectionStart, height: laneHeight.outer});
				found = true;
			}
		}
	}

	newLaneHeights = {inner: innerHeights, outer: outerHeights};

	return newLaneHeights;
}

/*
* Helper for paveLaneSection
*/
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

/*
* Helper for paveLaneSection
*
* Given the start position of a lane section along a road, return the geometry of the road starting from that position
* to the next lane section's start position if any
* @Param road the road as the reference coorodinate system
* @Param s start position in s-coordinate
* @Param es end position in s-soordinate
* @Param maxLength limit of the extraction
* @return geometries an array of geometries starting from position s to the end of the laneSection or maxLength
*/ 
function getGeometry(road, s, es) {

	if (s >= es + 1E-4) {
		throw Error('getGeometry error: start-s >= endS + 1E-4');
	}

	var geometries  = [];
	var found = false;
	//if (maxLength) es = Math.min(es, s + maxLength);

	for (var i = 0; i < road.geometry.length; i++) {
		var geometry = road.geometry[i];
		
		// if already found the start of the returning geometry, copy the rest of the geometries as the suceeding ones until the next lane section starts
		if (found) {
			if (geometry.s + geometry.length <= es) {
				//console.log(found, 'push the whole geometry')				
				geometries.push(road.geometry[i]);
			}
			// Assume delta < 1mm is at the same position
			else if (geometry.s < es && Math.abs(geometry.s - es) > 1E-4) {
				//console.log(found, 'push part of the geometry')
				var newGeometry = {};
				newGeometry.s = geometry.s;
				newGeometry.x = geometry.x;
				newGeometry.y = geometry.y;
				newGeometry.hdg = geometry.hdg;
				newGeometry.type = geometry.type;
				newGeometry.length = es - geometry.s;

				newGeometry.centralX = newGeometry.x;
				newGeometry.centralY = newGeometry.y;
				newGeometry.centralLength = newGeometry.length;

				if (geometry.offset) {
					console.log(geometry.offset)
					newGeometry.offset = geometry.offset;
				}

				// get ex, ey
				switch(geometry.type) {
					case 'line':
						newGeometry.ex = newGeometry.x + newGeometry.length * Math.cos(newGeometry.hdg);
						newGeometry.ey = newGeometry.y + newGeometry.length * Math.sin(newGeometry.hdg);

						break;
					case 'spiral':
						console.error('getGeometry error: not surpport extract part of the geometry of type spiral yet')
						var sample = generateSpiralPoints(geometry.length, null, geometry.x, geometry.y, geometry.hdg, geometry.spiral.curvStart, geometry.spiral.curvEnd, geometry.ex, geometry.ey, null, 0, newGeometry.length);
						newGeometry.ex = sample.points[sample.points.length - 1].x;
						newGeometry.ey = sample.points[sample.points.length - 1].y;
						newGeometry.spiral = {curvStart: 0, curvEnd: 0};
						break;
					case 'arc':
						//console.warn('getGeometry warning: extracting from start geometry arc to position before geometry arc end')
						newGeometry.arc = {curvature: geometry.arc.curvature};
						
						var curvature = newGeometry.arc.curvature;
						var radius = 1 / Math.abs(curvature);
						var rotation = newGeometry.hdg - Math.sign(curvature) * Math.PI / 2;
						var theta = newGeometry.length * curvature;
						newGeometry.ex = newGeometry.x - radius*Math.cos(rotation) + radius * Math.cos(rotation + theta);
						newGeometry.ey = newGeometry.y - radius*Math.sin(rotation) + radius * Math.sin(rotation + theta);
						/*
						var sample = generateArcPoints(geometry.length, null, geometry.x, geometry.y, geometry.hdg, geometry.arc.curvature, geometry.ex, geometry.ey, null, 0, newGeometry.length);
						var points = sample.points;
						newGeometry.ex = points[points.length - 1].x;
						newGeometry.ey = points[points.length - 1].y;
						*/
				}

				geometries.push(newGeometry);
			} else {
				break;
			}
		}

		// found the geometry segment which contains the starting position
		if (!found) {
			if (geometry.s == s) {
				// s is the start of a geometry segment of the road, push the whole geometry seg if nextS is not covered by the same geometry
				if (geometry.s + geometry.length <= es) {
					//console.log(found, 'geometry.s == sectionS, push the whole geometry')
					geometries.push(geometry);
				} else {
					//console.log(found, 'geometry.s == sectionS, push part of the geometry')

					var newGeometry = {};
					newGeometry.s = s;
					newGeometry.x = geometry.x;
					newGeometry.y = geometry.y;
					newGeometry.hdg = geometry.hdg;
					newGeometry.type = geometry.type;
					newGeometry.length = es - geometry.s;

					// customely added attributes to geometry specified in .xodr file
					newGeometry.centralX = geometry.centralX;
					newGeometry.centralY = geometry.centralY;
					newGeometry.centralLength = newGeometry.length;
					if (geometry.offset) {
						console.log(geometry.offset)
						newGeometry.offset = geometry.offset;
					}

					// get ex, ey
					switch(geometry.type) {
						case 'line':
							newGeometry.ex = newGeometry.x + newGeometry.length * Math.cos(newGeometry.hdg);
							newGeometry.ey = newGeometry.y + newGeometry.length * Math.sin(newGeometry.hdg);
							break;
						case 'spiral':
							console.error('getGeometry error: not surpport extract part of the geometry of type spiral yet')
							var points = generateSpiralPoints(geometry.length, null, geometry.x, geometry.y, geometry.hdg, geometry.spiral.curvStart, geometry.spiral, geometry.ex, geometry.ey, null, s - geometry.s, newGeometry.length).points
							console.log(points)
							newGeometry.ex = points[points.length - 1].x;
							newGeometry.ey = points[points.length - 1].y;
							newGeometry.spiral = {curvStart: 0, curvEnd: 0};
							break;
						case 'arc':
							//console.warn('getGeometry warnning: extracting arc from start of geometry to position before geometry end')
							newGeometry.arc = {curvature: geometry.arc.curvature};
							
							var curvature = newGeometry.arc.curvature;
							var radius = 1 / Math.abs(curvature);
							var rotation = newGeometry.hdg - Math.sign(curvature) * Math.PI / 2;
							var theta = newGeometry.length * curvature;
							newGeometry.ex = newGeometry.x - radius*Math.cos(rotation) + radius * Math.cos(rotation + theta);
							newGeometry.ey = newGeometry.y - radius*Math.sin(rotation) + radius * Math.sin(rotation + theta);
							/*
							var sample = generateArcPoints(geometry.length, null, geometry.x, geometry.y, geometry.hdg, geometry.arc.curvature, geometry.ex, geometry.ey, null, 0, newGeometry.length);
							var points = sample.points;
							newGeometry.ex = points[points.length - 1].x;
							newGeometry.ey = points[points.length - 1].y;
							*/
					}		

					geometries.push(newGeometry);
				}
				found = true;
			} else if (geometry.s < s && geometry.s + geometry.length > s) {
				//console.log(found, 'section is in the middle of the geometry')				
				
				// calcuate the first geometry element for the returning geometries
				var ds = s - geometry.s;
				var partialGeometry = {};
				partialGeometry.s = s;
				partialGeometry.type = geometry.type;
				partialGeometry.length = Math.min(es, geometry.s + geometry.length) - s;

				partialGeometry.centralLength = partialGeometry.length;
				if (geometry.offset) {
					console.log('section is in the middle of the geometry with offset <- offset should start along laneSection! error!')
				}

				switch(geometry.type) {
					case 'line':
						partialGeometry.x = geometry.x + ds * Math.cos(geometry.hdg);
						partialGeometry.y = geometry.y + ds * Math.sin(geometry.hdg);
						partialGeometry.hdg = geometry.hdg;

						partialGeometry.centralX = partialGeometry.x;
						partialGeometry.centralY = partialGeometry.y;
						partialGeometry.ex = geometry.x + (ds + partialGeometry.length) * Math.cos(geometry.hdg);
						partialGeometry.ey = geometry.y + (ds + partialGeometry.length) * Math.sin(geometry.hdg);
						
						geometries.push(partialGeometry);
						break;
					case 'spiral':
						// need the equation presentation for clothoid
						console.error('getGeometry error: not surpport extract part of the geometry of type spiral yet')
						var sample = generateSpiralPoints(geometry.length, geometry.x, geometry.y, geometry.hdg, geometry.spiral.curvStart, geometry.spiral, geometry.ex, geometry.ey, null, ds, partialGeometry.length);
						var points = sample.points;
						var heading = sample.heading;
						partialGeometry.x = points[0].x;
						partialGeometry.y = points[0].y;

						// USE Continous or Discreate HDG ? - discreate!(continous needs smaller curv as start)
						partialGeometry.hdg = heading[0];

						partialGeometry.centralX = partialGeometry.x;
						partialGeometry.centralY = partialGeometry.y;
						partialGeometry.ex = points[points.length - 1].x;
						partialGeometry.ey = points[points.length - 1].y;
						geometries.push(partialGeometry);
						break;
					case 'arc':
						//console.warn('getGeometry warnning: extracting arc from the middle of a geometry')
						
						var curvature = geometry.arc.curvature;
						var radius = 1 / Math.abs(curvature);
						var theta = ds * curvature;
						var rotation = geometry.hdg - Math.sign(curvature) * Math.PI / 2;
						partialGeometry.x = geometry.x - radius * Math.cos(rotation) + radius * Math.cos(rotation + theta);
						partialGeometry.y = geometry.y - radius * Math.sin(rotation) + radius * Math.sin(rotation + theta);
						partialGeometry.hdg = geometry.hdg + theta;
						partialGeometry.arc = {curvature: geometry.arc.curvature};

						partialGeometry.centralX = partialGeometry.x;
						partialGeometry.centralY = partialGeometry.y;

						partialGeometry.ex = geometry.ex;
						partialGeometry.ey = geometry.ey;

						if (es <= geometry.s + geometry.length - 1E-4)  {
							theta += partialGeometry.length * curvature;
							//* NOTE: road#5 laneSection#3 geometry#0 ends as the geometry, caculated ex,ey is not the same as geometry's ex,ey
							partialGeometry.ex = geometry.x - radius * Math.cos(rotation) + radius * Math.cos(rotation + theta);
							partialGeometry.ey = geometry.y - radius * Math.sin(rotation) + radius * Math.sin(rotation + theta);
						}
						/*
						partialGeometry.arc = {curvature: geometry.arc.curvature};

						var sample = generateArcPoints(geometry.length, null, geometry.x, geometry.y, geometry.hdg, geometry.arc.curvature, geometry.ex, geometry.ey, null, ds, partialGeometry.length);
						partialGeometry.x = sample.points[0].x;
						partialGeometry.y = sample.points[0].y;
						partialGeometry.hdg = sample.heading[0];
						partialGeometry.ex = sample.points[sample.points.length - 1].x;
						partialGeometry.ey = sample.points[sample.points.length - 1].y;
						partialGeometry.centralX = partialGeometry.x;
						partialGeometry.centralY = partialGeometry.y;
						*/
						geometries.push(partialGeometry);
						break;
				}
				found = true;
			}
		}
	}

	return geometries;
}

/*
* The number of lanes is constant per laneSection. However, the properties of each lane (e.g. width,
* road marks, friction etc.) may change
* Parameters geometryIds and isElevated are for test only, get rid of them in production version
*/
function paveLaneSection(road, laneSectionId, geometryIds, isElevated) {

	if (!roadsMesh[road.id]) roadsMesh[road.id] = new THREE.Mesh();
	var roadMesh = roadsMesh[road.id];
	if (!roadMesh[laneSectionId]) roadMesh[laneSectionId] = new THREE.Mesh();
	var sectionMesh = roadMesh[laneSectionId];

	// split lanes into three groups: center, left, right, (only left and right) sorted by absoluate value of lane.id in ascending order (-1 -> -n) (1->m)
	var lanes = road.laneSection[laneSectionId].lane;
	var centralLane, leftLanes = [], rightLanes = [];

	for (var i = 0; i < lanes.length; i++) {
		var lane = lanes[i];
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

	// accroding to the start position relative to the road entry, determine from which point on the geometry will be used 
	var start = road.laneSection[laneSectionId].s;
	var end = road.laneSection[laneSectionId + 1] ? road.laneSection[laneSectionId + 1].s : road.geometry[road.geometry.length - 1].s + road.geometry[road.geometry.length - 1].length;
	var geometries = getGeometry(road, start, end);
 
	// if specified geometries Ids in the given laneSection, draw only those geometries
	if (geometryIds) {
		if (geometryIds.length) {
			var geometriesCpy = [];
			for (var i in geometryIds) geometriesCpy.push(geometries[geometryIds[i]]);
			delete geometries;
			geometries = geometriesCpy;
		}
	}

	// elevation and lateral profile of the whole road
	var elevationLateralProfile = {};
	if (isElevated) {
		elevationLateralProfile.elevations = road.elevation;
		elevationLateralProfile.superelevations = road.superelevation;
		elevationLateralProfile.crossfalls = road.crossfall;
	}

	// pave lanes for each geometry seg
	for (var i = 0; i < geometries.length; i++ ) {

		// initiate central reference line's geometry (centralX, centralY and ex, ey is assigend during preProcessing(roads))
		var geometry = geometries[i];
		geometry.centralLength = geometry.length;
		if (!geometry.offset) {
			geometry.offset = {a: 0, b: 0, c: 0, d: 0};
		} else {
			// when paving roads, geometry.x, geometry.y is the actural reference line's start position! (drawReferenceLine x,y is still the reference line without offset)
			var tOffset = geometry.offset.a;
			geometry.x += Math.abs(tOffset) * Math.cos(geometry.hdg + Math.PI / 2 * Math.sign(tOffset));
			geometry.y += Math.abs(tOffset) * Math.sin(geometry.hdg + Math.PI / 2 * Math.sign(tOffset));
		}

		var currentLane = [0];
		var innerGeometries = [geometry];

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
					var oGeometries = paveLane(sectionMesh, start, innerGeometry, elevationLateralProfile, leftLanes[j]);
					if (j != leftLanes.length - 1) {
						for (var k = oGeometries.length; k > 0; k--) {
							innerGeometries.push(oGeometries[k - 1]);
							currentLane.push(j + 1);
						}
					}
				} catch(e) {
					console.info('paving error: road#' + road.id + ' laneSection#' + laneSectionId + ' geometry#' + i + ' lane#' + leftLanes[j].id);
					console.error(e.stack)
				}
			}

		}

		innerGeometries = [geometry];
		currentLane = [0];

		// right Lanes
		while (innerGeometries.length) {

			var laneId = currentLane.pop();
			var innerGeometry = innerGeometries.pop();

			for (var j = laneId; j < rightLanes.length; j++) {

				if (j != laneId) {
					innerGeometry = innerGeometries.pop();
					currentLane.pop();
				}

				try {
					var oGeometries = paveLane(sectionMesh, start, innerGeometry, elevationLateralProfile, rightLanes[j]);
					if (j != rightLanes.length - 1) {
						for (var k = oGeometries.length; k > 0; k--) {
							innerGeometries.push(oGeometries[k - 1]);
							currentLane.push(j + 1);
						}
					}
				} catch(e) {
					console.info('paving error: road#' + road.id + ' laneSection#' + laneSectionId + ' geometry#' + i + ' lane#' + rightLanes[j].id);
					console.error(e.stack);
				}
			}
		}

		// central lanes - draw on top of right/left lanes to be seen
		try {
			paveLane(sectionMesh, start, geometry, elevationLateralProfile, centralLane);
		} catch(e) {
			console.info('paving error: road#' + road.id + ' laneSection#' + laneSectionId + ' geometry#' + i + ' lane#' + centralLane.id);
			console.error(e.stack)
		}
	}

	roadMesh.add(sectionMesh);

}

function paveRoadLaneSectionsByIds(road, laneSectionIds) {

	var laneSectionId;
	for (var i = 0; i < laneSectionIds.length; i++) {
		
		laneSectionId = laneSectionIds[i];
		if (laneSectionId < 0 || laneSectionId > road.laneSection.length - 1) {
			throw Error('paveRoadLaneSectionsByIds error: invalid laneSectionIds, laneSectionId', laneSectionId, 'is not in the road\'s laneSections range');
		}

		paveLaneSection(road, laneSectionId);
	}
}

function paveRoad(road, isElevated) {

	for (var i  = 0; i < road.laneSection.length; i++) {

		try {
			paveLaneSection(road, i, [], isElevated);
		} catch(e) {
			console.info('paving error: road#' + road.id + ' laneSection#' + i);
			console.error(e.message + '\n' + e.stack);
		}
	}
}

/*
* Pave roads with lanes
* @Param roads array of road parsed from .xodr.
* @Param isElevated apply elevation profile if true, just pave in xy plane if false
*/
function paveRoads(roads, isElevated) {

	for (var id in roads) {
		paveRoad(roads[id], isElevated);
	}
}

function paveRoadsByIds(roadIds, isElevated) {
	for (var i=0; i < roadIds.length; i++) {
		var road = map.roads[roadIds[i]];	
		paveRoad(road, isElevated);
	}
}

function getRoadIds(roads) {
	var ids = [];
	for (var id in roads) {
		ids.push(id);
	}
	return ids;
}

/*
* Signal System along roads
*/
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

function placeSignal(signal) {

	var mesh;
	var transform = track2Inertial(signal.road, signal.s, signal.t, 0);
	var position = transform.position;
	var rotation = transform.rotation;
	position.z += signal.zOffset;

	// traffic signals' mesh use from outside, need to provide such an interface (signalType - signalMesh)
	// for now, use a simple self generated one
	if (signal.dynamic == 'yes')
		mesh = generateDefaultSignalMesh();
	else
		mesh = generateDefaultSignMesh();
	mesh.position.set(position.x, position.y, position.z);	
	mesh.rotation.set(0, 0, rotation.z + Math.PI / 2);

	if (signal.orientation == '+') {
		mesh.rotateZ(Math.PI);
	}

	mesh.updateMatrixWorld();

	//drawSphereAtPoint(position, 0.08, 0xFF0000)
	//drawLineAtPoint(position, mesh.rotation.z - Math.PI / 2, 1, 0xFF0000)

	scene.add(mesh);
	group.signal.push(mesh);
}

function placeSignals(signals) {

	for (var id in signals) {
		placeSignal(signals[id]);
	}
}

function placeSignalsByIds(signalIds) {
	for (var i = 0; i < signalIds.length; i++) {
		placeSignal(map.signals[signalIds[i]]);	
	}
}

function placeSignalsInDirtyRoad(dirtyMap, road) {
	if (road.signal) {
		for (var j = 0; j < road.signal.length; j++) {
			var signalId = road.signal[j];
			placeSignal(dirtyMap.signals[signalId]);
		}
	}
}

function placeSignalsInRoads(roadIds) {

	for (var i = 0; i < roadIds.length; i++) {
		
		var road = map.roads[roadIds[i]];
		
		if (road.signal) {
			for (var j = 0; j < road.signal.length; j++) {
				var signalId = road.signal[j];
				placeSignal(map.signals[signalId]);
			}
			//console.log('roadId#', roadIds[i], 'signals', road.signal);
		} else {
			//console.log('placeSignalsInRoads: no signals along road#', roadIds[i]);
		}
	}
}


/*************************************************************
**					Interface for client					**
**************************************************************/

/*
* Helper for getConnectingRoadId
*/
function getRoadIdsInJunction(junctionId) {

	if (junctionId == '-1') {
		throw Error('invalid junctionId', jucntionId);
	}

	var roadIds = [];
	var foundIds = {};
	var junction = map.junctions[junctionId];
	
	for (var connectionId in junction.connection) {
		var connection = junction.connection[connectionId];
		
		if (!(connection.incomingRoad in foundIds)) {
			roadIds.push(connection.incomingRoad);
			foundIds[connection.incomingRoad] = true;
		}
		if (!(connection.connectingRoad in foundIds)) {
			roadIds.push(connection.connectingRoad);
			foundIds[connection.connectionRoad] = true;
		}
	}

	return roadIds;
}
function getLinkedRoadId(linkedInfo) {

	var elementType = linkedInfo.elementType;
	var elementId = linkedInfo.elementId;
	var contactPoint = linkedInfo.contactPoint;

	var roadIds = [];

	if (elementType == 'road') {
		roadIds.push(elementId);
	} else if (elementType == 'junction') {
		roadIds = getRoadIdsInJunction(elementId);
	}

	return roadIds;
}

/*
* Helper for track2Inertial, get road info at speific s in a road
*/
function getGeometryAtS(roadId, s) {
	
	var result = null;
	var road = map.roads[roadId];

	if (s < 0 || s > road.length + 1E-4) {
		throw Error('getGeometryAtS error: invalid s', s, 'road length', road.length);
	}

	for (var i = 0; i < road.geometry.length; i++) {
		var geometry = road.geometry[i];

		if (geometry.s + geometry.length <= s) continue;
		else if (geometry.s <= s) result = geometry; //console.log(geometry.s, s, geometry.s <= s)}
		else break;
	}

	// must be s == road.length if result == null
	if (result == null) {
		result = road.geometry[road.geometry.length - 1]
	}
	
	return result;
}

function getElevationAtS(roadId, s) {
	
	var result = null;
	var road = map.roads[roadId];

	if (s < 0 || s > road.length + 1E-4) {
		throw Error('getElevationAtS error: invalid s ' + s + ' road length' + road.length);
	}

	if (!road.elevation || !road.elevation.length) return null;

	for (var i = 0; i < road.elevation.length; i++) {
		var elevation = road.elevation[i];
		var nextElevationS = road.elevation[i + 1] ? road.elevation[i + 1].s : road.geometry[road.geometry.length - 1].s + road.geometry[road.geometry.length - 1].length;

		if (nextElevationS <= s) continue;
		else if (elevation.s > s) break;
		else {
			if (!(elevation.s <= s)) throw Error('condition needs changing')
			result = elevation;
		}
	}

	// must be s == road.length if result == null
	if (result == null) {
		result = road.elevation[road.elevation.length - 1];
	}

	return result;
}

function getSupserelevationAtS(roadId, s) {

	var result = null;
	var road = map.roads[roadId];
	
	if (s < 0 || s > road.length + 1E-4) {
		throw Error('getSupserelevationAtS error: invalid s', s, 'road length', road.length);
	}

	if (!road.superelevation) return null;

	for (var i = 0; i < road.superelevation.length; i++) {
		var superelevation = road.superelevation[i];
		var nextSuperElevationS = road.superelevation[i + 1] ? road.superelevation[i + 1].s : road.geometry[road.geometry.length - 1].s + road.geometry[road.geometry.length - 1].length;

		if (nextSuperElevationS <= s) continue;
		else if (superelevation.s > s) break;
		else {
			if (!(superelevation.s <= s)) throw Error('condition needs changing');
			result = superelevation;
		}
	}

	// must be s == road.length if result == null
	if (result == null) {
		result = road.superelevation[road.superelevation.length - 1];
	}

	return result;
}

function getCrossfallAtS(roadId, s) {

	var result = null;
	var road = map.roads[roadId];

	if (s < 0 || s > road.length + 1E-4) {
		throw Error('getCrossfallAtS error: invalid s', s, 'road length', road.length);
	}

	if (!road.crossfall) return null;

	for (var i = 0; i < road.crossfall.length; i++) {
		var crossfall = road.crossfall[i];
		var nextCrossfallS = road.crossfall[i + 1] ? road.crossfall[i + 1].s : road.geometry[road.geometry.length - 1].s + road.geometry[road.geometry.length - 1].length;

		if (nextCrossfallS <= s) continue;
		else if (crossfall.s > s) break;
		else {
			if (!(crossfall.s <= s)) throw Error('condition needs changing');
			result = crossfall;
		}
	}

	// must be s == road.length if result == null
	if (result == null) {
		result = road.crossfall[road.crossfall.length - 1];
	}

	return result;
}

function getLaneOffsetAtS(roadId, s) {

	var result = null;
	var road = map.roads[roadId];

	if (s < 0 || s > road.length + 1E-4) {
		throw Error('getLaneOffsetAtS error: invalid s', s, 'road length', road.length);
	}

	if (!road.laneOffset) return null;

	for (var i = 0; i < road.laneOffset.length; i++) {
		var laneOffset = road.laneOffset[i];
		var nextLaneOffsetS = road.laneOffset[i + 1] ? road.laneOffset[i + 1].s : road.geometry[road.geometry.length - 1].s + road.geometry[road.geometry.length - 1].length;

		if (nextLaneOffsetS <= s) continue;
		else if (laneOffset.s > s) break;
		else {
			if (!(laneOffset.s <= s)) throw Error('condition needs changing')
			result = laneOffset;
		}
	}

	// must be s == road.length if result == null
	if (result == null) {
		result = road.laneOffset[road.laneOffset.length - 1];
	}

	return result;
}

function getLaneSectionAtS(roadId, s) {

	var result = null;
	var road = map.roads[roadId];

	if (s < 0 || s > road.length + 1E-4) {
		throw Error('getLaneSectionAtS error: invalid s', s, 'road length', road.length);
	}

	for (var i = 0; i < road.laneSection.length; i++) {
		var laneSection = road.laneSection[i];
		var nextLaneSectionS = road.laneSection[i + 1] ? road.laneSection[i + 1].s : road.geometry[road.geometry.length - 1].s + road.geometry[road.geometry.length - 1].length;

		if (nextLaneSectionS <= s) continue;
		else if (laneSection.s > s) break;
		else {
			if (!(laneSection.s <= s)) throw Error('condition needs changing');
			result = laneSection;
		}
	}

	// must be s == road.length if result == null
	if (result == null) {
		result = road.laneSection[road.laneSection.length - 1];
	}
	return result;
}

/*
* Given a roadId, return the id of the roads as the given road's predecessor and successor
* NOTE: If one of the connection is a junction, return all the roads' ids that is connected by the junction (road#500's junction is too small) ? or what?
* 
* @Param roadId target roadId
* @Return roadIds array of connecting roads' IDs, INCLUDING target roadId!
*/
function getConnectingRoadIds(roadId) {

	if (!map.roads[roadId]) return [];

	var roadIds = [];
	var junctionId = map.roads[roadId].junction;
	var predecessor = map.roads[roadId].predecessor;
	var successor = map.roads[roadId].successor;
	var addedself = false;	// flag if need to push roadId to roadIds at the end

	if (junctionId == '-1') {
		// the road is not in a junction, get its predecessor and successor if any
		if (predecessor) {
			roadIds = roadIds.concat(getLinkedRoadId(predecessor));
			if (predecessor.elementType == 'junction') addedself = true;
		}
		if (successor) {
			roadIds = roadIds.concat(getLinkedRoadId(successor));
			if (successor.elementType == 'junction') addedself = true;
		}
		
		// if neither predecessor not successor is of element type junction, meaning target roadId is not in the roadIds yet
		if (!addedself) {
			roadIds.push(roadId);
		}
	} else {
		// the road is in a junction, get all roads (incoming and connection roads) in the junction
		roadIds = getRoadIdsInJunction(junctionId);
	}

	/* POTENTIAL PROBLEM!
	* if the connecting roads of junction is very short, the returned roads do not cover enough area to show.
	* may need to specify a radius (forward or backward distance in all posible directions) given a s-position on a roadId
	*/
	return roadIds;
}

/*
* Given a track system coordinate and belonging road, calculate the inertial system coordinate
* NOTE: Do not apply crossfall for now.
*/
function track2Inertial(roadId, s, t, h) {

	var road = map.roads[roadId];

	if (!road) {
		console.warn('track2Inertial: no road of roadId#', roadId, 'found');
		return;
	}

	if (s < 0 || s > road.length) {
		throw Error('converting from track system to inertial system error: invalid s', s, 'for road#', roadId, 'total length', road.length);
	}

	var geometry = getGeometryAtS(roadId, s);
	var elevation = getElevationAtS(roadId, s);
	var superelevation = getSupserelevationAtS(roadId, s);
	var crossfall = getCrossfallAtS(roadId, s);

	var sOffset, hdg, roll, pitch;
	var svector, tvector;
	var x, y, z;

	if (!elevation) elevation = {s: 0, a: 0, b: 0, c: 0, d: 0};
	if (!superelevation) superelevation = {s: 0, a: 0, b: 0, c: 0, d: 0};
	if (!crossfall) crossfall = {side: 'both', s: 0, a: 0, b: 0, c: 0, d: 0};

	// find x-y on central reference line in x-y plane
	sOffset = s - geometry.s;
	switch(geometry.type) {
		case 'line':
			hdg = geometry.hdg;
			x = geometry.x + sOffset * Math.cos(geometry.hdg);
			y = geometry.y + sOffset * Math.sin(geometry.hdg);
			
			break;
		case 'spiral':
			//generateSpiralPoints(length, elevationLateralProfile sx, sy, hdg, curvStart, curvEnd, ex, ey, lateralOffset, subOffset, subLength)
			var sample = generateSpiralPoints(geometry.length, null, null, geometry.x, geometry.y, geometry.hdg, geometry.spiral.curvStart, geometry.spiral.curvEnd, geometry.ex, geometry.ey, null, sOffset, geometry.length + geometry.s - s);
			hdg = sample.heading[0];
			x = sample.points[0].x;
			y = sample.points[0].y;

			break;
		case 'arc':
			var curvature = geometry.arc.curvature;
			var radius = 1 / Math.abs(curvature);
			var rotation = geometry.hdg - Math.sign(curvature) * Math.PI / 2;
			var theta = sOffset * curvature;
			hdg = geometry.hdg + theta;
			x = geometry.x - radius * Math.cos(rotation) + radius * Math.cos(rotation + theta);
			y = geometry.y - radius * Math.sin(rotation) + radius * Math.sin(rotation + theta);
			
			break;
	}

	sOffset = s - elevation.s;
	z = cubicPolynomial(sOffset, elevation.a, elevation.b, elevation.c, elevation.d);
	var prez = cubicPolynomial(sOffset - 0.1, elevation.a, elevation.b, elevation.c, elevation.d);
	pitch = Math.atan((z - prez) / 0.1);

	sOffset = s - superelevation.s;
	var superelevationAngle = cubicPolynomial(sOffset, superelevation.a, superelevation.b, superelevation.c, superelevation.d);

	sOffset = s - crossfall.s;
	var crossfallAngle = cubicPolynomial(sOffset, crossfall.a, crossfall.b, crossfall.c, crossfall.d);

	roll = superelevationAngle;

	if (!((t < 0 && crossfall.side == 'left') || (t > 0 && crossfall.side == 'right'))) {
		roll += crossfallAngle * (- Math.sign(t));
	}

	// find x, y, z in s - t - h
	var svector = new THREE.Vector3(1, 0, 0);
	svector.applyAxisAngle(new THREE.Vector3(0, 0, 1), hdg);

	var tvector = svector.clone();
	tvector.cross(new THREE.Vector3(0, 0, -1));
	tvector.applyAxisAngle(svector, roll);

	var hvector = svector.clone();
	hvector.cross(tvector);

	tvector.multiplyScalar(t);
	hvector.multiplyScalar(h);

	x += tvector.x + hvector.x;
	y += tvector.y + hvector.y;
	z += tvector.z + hvector.z;

	return {
		position: new THREE.Vector3(x, y, z),
		rotation: new THREE.Euler(roll, -pitch, hdg, 'XYZ')
	}
}

/*
* Helper for isWithinGeometry.
* Given two lines in the same plane, defined separately by two different points each, get their intersect
*
* @Param x1, y1, x2, y2 the two points defining the first line
* @Param x3, y3, x4, y4 the two points defining the second line
* @Return (x, y, 0) Vector3 the intersect point, null if no intersect
*/
function getXYLineIntersect(x1, y1, x2, y2, x3, y3, x4, y4) {

	if ( Math.abs((x1 - x2) * (y3 - y4)) == Math.abs((x3 - x4) * (y1 - y2)) ) {
		return null;
	}

	var intersect = new THREE.Vector3();
	intersect.set(((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) / ((x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)),
					((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4))/ ((x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)),
					0);

	return intersect;
}

/*
* Given a single geometry, in X-Y PLANE, tell if the inertial system xy coordinate is bounded by two perpendicular lines to the headings through both ends of the geometry
*
* For the following geometry of type 'line', p2 is within the geometry's range, p1 and p3 is not.
*
*	p1	|		  p2 		|	p3
*		|					|
*		|___________________|
*		s 					e
*		
* NOTE: is it going right with curves?
* NOTE: Noticable error on y for line, < 0.1 error for spiral, Noticable error along radius, t closer to center
*
* @Param geometry the geometry defining the area range
* @Param x, y inertial coordinate (x,y) on x-y plane only
* @Return {in: T/F, s, t} if (x,y) is bounded by the geometry, in as true, s as s coordinate in the road, t as the distance from (x,y) perpendicular to geometry's central reference line; in is false if point is not in this geometry, s, t sets to null
*/
function isWithinGeometry(geometry, x, y) {

	var sx, sy, ex, ey;
	var start, end, point;
	var se, seUnit, sp, ep;
	var perpendicularPoint;
	var isWithin = false, s = null, t = null;
	sx = geometry.x;
	sy = geometry.y;
	sp = new THREE.Vector3(x - sx, y - sy, 0);
	ex = geometry.ex;
	ey = geometry.ey;
	ep = new THREE.Vector3(x - ex, y - ey, 0);
	se = new THREE.Vector3(ex - sx, ey - sy, 0);

	point = new THREE.Vector3(x, y, 0);
	start = new THREE.Vector3(sx, sy, 0);
	end = new THREE.Vector3(ex, ey, 0);

	switch(geometry.type) {

		case 'line':
			// in case the geometry or its neighbour geometries has lane offset, geometry.ex, ey may not be where the geometry really ends
			ex = sx + geometry.length * Math.cos(geometry.hdg);
			ey = sy + geometry.length * Math.sin(geometry.hdg);
			ep.set(x - ex, y - ey, 0);
			se.set(ex - sx, ey - sy, 0);
			end.set(ex, ey, 0);
			seUnit = se.clone();
			seUnit.normalize();

			if (se.dot(sp) >= 0 && se.dot(ep) <=0) {
				perpendicularPoint = seUnit.multiplyScalar(seUnit.dot(sp)).add(start);
				t = perpendicularPoint.distanceTo(point);

				if (t <= maxTOffset) {
					isWithin = true;
					s = perpendicularPoint.distanceTo(start) + geometry.s;
					if (sp.clone().cross(ep).dot(new THREE.Vector3(0, 0, 1)) < 0) {
						t *= -1;
					}
				} else {
					t = null;
				}
			}

			//drawSphereAtPoint(point, 0.1, 0x000001);
			//drawSphereAtPoint(start, 0.1, 0xFF0000);
			//drawSphereAtPoint(end, 0.1, 0x0000FF);
			//if (perpendicularPoint) drawSphereAtPoint(perpendicularPoint, 0.1, 0x000001);
			//drawCustomLine([start, end], 0x000001);
			//drawCustomLine([start, point], 0xFF0000);
			//drawCustomLine([end, point], 0x0000FF);

			break;

		case 'spiral':
			var curvStart = geometry.spiral.curvStart;
			var curvEnd = geometry.spiral.curvEnd;
			var length = geometry.length;
			var theta = geometry.hdg;
			var center = new THREE.Vector3();
			var arcCenter = new THREE.Vector3();
			var cs, ce, cp, perpendicularPoint;

			var sx1, sy1, ex1, ey1;
			var sample = generateSpiralPoints(length, null, null, sx, sy, geometry.hdg, curvStart, curvEnd, ex, ey);
			var endHeading = sample.heading[sample.heading.length - 1];
			ex = sample.points[sample.points.length - 1].x;
			ey = sample.points[sample.points.length - 1].y;
			end.set(ex, ey, 0);

			sx1 = sx + Math.cos(geometry.hdg + Math.PI / 2);
			sy1 = sy + Math.sin(geometry.hdg + Math.PI / 2);
			ex1 = ex + Math.cos(endHeading + Math.PI / 2);
			ey1 = ey + Math.sin(endHeading + Math.PI / 2);

			center = getXYLineIntersect(sx, sy, sx1, sy1, ex, ey, ex1, ey1);

			//drawSphereAtPoint(point, 0.05, 0x000001);
			//drawSphereAtPoint(center, 0.08, 0xFF0000);
			//drawSphereAtPoint(start, 0.08, 0xFF0000);
			//drawSphereAtPoint(end, 0.08, 0x0000FF);
			//drawCustomLine([center, start], 0xFF0000);
			//drawCustomLine([center, end], 0x0000FF);
			//drawCustomLine([center, point], 0x000001);

			cs = new THREE.Vector3(start.x - center.x, start.y - center.y, 0);
			ce = new THREE.Vector3(end.x - center.x, end.y - center.y, 0);
			cp = new THREE.Vector3(x - center.x, y - center.y, 0);

			if (Math.abs( cs.angleTo(cp) + cp.angleTo(ce) - cs.angleTo(ce) ) < 1E-10 && !(cp.length() - cs.length() > maxTOffset && cp.length() - ce.length() > maxTOffset) ) {
				isWithin = true;
			}

			if (isWithin) {
				// go through the spiral generation process, test point for each step's arc
				var currentS = 0, preS = 0;
				var curvature, radius;
				var p = new THREE.Vector3(), prep = new THREE.Vector3();
				
				do {
					if (currentS == 0) {
						p.set(start.x, start.y, start.z);
						prep.set(p.x, p.y, p.z);
						currentS += step;
						continue;
					};

					if (currentS > length) currentS = length;

					curvature = curvStart + (currentS + preS) * 0.5 * (curvEnd - curvStart) / length;
					radius = 1 / Math.abs(curvature);
					p.setX(prep.x + (currentS - preS) * Math.cos(theta + curvature * (currentS - preS) / 2));
					p.setY(prep.y + (currentS - preS) * Math.sin(theta + curvature * (currentS - preS) / 2));

					arcCenter.set(prep.x + radius * Math.cos(theta + Math.sign(curvature) * Math.PI / 2),
								prep.y + radius * Math.sin(theta + Math.sign(curvature) * Math.PI / 2), 0);

					cs = new THREE.Vector3(prep.x - arcCenter.x, prep.y - arcCenter.y, 0);
					ce = new THREE.Vector3(p.x - arcCenter.x, p.y - arcCenter.y, 0);
					cp = new THREE.Vector3(x - arcCenter.x, y - arcCenter.y, 0);
					
					if (Math.abs(cs.angleTo(cp) + cp.angleTo(ce) - cs.angleTo(ce)) < 1E-10) {

						// when traslating s,t to x,y,z, tOffset is based on the ponit on the line sgments instead of the approximate arc
						perpendicularPoint = cp.clone().normalize().multiplyScalar(radius).add(arcCenter);

						s = radius * Math.sin( cs.angleTo(cp) ) + preS + geometry.s;
						t = point.distanceTo(perpendicularPoint);

						sp.set(point.x - prep.x, point.y - prep.y, 0);
						ep.set(point.x - p.x, point.y - p.y, 0);

						if (sp.cross(ep).dot(new THREE.Vector3(0,0, -1)) > 0) {
							t *= -1;
						}

						//drawSphereAtPoint(perpendicularPoint, 0.08, 0x000001);
						//drawSphereAtPoint(arcCenter, 0.08, 0xFFC125);
						//drawSphereAtPoint(prep, 0.05, 0xFF0000);
						//drawSphereAtPoint(p, 0.05, 0x0000FF);
						//drawCustomLine([arcCenter.clone(), prep.clone()], 0xFF0000);
						//drawCustomLine([arcCenter.clone(), p.clone()], 0x0000FF);
						//drawCustomLine([arcCenter.clone(), point], 0x000001);
						//drawCustomLine([arcCenter.clone(), perpendicularPoint], 0x000001);

						break;
					}

					//drawSphereAtPoint(arcCenter, 0.08, 0xFFC125);
					//drawSphereAtPoint(prep, 0.05, 0xFF0000);
					//drawSphereAtPoint(p, 0.05, 0x0000FF);

					prep.set(p.x, p.y, p.z);
					preS = currentS;
					currentS += step;
					theta += curvature * (currentS - preS);

				} while (currentS < length + step);
			}

			break;

		case 'arc':
			var curvature = geometry.arc.curvature;
			var radius = 1 / Math.abs(curvature);
			var theta = geometry.length * curvature;
			var center = new THREE.Vector3(sx + radius * Math.cos(geometry.hdg + Math.sign(curvature) * Math.PI / 2),
											sy + radius * Math.sin(geometry.hdg + Math.sign(curvature) * Math.PI / 2), 0);

			var rotation = geometry.hdg - Math.sign(curvature) * Math.PI / 2;
			if (!ex || !ey) {
				ex = sx - radius * Math.cos(rotation) + radius * Math.cos(rotation + theta);
				ey = sy - radius * Math.sin(rotation) + radius * Math.sin(rotation + theta);
			}

			var cp = new THREE.Vector3(x - center.x, y - center.y, 0);
			var cs = new THREE.Vector3(sx - center.x, sy - center.y, 0);
			var ce = new THREE.Vector3(ex - center.x, ey - center.y, 0);

			if (cp.length() - cs.length() <= maxTOffset) {
				perpendicularPoint = cp.clone().normalize().multiplyScalar(radius).add(center);

				sp.set(perpendicularPoint.x - sx, perpendicularPoint.y - sy, 0);
				ep.set(perpendicularPoint.x - ex, perpendicularPoint.y - ey, 0);
				end.set(ex, ey, 0);

				// in actual road design, an arc shold not exceeds Math.PI - NO. Think of exit ramps at a high way exit? Anyway, needs separate dealing with perpendicular point when theta in [0, Math.PI], (Math.PI, Math.PI * 2]
				if (Math.abs(theta) <= Math.PI) {
					if (se.dot(sp) >= 0 && se.dot(ep) <= 0 ) {
						if (sp.clone().cross(ep).dot(new THREE.Vector3(0, 0, -1 * Math.sign(curvature))) >= 0) {
							isWithin = true;
							s = radius * cs.angleTo(cp) + geometry.s;
							t = -1 * Math.sign(curvature) * (cp.length() - radius)
						}
					}
				} else {
					console.warn('geometry arc has swept over Math.PI', geometry.length / radius);
				}
			}

			//drawSphereAtPoint(center, 0.08, 0xFF0000);
			//drawSphereAtPoint(point, 0.05, 0x000001);
			//drawSphereAtPoint(perpendicularPoint, 0.08, 0x0F0F0F);
			//drawCustomLine([center, start], 0xFF0000);
			//drawCustomLine([center, end], 0x0000FF);
			//drawCustomLine([center, point], 0x000001);

			break;
	}

	return {in: isWithin, s: s, t: t};

}

/*
* Given a inertial system coordinate, and roadId, tell if the inertial system coordinate is on the road
*
* CHALLENGE: tell if a point is in a custom shape
*
* @Param roadId the id of the road to be tested against
* @Param x,y,z position of the point to be tested
* @Return {isOn: T/F, s, t, h} isOn as true, (s, t, h) the track coordinate, if point is on or above road
*/
function isOnRoad(roadId, x, y, z) {

	var isOn = false, s = null, t = null, h = null;

	for (var i = 0; i < map.roads[roadId].geometry.length; i++) {
		var geometry = map.roads[roadId].geometry[i];
		var isIn = isWithinGeometry(geometry, x, y);
		if (isIn.in) {

			s = isIn.s;
			t = isIn.t;
			h = 0;

			var elevation = getElevationAtS(roadId, s);
			var superelevation = getSupserelevationAtS(roadId, s);
			var crossfall = getCrossfallAtS(roadId, s);

			if (!elevation) elevation = {s: 0, a: 0, b: 0, c: 0, d: 0};
			if (!superelevation) superelevation = {s: 0, a: 0, b: 0, c: 0, d: 0};
			if (!crossfall) crossfall = {side: 'both', s: 0, a: 0, b: 0, c: 0, d: 0};

			var zOffset = cubicPolynomial(s - elevation.s, elevation.a, elevation.b, elevation.c, elevation.d);
			var superelevationAngle = cubicPolynomial(s - superelevation.s, superelevation.a, superelevation.b, superelevation.c, superelevation.d);
			var crossfallAngle = cubicPolynomial(s - crossfall.s, crossfall.a, crossfall.b, crossfall.c, crossfall.d);

			var roll = superelevationAngle;
			if (!((t < 0 && crossfall.side == 'left') || (t > 0 && crossfall.side == 'right'))) {
				roll += crossfallAngle * (- Math.sign(t));
			}

			t = t / Math.cos(roll);
			zOffset += t * Math.sin(roll);
			h = (z - zOffset) / Math.cos(roll);

			if (h >= 0) {
				isOn = true;
			}

			// original position
			drawSphereAtPoint(new THREE.Vector3(x,y,z), 0.2, 0x000001);

			// traslated from s,t position
			var position = track2Inertial(roadId, s, t, h).position;
			
			drawSphereAtPoint(position, 0.2, 0xFF0000);

			console.log('error: x', position.x - x, 'y', position.y - y, 'z', position.z - z);
			break;
		}
	}

	return {on: isOn, s: s, t: t, h: h};
}

/*
* Given a inertial system coordinate, calculate the track system coordinate
*
* CHALLENGE: find the right roadId - use bounding box for roadMesh
*/
function inertial2Track(x, y, z) {

	var point = new THREE.Vector3(x, y, z);
	var candidateRoadIds = [];
	var result = null;

	for (var id in roadsMesh) {

		var roadMesh = roadsMesh[id];
		var bbox = new THREE.Box3().setFromObject(roadMesh);
		bbox.max.z += heightClearance;
		if (bbox.containsPoint(point)) {
			candidateRoadIds.push(id);
		}
	}

	if (candidateRoadIds.length) {
		result = {};
	}

	for (var i = 0; i < candidateRoadIds.length; i++) {
		result[candidateRoadIds[i]] = isOnRoad(candidateRoadIds[i], x, y, z);
	}

	return result;

}

/*
* Given a roadId, returns the link info in level of lanes of the whole road (what about the starting and ending lane sections?)
*/
function getLinkInfo(roadId) {

	var road = map.roads[roadId];

	for (var i = 0; i < road.laneSection.length; i++) {

		var laneSection = road.laneSection[i];

		for (var j = 0; laneSection.lanes.length; j++) {

			var lane = laneSection.lanes[j];

			if (i == 0) {

				// the predecessor of the lane must be in the previous road
			}

			if (i == road.laneSection.length - 1) {

				// the successor of the lane must be in the succeeding road
			}
		}
	}
}

/*************************************************************
**				Editor SubGroupah functions					**
**************************************************************/

/*
* Init dat.gui
*
* CHALLENGE: map editor, how to interact with users
*/
function initGUI() {

	var exporter = {
		saveAsJSON: ( function() { saveFile(map, viewer.mapName + '.json') } ),
	}

	var editor = {
		addNewRoad: (function() { popEditions() }),
		resetEditions: (function() { resetEditions() }),
		saveEditions: (function() { saveEditions(dirtyMap) }),
	}

	var road = {
		roadID: 0,
		addNewSignal: (function() { addSignal() }),
	}

	defaultRoad = {
		geometry: [{
			type: 'line',
			sx: 0,
			sy: 0,
			heading: 0,
			length: 10,
			spiral: {curvStart:0, curvEnd: 1.57},
			arc: {curvature: 0.001},
			offset: {a: 0, b: 0, c: 0, d: 0}
		}],
		laneOffset: [{
			s: 0,
			a: 0,
			b: 0,
			c: 0,
			d: 0
		}],
		laneSection: [{
			s: 0,
			singleSide: 'false',
			lane: [
				{
					id: 0,
					roadMark: [{type: 'solid', weight: 'standard', color: 'yellow', width: 0.13}]
				},
				{
					id: -1,
					width: [{s: 0, a: 3.25, b: 0, c: 0, d: 0}],
					roadMark: [{type: 'broken', weight: 'standard', color: 'standard', width: 0.13}]
				},
				{
					id: -2,
					width: [{s: 0, a: 3.25, b: 0, c: 0, d: 0}],
					roadMark: [{type: 'broken', weight: 'standard', color: 'standard', width: 0.13}]
				},
				{
					id: -3,
					width: [{s: 0, a: 3.25, b: 0, c: 0, d: 0}],
					roadMark: [{type: 'solid', weight: 'standard', color: 'standard', width: 0.13}]
				}
			]
		}]
	}

	defaultSignal = {
		id: '',
		road: '', // roadid to which the signal belongs
		s: 0,
		t: 0,
		dynamic: 'yes',
		orientation: '+'
	}

	var edittingRoad = JSON.parse(JSON.stringify(defaultRoad));

	var gui = new dat.GUI({width: 300});

	var mapExporter, mapEditor, editorReseter, editorSaver, roadDetail;

	mapExporter = gui.addFolder('Map Exporter');
	mapExporter.add(exporter, 'saveAsJSON');

	mapEditor = gui.addFolder('Map Editor');
	mapEditor.add(editor, 'addNewRoad');

	function popGeometry2Folder(geometry, folder) {
			
		var geometryUI = {
			s: geometry.s,
			x: geometry.x,
			y: geometry.y,
			hdg: geometry.hdg,
			length: geometry.length,
			type: geometry.type,
			offset: {a: geometry.offset.a, b: geometry.offset.b, c: geometry.offset.c, d: geometry.offset.d},
		}
		if (geometry.type == 'spiral') {
			geometryUI.curvStart = geometry.spiral.curvStart;
			geometryUI.curvEnd = geometry.spiral.curvEnd;
		}
		if (geometry.type == 'arc') {
			geometryUI.curvature = geometry.arc.curvature;
		}

		folder.add(geometryUI, 'type', ['line', 'spiral', 'arc']).onChange( 
			function(value) { geometry.type = value; closeEditions(); popEditions(); });
		folder.add(geometryUI, 'length', 10.0).onChange(function(value) {geometry.length = value; refreshRoad(road);});
		if (geometry.type == 'spiral') {
			folder.add(geometryUI, 'curvStart').onChange( function(value) { geometry.spiral.curvStart = value; refreshRoad(road); });
			folder.add(geometryUI, 'curvEnd').onChange( function(value) { geometry.spiral.curvEnd = value; refreshRoad(road); });
		}
		if (geometry.type == 'arc') {
			folder.add(geometryUI, 'curvature').onChange( function(value) { geometry.arc.curvature = value; refreshRoad(road); });
		}

		var geometryOffset = folder.addFolder('Lane Offset');
		geometryOffset.add(geometryUI.offset, 'a').onChange(function(value) {geometry.offset.a = value; refreshRoad(road);});
		geometryOffset.add(geometryUI.offset, 'b').onChange(function(value) {geometry.offset.b = value; refreshRoad(road);});
		geometryOffset.add(geometryUI.offset, 'c').onChange(function(value) {geometry.offset.c = value; refreshRoad(road);});
		geometryOffset.add(geometryUI.offset, 'd').onChange(function(value) {geinetrt.offset.d = value; refreshRoad(road);});
	}

	function fillGeometryFolder(geometries, geometryFolder) {
		if (geometries.length == 1) {
			popGeometry2Folder(geometries[0], geometryFolder);
		} else {
			for (var i = 0; i < geometries.length; i++) {
				popGeometry2Folder(geometries[i], geometryFolder.addFolder('Geometry ' + (i + 1)));
			}
		}
	}

	function popLaneSectoin2Folder(laneSection, folder) {

		laneSection.lane.sort(function(laneA, laneB) { if (laneA.id > laneB.id) return - 1; if (laneA.id < laneB.id) return 1; if (laneA.id == laneB.id) return 0} );
		for (var i = 0; i < laneSection.lane.length; i++) {

			var lane = laneSection.lane[i];
			var laneFolder = folder.addFolder('Lane ' + lane.id);
			
			var laneUI = {
				id: lane.id
			}
			
			function popWidth2Folder(width, folder) {

				var widthUI = {
					a: width.a,
					b: width.b,
					c: width.c,
					d: width.d,
				}

				folder.add(widthUI, 'a').onChange(function(value) {width.a = value; refreshRoad(road)});
				folder.add(widthUI, 'b').onChange(function(value) {width.b = value; refreshRoad(road)});
				folder.add(widthUI, 'c').onChange(function(value) {width.c = value; refreshRoad(road)});
				folder.add(widthUI, 'd').onChange(function(value) {width.d = value; refreshRoad(road)});
			}
			function fillWidthFolder() {
				if (lane.width.length == 1) {
					popWidth2Folder(lane.width[0], widthFolder);
				} else {
					for (var i = 0; i < lane.width.length; i++) {
						popWidth2Folder(lane.width[i], widthFolder.addFolder('Width ' + (i + 1)));
					}
				}
			}

			function popRoadMark2Folder(roadMark, folder) {

				var roadMarkUI = {
					// sOffset: roadMark.sOffset,
					type: roadMark.type,
					weight: roadMark.weight,
					color: roadMark.color,
					width: roadMark.width,
					material: roadMark.material,
					laneChange: roadMark.laneChange,
					height: roadMark.height,
				}

				// folder.add(roadMarkUI, 'sOffset').onChange(function(value) {roadMark.sOffset = value; refreshRoad(road)});
				folder.add(roadMarkUI, 'type', ['broken', 'solid', 'solid solid', 'broken broken', 'solid broken', 'broken solid']).onChange(function(value) {roadMark.type = value; refreshRoad(road)});
				folder.add(roadMarkUI, 'color', ['standard', 'white', 'yellow']).onChange(function(value) {roadMark.color = value; refreshRoad(road)});
				folder.add(roadMarkUI, 'width').onChange(function(value) {roadMark.width = value; refreshRoad(road)});
			}
			function fillRoadMarkFolder() {
				if (lane.roadMark.length == 1) {
					popRoadMark2Folder(lane.roadMark[0], roadMarkFolder);
				} else {
					for (var i = 0; i < lane.roadMark.length; i++) {
						popRoadMark2Folder(lane.roadMark[i], roadMarkFolder.addFolder('Mark ' + (i + 1)));
					}
				}
			}

			laneFolder.add(laneUI, 'id');

			if (lane.width) {
				var widthFolder = laneFolder.addFolder('Width');
				fillWidthFolder();
			}

			if (lane.roadMark) {
				var roadMarkFolder = laneFolder.addFolder('Roadmark');
				fillRoadMarkFolder();
			}
		}
	}
	function fillLaneSectionFolder(laneSections, laneSectionFolder) {

		if (laneSections.length == 1) {
			popLaneSectoin2Folder(laneSections[0], laneSectionFolder);
		} else {
			for (var i = 0; i < laneSections.length; i++) {
				popLaneSectoin2Folder(laneSections[i], laneSectionFolder.addFolder('Section ' + (i + 1)));
			}
		}
	}

	function popSignal2Folder(signal, folder) {

		var signalUI = {
			name: signal.name,
			s: signal.s,
			t: signal.t,
			dynamic: signal.dynamic,
			orientation: signal.orientation,
			type: signal.type,
		}

		folder.add(signalUI, 'name').onChange( function(value) { signal.name = value; } );
		folder.add(signalUI, 's', 0, road.length).onChange( function(value) {signal.s = value; refreshSignal(); } );
		folder.add(signalUI, 't').onChange( function(value) { signal.t = value; refreshSignal(); } );
		folder.add(signalUI, 'dynamic').onChange( function(value) { signal.dynamic = value; refreshSignal(); } );
		folder.add(signalUI, 'orientation', ['+', '-']).onChange( function(value) {signal.orientation = value; refreshSignal(); } );
		folder.add(signalUI, 'type'). onChange( function(value) {} );
	}

	function fillSignalFolder(signals, signalFolder) {
		signals.sort();
		for (var i = 0; i < signals.length; i++) {
			// if (!(road.signal[i] in dirtyMap.signals)) {
			// 	dirtyMap.signals[road.signal[i]] = JSON.parse(JSON.stringify(map.signals[road.signal[i]]));
			// }
			// var signal = dirtyMap.signals[road.signal[i]];
			// try {
			// 	popSignal2Folder(signal, signalFolder.addFolder('Singal ' + signal.id));
			// } catch(e) {
			// 	popSignal2Folder(signal, signalFolder.addFolder('Singal ' + signal.id + '(' + i + ')'));
			// }
			console.log(signal);
		}
	}

	function popEditions() {

		roadDetail = mapEditor.addFolder('Detail');
		roadDetail.open();

		roadDetail.add(road, 'roadID');

		geometryFolder = roadDetail.addFolder('Geometry');
		geometryFolder.open();
		fillGeometryFolder(edittingRoad.geometry, geometryFolder);

		laneSectionFolder = roadDetail.addFolder('Lanes');
		laneSectionFolder.open();
		fillLaneSectionFolder(edittingRoad.laneSection, laneSectionFolder);

		if (edittingRoad.signal) {
			signalFolder = roadDetail.addFolder('Signal');
			fillSignalFolder(edittingRoad.signal, signalFolder);
		}
		
		editorReseter = mapEditor.add(editor, 'resetEditions');
		editorSaver = mapEditor.add(editor, 'saveEditions');
	}

	function closeEditions() {

		mapEditor.removeFolder('Detail');
		mapEditor.remove(editorReseter);
		mapEditor.remove(editorSaver);
	}

	function refreshRoad(road) {
		clearRoads();
		paveRoad(road, true);
		drawRoad(road, true);
		if (road.id in dirtyMap.roads) {
			placeSignalsInDirtyRoad(dirtyMap, road);	
		} else {
			placeSignalsInRoads([road.id]);
		}
	}

	/*
		function popGeometry2Folder(geometry, folder) {
			
			var geometryUI = {
				s: geometry.s,
				x: geometry.x,
				y: geometry.y,
				hdg: geometry.hdg,
				length: geometry.length,
				type: geometry.type,
				offset: {a: geometry.offset.a, b: geometry.offset.b, c: geometry.offset.c, d: geometry.offset.d},
			}
			if (geometry.type == 'spiral') {
				geometryUI.curvStart = geometry.spiral.curvStart;
				geometryUI.curvEnd = geometry.spiral.curvEnd;
			}
			if (geometry.type == 'arc') {
				geometryUI.curvature = geometry.arc.curvature;
			}

			folder.add(geometryUI, 's').__input.disabled = true;
			folder.add(geometryUI, 'x').onChange(function(value) {geometry.x = value; refreshRoad(road);});
			folder.add(geometryUI, 'y').onChange(function(value) {geometry.y = value; refreshRoad(road);});
			folder.add(geometryUI, 'hdg', 0, Math.PI *2).onChange(function(value) {geometry.hdg = value; refreshRoad(road);});
			folder.add(geometryUI, 'length', 0).onChange(function(value) {geometry.length = value; refreshRoad(road);});
			folder.add(geometryUI, 'type');
			if (geometry.type == 'spiral') {
				folder.add(geometryUI, 'curvStart');
				folder.add(geometryUI, 'curvEnd');
			}
			if (geometry.type == 'arc') {
				folder.add(geometryUI, 'curvature');
			}

			var geometryOffset = folder.addFolder('Lane Offset');
			geometryOffset.add(geometryUI.offset, 'a').onChange(function(value) {geometry.offset.a = value; refreshRoad(road);});
			geometryOffset.add(geometryUI.offset, 'b').onChange(function(value) {geometry.offset.b = value; refreshRoad(road);});
			geometryOffset.add(geometryUI.offset, 'c').onChange(function(value) {geometry.offset.c = value; refreshRoad(road);});
			geometryOffset.add(geometryUI.offset, 'd').onChange(function(value) {geinetrt.offset.d = value; refreshRoad(road);});
		}

		function fillGeometryFolder(geometryFolder) {
			if (geometries.length == 1) {
				popGeometry2Folder(geometries[0], geometryFolder);
			} else {
				for (var i = 0; i < geometries.length; i++) {
					popGeometry2Folder(geometries[i], geometryFolder.addFolder('Geometry ' + (i + 1)));
				}
			}
		}

		function popElevation2Folder(elevation, folder) {

			var elevationUI = {
				s: elevation.s,
				a: elevation.a,
				b: elevation.b,
				c: elevation.c,
				d: elevation.d,
			}
			folder.add(elevationUI, 's').__input.disabled = true;
			folder.add(elevationUI, 'a').onChange(function(value) {elevation.a = value; refreshRoad(road);});
			folder.add(elevationUI, 'b').onChange(function(value) {elevation.b = value; refreshRoad(road);});
			folder.add(elevationUI, 'c').onChange(function(value) {elevation.c = value; refreshRoad(road);});
			folder.add(elevationUI, 'd').onChange(function(value) {elevation.d = value; refreshRoad(road);});
		}

		function fillElevationFolder(elevationFolder) {
			if (road.elevation.length == 1) {
				popElevation2Folder(road.elevation[0], elevationFolder);
			} else {
				for (var i = 0; i < road.elevation.length; i++) {
					popElevation2Folder(road.elevation[i], elevationFolder.addFolder('Elevation ' + (i + 1)));
				}
			}
		}

		function popSuperelevation2Folder(superelevation, folder) {

			var superelevationUI = {
				s: superelevation.s,
				a: superelevation.a,
				b: superelevation.b,
				c: superelevation.c,
				d: superelevation.d,
			}
			folder.add(superelevationUI, 's').__input.disabled = true;
			folder.add(superelevationUI, 'a').onChange(function(value) {superelevation.a = value; refreshRoad(road);});
			folder.add(superelevationUI, 'b').onChange(function(value) {superelevation.b = value; refreshRoad(road);});
			folder.add(superelevationUI, 'c').onChange(function(value) {superelevation.c = value; refreshRoad(road);});
			folder.add(superelevationUI, 'd').onChange(function(value) {superelevation.d = value; refreshRoad(road);});
		}

		function fillSuperelevationFolder(superelevationFolder) {
			if (road.superelevation.length == 1) {
				popSuperelevation2Folder(road.superelevation[0], superelevationFolder);
			} else {
				for (var i = 0; i < road.superelevation.length; i++) {
					popSuperelevation2Folder(road.superelevation[i], superelevationFolder.addFolder('Superelevation ' + (i + 1)));
				}
			}
		}

		function popCrossfall2Folder(crossfall, folder) {

			var crossfallUI = {
				side: crossfall.side,
				s: crossfall.s,
				a: crossfall.a,
				b: crossfall.b,
				c: crossfall.c,
				d: crossfall.d,
			}
			folder.add(crossfallUI, 'side').onChange(function(value) {crossfall.side = value; refreshRoad(road);});
			folder.add(crossfallUI, 's').__input.disabled = true;
			folder.add(crossfallUI, 'a').onChange(function(value) {crossfall.a = value; refreshRoad(road);});
			folder.add(crossfallUI, 'b').onChange(function(value) {crossfall.b = value; refreshRoad(road);});
			folder.add(crossfallUI, 'c').onChange(function(value) {crossfall.c = value; refreshRoad(road);});
			folder.add(crossfallUI, 'd').onChange(function(value) {crossfall.d = value; refreshRoad(road);});
		}

		function fillCrossfallFolder(crossfallFolder) {
			if (road.crossfall.length == 1) {
				popCrossfall2Folder(road.crossfall[0], crossfallFolder);
			} else {
				for (var i = 0; i < road.crossfall.length; i++) {
					popCrossfall2Folder(road.crossfall[i], crossfallFolder.addFolder('Crossfall ' + (i + 1)));
				}
			}
		}

		function popLaneSectoin2Folder(laneSection, folder) {

			var laneSectionUI = {
				s: laneSection.s,
			}

			folder.add(laneSectionUI, 's').__input.disabled = true;

			laneSection.lane.sort(function(laneA, laneB) { if (laneA.id > laneB.id) return - 1; if (laneA.id < laneB.id) return 1; if (laneA.id == laneB.id) return 0} );
			for (var i = 0; i < laneSection.lane.length; i++) {

				var lane = laneSection.lane[i];
				var laneFolder = folder.addFolder('Lane ' + lane.id);

				var laneUI = {
					type: lane.type,
					level: (lane.level == '0' || lane.level == 'false') ? 'Apply superelevation if any' : 'Keep within road level',
					predecessor: lane.predecessor,
					successor: lane.successor,
				}
				
				function popWidth2Folder(width, folder) {

					var widthUI = {
						sOffset: width.sOffset,
						a: width.a,
						b: width.b,
						c: width.c,
						d: width.d,
					}

					folder.add(widthUI, 'sOffset').onChange(function(value) {width.sOffset = value; refreshRoad(road)});
					folder.add(widthUI, 'a').onChange(function(value) {width.a = value; refreshRoad(road)});
					folder.add(widthUI, 'b').onChange(function(value) {width.b = value; refreshRoad(road)});
					folder.add(widthUI, 'c').onChange(function(value) {width.c = value; refreshRoad(road)});
					folder.add(widthUI, 'd').onChange(function(value) {width.d = value; refreshRoad(road)});
				}
				function fillWidthFolder() {
					if (lane.width.length == 1) {
						popWidth2Folder(lane.width[0], widthFolder);
					} else {
						for (var i = 0; i < lane.width.length; i++) {
							popWidth2Folder(lane.width[i], widthFolder.addFolder('Width ' + (i + 1)));
						}
					}
				}

				function popRoadMark2Folder(roadMark, folder) {

					var roadMarkUI = {
						sOffset: roadMark.sOffset,
						type: roadMark.type,
						weight: roadMark.weight,
						color: roadMark.color,
						width: roadMark.width,
						material: roadMark.material,
						laneChange: roadMark.laneChange,
						height: roadMark.height,
					}

					folder.add(roadMarkUI, 'sOffset').onChange(function(value) {roadMark.sOffset = value; refreshRoad(road)});
					folder.add(roadMarkUI, 'type').onChange(function(value) {roadMark.type = value; refreshRoad(road)});
					folder.add(roadMarkUI, 'weight').onChange(function(value) {roadMark.weight = value; refreshRoad(road)});
					folder.add(roadMarkUI, 'color').onChange(function(value) {roadMark.color = value; refreshRoad(road)});
					folder.add(roadMarkUI, 'width').onChange(function(value) {roadMark.width = value; refreshRoad(road)});
					if (roadMark.material) folder.add(roadMarkUI, 'material').onChange(function(value) {roadMark.material = value; refreshRoad(road)});
					if (roadMark.laneChange) folder.add(roadMarkUI, 'laneChange').onChange(function(value) {roadMark.laneChange = value; refreshRoad(road)});
					if (roadMark.height) folder.add(roadMarkUI, 'height').onChange(function(value) {roadMark.height = value; refreshRoad(road)});
				}
				function fillRoadMarkFolder() {
					if (lane.roadMark.length == 1) {
						popRoadMark2Folder(lane.roadMark[0], roadMarkFolder);
					} else {
						for (var i = 0; i < lane.roadMark.length; i++) {
							popRoadMark2Folder(lane.roadMark[i], roadMarkFolder.addFolder('Mark ' + (i + 1)));
						}
					}
				}

				function popLaneHeight2Folder(laneHeight, folder) {

					var laneHeightUI = {
						sOffset: laneHeight.sOffset,
						inner: laneHeight.inner,
						outer: laneHeight.outer,
					}

					folder.add(laneHeightUI, 'sOffset').onChange(function(value) {laneHeight.sOffset = value; refreshRoad(road)});
					folder.add(laneHeightUI, 'inner').onChange(function(value) {laneHeight.inner = value; refreshRoad(road)});
					folder.add(laneHeightUI, 'outer').onChange(function(value) {laneHeight.outer = value; refreshRoad(road)});
				}
				function fillLaneHeightFolder() {
					if (lane.height.length == 1) {
						popLaneHeight2Folder(lane.height[0], laneHeightFolder);
					} else {
						for (var i = 0; i < lane.height.length; i++) {
							popLaneHeight2Folder(lane.height[i], laneHeightFolder.addFolder('Height ' + (i + 1)));
						}
					}
				}

				function popMaterial2Folder(material, folder) {

					var materialUI = {
						sOffset: material.sOffset,
						surface: material.surface,
						friction: material.friction,
						roughness: material.roughness,
					}

					folder.add(materialUI, 'sOffset').onChange(function(value) {material.sOffset = value; refreshRoad(road)});
					folder.add(materialUI, 'surface').onChange(function(value) {material.surface = value; refreshRoad(road)});
					folder.add(materialUI, 'friction').onChange(function(value) {material.friction = value; refreshRoad(road)});
					folder.add(materialUI, 'roughness').onChange(function(value) {material.roughness = value; refreshRoad(road)});
				}
				function fillMaterialFolder() {

					if (lane.material.length == 1) {
						popMaterial2Folder(lane.material[0], materialFolder);
					} else {
						for (var i = 0; i < lane.material.length; i++) {
							popMaterial2Folder(lane.material[i], materialFolder.addFolder('Material ' + (i + 1)));
						}
					}
				}

				function popVisiblity2Folder(visibility, folder) {

					var visibilityUI = {
						sOffset: visibility.sOffset,
						forward: visibility.forward,
						back: visibility.back,
						left: visibility.left,
						right: visibility.right,
					}

					folder.add(visibilityUI, 'sOffset').onChange(function(value) {visibility.sOffset = value; refreshRoad(road)});
					folder.add(visibilityUI, 'forward').onChange(function(value) {visibility.forward = value; refreshRoad(road)});
					folder.add(visibilityUI, 'back').onChange(function(value) {visibility.back = value; refreshRoad(road)});
					folder.add(visibilityUI, 'left').onChange(function(value) {visibility.left = value; refreshRoad(road)});
					folder.add(visibilityUI, 'right').onChange(function(value) {visibility.right = value; refreshRoad(road)});
				}
				function fillVisibilityFolder() {

					if (lane.visibility.length == 1) {
						popMaterial2Folder(lane.visibility[0], visibilityFolder);
					} else {
						for (var i = 0; i < lane.visibility.length; i++) {
							popMaterial2Folder(lane.visibility[i], visibilityFolder.addFolder('Visibility ' + (i + 1)));
						}
					}
				}

				function popSpeed2Folder(speed, folder) {

					var speedUI = {
						sOffset: speed.sOffset,
						max: speed.max,
						unit: speed.unit,
					}

					folder.add(speedUI, 'sOffset').onChange(function(value) {speed.sOffset = value; refreshRoad(road)});
					folder.add(speedUI, 'max').onChange(function(value) {speed.max = value; refreshRoad(road)});
					folder.add(speedUI, 'unit').onChange(function(value) {speed.unit = value; refreshRoad(road)});
				}
				function fillSpeedFolder() {

					if (lane.speed.length == 1) {
						popMaterial2Folder(lane.speed[0], speeFolder);
					} else {
						for (var i = 0; i < lane.speed.length; i++) {
							popMaterial2Folder(lane.speed[i], speeFolder.addFolder('Speed ' + (i + 1)));
						}
					}
				}

				function popAccess2Folder(access, folder) {

					var accessUI = {
						sOffset: access.sOffset,
						restriction: access.restriction,
					}

					folder.add(accessUI, 'sOffset').onChange(function(value) {access.sOffset = value; refreshRoad(road)});
					folder.add(accessUI, 'restriction').onChange(function(value) {access.restriction = value; refreshRoad(road)});
				}
				function fillAccessFolder() {

					if (lane.access.length == 1) {
						popMaterial2Folder(lane.access[0], accessFolder);
					} else {
						for (var i = 0; i < lane.access.length; i++) {
							popMaterial2Folder(lane.access[i], accessFolder.addFolder('Access ' + (i + 1)));
						}
					}
				}

				function popRule2Folder(rule, folder) {

					var ruleUI = {
						sOffset: rule.sOffset,
						value: rule.value,
					}

					folder.add(ruleUI, 'sOffset').onChange(function(value) {rule.sOffset = value; refreshRoad(road)});
					folder.add(ruleUI, 'value').onChange(function(value) {rule.value = value; refreshRoad(road)});
				}
				function fillRuleFolder() {
					if (lane.rule.length == 1) {
						popRule2Folder(lane.rule[0], ruleFolder);
					} else {
						for (var i = 0; i < lane.rule.length; i++) {
							popRule2Folder(lane.rule[i], ruleFolder.addFolder('Rule ' + (i + 1)));
						}
					}
				}

				laneFolder.add(laneUI, 'type').onChange(function(value) {lane.type = value; refreshRoad(road)});
				laneFolder.add(laneUI, 'level', ['Apply superelevation if any', 'Keep within road level']).onChange(function(value) {if (value == 'Keep within road level') lane.level = 'true'; else lane.level = 'false'; refreshRoad(road)});
				if (lane.predecessor) {
					var predecessor = laneFolder.add(laneUI, 'predecessor');
					predecessor.__input.disabled = true;
				}
				if (lane.successor) {
					var successor = laneFolder.add(laneUI, 'successor');
					successor.__input.disabled = true;
				}

				if (lane.width) {
					var widthFolder = laneFolder.addFolder('Width');
					fillWidthFolder();
				}

				if (lane.roadMark) {
					var roadMarkFolder = laneFolder.addFolder('Roadmark');
					fillRoadMarkFolder();
				}

				if (lane.height) {
					var laneHeightFolder = laneFolder.addFolder('Height');
					fillLaneHeightFolder();
				}

				if (lane.material) {
					var materialFolder = laneFolder.addFolder('Material');
					fillMaterialFolder();
				}

				if (lane.visibility) {
					var visibilityFolder = laneFolder.addFolder('Visibility');
					fillVisibilityFolder();
				}

				if (lane.speed) {
					var speeFolder = laneFolder.addFolder('Speed');
					fillSpeedFolder();
				}

				if (lane.access) {
					var accessFolder = laneFolder.addFolder('Access');
					fillAccessFolder();
				}

				if (lane.rule) {
					var ruleFolder = laneFolder.addFolder('Rule');
					fillRuleFolder();
				}

			}
		}

		function fillLaneSectionFolder(laneSectionFolder) {

			if (road.laneSection.length == 1) {
				popLaneSectoin2Folder(road.laneSection[0], laneSectionFolder);
			} else {
				for (var i = 0; i < road.laneSection.length; i++) {
					popLaneSectoin2Folder(road.laneSection[i], laneSectionFolder.addFolder('Section ' + (i + 1)));
				}
			}
		}

		function popSignal2Folder(signal, folder) {

			var signalUI = {
				name: signal.name,
				s: signal.s,
				t: signal.t,
				dynamic: signal.dynamic,
				orientation: signal.orientation,
				type: signal.type,
			}

			folder.add(signalUI, 'name').onChange( function(value) { signal.name = value; } );
			folder.add(signalUI, 's', 0, road.length).onChange( function(value) {signal.s = value; refreshSignal(); } );
			folder.add(signalUI, 't').onChange( function(value) { signal.t = value; refreshSignal(); } );
			folder.add(signalUI, 'dynamic').onChange( function(value) { signal.dynamic = value; refreshSignal(); } );
			folder.add(signalUI, 'orientation', ['+', '-']).onChange( function(value) {signal.orientation = value; refreshSignal(); } );
			folder.add(signalUI, 'type'). onChange( function(value) {} );
		}

		function fillSignalFolder(signalFolder) {
			road.signal.sort();
			for (var i = 0; i < road.signal.length; i++) {
				if (!(road.signal[i] in dirtyMap.signals)) {
					dirtyMap.signals[road.signal[i]] = JSON.parse(JSON.stringify(map.signals[road.signal[i]]));
				}
				var signal = dirtyMap.signals[road.signal[i]];
				try {
					popSignal2Folder(signal, signalFolder.addFolder('Singal ' + signal.id));
				} catch(e) {
					popSignal2Folder(signal, signalFolder.addFolder('Singal ' + signal.id + '(' + i + ')'));
				}
			}
		}

		function refreshSignal(signal) {
			hide(group.signal);
			group.signal = [];
			placeSignalsInDirtyRoad(dirtyMap, road);
		}

		// root
		roadDetail = mapEditor.addFolder('Road Detail');

		roadDetail.add(roadUI, 'name');
		roadDetail.add(roadUI, 'length').__input.disabled = true;
		if (road.type) roadDetail.add(roadUI, 'type');
		if (road.junction != '-1') roadDetail.add(roadUI, 'junction').__input.disabled = true;

		// link
		if(road.predecessor) {
			predecessorFolder = roadDetail.addFolder('Predecessor');
			popPredecessor2Folder(road.predecessor, predecessorFolder);
		}
		if (road.successor) {
			successorFolder = roadDetail.addFolder('Successor');
			popSuccessor2Folder(road.successor, successorFolder);
		}
		
		// planView geometry
		geometryFolder = roadDetail.addFolder('Alignment');
		fillGeometryFolder(geometryFolder);

		// elevation
		if (road.elevation) {
			elevationFolder = roadDetail.addFolder('Elevation Profile');
			fillElevationFolder(elevationFolder);
		}

		// lateral profile
		if (road.superelevation) {
			superelevationFolder = roadDetail.addFolder('Superelevation Profile');
			fillSuperelevationFolder(superelevationFolder);
		}
		if (road.crossfall) {
			crossfallFolder = roadDetail.addFolder('Crossfall Profile');
			fillCrossfallFolder(crossfallFolder);
		}

		// lanes
		laneSectionFolder = roadDetail.addFolder('Lane Section');
		fillLaneSectionFolder(laneSectionFolder);

		if (road.signal) {
			signalFolder = roadDetail.addFolder('Signal');
			fillSignalFolder(signalFolder);
		}

		roadDetail.open();

		editorReseter = mapEditor.add(editor, 'resetEditions');
		editorSaver = mapEditor.add(editor, 'saveEditions');
	}
	*/
	function exitEditorMode() {
		if (roadDetail) {
			mapEditor.removeFolder('Road Detail');
			roadDetail = null;
			mapEditor.remove(editorReseter);
			mapEditor.remove(editorSaver);
			editorReseter = null;
			editorSaver = null;
		}
	}

	function resetEditions() {
		
		console.log('Resetting Editions.');
	}

	function saveEditions() {

		console.log('Editions have been saved.');
	}

}

/*
* clear screen to show nothing
*/
function clearRoads() {
	hide(group.road);
	hide(group.roadMark);
	hide(group.signal);
	hide(group.referenceLine);
	delete group.road;
	delete group.roadMark
	delete group.referenceLine;
	delete group.signal;
	group = {road: [], roadMark: [], referenceLine: [], signal: []};
}

/*
* hide added mesh from scene
*
* NOTE: after hiding a groupMesh, should delte its memory, but delete groupMesh won't work in hide function
*/
function hide(groupMesh) {
	
	groupMesh.forEach(function(mesh) {
		scene.remove(mesh);
	} );
}

/*
* Show geometry in plan view
*/
function geometryPlanView(roadId) {

	var isElevated = true;
	drawRoad(map.roads[roadId], isElevated);
}

/*
* Show elevation profile from -t as ponit of view (draw s in a straight line)
*/
function elevationSView(roadId) {

	var elevations = map.roads[roadId].elevation;

	if (!elevations)
		elevations = [{s: 0, a: 0, b: 0, c: 0, d: 0}];

	for (var i = 0; i < elevations.length; i++) {

		var elevation = elevations[i];
		var nextElevationS = elevations[i + 1] ? elevations[i + 1].s : map.roads[roadId].geometry[map.roads[roadId].geometry.length - 1].s + map.roads[roadId].geometry[map.roads[roadId].geometry.length - 1].length;

		var points = generateCubicPoints(0, nextElevationS - elevation.s, null, null, elevation.s - elevations[0].s, 0, 0, elevation);

		drawCustomLine(points, 0x000001);
	}
}

/*
* Show cross section of the road from -s as point of view
*/
function lateralView(roadId, s) {

}

/*
* Show lane info along s (draw s in a straight line)
*/
function laneSView(roadId, laneSectionId) {

	var road = map.roads[roadId];
	var laneSection = road.laneSection[laneSectionId];
	var lanes = laneSection.lane;
}

/*************************************************************
**					User Interaction						**
**************************************************************/



/*************************************************************
**				Importing/Exporting Roads					**
**************************************************************/

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

function loadOBJ(objFile) {

	var loader = new THREE.OBJLoader();

	// load a resource
	loader.load(objFile, function(object) {
		scene.add(object);
	});
}

function exportOBJ(meshArray, filename) {
	
	if (meshArray.length == 0) return;

	var object = {children:meshArray};

	object.traverse = scene.traverse;

	var exporter = new THREE.OBJExporter(targetEngineMatrix);
	var obj = exporter.parse(object);

	saveFile(obj, filename);
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

function onWindowResize() {
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize( window.innerWidth, window.innerHeight );
}

function test() {
	var roadIds = getConnectingRoadIds('500');
	//paveRoadsByIds(roadIds);

	// check if road.length is the same as the last geometry.s + geometry.length - tiny errors exist for some roads 
	for (var id in map.roads) {
		var road = map.roads[id];
		//if (road.geometry[road.geometry.length - 1].s + road.geometry[road.geometry.length - 1].length != road.length)
		//console.log(road.geometry[road.geometry.length - 1].s + road.geometry[road.geometry.length - 1].length, road.length)
	}

	var s = 0;
	var t = -1;
	var h = 0;
	var point = track2Inertial('500', s, t, h).position;
	//console.log('track2Inertial point ', point);

	var rBorderPoints = [new THREE.Vector3(-1, 1, 1), new THREE.Vector3(-1, -1, 1)]
	var lBorderPoints = [new THREE.Vector3(1, 1, 1), new THREE.Vector3(1, -1, 1), new THREE.Vector3(1, -2, 1)]
	var geometry = createCustomFaceGeometry(lBorderPoints, rBorderPoints);
	var material = new THREE.MeshBasicMaterial({color: 0xFF0000, side: THREE.DoubleSide});
	var mesh = new THREE.Mesh(geometry, material);
	//scene.add(mesh);

	var svector, tvector, hvector;

	svector = new THREE.Vector3(1, 0, 0);
	svector.applyAxisAngle(new THREE.Vector3(0, 0, 1), 0);

	tvector = svector.clone();
	tvector.cross(new THREE.Vector3(0, 0, -1));
	tvector.applyAxisAngle(svector, Math.PI / 4);
	
	hvector = svector.clone();
	hvector.cross(tvector);
 
	//drawDirectionalVector(svector, 0xFF0000);
	//drawDirectionalVector(tvector, 0x0000FF);
	//drawDirectionalVector(hvector, 0x00FF00);

	//scene.add(generateDefaultSignMesh());
	//scene.add(generateDefaultSignalMesh());

	//loadOBJ('../data/trumpet.obj');

	var roadId = '502';
	var s = Math.random() * map.roads[roadId].length//(map.roads[roadId].geometry[1].s - map.roads[roadId].geometry[0].s) + map.roads[roadId].geometry[0].s;
	var t = Math.random() * -4;
	var h = 0;
	//var position = track2Inertial(roadId, s, t, h).position;
	//drawLineAtPoint(position, 0, 5, 0x000001)
	//console.log('s',s, '\nt',t,'\nh', h, '\nposition', position.x, position.y, position.z);
	//var inGeometry = isWithinGeometry(map.roads[roadId].geometry[0], position.x, position.y);
	//console.log(inGeometry);
	//var onRoad = isOnRoad(roadId, position.x, position.y, position.z);
	//console.log(onRoad)
	//console.log('track error: s', onRoad.s - s, 't', onRoad.t - t, 'h', onRoad.h - h);

	//paveRoads(map.roads)
	//paveRoads(map.roads, true)
	//paveRoadsByIds([roadId], true);
	//paveLaneSection(map.roads[roadId], 0, [0], true)

	//placeSignals(map.signals);
	//placeSignalsInRoads(['5']);
	//placeSignalsByIds(['40'])

	//drawRoads(map.roads)
	//drawRoads(map.roads, true)
	//drawRoadsByIds([roadId], true)
	//drawRoadByLaneSections('5', [0, 1, 2, 3], true)
	//drawRoadByLaneSectionGeometries(roadId, 0, [0], true)

	//geometryPlanView('509')

	// -8.318342827395044 -0.6232362266760951 1.6006798769007737 for map Crossing8Course.xodr: 500, 504, 506, 509, 512
	var x = Math.random() * -20// - 10;
	var y = Math.random() * 15// - 10;
	var z = 0//Math.random() * 20 - 10;
	//console.log(x,y,z)
	//drawSphereAtPoint(new THREE.Vector3(x,y,z), 0.2, 0x2F2F2F)
	//var trackPosition = inertial2Track(x, y, z);
	//console.log(trackPosition);
	//for (var id in trackPosition) {
	//	if (trackPosition[id].on) {
	//		var inertial = track2Inertial(id, trackPosition[id].s, trackPosition[id].t, trackPosition[id].h);
	//		drawSphereAtPoint(inertial.position, 0.05, 0x0000FF);
	//	}
	//}

	//var meshArray = group.road.concat(group.roadMark).concat(group.signal);
	//exportOBJ([roadsMesh['500'], roadsMesh['508']], 'map.obj');
	//loadOBJ('../data/map.obj');

	//var mesh = verticalLoop(18, 5);
	//scene.add(mesh);

	//mesh = rollBegin('right', 10, 5, 0);
	//mesh.position.set(0, 0, 10);
	//scene.add(mesh);

	//mesh = rollArc('right', Math.PI * 10, 5, 10, -10);
	//mesh.position.set(10, 0, 10);
	//scene.add(mesh);

	//mesh = rollEnd('right', 10, 5, 0);
	//mesh.position.set(10, -20, 0);
	//mesh.rotation.set(0, 0, Math.PI);
	//scene.add(mesh);

	//mesh = rollLine('right', 10, 5, 5);
	//mesh.position.set(0, -50, 0);
	//scene.add(mesh);

	var mesh = new THREE.Mesh(new THREE.SphereBufferGeometry(5, 32, 32));
	isWithinMesh(mesh);

	var loader = new THREE.ObjectLoader();
	// loader.load('../data/circle_UV.json', addToScene);
	function addToScene(geometry, materials) {
		var material = new THREE.MeshFaceMaterial(materials);
		model = new THREE.Mesh( geometry, material );
		model.scale.set(0.5,0.5,0.5);
		scene.add( model );
	}

	var loader = new THREE.ObjectLoader();
	/*
	loader.load("../data/circle_UV.json", 
	    function ( obj ) {
	        scene.add( obj );
	    }   
	);
	*/
}