/*
*	the main demo
*
*	Copyright (C) 2017 Juergen Wothke
*/



// -------------------------- handling of info box ----------------------------- 

var lastMove=  new Date().getTime();
var previousTimer= null;
function showInfo() { 
	lastMove=  new Date().getTime();

	var em = document.getElementById("info");
	em.style.opacity = '0.68';
	em.style.zIndex="10";

	if (previousTimer !== null) {
	    clearTimeout(previousTimer);
	}
	previousTimer= setTimeout(function(){ 
		// display: "none" is insufficient: the hidden element will still cause
		// mouse focus loss
		em.style.zIndex="-10";		
	}, 6000);
}

/*
* Handles the flight instruments, i.e. status display..
*/
WOO.FlightInstruments = function(scene, utils) {
	this.scene= scene;
	this.utils= utils;
	this.instruments= this._create();
	this.show();
};

WOO.FlightInstruments.prototype = {
	show: function() {
		this.hide();	// just in case
		this.scene.add(this.instruments);	
	},	
	hide: function() {
		this.scene.remove(this.instruments);		
	},
	updateInstruments: function(basePosition, baseRotation, position, rotation) { // inputs refer to camera
		var absRrotation= new THREE.Vector3().add(basePosition).add(rotation);

		// set horizon 
		var up= new THREE.Vector3(0,1,0);
		up= this.utils.getRotatedVector(up.normalize(), rotation);

		// get polar coordinates (normalized vector, i.e. radius is 1)
		var a1 = Math.acos(up.z);
		var a2 = Math.atan2(up.y , up.x);
		this.rotateHorizon(new THREE.Vector3(a1,0, a2));
		
		
		var vLook = this.utils.getRotatedVector(new THREE.Vector3(0,0,-1), absRrotation);
		var vOrigin= new THREE.Vector3().add(position).sub(basePosition).negate();

		var dist= vOrigin.length();	// vector that would lead straight to back to base
		this._glowPointer(dist);
		
		var a=0;
		if (dist > 0) a= THREE.Math.radToDeg(vLook.angleTo(vOrigin));
		
		this.rotateDegNorth(a);	// not correct but good enough
	},
	// in radians
	rotateHorizon: function(v3) {
		// manually aligned 
		this.artificialHorizon.rotation.x=  THREE.Math.degToRad( 30+this.horizonBaseRotation.x)+v3.x;
		this.artificialHorizon.rotation.y=  THREE.Math.degToRad( 40+this.horizonBaseRotation.y )+v3.y;
		this.artificialHorizon.rotation.z=  THREE.Math.degToRad( 80+this.horizonBaseRotation.z )+v3.z;
	},
	rotateDegNorth: function(angle) {
		// base rotation (in sync wirh "horizon")
		this.north.rotation.x=  THREE.Math.degToRad( this.horizonBaseRotation.x );
		this.north.rotation.y=  THREE.Math.degToRad( this.horizonBaseRotation.y );
		this.north.rotation.z=  THREE.Math.degToRad( this.horizonBaseRotation.z +angle);
	},
	updateThrustLevel: function(level) {
		// -10..10
		this.thrust.scale.x = this.thrust.scale.z = this.thrust.baseScale;
		
		this.thrust.scale.y= this.thrust.baseScale/10*Math.abs(level);
		var offsety= this.thrust.scale.y*this.thrust.originalHeight/2;
		this.thrust.position.y= (level < 0) ? -offsety : offsety;
		
		this.thrust.rotation.z=  THREE.Math.degToRad( this.thrust.baseRotation.z );
		
		if (level < 0) this.thrust.rotation.z+=  THREE.Math.degToRad( 180 );
		
		this.thrust.position.x=  this.thrust.basePos.x;
		
		this.thrust.material.color= (level < 0) ? new THREE.Color(0x707070) : new THREE.Color(0xe0e0e0);
		this.thrust.needsUpdate=true;
	},
	_glowPointer: function(dist) {
		// glow red when approaching base point
		var baseCol= 0x5b5e52;
		var red= (0xa0 *(1-Math.min(1, dist/0.5))) << 16;					
		this.pointerMaterial.emissive= new THREE.Color(baseCol+red);
	},
	_createHorizon: function() {
		var geometry = new THREE.SphereGeometry(0.09, 15, 15, 0, Math.PI * 2, 0, Math.PI * 2);

		// better texture mapping (see http://stackoverflow.com/questions/21663923/mapping-image-onto-a-sphere-in-three-js)
		for(var v=0;v<geometry.faces.length;v++) {
			var face =geometry.faces[v];

			var uv= geometry.faceVertexUvs[ 0 ][v];
			for(var j=0;j<uv.length;j++) {
				uv[ j ].x = face.vertexNormals[ j ].x * 0.5 + 0.5;
				uv[ j ].y = face.vertexNormals[ j ].y * 0.5 + 0.5;
			}
		}
		geometry.uvsNeedUpdate= true;
		var sphereMaterial = new THREE.MeshPhongMaterial({
				name: "horizon",
				emissive:0x404040,
				color: 0xffffff,
				specular: 0x202020,	
				shininess: 0,
				map:  this._getHorizonTexture(16),
			
				overdraw: 0.5, 
				opacity:0.9,
				transparent: true
			});
		return new THREE.Mesh(geometry, sphereMaterial);		
	},
	_getHorizonTexture: function(size) {
		var canvas = document.createElement("canvas");
		canvas.width= canvas.height= size;
		var context = canvas.getContext("2d");
		var imd = context.createImageData(1,1);
		var d  = imd.data;  // rgba array                    

		// greyblue
		d[0]   = 136;
		d[1]   = 164;
		d[2]   = 177;
		d[3]   = 0xff;

		for (var y= 0; y<size/2; y++) {
			for (var x= 0; x<size; x++) {
				context.putImageData( imd, x, y ); 
			}			
		}
		// light grey
		d[0]   = 255;
		d[1]   = 255;
		d[2]   = 255;

		for (var y= size/2; y<size; y++) {
			for (var x= 0; x<size; x++) {
				context.putImageData( imd, x, y ); 
			}			
		}
		var texture= new THREE.Texture(canvas);
		texture.name= "artificial horizon";
		texture.format = THREE.RGBAFormat;
		texture.type = THREE.FloatType;
		texture.generateMipmaps = true;

	//	texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
		texture.wrapS = texture.wrapT = THREE.RepeatWrapping;

		texture.minFilter= THREE.LinearMipMapLinearFilter;
		texture.magFilter= THREE.LinearFilter;

		texture.repeat.set(1,4);
		
		texture.needsUpdate= true;

		return texture;
	},
	_createNorthIndicator: function() {		
		var ringGroup = new THREE.Group();
		
		// little pyramid
		var pyramid = new THREE.Geometry();
		var offset = 3.1;	// far enough from horizon-sphere
		
		pyramid.vertices = [
			new THREE.Vector3( -0.5, 0+offset, -0.5 ),
			new THREE.Vector3( 0.5, 0+offset, -0.5 ),
			new THREE.Vector3( 0.5, 0+offset, 0.5 ),
			new THREE.Vector3( -0.5, 0+offset, 0.5 ),
			new THREE.Vector3( 0, 1+offset, 0 )
		];
		pyramid.faces = [
			new THREE.Face3( 0, 1, 2 ),
			new THREE.Face3( 0, 2, 3 ),
			new THREE.Face3( 1, 0, 4 ),
			new THREE.Face3( 2, 1, 4 ),
			new THREE.Face3( 3, 2, 4 ),
			new THREE.Face3( 0, 3, 4 )
		];    
		pyramid.computeFaceNormals();

		this.pointerMaterial = new THREE.MeshPhongMaterial({
			name: "pointer",
			side: THREE.DoubleSide,  
			emissive:0x9bbed2,
			specular: 0x202020,	
			shininess: 0.4,
			overdraw: 0.5, 
			});

		var pointer =new THREE.Mesh( pyramid, this.pointerMaterial );
		pointer.scale.x = pointer.scale.y = pointer.scale.z = 0.03;
		ringGroup.add(pointer);

		// ring with gap for pyramid
		var ringMaterial = new THREE.MeshPhongMaterial({
			name: "ring",
			side: THREE.DoubleSide,  
			color: 0xadbfd9,
			specular: 0xefefef,	
			overdraw: 0.5, 
			opacity:0.4,
			transparent: true
			});
		
		var gap= 16;
	//	var geometry = new THREE.TorusGeometry( 2.2, 0.4, 8, 30, THREE.Math.degToRad(360-gap) );		
		var geometry = new THREE.TorusGeometry( 2.3, 0.3,  20 , 18, 25 );	// hacked torus..	
		
		var ring = new THREE.Mesh(geometry, ringMaterial);
		ring.scale.x = ring.scale.y = ring.scale.z = 0.05;
		ring.rotation.z=  THREE.Math.degToRad( 90 +gap/2);	// align gap with pointer
		ringGroup.add(ring);
		
		return ringGroup;
	},	
	_createThrustIndicator: function() {
		var h= 25;
		var w= 8;
		var geom = new THREE.CylinderGeometry(w/2,w/2,h);
		var mat = new THREE.MeshPhongMaterial({
				name: "thrust",
				emissive:0x101010,
				color: 0x000000,
				specular: 0x202020,	
				shininess: 40,
				overdraw: 0.5, 
				opacity:0.8,
				transparent: true
			});
	   				
		var mesh =new THREE.Mesh( geom, mat );
		// relative GUI positioning..
		mesh.originalHeight= h;
		mesh.originalWidth= w;
		mesh.baseScale=  0.0045;
		mesh.basePos=  new THREE.Vector3(0.25, 0, 0);
		mesh.baseRotation=  new THREE.Vector3(0, 0, 14);
		return mesh;
	},
	_create: function() {
		var group = new THREE.Group();
		
		this.horizonBaseRotation= new THREE.Vector3(65 +180, -10, 0);
		
		this.artificialHorizon= this._createHorizon();
		this.rotateHorizon(new THREE.Vector3(0,0,0));
		group.add(this.artificialHorizon);

		this.north= this._createNorthIndicator();
		this.rotateDegNorth(0);
		group.add(this.north);


		this.thrust = this._createThrustIndicator();
		this.updateThrustLevel(1);		
		group.add(this.thrust);

		group.position.x=1.3;
		group.position.y=4.1; 
		group.position.z=15.6; 

		return group;		
	},
};

