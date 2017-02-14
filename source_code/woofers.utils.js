/*
*	various non-shader-, THREE.js-related utilities..
*
*	Copyright (C) 2017 Juergen Wothke
*
*/

WOO = "WOO" in window ? WOO : {}

/* minimalistic jQuery mockup */
if (!("$" in window)) {
	$= function(i) {
		var e= document.getElementById(i.replace("#", ""));
		
		var n= e.tagName.toUpperCase();
		/*
		if ((n == 'DIV')) {
			
		} else */
		if ((n == 'CANVAS') || (n == 'AUDIO')) {
			e= [e];
		} else {
			e.empty= function() {
				e.innerHTML = "";
				return e;
			};
			e.append= function(c) {
				e.insertAdjacentHTML('beforeend', c);
				return e;
			};
			e.html= function(c) {
				e.innerHTML= c;
			};
		}
		return e;
	};
	$.getJSON= function(url, success) {
		this.fail= function(){};
		var xhr = new XMLHttpRequest();
		xhr.onreadystatechange = function()
		{
			if (xhr.readyState === XMLHttpRequest.DONE) {
				if (xhr.status === 200) {
					if (success)
						success(JSON.parse(xhr.responseText));
				} else {
				   this.fail();
				}
			}
		};
		xhr.open("GET", url, true);
		xhr.send();
		
		return {fail: function(failFunc){this.fail= failFunc}.bind(this)};
	}	 	
}

/* 
*	utility to create a mesh of a specific text..
*	based on https://threejs.org/examples/webgl_geometry_text.html 
*/
WOO.MeshText = function(font) {
	this.height = 4;	// thickness of the letters
	this.size = 70;
	this.curveSegments = 4;
	this.bevelThickness = 3;
	this.bevelSize = 4.5;
	this.bevelEnabled = true;
	this.font = font;
}

WOO.MeshText.prototype = {
	create: function(text) {
		var textGeo = new THREE.TextGeometry( text, {
			font: font,

			size: this.size,
			height: this.height,
			curveSegments: this.curveSegments,

			bevelThickness: this.bevelThickness,
			bevelSize: this.bevelSize,
			bevelEnabled: this.bevelEnabled,

			material: 0,
			extrudeMaterial: 1
		});

		textGeo.computeBoundingBox();
		textGeo.computeVertexNormals();

		// "fix" side normals by removing z-component of normals for side faces
		// (this doesn't work well for beveled geometry as then we lose nice curvature around z-axis)

		if ( ! this.bevelEnabled ) {
			var triangleAreaHeuristics = 0.1 * ( this.height * this.size );

			for ( var i = 0; i < textGeo.faces.length; i ++ ) {
				var face = textGeo.faces[ i ];
				if ( face.materialIndex == 1 ) {
					for ( var j = 0; j < face.vertexNormals.length; j ++ ) {
						face.vertexNormals[ j ].z = 0;
						face.vertexNormals[ j ].normalize();
					}

					var va = textGeo.vertices[ face.a ];
					var vb = textGeo.vertices[ face.b ];
					var vc = textGeo.vertices[ face.c ];

					var s = THREE.GeometryUtils.triangleArea( va, vb, vc );

					if ( s > triangleAreaHeuristics ) {
						for ( var j = 0; j < face.vertexNormals.length; j ++ ) {
							face.vertexNormals[ j ].copy( face.normal );
						}
					}
				}
			}
		}

		// add-on: keep original data as a base for later transformations
		textGeo.originalVertices = [];
		for ( var j = 0; j < textGeo.vertices.length; j ++ ) {
			var copy= new THREE.Vector3();
			copy.set( textGeo.vertices[ j ].x, textGeo.vertices[ j ].y, textGeo.vertices[ j ].z );
			
			textGeo.originalVertices[ j ]= copy;
		}
		textGeo.originalBoundingBox = new THREE.Vector3(textGeo.boundingBox.max.x - textGeo.boundingBox.min.x,
													textGeo.boundingBox.max.y - textGeo.boundingBox.min.y,
													textGeo.boundingBox.max.z - textGeo.boundingBox.min.z)
		
		return textGeo;
	}
};

