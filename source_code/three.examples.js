/*
	utilities and shaders from the standard THREE.js examples..
*/

/**
 * @author mrdoob / http://mrdoob.com/
 * @author alteredq / http://alteredqualia.com/
 */
THREE.GeometryUtils = {

	// Merge two geometries or geometry and geometry from object (using object's transform)

	merge: function ( geometry1, geometry2, materialIndexOffset ) {

		console.warn( 'THREE.GeometryUtils: .merge() has been moved to Geometry. Use geometry.merge( geometry2, matrix, materialIndexOffset ) instead.' );

		var matrix;

		if ( geometry2 instanceof THREE.Mesh ) {

			geometry2.matrixAutoUpdate && geometry2.updateMatrix();

			matrix = geometry2.matrix;
			geometry2 = geometry2.geometry;

		}

		geometry1.merge( geometry2, matrix, materialIndexOffset );

	},

	// Get random point in triangle (via barycentric coordinates)
	// 	(uniform distribution)
	// 	http://www.cgafaq.info/wiki/Random_Point_In_Triangle

	randomPointInTriangle: function () {

		var vector = new THREE.Vector3();

		return function ( vectorA, vectorB, vectorC ) {

			var point = new THREE.Vector3();

			var a = Math.random();
			var b = Math.random();

			if ( ( a + b ) > 1 ) {

				a = 1 - a;
				b = 1 - b;

			}

			var c = 1 - a - b;

			point.copy( vectorA );
			point.multiplyScalar( a );

			vector.copy( vectorB );
			vector.multiplyScalar( b );

			point.add( vector );

			vector.copy( vectorC );
			vector.multiplyScalar( c );

			point.add( vector );

			return point;

		};

	}(),

	// Get random point in face (triangle)
	// (uniform distribution)

	randomPointInFace: function ( face, geometry ) {

		var vA, vB, vC;

		vA = geometry.vertices[ face.a ];
		vB = geometry.vertices[ face.b ];
		vC = geometry.vertices[ face.c ];

		return THREE.GeometryUtils.randomPointInTriangle( vA, vB, vC );

	},

	// Get uniformly distributed random points in mesh
	// 	- create array with cumulative sums of face areas
	//  - pick random number from 0 to total area
	//  - find corresponding place in area array by binary search
	//	- get random point in face

	randomPointsInGeometry: function ( geometry, n ) {

		var face, i,
			faces = geometry.faces,
			vertices = geometry.vertices,
			il = faces.length,
			totalArea = 0,
			cumulativeAreas = [],
			vA, vB, vC;

		// precompute face areas

		for ( i = 0; i < il; i ++ ) {

			face = faces[ i ];

			vA = vertices[ face.a ];
			vB = vertices[ face.b ];
			vC = vertices[ face.c ];

			face._area = THREE.GeometryUtils.triangleArea( vA, vB, vC );

			totalArea += face._area;

			cumulativeAreas[ i ] = totalArea;

		}

		// binary search cumulative areas array

		function binarySearchIndices( value ) {

			function binarySearch( start, end ) {

				// return closest larger index
				// if exact number is not found

				if ( end < start )
					return start;

				var mid = start + Math.floor( ( end - start ) / 2 );

				if ( cumulativeAreas[ mid ] > value ) {

					return binarySearch( start, mid - 1 );

				} else if ( cumulativeAreas[ mid ] < value ) {

					return binarySearch( mid + 1, end );

				} else {

					return mid;

				}

			}

			var result = binarySearch( 0, cumulativeAreas.length - 1 );
			return result;

		}

		// pick random face weighted by face area

		var r, index,
			result = [];

		var stats = {};

		for ( i = 0; i < n; i ++ ) {

			r = Math.random() * totalArea;

			index = binarySearchIndices( r );

			result[ i ] = THREE.GeometryUtils.randomPointInFace( faces[ index ], geometry );

			if ( ! stats[ index ] ) {

				stats[ index ] = 1;

			} else {

				stats[ index ] += 1;

			}

		}

		return result;

	},

	randomPointsInBufferGeometry: function ( geometry, n ) {

		var i,
			vertices = geometry.attributes.position.array,
			totalArea = 0,
			cumulativeAreas = [],
			vA, vB, vC;

		// precompute face areas
		vA = new THREE.Vector3();
		vB = new THREE.Vector3();
		vC = new THREE.Vector3();

		// geometry._areas = [];
		var il = vertices.length / 9;

		for ( i = 0; i < il; i ++ ) {

			vA.set( vertices[ i * 9 + 0 ], vertices[ i * 9 + 1 ], vertices[ i * 9 + 2 ] );
			vB.set( vertices[ i * 9 + 3 ], vertices[ i * 9 + 4 ], vertices[ i * 9 + 5 ] );
			vC.set( vertices[ i * 9 + 6 ], vertices[ i * 9 + 7 ], vertices[ i * 9 + 8 ] );

			area = THREE.GeometryUtils.triangleArea( vA, vB, vC );
			totalArea += area;

			cumulativeAreas.push( totalArea );

		}

		// binary search cumulative areas array

		function binarySearchIndices( value ) {

			function binarySearch( start, end ) {

				// return closest larger index
				// if exact number is not found

				if ( end < start )
					return start;

				var mid = start + Math.floor( ( end - start ) / 2 );

				if ( cumulativeAreas[ mid ] > value ) {

					return binarySearch( start, mid - 1 );

				} else if ( cumulativeAreas[ mid ] < value ) {

					return binarySearch( mid + 1, end );

				} else {

					return mid;

				}

			}

			var result = binarySearch( 0, cumulativeAreas.length - 1 );
			return result;

		}

		// pick random face weighted by face area

		var r, index,
			result = [];

		for ( i = 0; i < n; i ++ ) {

			r = Math.random() * totalArea;

			index = binarySearchIndices( r );

			// result[ i ] = THREE.GeometryUtils.randomPointInFace( faces[ index ], geometry, true );
			vA.set( vertices[ index * 9 + 0 ], vertices[ index * 9 + 1 ], vertices[ index * 9 + 2 ] );
			vB.set( vertices[ index * 9 + 3 ], vertices[ index * 9 + 4 ], vertices[ index * 9 + 5 ] );
			vC.set( vertices[ index * 9 + 6 ], vertices[ index * 9 + 7 ], vertices[ index * 9 + 8 ] );
			result[ i ] = THREE.GeometryUtils.randomPointInTriangle( vA, vB, vC );

		}

		return result;

	},

	// Get triangle area (half of parallelogram)
	// http://mathworld.wolfram.com/TriangleArea.html

	triangleArea: function () {

		var vector1 = new THREE.Vector3();
		var vector2 = new THREE.Vector3();

		return function ( vectorA, vectorB, vectorC ) {

			vector1.subVectors( vectorB, vectorA );
			vector2.subVectors( vectorC, vectorA );
			vector1.cross( vector2 );

			return 0.5 * vector1.length();

		};

	}(),

	center: function ( geometry ) {

		console.warn( 'THREE.GeometryUtils: .center() has been moved to Geometry. Use geometry.center() instead.' );
		return geometry.center();

	}

};