/*
* Handles the banner text that is embedded into the scene.
*/
WOO.BannerText = function(scene) {
	this.scene= scene;
	
	this.startPos= this.previousPos= null;
	this.phaseRight= true;

	this.textGeo= null;
	this.txtGroup = this._createBanner();
	
	this.scene.add(this.txtGroup);
};
WOO.BannerText.prototype = {
	isReady: function() {
		return this.txtGroup.children.length >0;
	},
	show: function() {
		this.hide(); // just in case
		this.scene.add(this.txtGroup);	
	},	
	hide: function() {
		this.scene.remove(this.txtGroup);		
	},
	
	_createBanner: function() {
		var group = new THREE.Group();
		
		group.scale.x = group.scale.y = group.scale.z = 0.004;
		group.rotation.x=0;//-Math.PI/180*30; 
		group.rotation.y=-Math.PI/180*10; 
		group.rotation.z=0;//Math.PI/180*30; 	

		var rayMat = new THREE.MeshPhongMaterial({
			name: "text front material",
			emissive:0x000000,
			color: 0xffffff,
			
			// shininess
			specular: 0x802020,	
			shininess: 30,
			});

		getMeshTexter('./One-Eighty(-)_Regular.json', function(texter){
			this.textGeo= texter.create("modum panem");
			
			var frontMaterial= rayMat; 
			var material= new THREE.MultiMaterial( [
				(frontMaterial!=null)?frontMaterial:new THREE.MeshPhongMaterial( { color: 0xffffff, shading: THREE.FlatShading } ),// front
				new THREE.MeshPhongMaterial( { color: 0xffffff, shading: THREE.SmoothShading } ) // side
			] );

			var hover = 0;
			var centerOffset = -0.5 * ( this.textGeo.boundingBox.max.x - this.textGeo.boundingBox.min.x );
	
			var textMesh = new THREE.Mesh( this.textGeo, material );

			textMesh.position.x = centerOffset;
			textMesh.position.y = hover;
			textMesh.position.z = 0;

			textMesh.rotation.x = 0;
			textMesh.rotation.y = Math.PI * 2;
			
			group.add(textMesh);
		}.bind(this));
		return group;
	},
	updateTextGeometry: function(time) {
		// just twist the text a bit.. that creates a nice reflection on the front surface..
		var tempVec3 = new THREE.Vector3();

		var w= this.textGeo.originalBoundingBox.x;
	
		for ( var i = 0, il = this.textGeo.originalVertices.length; i < il; i ++ ) {
			var v= this.textGeo.originalVertices[i];

			var matrix = new THREE.Matrix4();
			// try to mimick cadence of drum beat
			matrix.multiply( new THREE.Matrix4().makeRotationX( THREE.Math.degToRad( 30 *v.x/w *Math.sin(time/95)) ) );

			tempVec3.set( v.x, v.y, v.z );
			tempVec3.applyMatrix4( matrix );
			
			this.textGeo.vertices[ i ].set( tempVec3.x, tempVec3.y, tempVec3.z);
		}

		this.textGeo.computeFaceNormals();
		this.textGeo.computeVertexNormals();

		this.textGeo.normalsNeedUpdate = true;
		this.textGeo.verticesNeedUpdate = true;	
	},
	animateText: function(time, cameraPos) {
		if (time > 0) {
			if(this.startPos == null) {
				this.startPos= [cameraPos.y,cameraPos.z];
			}
			if (this.textGeo != null) {
				this.updateTextPosition(cameraPos);
				
				if (time > 30000)	// at first do not animate - while there is no drum beat
					this.updateTextGeometry(time);
			}				
		}
	},	
	updateTextPosition: function(cameraPos) {
		// default starting pos
		var x= -1.4;
		var y= 5.4;
		var z= 13.66; 	// - back / + front

		if(this.startPos != null) {
			// hack: text position/visibility is manually adjusted tomandelbox camera pos.
			// alternatively the camera for the 3d scene would just need to be in sync 
			// with the mandelbox one.. but I am too lazy to do that now..

			var p= cameraPos;
			var dy= (p.y-this.startPos[0]);
			var dz= (p.z-this.startPos[1]);
			var dist= Math.sqrt(dz*dz+dy*dy);
					
			if (this.previousPos != null) {
				// check angle between vectors
				var sp= this.previousPos[0]*dy +this.previousPos[1]*dz;
				var l1= Math.sqrt(this.previousPos[0]*this.previousPos[0]+this.previousPos[1]*this.previousPos[1]);
				var l2= Math.sqrt(dy*dy+dz*dz);
				if (Math.acos(sp/(l1*l2)) > Math.PI/2) {
					// change of direction relative to origine
					this.phaseRight= !this.phaseRight;
				}
			}
	
			if (this.phaseRight) {
				// phases while moving to the right (return phases just mirrored)
				var rightSide= [
						0,						// show 
						0.11883898335569883,  	// hide
						0.3157312840105159,		// show displayed + move right
						0.44					// 
						];
				var phase;
				for (phase= 0; phase<rightSide.length-1; phase++) {
					if ((dist > rightSide[phase]) && (dist <= rightSide[phase+1])) break;
				}
				switch(phase) {
					case 0:
						// nothing to do					
						break;
					case 1:
						z= 1000;	// not within fov					
						break;
					case 2: {
						// further up/back
						y= 6.0;
						z= 13.0;

						var tz= 13.4;	// target pos
						var s= (dist-rightSide[2])/(rightSide[3]-rightSide[2]);
						z= z+(tz-z)*s; // linear move from back to front	

						
						var tx= 1.;	// target pos
						var s= (dist-rightSide[2])/(rightSide[3]-rightSide[2]);
						x= x+(tx-x)*s; // linear move from left to right	
						}
						break;
				}
				
			} else {
				var leftSide= [
						0,						// show + move right 
						0.3992501616060665,		// hide
						0.44					// 
						];
				var phase;
				for (phase= 0; phase<leftSide.length-1; phase++) {
					if ((dist > leftSide[phase]) && (dist <= leftSide[phase+1])) break;
				}
				switch(phase) {
					case 0: {
						// further up/back
						
						var tx= 1.;	// target pos
						var s= (dist-leftSide[0])/(leftSide[1]-leftSide[0]);
						x= x+(tx-x)*s; // linear move from left to right	
						}
						break;
					case 1:
						z= 1000;	// not within fov					
						break;
				}				
			}
		}	
		this.txtGroup.position.x=x; 
		this.txtGroup.position.y=y; 
		this.txtGroup.position.z=z;

		this.previousPos= [dy, dz];
	},
}