function getMeshTexter(fontFile, onReady) {
	var loader = new THREE.FontLoader();	// add packed font support?
	loader.load( fontFile, function ( response ) {
		this.font = response;
		
		var m= new WOO.MeshText(response);
		onReady(m);
	} );
};



// -------------------------- F11 / fullscreen handling ----------------------------- 
WOO.FullscreenSwitcher = function(elementId, fullscreenToggleCallback) {
	var that= this;
	this.elementId= elementId;
	this.fullscreenToggleCallback= fullscreenToggleCallback;

	document.addEventListener('fullscreenchange', function () {
		that.fullscreenToggleCallback(!!document.fullscreen);
	}, false);

	document.addEventListener('mozfullscreenchange', function () {
		that.fullscreenToggleCallback(!!document.mozFullScreen);
	}, false);

	document.addEventListener('webkitfullscreenchange', function () {
		that.fullscreenToggleCallback(!!document.webkitIsFullScreen);
	}, false);

	document.onkeydown = function (event) {
		if (event.keyCode == 122) { // F11	(replace default "fullscreen" behavior)
			this.toggleFullScreen(); 
			event.keyCode = 0;	// disable default handling of F11
			return false;
		}
	}.bind(this);
};

WOO.FullscreenSwitcher.prototype = {
	toggleFullScreen: function() {
		if (!document.fullscreenElement &&    // alternative standard method
				!document.mozFullScreenElement && !document.webkitFullscreenElement && !document.msFullscreenElement ) {  // current working methods

			var el =  document.getElementById(this.elementId); 

			if (el.requestFullscreen) {
				el.requestFullscreen();
			} else if (el.msRequestFullscreen) {
				el.msRequestFullscreen();
			} else if (el.mozRequestFullScreen) {
				el.mozRequestFullScreen();
			} else if (el.webkitRequestFullscreen) {
				el.webkitRequestFullscreen(Element.ALLOW_KEYBOARD_INPUT);
			}
		} else {
			if (document.exitFullscreen) {
				document.exitFullscreen();
			} else if (document.msExitFullscreen) {
				document.msExitFullscreen();
			} else if (document.mozCancelFullScreen) {
				document.mozCancelFullScreen();
			} else if (document.webkitExitFullscreen) {
				document.webkitExitFullscreen();
			}
		}
	}
};


/*
*	General handling of user input.
*
*	observer must implement keyPress(code, char) & rotation(x, y)	
*/
WOO.Controls = function(observer, fullscreenElement, fullscreenToggleCallback, absMode) {
	this.observer= observer;
	this.test= ["ok"];
	this.absMode= absMode;
	
	this.reset();
	
	if (fullscreenElement != null) {
		new WOO.FullscreenSwitcher(fullscreenElement, fullscreenToggleCallback);
	}
	
	// EVENTS
	document.addEventListener( 'mousedown', this.onDocumentMouseDown.bind(this), false );
	document.addEventListener( 'touchstart', this.onDocumentTouchStart.bind(this), false );
	document.addEventListener( 'touchmove', this.onDocumentTouchMove.bind(this), false );
	document.addEventListener( 'keypress', this.onDocumentKeyPress.bind(this), false );
	document.addEventListener( 'keydown', this.onDocumentKeyDown.bind(this), false );
	
		// IE9, Chrome, Safari, Opera
	document.addEventListener("mousewheel",  this.onDocumentMouseWheel.bind(this), false);
		// Firefox
	document.addEventListener("DOMMouseScroll", this.onDocumentMouseWheel.bind(this), false);
}