/* 
	some shaders from the "THREE.js examples": Pass, ShaderPass, CopyShader, RenderPass, FilmShader
*/
THREE.Pass = function() {
    this.enabled = !0, this.needsSwap = !0, this.clear = !1, this.renderToScreen = !1
}, Object.assign(THREE.Pass.prototype, {
    setSize: function(a, b) {},
    render: function(a, b, c, d, e) {
        console.error("THREE.Pass: .render() must be implemented in derived pass.")
    }
}), THREE.ShaderPass = function(a, b) {
    THREE.Pass.call(this), this.textureID = void 0 !== b ? b : "tDiffuse", a instanceof THREE.ShaderMaterial ? (this.uniforms = a.uniforms, this.material = a) : a && (this.uniforms = THREE.UniformsUtils.clone(a.uniforms), this.material = new THREE.ShaderMaterial({
        defines: a.defines || {},
        uniforms: this.uniforms,
        vertexShader: a.vertexShader,
        fragmentShader: a.fragmentShader
    })), this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), this.scene = new THREE.Scene, this.quad = new THREE.Mesh(new THREE.PlaneBufferGeometry(2, 2), null), this.quad.frustumCulled = !1, this.scene.add(this.quad)
}, THREE.ShaderPass.prototype = Object.assign(Object.create(THREE.Pass.prototype), {
    constructor: THREE.ShaderPass,
    render: function(a, b, c, d, e) {
        this.uniforms[this.textureID] && (this.uniforms[this.textureID].value = c.texture), this.quad.material = this.material, this.renderToScreen ? a.render(this.scene, this.camera) : a.render(this.scene, this.camera, b, this.clear)
    }
}), THREE.CopyShader = {
    uniforms: {
        tDiffuse: {
            value: null
        },
        opacity: {
            value: 1
        }
    },
    vertexShader: ["varying vec2 vUv;", "void main() {", "vUv = uv;", "gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );", "}"].join("\n"),
    fragmentShader: ["uniform float opacity;", "uniform sampler2D tDiffuse;", "varying vec2 vUv;", "void main() {", "vec4 texel = texture2D( tDiffuse, vUv );", "gl_FragColor = opacity * texel;", "}"].join("\n")
}, THREE.RenderPass = function(a, b, c, d, e) {
    THREE.Pass.call(this), this.scene = a, this.camera = b, this.overrideMaterial = c, this.clearColor = d, this.clearAlpha = void 0 !== e ? e : 0, this.clear = !0, this.clearDepth = !1, this.needsSwap = !1
}, THREE.RenderPass.prototype = Object.assign(Object.create(THREE.Pass.prototype), {
    constructor: THREE.RenderPass,
    render: function(a, b, c, d, e) {
        var f = a.autoClear;
        a.autoClear = !1, this.scene.overrideMaterial = this.overrideMaterial;
        var g, h;
        this.clearColor && (g = a.getClearColor().getHex(), h = a.getClearAlpha(), a.setClearColor(this.clearColor, this.clearAlpha)), this.clearDepth && a.clearDepth(), a.render(this.scene, this.camera, this.renderToScreen ? null : c, this.clear), this.clearColor && a.setClearColor(g, h), this.scene.overrideMaterial = null, a.autoClear = f
    }
}), THREE.FilmShader = {
    uniforms: {
        tDiffuse: {
            value: null
        },
        time: {
            value: 0
        },
        nIntensity: {
            value: .5
        },
        sIntensity: {
            value: .05
        },
        sCount: {
            value: 4096
        },
        grayscale: {
            value: 1
        }
    },
    vertexShader: ["varying vec2 vUv;", "void main() {", "vUv = uv;", "gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );", "}"].join("\n"),
    fragmentShader: ["uniform float time;", "uniform bool grayscale;", "uniform float nIntensity;", "uniform float sIntensity;", "uniform float sCount;", "uniform sampler2D tDiffuse;", "varying vec2 vUv;", "float rand(vec2 co){", "    return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);", "}", "void main() {", "vec4 cTextureScreen = texture2D( tDiffuse, vUv );", "float dx = rand( vUv + time );", "vec3 cResult = cTextureScreen.rgb + cTextureScreen.rgb * clamp( 0.1 + dx, 0.0, 1.0 );", "vec2 sc = vec2( sin( vUv.y * sCount ), cos( vUv.y * sCount ) );", "cResult += cTextureScreen.rgb * vec3( sc.x, sc.y, sc.x ) * sIntensity;", "cResult = cTextureScreen.rgb + clamp( nIntensity, 0.0,1.0 ) * ( cResult - cTextureScreen.rgb );", "if( grayscale ) {", "cResult = vec3( cResult.r * 0.3 + cResult.g * 0.59 + cResult.b * 0.11 );", "}", "gl_FragColor =  vec4( cResult, cTextureScreen.a );", "}"].join("\n")
}, THREE.FilmPass = function(a, b, c, d) {
    THREE.Pass.call(this), void 0 === THREE.FilmShader && console.error("THREE.FilmPass relies on THREE.FilmShader");
    var e = THREE.FilmShader;
    this.uniforms = THREE.UniformsUtils.clone(e.uniforms), this.material = new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: e.vertexShader,
        fragmentShader: e.fragmentShader
    }), void 0 !== d && (this.uniforms.grayscale.value = d), void 0 !== a && (this.uniforms.nIntensity.value = a), void 0 !== b && (this.uniforms.sIntensity.value = b), void 0 !== c && (this.uniforms.sCount.value = c), this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), this.scene = new THREE.Scene, this.quad = new THREE.Mesh(new THREE.PlaneBufferGeometry(2, 2), null), this.quad.frustumCulled = !1, this.scene.add(this.quad)
}, THREE.FilmPass.prototype = Object.assign(Object.create(THREE.Pass.prototype), {
    constructor: THREE.FilmPass,
    render: function(a, b, c, d, e) {
        this.uniforms.tDiffuse.value = c.texture, this.uniforms.time.value += d, this.quad.material = this.material, this.renderToScreen ? a.render(this.scene, this.camera) : a.render(this.scene, this.camera, b, this.clear)
    }
});