/*
* Handles the spaceship
*/
WOO.Spaceship = function(scene, utils) {
	this.utils= utils;
	this.scene= scene;
	
	this.lastTime= 0;
	
	this.steepBank= new THREE.Vector2();
	
	this.falconMesh= null;
	this.falconTexture= null;
	
	this.sphereMesh= null;
	this.sphereMaterial= null;
	
	this.plasmaPass= new WOO.PlasmaPass();
	this.plasmaPass.uniforms.tNoise.value=  this.utils.getNoiseTexture(256);
	
	this.plasmaPass.uniforms.size.value=  new THREE.Vector2(30, 30);	// patched within shader for 'collision effect'
	this.plasmaPass.plasmaTarget= this.utils.createPlasmaRenderTarget(356,316);

	var loader = new THREE.TextureLoader();
	loader.load('pattern2.gif', function ( texture ) {
		texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;	// ClampToEdgeWrapping
		texture.offset.set(0.5, 0.5);

		texture.name= "falcon texture";
		this.falconTexture= texture;

		this._createMeshes();

	}.bind(this));
};
WOO.Spaceship.prototype = {
	getBaseFlightOrientation: function() {
		// manually adjusted to point into flight path..
		return new THREE.Vector3(THREE.Math.degToRad(-17.47), THREE.Math.degToRad(119.42), THREE.Math.degToRad(-17.43));
	},
	animateFlightOrientation: function(time) {
		var dt= time-this.lastTime;
		
		if (dt > 50) {
			var maxDisplacement= new THREE.Vector2(THREE.Math.degToRad(50),THREE.Math.degToRad(50));
			this.lastTime= time;

			var decay= 0.8;
			this.steepBank.multiplyScalar(decay);

			var o= new THREE.Vector3().add(this.getBaseFlightOrientation());
			o.z+= maxDisplacement.y*Math.sin(this.steepBank.y*Math.PI/2);	// up/down
			
			o.x+= maxDisplacement.x*Math.sin(this.steepBank.x*Math.PI/2)/2;	// left/right
			o.y-= maxDisplacement.x*Math.sin(this.steepBank.x*Math.PI/2);
			
			// add some base movement
			
			o.x+= Math.sin(time/1000)/20;
			o.y+= Math.sin(time/1000+Math.PI/4)/20;
			
			this.setRotation(o);
		}
	},
	handleSteepBank: function(dx, dy) {
		var damping= 0.01;
		
		this.steepBank.x= Math.max(-1, Math.min(1, this.steepBank.x+dx*damping));
		this.steepBank.y= Math.max(-1, Math.min(1, this.steepBank.y+dy*damping));
	},
	isReady: function() {
		return this.falconMesh != null;
	},
	update: function(renderer, time, detectorTexture, debugPlasma) {
		if (this.plasmaPass != null) {
			if (!("tOffset" in window)) window.tOffset= time;
			
			this.plasmaPass.uniforms.tDetector.value=  detectorTexture;
			this.plasmaPass.uniforms.time.value= (time-window.tOffset)/1000;	

			if (debugPlasma) {
				// without feedback from Mandelbox..
				this.plasmaPass.render(renderer);
			} else {
				this.plasmaPass.render(renderer, this.plasmaPass.plasmaTarget);
			}	
		}	
	},
	animate: function() {
		var speed=Math.PI/360;
		if (this.isReady()) {
			this.setRotation(new THREE.Vector3(-speed * 2, -speed, -speed * 3).add(this.getRotation()));
										
		}		
	},
	_createMeshes: function() {
		this._loadFalconMesh(function(resultMesh) { 
			this.falconMesh= resultMesh;
			this.falconMesh.position.y=5.4; 
			this.falconMesh.position.z=15.4; 	// - back / + front
		
			this.scene.add(resultMesh);
						
			var geometry = new THREE.SphereGeometry(0.43, 40, 40, 0, Math.PI * 2, 0, Math.PI * 2);

			// better texture mapping (see http://stackoverflow.com/questions/21663923/mapping-image-onto-a-sphere-in-three-js)
			for(var v=0;v<geometry.faces.length;v++) {
				var face =geometry.faces[v];

				var uv= geometry.faceVertexUvs[ 0 ][v];
				for(var j=0;j<uv.length;j++) {
					uv[ j ].x = face.vertexNormals[ j ].x * 0.5 + 0.5;
					uv[ j ].y = face.vertexNormals[ j ].y * 0.5 + 0.5;
				}
			}
			geometry.uvsNeedUpdate= true;
			
			this.sphereMaterial = new THREE.MeshPhongMaterial({
				map: this.plasmaPass.plasmaTarget.texture, 
				side: THREE.DoubleSide, 
				transparent: true, 
				opacity:	1.0, 		// use transparency of the plasma
				shading: THREE.SmoothShading, 
				shininess: 10, 
				specular: 0x9F9FFF,
				wireframe: false
			});
			this.sphereMesh = new THREE.Mesh(geometry, this.sphereMaterial);
			// position in sync with falcon
			this.sphereMesh.position.x=this.falconMesh.position.x; 
			this.sphereMesh.position.y=this.falconMesh.position.y; 
			this.sphereMesh.position.z=this.falconMesh.position.z; 
			
			this.scene.add(this.sphereMesh);
		}.bind(this));
	},
	// in radians
	setRotation: function(v3) {
		var r= this.falconMesh.rotation;
		r.x = v3.x;
		r.y = v3.y;
		r.z = v3.z;		
		
		this.sphereMesh.rotation.x = r.x; 
		this.sphereMesh.rotation.y = r.y; 
		this.sphereMesh.rotation.z = r.z+Math.PI/2;	// works better with the texture 

	},
	getRotation: function() {
		var r= this.falconMesh.rotation;
		return new THREE.Vector3(r.x, r.y, r.z);
	},

	_loadFalconMesh: function(resultCallback) {
		var dishMat= new THREE.MeshPhongMaterial( {
			side: THREE.DoubleSide,  
			name: "satellite dish",
			wireframe: false, 
			shininess: 55,
			color: 0x808080,
			specular: 0x808080,
			emissive:0x000000
			});
		var cockpitMat= new THREE.MeshPhongMaterial( {	// bug: does not seem to be used..
			side: THREE.DoubleSide,  
			name: "cockpit window",
			wireframe: false, 
			shininess: 55,
			color: 0x808080,
			specular: 0x808080,
			emissive:0x000000
			});

		var texMaterial = new THREE.MeshPhongMaterial({
			name: "main body",
			side: THREE.DoubleSide,  
			emissive:0x000000,
			color: 0xffffff,
			
			// shininess
			specular: 0x202020,	
			shininess: 0,

			bumpMap:  this.falconTexture, 
			map: this.falconTexture, 
			overdraw: 0.5, 
			});

		var exhaustMat =  new THREE.ShaderMaterial({
			name: "1st pass glow shading",
			uniforms    : WOO.AttachmentShader.getUniforms(0x0000ff, 0.3, 1),
			vertexShader: WOO.AttachmentShader.vertexShader,
			fragmentShader: WOO.AttachmentShader.fragmentShader,
			});
			
		this.utils.loadMesh([	
						{f:'./f1.bin' , m: texMaterial}, 
						{f:'./f2.bin'}, 
						{f:'./f3.bin'}, 
						{f:'./f4.bin', m: [dishMat, cockpitMat]},
						{f:'./f5.bin', m: exhaustMat}
						],
						0.05, resultCallback);
	},	 
};