WOO.Controls.prototype = {
	reset: function() {		
		this.targetRotationX = 0;
		this.targetRotationXOnMouseDown = 0;

		this.targetRotationY = 0;
		this.targetRotationYOnMouseDown = 0;

		this.mouseX = 0;
		this.mouseXOnMouseDown = 0;
		
		this.mouseY = 0;
		this.mouseYOnMouseDown = 0;

		this.windowHalfX = window.innerWidth / 2;
		this.windowHalfY = window.innerHeight / 2;
	},
	
	onDocumentMouseWheel: function( event ) {
		if (this.observer.preventDefault()) event.preventDefault();
		
		// cross-browser wheel delta
		var event = window.event || event; // old IE support
		var delta = Math.max(-1, Math.min(1, (event.wheelDelta || -event.detail)));

		this.observer.mouseWheel(delta);
		return false;	
	},
	onDocumentMouseDown: function( event ) {
		if (this.observer.preventDefault()) event.preventDefault();
		
		// need to separately keep the bound version
		// or removeEventListener will not find them
		this.mmove= this.onDocumentMouseMove.bind(this);		
		this.mup= this.onDocumentMouseUp.bind(this);
		this.mout= this.onDocumentMouseOut.bind(this);
		
		document.addEventListener( 'mousemove', this.mmove, false );
		document.addEventListener( 'mouseup', this.mup, false );
		document.addEventListener( 'mouseout', this.mout, false );

		this.mouseXOnMouseDown = event.clientX - this.windowHalfX;
		this.targetRotationXOnMouseDown = this.absMode?0:this.targetRotationX;

		this.mouseYOnMouseDown = event.clientY - this.windowHalfY;
		this.targetRotationYOnMouseDown = this.absMode?0:this.targetRotationY;
	},
	onDocumentMouseMove: function( event ) {
		this.mouseX = event.clientX - this.windowHalfX;
		var ox= this.targetRotationX;
		this.targetRotationX = this.targetRotationXOnMouseDown + ( this.mouseX - this.mouseXOnMouseDown ) * 0.02;

		this.mouseY = event.clientY - this.windowHalfY;
		var oy= this.targetRotationY;
		this.targetRotationY = this.targetRotationYOnMouseDown + ( this.mouseY - this.mouseYOnMouseDown ) * 0.02;

		this.observer.rotation(this.targetRotationX, this.targetRotationY, this.targetRotationX-ox, this.targetRotationY-oy, false);

	},
	onDocumentMouseUp: function( event ) {
		document.removeEventListener( 'mousemove', this.mmove, false );
		document.removeEventListener( 'mouseup', this.mup, false );
		document.removeEventListener( 'mouseout', this.mout, false );
		this.observer.rotation(this.targetRotationX, this.targetRotationY, 0, 0, true);
	},
	onDocumentMouseOut: function( event ) {
		document.removeEventListener( 'mousemove', this.mmove, false );
		document.removeEventListener( 'mouseup', this.mup, false );
		document.removeEventListener( 'mouseout', this.mout, false );
		this.observer.rotation(this.targetRotationX, this.targetRotationY, 0, 0, true);
	},	
	onDocumentTouchStart: function( event ) {
		if ( event.touches.length == 1 ) {
			if (this.observer.preventDefault()) event.preventDefault();

			this.mouseXOnMouseDown = event.touches[ 0 ].pageX - this.windowHalfX;
			this.targetRotationXOnMouseDown = 0; //this.targetRotationX;
			
			this.mouseYOnMouseDown = event.touches[ 0 ].pageY - this.windowHalfY;
			this.targetRotationYOnMouseDown = 0; this.targetRotationY;
		}
	},
	onDocumentTouchMove: function( event ) {
		if ( event.touches.length == 1 ) {
			if (this.observer.preventDefault()) event.preventDefault();
			
			this.mouseX = event.touches[ 0 ].pageX - this.windowHalfX;
			var ox= this.targetRotationX;
			this.targetRotationX = this.targetRotationXOnMouseDown + ( this.mouseX - this.mouseXOnMouseDown ) * 0.05;

			this.mouseY = event.touches[ 0 ].pageY - this.windowHalfY;
			var oy= this.targetRotationY;
			this.targetRotationY = this.targetRotationYOnMouseDown + ( this.mouseY - this.mouseYOnMouseDown ) * 0.05;

			this.observer.rotation(this.targetRotationX, this.targetRotationY, this.targetRotationX-ox, this.targetRotationY-oy, false);
		}
	},
	onDocumentKeyPress: function( event ) {
		var keyCode = event.which;
		this.observer.keyPress(keyCode, String.fromCharCode( keyCode ));
	},
	onDocumentKeyDown: function( event ) {
		var keyCode = event.which;
		this.observer.keyDown(keyCode, String.fromCharCode( keyCode ));
	},
};