/*
* Handles the MandelBox shader based background.
*/
WOO.MandelSceneHolder = function(target) {
	this.scene = new THREE.Scene();
	this.mesh= null;
	this.mandelboxMaterial= null;

	this.initialCameraPos= new THREE.Vector3(-0.07963,0.099261,-1.3678434);
	
	// turn to face sideways from the movement direction
// ORIG  	this.initialCameraOrientation= new THREE.Vector3(-5.5, 61.5, 40); //x: pitch, y: yaw, z: roll
  	this.initialCameraOrientation= new THREE.Vector3(5.5, 180-61.5, 40); //x: pitch, y: yaw, z: roll     

	this.resetCamera();
	
	this.noise= 0.9;	// for start animation
	
	this.bubbleOrigin= new THREE.Vector2(0.5, 0.7);	// manually aligned with "spaceship"
	this.bubbleRadius= 0.2;
	
	this.condenser= new WOO.Condenser();
	
	this.resetScene(target);			
};

WOO.MandelSceneHolder.prototype = {
	isReady: function() {
		return this.mandelboxMaterial != null;
	},
	resetCameraOrientation: function() {
		this.setCameraOrientationDeg(this.initialCameraOrientation);
	},
	resetCamera: function() {
		this.setCameraPos(this.initialCameraPos);
		this.setCameraOrientationDeg(this.initialCameraOrientation);
	},
	getMandelPass: function() {
		var camera = new THREE.Camera();
		camera.position.z = 1;

		return new THREE.RenderPass( this.scene, camera );
	},
	resetScene: function(target){
		if (this.mesh !== null) this.scene.remove(this.mesh);

		var bgColor= new THREE.Vector3(0.7882352941176471, 1, 1);
		
		this.mandelboxMaterial = getMandelboxMaterial(target.texSize.x, target.texSize.y, bgColor, 
														this.getCameraPos(), this.getCameraOrientationDeg(), 
														this.bubbleOrigin, this.bubbleRadius);

		var geometry = new THREE.CubeGeometry(target.texSize.x, target.texSize.y, 0);
		this.mesh = new THREE.Mesh(geometry, this.mandelboxMaterial);
		this.scene.add(this.mesh);	
	},
	setCameraOrientationDeg: function(v3) {
		// x=pitch,y=yaw,z=roll
		
		this.cameraOrientation= new THREE.Vector3().add(v3);
		
		if (this.mandelboxMaterial != null) {
			this.mandelboxMaterial.uniforms.cameraPitch.value= this.cameraOrientation.x;
			this.mandelboxMaterial.uniforms.cameraYaw.value= this.cameraOrientation.y;
			this.mandelboxMaterial.uniforms.cameraRoll.value= this.cameraOrientation.z;
		}
	},
	getCameraOrientationDeg: function() {
		// x=pitch,y=yaw,z=roll
		return new THREE.Vector3().add(this.cameraOrientation);
	},
	getInitCameraOrientationDeg: function() {
		// x=pitch,y=yaw,z=roll
		return new THREE.Vector3().add(this.initialCameraOrientation);
	},
	getCameraPos: function() {
		return 	 new THREE.Vector3().add(this.cameraPos);
	},
	getInitCameraPos: function() {
		return 	 new THREE.Vector3().add(this.initialCameraPos);
	},
	setFocalLength: function(x) {
		this.mandelboxMaterial.uniforms.cameraFocalLength.value= x;
	},
	setCameraPos: function(v3) {
		this.cameraPos = new THREE.Vector3().add(v3);
		if (this.mandelboxMaterial != null) this.mandelboxMaterial.uniforms.cameraPosition.value= new THREE.Vector3().add(this.cameraPos);	
	},
	getCollisionDetectionTexture: function() {
		return this.condenser.getResultTexture();
	},
	resetEffects: function() {
		this.mandelboxMaterial.uniforms.waterworld.value= 0.0;
		this.mandelboxMaterial.uniforms.boxScale.value= 0.5;
		this.mandelboxMaterial.uniforms.deFactor.value= 1.0;
	},
	animate: function(debug, time, freqByteData) {
		// just use as 1 time startup effect
		this.noise= 0.995*this.noise;	// make it last longer
		this.mandelboxMaterial.uniforms.deFactor.value= 1-(this.noise);

		var f= Math.sin(time * 0.00001);
				
		var pos;				
		if (debug) {
			// good fixed position with active "collision"
			pos= new THREE.Vector3(this.cameraPos.x-0.1, this.cameraPos.y+0.21345, this.cameraPos.z+0.011);
		} else {
			pos= this._getAnimationCameraPos(time, f);
		}
		this.mandelboxMaterial.uniforms.waterworld.value= this._getAnimationWaterEffect(time);

		this.setCameraPos(pos)
		
		if (freqByteData != null) {
			// pulse boxes in sync with music
			this.mandelboxMaterial.uniforms.boxScale.value= this._getAnimationBoxZoom(freqByteData, f);	
		}
	},
	postprocess: function(renderer, inputTexture) {
		this.condenser.runChain(renderer, this.bubbleOrigin, this.bubbleRadius, inputTexture);			
	},
	
	_getAnimationCameraPos: function(t, f) {
		var p= new THREE.Vector3(this.initialCameraPos.x, this.initialCameraPos.y, this.initialCameraPos.z);
		// just scroll a bit left and right
		p.y= p.y+ Math.sin(t * 0.00004)*0.02;
		p.z= p.z- f*0.44;
	
		return p;
	},
	_getAnimationWaterEffect: function(t) {
		var s=  Math.sin((t-15000) * 0.00004);
		if (s>0) {
			return  0.02*s;
		}
		return 0;
	},
	_getAnimationBoxZoom: function(freqByteData, f) {
		f= Math.abs(f);
		var silencer= ((f<0.5)? 1-f*20 : 0);	// remove pulsing while in "detail areas" where shaking is too much
		silencer= 1+(silencer*249)
		
		var zoom= (freqByteData[39]+freqByteData[199]+freqByteData[299])/(1000000/silencer); // for orig
		return zoom+0.5;
	},
};


// -------------------------- Three.js setup ----------------------------- 

//var $ = document.querySelector.bind(document);

var defaultWidth= 640;
var defaultHeight= 480;

WOO.DemoMode = {
	ANIMATION:0,
	LOOKAROUND: 1,
	FREEFLIGHT: 2
};

Woofer = function(canvasId) {
	this.mode= WOO.DemoMode.ANIMATION;
	
	
	this.canvasId = canvasId;
	this.canvas = null;

	this.timeOffset= 0;	// base for animation sequence..

	// postprocessing effects
	this.filmPass= new THREE.FilmPass( 0.0, 1.4, 500, false );// noiseIntensity, scanlinesIntensity, scanlinesCount, grayscale
	this.intensity= 0;
		// since no fftSize is set, default of 2048 is used.. 
//	this.beatDetector= new WOO.SoundDetector(85, 1, false, 50, 32, 0, 0);	// orig for c64 track; sample across complete spectrum
	this.beatDetector= new WOO.SoundDetector(115, 1, false, 50, 32, 1, 13);	// sample across complete spectrum

	// all the stuff that gets initialized later
	this.mandelSceneHolder= this.renderer= this.composer= this.target= this.flightInstruments= this.spaceship= this.bannerText= null;
		
	this.movementSpeed= 0;
	this.rndOffset= new THREE.Vector3();
	
	this.utils= new WOO.Utils();
};