WOO.Utils = function() {
};
WOO.Utils.prototype = {
	/*
	* Gets extended THREE.JSONLoader that also knows how to load PGN compressed files.
	*/
	getPackedGeometryLoader: function(filename) {
		var jsonLoader = new THREE.JSONLoader();
		
		if (!filename.endsWith(".json")) {
			// patched loader to use PNG compressed JSON files..
			jsonLoader.load = function( url, onLoad, onProgress, onError ) {
				var scope = this;
				var texturePath = this.texturePath && ( typeof this.texturePath === "string" ) ? this.texturePath : THREE.Loader.prototype.extractUrlBase( url );

				onError= function(e) {
					console.log("error: "+e)
				};
				
				var loader = new THREE.ImageLoader( this.manager );

				loader.load( url, function ( image ) {
					// loader returns the loaded img
					URL.revokeObjectURL(image.currentSrc);
					
					var canvas = document.createElement("canvas");
					canvas.width = image.width; 
					canvas.height = image.height; 
					var ctx = canvas.getContext("2d"); 
					ctx.drawImage(image, 0, 0); 

					var imgData=ctx.getImageData(0,0,image.width,image.height).data;
					// alpha channel not used due to 7-bit limitations of GD lib
					var text = "";
					for (var i = 0; i < imgData.length; i++) {
						if (((i+1) % 4) > 0) {	// ignore alpha channel
							text += String.fromCharCode(imgData[i]);
						}
					}
					
					var json = JSON.parse( text );
					var metadata = json.metadata;
					if ( metadata !== undefined ) {
						var type = metadata.type;

						if ( type !== undefined ) {
							if ( type.toLowerCase() === 'object' ) {
								console.error( 'THREE.JSONLoader: ' + url + ' should be loaded with THREE.ObjectLoader instead.' );
								return;
							}
							if ( type.toLowerCase() === 'scene' ) {
								console.error( 'THREE.JSONLoader: ' + url + ' should be loaded with THREE.SceneLoader instead.' );
								return;
							}
						}
					}

					var object = scope.parse( json, texturePath );
					onLoad( object.geometry, object.materials );
				}, onProgress, onError );
			};		
		}	
		return jsonLoader;
	},
	/* loads geometries from multiple JSON files and merges them */
	loadMesh: function(files, scale, resultCallback) {
		var combinedGeom= null;		
		var combinedMaterials= [];
		
		var pending= files.length;
		for (var i= 0; i<files.length; i++) {
						
			var fileName= files[i].f;						
			var loader = this.getPackedGeometryLoader(fileName);

			loader["fileId"]= i;
						
			loader.load(fileName, function(geometry, materials) {
				
				// optional: override material supplied in JSON
				var overrideMaterials= ('m' in files[this["fileId"]]) ? files[this["fileId"]].m : [];
				if (!(Object.prototype.toString.call( overrideMaterials ) === '[object Array]')) overrideMaterials= [overrideMaterials];

				if (overrideMaterials.length >0) {
					var n= Math.min(overrideMaterials.length, materials.length);	// just ignore excess materials
					for (m= 0; m<n; m++) {
						materials[m]= overrideMaterials[m];
					}
				}
				
				// merge additional materials and update references in the new geometry
				var materialIndexOffset=combinedMaterials.length;
				
				for (var j= 0; j<materials.length; j++) {
					var mat= materials[j];
					combinedMaterials.push(mat);
				}

				var dummyUv= [new THREE.Vector2(0,0),new THREE.Vector2(0,0),new THREE.Vector2(0,0)];
				// create filler UVs for all those vertices that don't have/need them
				if (geometry.faceVertexUvs[0].length == 0) {
					for(var v=0;v<geometry.faces.length;v++) geometry.faceVertexUvs[0].push( dummyUv );
				}


				if (combinedGeom == null) {
					combinedGeom= geometry;
				} else {
					// merge geometry					
					var dummy = new THREE.Mesh(combinedGeom);
					combinedGeom.merge( geometry, dummy.matrix, materialIndexOffset );
				}
				
				pending-= 1;
				if (pending == 0) {
					combinedGeom.uvsNeedUpdate = true;

					combinedGeom.computeFaceNormals();
					combinedGeom.computeVertexNormals();


					var result = new THREE.Mesh(combinedGeom, new THREE.MeshFaceMaterial(combinedMaterials));
					result.scale.x = result.scale.y = result.scale.z = scale;
					resultCallback(result); 
				}
			}.bind(loader));
		}
	},	
	/* Generate a square noise texture */
	getNoiseTexture: function(size) {
		// not the correct impl but good enough for the use here..
		var size= 256;
		var l= 4 * size*size;
		var data = new Uint8Array( l );

		for (var i = 0; i < l; i++) {
				data[i] =  Math.random() * 0xff;
		}
		var texture = new THREE.DataTexture( data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
		return this._setupNoiseTexture(texture);
	},
	getIqNoiseTexture: function() {	// unused
		// iq's noise texture has specific properties: https://www.shadertoy.com/view/4sfGzS
		// (this would be the correct "noise texture" to achieve smooth transitions with 
		// iq's shader noise() function.. )
		var size= 256;
		var data = new Uint8Array( 4 * size*size );

		for (var i = 0; i < size*size; i++) {	// init R+B with random data
				data[(i*4)+0] =  Math.random() * 0xff;	// R
				data[(i*4)+2] =  Math.random() * 0xff;	// B
		}

		for (var y = 0; y < size; y++) {
			for (var x = 0; x < size; x++) {
				// the 37/17 offsets must match the ones in the shader's "noise()" function
				var x2 = (0x100 + x - 37) & 0xff;
				var y2 = (0x100 + y - 17 ) & 0xff;
				data[((x+y*size)*4)+1] = data[((x2+y2*size)*4)+0];	// G from R
				data[((x+y*size)*4)+3] = data[((x2+y2*size)*4)+2];	// A from B
			}
		}
		var texture = new THREE.DataTexture( data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
		return this._setupNoiseTexture(texture);
	},
	_setupNoiseTexture: function(texture) {
		texture.format = THREE.RGBAFormat;
		texture.type = THREE.UnsignedByteType;	//THREE.UnsignedByteType THREE.FloatType
		texture.generateMipmaps = true;
		texture.flipY = true;		// Disable the default vertical flip

		texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
		texture.minFilter= THREE.LinearMipMapLinearFilter;
		texture.magFilter= THREE.LinearFilter;

		texture.needsUpdate = true;
		return texture;
	},
	createPlasmaRenderTarget: function(width, height) {
		var target = new THREE.WebGLRenderTarget( width, height );
		var texture= target.texture;
		
		texture.name= "plasma texture";
		texture.format = THREE.RGBAFormat;
		texture.minFilter = THREE.LinearFilter;
		texture.magFilter = THREE.LinearFilter;
		texture.type = THREE.FloatType;
		texture.generateMipmaps = false;
		
		// THREE.RepeatWrapping, THREE.ClampToEdgeWrapping, THREE.MirroredRepeatWrapping
		texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
		
		texture.repeat.set(1, 1);
		
		target.stencilBuffer = false;
		target.depthBuffer = false;
		
		return target;
	},
	getRotatedVector: function(v3, eulerDeg) {
		var v = new THREE.Vector3().add(v3).normalize();
		
		v.applyEuler(new THREE.Euler( THREE.Math.degToRad(-eulerDeg.x), 
							THREE.Math.degToRad(-eulerDeg.y), THREE.Math.degToRad(-eulerDeg.z), 
							"XYZ"));
		return v;
	},	
};



/*
	Music playback related API - with impl for SoundCloud
*/
WOO.SoundCloudMusic = function(){
	this.gainNode= null;
	this.analyserNode= null;
	this.freqByteData= 0;

	var dummyAnalyzer = {
		setConfig: function(ignore) {}.bind(this),
		setupWebAudioNodes: function(player) {		
			if (!this.once) {
				this.once = true;
			
				var source = audioCtx.createMediaElementSource(player);

				this.analyserNode= audioCtx.createAnalyser();
				source.connect(this.analyserNode);
				
				this.gainNode = audioCtx.createGain();	
				this.analyserNode.connect(this.gainNode);
				
				this.gainNode.connect(audioCtx.destination);
			}		
		}.bind(this)
	};
		
	window.cloudPlayer= new CloudPlayer( {
			player:		"#player",		// map GUI related stuff
			source:		"#mp3Source",
			loading: 	"#isloading",
			title:		"#sound-title"
		}, dummyAnalyzer, null);

	window.cloudPlayer.initMusic();

	window.addEventListener("hashchange", function() {
		window.cloudPlayer.startMusic();	// restart with new song
	}, false);
	
}

WOO.SoundCloudMusic.prototype = {
	setVolume: function(volume) {
		if (this.gainNode != null) this.gainNode.gain.value= volume;
	},
	getFrequencyData: function() { 
		if (this.freqByteData == 0) {
			if (this.analyserNode == null) return null;
			
			this.freqByteData = new Uint8Array(this.analyserNode.frequencyBinCount);	
		}
		this.analyserNode.getByteFrequencyData(this.freqByteData);
		return this.freqByteData;
	},
	isPaused: function( ) {return false;},	// for other impls (e.g. SID player)
}

/*
	Music playback related API - with impl for mp3 files
*/
WOO.MP3Music = function(filename) {
	this.musicFileBuffer = null;
	this.gainNode= null;
	this.analyserNode= null;
	this.freqByteData = 0;	
	
	try {
		window.AudioContext = window.AudioContext||window.webkitAudioContext;
		this.context = new AudioContext();
	} catch(e) {
		alert('Web Audio API is not supported in this browser');
	}
	this._loadMusic(filename);	// autostart
}

WOO.MP3Music.prototype = {
	// -- API: these 3 functions must be provided by any alternative impl
	setVolume: function(volume) {
		if (this.gainNode != null) this.gainNode.gain.value= volume;
	},
	getFrequencyData: function() { 
		if (this.freqByteData === 0) {
			if (this.analyserNode == null) return null;
			
			this.freqByteData = new Uint8Array(this.analyserNode.frequencyBinCount);	
		}
		this.analyserNode.getByteFrequencyData(this.freqByteData);
		return this.freqByteData;
	},
	isPaused: function( ) {return false;},	// for other impls (e.g. SID player)
	// -- internal:
	_loadMusic: function(url) {
		var request = new XMLHttpRequest();
		request.open('GET', url, true);
		request.responseType = 'arraybuffer';

		request.onload = function() {
			this.context.decodeAudioData(request.response, function(buffer) {
				this.musicFileBuffer = buffer;
				this._playSound(this.musicFileBuffer);
			}.bind(this), function(){}.bind(this));
		}.bind(this);
		request.send();
	},
	_playSound: function(buffer) {
		var source = this.context.createBufferSource();
		source.loop = true;
		source.buffer = buffer;

		this.gainNode = this.context.createGain();	
		this.analyserNode= this.context.createAnalyser();

		source.connect(this.gainNode);				
		this.gainNode.connect(this.analyserNode);
		this.analyserNode.connect(this.context.destination);

		source.start(0);
	},
}


//-------------------------- sound util ------------------------------------------- 

WOO.SoundDetector = function (trigger, repeats, invert, cooldown, stepWidth, startStep, maxSteps) {
	this.lastDetect = 0;
	this.repeatCount = 0;
	
	this.trigger = trigger;
	this.repeats = repeats;
	this.repeatCount = 0;
	this.invert = invert;
	this.cooldown = cooldown;
	this.stepWidth = stepWidth;
	this.startStep = startStep;
	this.maxSteps = maxSteps;
};

WOO.SoundDetector.prototype = Object.assign( Object.create( WOO.SoundDetector.prototype ), {
	constructor: WOO.SoundDetector,

	detect: function (freqByteData) {
		if ((freqByteData== null) || (freqByteData.length == 0)) return false;
		
		var d= new Date();
		var t = d.getTime();
		if ((t - this.lastDetect) <= this.cooldown) return false;
		
		var idx=0;
		var max= Math.floor(freqByteData.length/this.stepWidth);			
		for (var i=0, s=0; i<max; i++) {
			if((i >= this.startStep)) {
				if(this.invert) {
					// always smaller than trigger
					if (freqByteData[idx] > this.trigger ) {
						return false;
					}
				} else {
					if (freqByteData[idx] < this.trigger ) {
						return false;
					}
				}
				s+= 1;
				if ((this.maxSteps > 0) && (s >= this.maxSteps)) break;
			}
			idx+= this.stepWidth;
		}
		
		if (this.repeatCount++ >= this.repeats) {
			this.lastDetect= t;
			this.repeatCount= 0;
			return true;			
		}
		return false;
	}
} );