Woofer.prototype = {
	getSpaceshipPass: function(w, h) {
		this.spaceshipScene = new THREE.Scene();
		var light = new THREE.AmbientLight(0x2f2f2f);
		this.spaceshipScene.add(light);

		var light2 =  new THREE.DirectionalLight( 0x404040, 1.4 );
		light2.position = new THREE.Vector3(0,-1,0);		
		this.spaceshipScene.add(light2);
		
		var camera = new THREE.PerspectiveCamera(70, w / h, 1, 3000);	// fov,aspect,near,far
		camera.position.set(0, 5.5, 17);
		camera.lookAt(this.spaceshipScene.position);

		// add "stuff" to the scene.. 
		this.flightInstruments= new WOO.FlightInstruments(this.spaceshipScene, this.utils);
		this.flightInstruments.hide();
		
		this.spaceship= new WOO.Spaceship(this.spaceshipScene, this.utils);	
		this.bannerText= new WOO.BannerText(this.spaceshipScene);
			
		return  new THREE.RenderPass( this.spaceshipScene, camera );
	},
	swapTarget: function(pass) {
		// intermediate render pass - no framebuffer output
		pass.needsSwap = true;
		pass.renderToScreen = false;
		pass.clear = false;	
		pass.clearDepth = false;
		
		return pass;
	},
	sameTarget: function(pass) {
		// intermediate render pass - no framebuffer output
		pass.renderToScreen = false;
		pass.needsSwap = false;	// e.g. partially overwrite output of mandelPass
		pass.clearDepth = false;
		pass.clear = false;	// important keep previous (e.g. mandelpass) result
		
		return pass;
	},
	getEffectComposer: function(target) {
		var c = new WOO.MultiTargetEffectComposer( this.renderer, target );
		
		// the following two passes just render into the 2 multi-render texures..
		// and do not use any of these textures as input..
		
		var mandelPass = this.mandelSceneHolder.getMandelPass();
		mandelPass.renderToScreen = false;
		mandelPass.needsSwap = false;	// makes no difference
		c.addPass(mandelPass);

		var falconPass = this.sameTarget(this.getSpaceshipPass(target.texSize.x, target.texSize.y));
		c.addPass(falconPass);
		
		// postprocessing: the two multi-render output textures from above
		// are then used as inputs for the below steps (only now render targets are
		// switched..)

		var glowPass = this.swapTarget(new WOO.ExhaustGlowPass());
		c.addPass(glowPass);

		var rayPass = this.swapTarget(new WOO.RaysPass(new THREE.Vector2(0.7,0.7), 0.012, 0.9, 0.99, 1.0));	
		c.addPass(rayPass);

		this.filmPass.renderToScreen = true;
		c.addPass(this.filmPass);
		
		return c;
	},
	
	getCameraVector: function() {
		var orientationDeg= this.mandelSceneHolder.getCameraOrientationDeg();		
		return this.utils.getRotatedVector(new THREE.Vector3(0,0,-1).normalize(), orientationDeg);
	},
	moveShip: function(speed) {	// actually it's the camera that's moving..
		// make slow speed range more sensitive
		speed= Math.sign(speed)*(1-Math.cos(Math.PI/2*speed/10));
	
		var scale=0.001*speed;
		var cameraVector= this.getCameraVector();
		cameraVector.multiplyScalar(scale);
				
		var oldPos= this.mandelSceneHolder.getCameraPos();
		var pos= new THREE.Vector3().add(oldPos).add(cameraVector);
		
		var s= 0.0000001;
		var r1= Math.random()*s-s/2;
		var r2= Math.random()*s-s/2;
		var r3= Math.random()*s-s/2;
		
		this.rndOffset= new THREE.Vector3((3*this.rndOffset.x+r1)/4, (3*this.rndOffset.y+r2)/4, (3*this.rndOffset.z+r3)/4);		
		pos.add(this.rndOffset);
		
		this.mandelSceneHolder.setCameraPos(pos);	
	},
	rotateShip: function(v3) {
		if (this.mode == WOO.DemoMode.ANIMATION) {
			return;	// disable drag
		}
		this.spaceship.setRotation(v3.add(this.spaceship.getRotation()));		
	},
	drag: function(x, y, dx, dy, commit) {
		if (this.mode == WOO.DemoMode.ANIMATION) {
			return;	// disable drag
		}
		
		// map user's left/right//up/down dragging into respective camera rotation
		dx*= 15; dy*= 15;
		
		var baseOrientation= this.mandelSceneHolder.getCameraOrientationDeg();
		
		// the trick for not having the "pitch" distorted seems to be the inverted 
		// "ZYX" order.. 
		var dragRotation= new THREE.Matrix4();
		dragRotation.makeRotationFromEuler(new THREE.Euler( THREE.Math.degToRad(-dy), 
															THREE.Math.degToRad(0), 
															THREE.Math.degToRad(0), "ZYX"));
		
		var baseRotation= new THREE.Matrix4();	// original rotations
		baseRotation.makeRotationFromEuler(new THREE.Euler( THREE.Math.degToRad(baseOrientation.x), 
															THREE.Math.degToRad(baseOrientation.y), 
															THREE.Math.degToRad(baseOrientation.z), "ZYX"))
		
		var e= new THREE.Euler();
		var m= dragRotation.multiply(baseRotation);	
		e.setFromRotationMatrix(m, "ZYX");

		var result= new THREE.Vector3(THREE.Math.radToDeg(e.x), THREE.Math.radToDeg(e.y), THREE.Math.radToDeg(e.z)-dx);	// +x seems to be OK
				
		this.spaceship.handleSteepBank(dx, dy);
		
		this.mandelSceneHolder.setCameraOrientationDeg(result);		
	},
	changeSpeed: function(speedDiff) {
		var speed= this.changeMovementSpeed(speedDiff);
		this.flightInstruments.updateThrustLevel(speed);		
	},
	changeMovementSpeed: function(diff) {
		this.movementSpeed= Math.min(10, Math.max(-10, this.movementSpeed+diff));
		return this.movementSpeed;
	},
	start: function() {
		// music
		if ((window.location.hash == null) || (window.location.hash == ''))
			window.music= new WOO.MP3Music("Drumhead - Symbol.mp3");
		else 
			window.music= new WOO.SoundCloudMusic();
		
		// visuals
		this.canvas = $( "#"+this.canvasId )[0];
		this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas , alpha: true, 
							preserveDrawingBuffer: true , autoClearDepth: false});
		
		this.renderer.autoClear = false;

		if ( !this.renderer.extensions.get('EXT_frag_depth') ) {
			alert("error: EXT_frag_depth not available");
			return;
		}
		if ( !this.renderer.extensions.get('WEBGL_draw_buffers') ) {
			alert("error: WEBGL_draw_buffers not available");
			return;
		}

		
		this.target= getRenderTarget(defaultWidth, defaultHeight );

		this.mandelSceneHolder= new WOO.MandelSceneHolder(this.target);
		
		this.composer = this.getEffectComposer(this.target);
		this.resize(true);


		this.startUserInputHander();
		
		this.render(0);		
	},
	startUserInputHander: function() {
		new WOO.Controls({
			preventDefault: function() {
				if (this.mode == WOO.DemoMode.ANIMATION) {
					return false;	// for use of showInfo()
				}
				return true;
			}.bind(this),			
			keyDown: function(code, c){
				switch (code) {		
						// navigation
					case 38: // up
						this.drag(0, 0,  0, -0.1, false);
						break;
					case 40:	// down
						this.drag(0, 0,  0, 0.1, false);
						break;
					case 39:	// right
						this.drag(0, 0, 0.1, 0, false);
						break;
					case 37:	// left
						this.drag(0, 0, -0.1, 0, false);
						break;
					case 13:	// enter
						showInfo();
						break;
					// mode switching
					case 32:		//	space
						this.mode = ((this.mode == WOO.DemoMode.ANIMATION) || (this.mode ==WOO.DemoMode.LOOKAROUND)) 
										? WOO.DemoMode.FREEFLIGHT : WOO.DemoMode.ANIMATION;
					
						if (this.mode == WOO.DemoMode.ANIMATION) {
							this.flightInstruments.hide();
							this.bannerText.show();
							this.mandelSceneHolder.resetCamera();
							this.mandelSceneHolder.setFocalLength(0.9);
							
							this.timeOffset= 0;	// reset animation
						} else {
							this.spaceship.setRotation(this.spaceship.getBaseFlightOrientation());
							this.flightInstruments.show();
							this.bannerText.hide();
							this.mandelSceneHolder.setFocalLength(2.0); // use less distortion in interactive mode
							
							this.filmPass.uniforms.nIntensity.value = 0.0;		// or use during interactive mode?					
							this.mandelSceneHolder.resetEffects();
						}
						break;
					case 17:		//	ctrl
						if (this.mode == WOO.DemoMode.ANIMATION) {
							this.mode = WOO.DemoMode.LOOKAROUND;

							this.flightInstruments.show();
							this.bannerText.hide();
							
						} else if (this.mode == WOO.DemoMode.LOOKAROUND) {
							this.mode = WOO.DemoMode.ANIMATION;
							
							this.mandelSceneHolder.resetCameraOrientation();							
							this.flightInstruments.hide();
							this.bannerText.show();
						}					
						break;
				}
			}.bind(this), 
			keyPress: function(code, c){
				var s= THREE.Math.degToRad(1);
				switch (c) {							
				// navigation
					case 'y':		// 'q'
						this.rotateShip(new THREE.Vector3(s, 0, 0));
						break;
					case 'Y':		// 'q'
						this.rotateShip(new THREE.Vector3(-s, 0, 0));
						break;
					case 'x':		// 'q'
						this.rotateShip(new THREE.Vector3(0, s, 0));
						break;
					case 'X':		// 'q'
						this.rotateShip(new THREE.Vector3(0, -s, 0));
						break;
					case 'c':		// 'q'
						this.rotateShip(new THREE.Vector3(0, 0, s));
						break;
					case 'C':		// 'q'
						this.rotateShip(new THREE.Vector3(0, 0, -s));
						break;
				}				
	
				switch (code) {							
					// navigation
					case 113:		// 'q'
						this.changeSpeed(1);						
						break;
					case 97:		// 'a'
						this.changeSpeed(-1);
						break;		
					case 112:	// 'p'
						{
						// debugging..
						var pos= this.mandelSceneHolder.getCameraPos();
						console.log ("mandelbox coord: " + pos.x + " / " + pos.y + " / " + pos.z );
						}
						break;
						
				}
				
			}.bind(this), 
			rotation: function(x,y, dx, dy, commit){
				this.drag(x,y, dx, dy, commit);
				if (this.mode == WOO.DemoMode.ANIMATION) {
					showInfo();
				}				
			}.bind(this),
			mouseWheel: function(diff){
				this.changeSpeed(diff);
			}.bind(this)
		}, this.canvasId, this.fullscreenToggle.bind(this));		
	},
	
	stfu: function(func) {
		// temp disable 'console warning': dumbshit WEBGL complains about global shader variables derived from 
		// uniforms .. rather than uglifying the code that bloody bullshit warning is better just squelched..
		// (also there are miles of "extension directive should occur before any non-preprocessor tokens " from 
		// core THREE.js stuff.. no point in having that kind of garbage flood the console..)
		var oldWarnFunction = console.warn;
		console.warn = function(){}; 	// disable
	
		func.bind(this)();
	
		console.warn = oldWarnFunction; // restore
	},

	isReady: function() {
		return this.spaceship.isReady() &&  this.bannerText.isReady(); 
	},
	isMusicPlaying: function(freqByteData) {
		return !music.isPaused() && (freqByteData !== null);
	},
	animateSoundEffect: function(freqByteData) {
		// "hi-hat" flashes..
		this.intensity= 0.94*this.intensity;
		if (this.beatDetector.detect(freqByteData)) {
			this.intensity= 0.6;
		}
		this.filmPass.uniforms.nIntensity.value = this.intensity;					
	},
	updateFlightInstruments: function() {
		var initPos= this.mandelSceneHolder.getInitCameraPos();
		var initOri= this.mandelSceneHolder.getInitCameraOrientationDeg();
		var pos= this.mandelSceneHolder.getCameraPos();
		var ori= this.mandelSceneHolder.getCameraOrientationDeg();
		
		this.flightInstruments.updateInstruments(initPos, initOri, pos, ori);		
	},
	render: function(time) {
//	time=1;
		var debugMandelbox= false;
		
		if (this.isReady()) {			
			var freqByteData= music.getFrequencyData();

			if (this.mode == WOO.DemoMode.FREEFLIGHT) {				
				// interactive
				this.moveShip(this.movementSpeed);
				
				this.spaceship.animateFlightOrientation(time);
							
				this.updateFlightInstruments();

				this.animateSoundEffect(freqByteData);				
			} else {
				// animation with fixed flightpath
				this.spaceship.animate();
				
				if (this.mode == WOO.DemoMode.LOOKAROUND) this.updateFlightInstruments();
				
				// for initial fade-in / before music starts
				if (!this.isMusicPlaying(freqByteData)) this.mandelSceneHolder.animate(debugMandelbox, 0);

				var relTime= (this.timeOffset == 0) ? 0 : time-this.timeOffset;
				var camPos=  this.mandelSceneHolder.getCameraPos();
				
				if (this.mode == WOO.DemoMode.ANIMATION) {
					// fixed positioning doesn't work well with camera changes
					this.bannerText.animateText(relTime, camPos);
				}

				// start main animation when music is playing
				if (this.isMusicPlaying(freqByteData)) {
					if (this.timeOffset == 0) this.timeOffset= time;
					
					relTime= time-this.timeOffset
					
					this.mandelSceneHolder.animate(debugMandelbox, relTime, freqByteData);
									
					this.animateSoundEffect(freqByteData);
				}
			}
				
			this.stfu(function() {
				var debugPlasma= false;

				if (this.spaceship.isReady()) {
					this.spaceship.update(this.renderer, time, this.mandelSceneHolder.getCollisionDetectionTexture(), debugPlasma);
				}
				if (! debugPlasma) this.composer.render();
			});
	
			this.mandelSceneHolder.postprocess(this.renderer, this.composer.readBuffer.attachments[1]);
		}
	
		requestAnimationFrame(this.render.bind(this));
	},
	
	resize: function(force) {
		var c = this.renderer.domElement;
		var dpr    = 1; //window.devicePixelRatio;  // make 1 or less if too slow
		var width  = c.clientWidth  * dpr;
		var height = c.clientHeight * dpr;
		if (force || width != c.width || height != c.height) { 
			var updateStyle= false;
			this.renderer.setSize( width, height, updateStyle );
		}
	},
	
	fullscreenToggle: function( isFullscreen ) {
		var c = this.renderer.domElement;
		var w,h;
		if ( isFullscreen ) {	
			w=  window.screen.availWidth;
			h=  window.screen.availHeight;
		} else {
			// return to fixed size
			w= defaultWidth;
			h=  defaultHeight;
		}
		
		c.clientWidth= w;
		c.clientHeight=  h;

		var canvas = $( "#"+this.canvasId )[0];
		canvas.width  = w;
		canvas.height =  h;

		canvas.style.width=w+'px';
		canvas.style.height=h+'px';

		this.resize(true);	
		
		this.target= getRenderTarget(w, h);
		this.mandelSceneHolder.resetScene(this.target);
		this.composer = this.getEffectComposer(this.target);
	}
};


