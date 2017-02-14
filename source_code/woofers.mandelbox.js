/*
* Based on original "mandelbox" logic from "old version" of Fractal Lab (see http://www.subblue.com). 
*
* Copyright 2011, Tom Beddard
* http://www.subblue.com
*
* Added THREE.js integration, base for 'god's ray' lighting, 'depthbuffer' and 
* 'poor mann's collision detection' handling.
* Requires the following WEBGL extensions: GL_EXT_draw_buffers, GL_EXT_frag_depth
*
* Copyright 2017, Juergen Wothke
*
* Licensed under the GPL Version 3 license.
* http://www.gnu.org/licenses/
*/
function getMandelboxMaterial(outputSizeX, outputSizeY, bgColor, cameraPos, cameraOrientation, bubbleOrigin, bubbleRadius) {
	var shader = {
		uniforms: {
		  waterworld: { type: "f", value: 0.0 },
		  bubble_origin: { type: "v2", value: new THREE.Vector2(0.0, 0.0) },	// y=0 is bottom
		  bubble_radius: { type: "f", value: 0.0 },	//"min":0.0, "max":0.5

		  deFactor: { type: "f", value: 1.0 },
		  scale: { type: "f", value: -2.81 },
		  surfaceDetail: { type: "f", value: 0.66 },
		  surfaceSmoothness: { type: "f", value: 0.79 },
		  boundingRadius: { type: "f", value: 114.02 },	//"min":0.1, "max":150
		  offset: { type: "v3", value: new THREE.Vector3(0,0,0) },	// "min":-3,   "max":3

		  // turn to face sideways from the movement direction
		  cameraPitch: { type: "f", value: cameraOrientation.x },	// "min":-180, "max":180
		  cameraYaw: { type: "f", value: cameraOrientation.y },	// "min":-180, "max":180
		  cameraRoll: { type: "f", value: cameraOrientation.z },	// "min":-180, "max":180
		  
		  cameraFocalLength: { type: "f", value: 0.9 },	// "min":0.1,  "max":3, 
		  cameraPosition: { type: "v3", value: cameraPos },

		  sCount: { type: "colorIterations", value: 3 },	// "min":0, "max": 30
		  color1: { type: "v3", value: new THREE.Vector3(0.4, 0.3, 0.9) },
		  color1Intensity: { type: "f", value: 2.946 },
		  color2: { type: "v3", value: new THREE.Vector3(0.1,0.1803921568627451,0.1) },
		  color2Intensity: { type: "f", value: 0.16 },
		  color3: { type: "v3", value: new THREE.Vector3(0.3,0.3,0.9) },	// "surface" color
		  color3Intensity: { type: "f", value: 0.11 },
		  transparent: {  value: false },
		  gamma: { type: "f", value: 0.799 },

		  light: { type: "v3", value: new THREE.Vector3(48, 191, -198) },	//  "min":-300, "max":300
		  ambientColor: { type: "v2", value: new THREE.Vector2(0.41, 0) },
		  background1Color: { type: "v3", value: bgColor },
		  background2Color: { type: "v3", value: new THREE.Vector3(0,0,0) },

		  
		  innerGlowColor: { type: "v3", value: new THREE.Vector3(0.23,0.249,0.9019) },
		  innerGlowIntensity: { type: "f", value: 0.24 },	//  "min":0, "max":1

		  outerGlowColor: { type: "v3", value: new THREE.Vector3(1.0,1.0,1.0) },
		  outerGlowIntensity: { type: "f", value: 0.08 },	//  "min":0, "max":1


		  fog: { type: "f", value: 0.06 },	//  "min":0, "max":1
		  fogFalloff: { type: "f", value: 2.8 },	//  "min":0, "max":1
		  specularity: { type: "f", value: 0.86 },	//  "min":0, "max":1
		  specularExponent: { type: "f", value: 7 },	//  "min":0, "max":50


		  size: { type: "v2", value: new THREE.Vector2(outputSizeX/2, outputSizeY/2) },
		  outputSize: { type: "v2", value: new THREE.Vector2(outputSizeX, outputSizeY) },

		  aoIntensity: { type: "f", value: 0.21 },	//  "min":0, "max":1
		  aoSpread: { type: "f", value: 11.79 },	//  "min":0, "max":20

	// unused.. no point burning cycles for a no-op - uncomment if needed
	//	  objectRotation: { type: "Matrix3fv", value: new THREE.Matrix3() },
	//	  fractalRotation1: { type: "Matrix3fv", value: new THREE.Matrix3() },
	//	  fractalRotation2: { type: "Matrix3fv", value: new THREE.Matrix3() },
		  
		  sphereScale: { type: "f", value: 1 },	//  "min":0, "max":3
		  boxScale: { type: "f", value: 0.5 },	//  "min":0, "max":3
		  boxFold: { type: "f", value: 1 },	//  "min":0, "max":3
		  fudgeFactor: { type: "f", value: 0 },	//  "min":0, "max":100
		},

		vertexShader: [
			"#extension GL_EXT_draw_buffers : require",
			"#extension GL_EXT_frag_depth : enable",
			"precision mediump float;",
			"attribute vec4 position;",
			"void main()	{",
			"  gl_Position = position;",
			"}"
		].join( "\n" ),

		fragmentShader: [
			"#extension GL_EXT_draw_buffers : require",
			"#extension GL_EXT_frag_depth : enable",
			"#ifdef GL_ES",
			"precision mediump float;",
			"#endif",

			"#define HALFPI 1.570796",
			"#define MIN_EPSILON 6e-7",
			"#define MIN_NORM 1.5e-7",

			// {"label":"Iterations", "min":1, "max":30, "step":1, "group_label":"Fractal parameters"}
			"#define maxIterations 15",             
			// {"label":"Max steps", "min":10, "max":300, "step":1}
			"#define stepLimit 105",

			// {"label":"AO iterations", "min":0, "max":10, "step":1}
			"#define aoIterations 3",

			"#define minRange 6e-5",

			"uniform float waterworld;",                // "min":0, "max":0.02,
			"uniform vec2 bubble_origin;",				// in relative coordinates (i.e. 0.0-1.0)
			"uniform float bubble_radius;",				// in relative coordinates (i.e. 0.0-1.0)
			
			"uniform float deFactor;",                // "min":0, "max":1,
			"uniform sampler2D tDepth;",

			"uniform float scale;",                // {"label":"Scale",        "min":-10,  "max":10,   "step":0.01,     "default":2,    "group":"Fractal", "group_label":"Fractal parameters"}
			"uniform float surfaceDetail;",        // {"label":"Detail",   "min":0.1,  "max":2,    "step":0.01,    "default":0.6,  "group":"Fractal"}
			"uniform float surfaceSmoothness;",    // {"label":"Smoothness",   "min":0.01,  "max":1,    "step":0.01,    "default":0.8,  "group":"Fractal"}
			"uniform float boundingRadius;",       // {"label":"Bounding radius", "min":0.1, "max":150, "step":0.01, "default":5, "group":"Fractal"}
			"uniform vec3  offset;",               // {"label":["Offset x","Offset y","Offset z"],  "min":-3,   "max":3,    "step":0.01,    "default":[0,0,0],  "group":"Fractal", "group_label":"Offsets"}

			"uniform float cameraRoll;",           // {"label":"Roll",         "min":-180, "max":180,  "step":0.5,     "default":0,    "group":"Camera", "group_label":"Camera parameters"}
			"uniform float cameraPitch;",          // {"label":"Pitch",        "min":-180, "max":180,  "step":0.5,     "default":0,    "group":"Camera"}
			"uniform float cameraYaw;",            // {"label":"Yaw",          "min":-180, "max":180,  "step":0.5,     "default":0,    "group":"Camera"}
			"uniform float cameraFocalLength;",    // {"label":"Focal length", "min":0.1,  "max":3,    "step":0.01,    "default":0.9,  "group":"Camera"}
			"uniform vec3  cameraPosition;",       // {"label":["Camera x", "Camera y", "Camera z"],   "default":[0.0, 0.0, -2.5], "control":"camera", "group":"Camera", "group_label":"Position"}

			"uniform int   colorIterations;",      // {"label":"Colour iterations", "default": 4, "min":0, "max": 30, "step":1, "group":"Colour", "group_label":"Base colour"}
			"uniform vec3  color1;",               // {"label":"Colour 1",  "default":[1.0, 1.0, 1.0], "group":"Colour", "control":"color"}
			"uniform float color1Intensity;",      // {"label":"Colour 1 intensity", "default":0.45, "min":0, "max":3, "step":0.01, "group":"Colour"}
			"uniform vec3  color2;",               // {"label":"Colour 2",  "default":[0, 0.53, 0.8], "group":"Colour", "control":"color"}
			"uniform float color2Intensity;",      // {"label":"Colour 2 intensity", "default":0.3, "min":0, "max":3, "step":0.01, "group":"Colour"}
			"uniform vec3  color3;",               // {"label":"Colour 3",  "default":[1.0, 0.53, 0.0], "group":"Colour", "control":"color"}
			"uniform float color3Intensity;",      // {"label":"Colour 3 intensity", "default":0, "min":0, "max":3, "step":0.01, "group":"Colour"}
			"uniform bool  transparent;",          // {"label":"Transparent background", "default":false, "group":"Colour"}
			"uniform float gamma;",                // {"label":"Gamma correction", "default":1, "min":0.1, "max":2, "step":0.01, "group":"Colour"}

			"uniform vec3  light;",                // {"label":["Light x", "Light y", "Light z"], "default":[-16.0, 100.0, -60.0], "min":-300, "max":300,  "step":1,   "group":"Shading", "group_label":"Light position"}
			"uniform vec2  ambientColor;",         // {"label":["Ambient intensity", "Ambient colour"],  "default":[0.5, 0.3], "group":"Colour", "group_label":"Ambient light & background"}
			"uniform vec3  background1Color;",     // {"label":"Background top",   "default":[0.0, 0.46, 0.8], "group":"Colour", "control":"color"}
			"uniform vec3  background2Color;",     // {"label":"Background bottom", "default":[0, 0, 0], "group":"Colour", "control":"color"}
			"uniform vec3  innerGlowColor;",       // {"label":"Inner glow", "default":[0.0, 0.6, 0.8], "group":"Shading", "control":"color", "group_label":"Glows"}
			"uniform float innerGlowIntensity;",   // {"label":"Inner glow intensity", "default":0.1, "min":0, "max":1, "step":0.01, "group":"Shading"}
			"uniform vec3  outerGlowColor;",       // {"label":"Outer glow", "default":[1.0, 1.0, 1.0], "group":"Shading", "control":"color"}
			"uniform float outerGlowIntensity;",   // {"label":"Outer glow intensity", "default":0.0, "min":0, "max":1, "step":0.01, "group":"Shading"}
			"uniform float fog;",                  // {"label":"Fog intensity",          "min":0,    "max":1,    "step":0.01,    "default":0,    "group":"Shading", "group_label":"Fog"}
			"uniform float fogFalloff;",           // {"label":"Fog falloff",  "min":0,    "max":10,   "step":0.01,    "default":0,    "group":"Shading"}
			"uniform float specularity;",          // {"label":"Specularity",  "min":0,    "max":3,    "step":0.01,    "default":0.8,  "group":"Shading", "group_label":"Shininess"}
			"uniform float specularExponent;",     // {"label":"Specular exponent", "min":0, "max":50, "step":0.1,     "default":4,    "group":"Shading"}

			"uniform vec2  size;",                 // {"default":[400, 300]}
			"uniform vec2  outputSize;",           // {"default":[800, 600]}
			"uniform float aoIntensity;",          // {"label":"AO intensity",     "min":0, "max":1, "step":0.01, "default":0.15,  "group":"Shading", "group_label":"Ambient occlusion"}
			"uniform float aoSpread;",             // {"label":"AO spread",    "min":0, "max":20, "step":0.01, "default":9,  "group":"Shading"}

		//	"uniform mat3  objectRotation;",       // {"label":["Rotate x", "Rotate y", "Rotate z"], "group":"Fractal", "control":"rotation", "default":[0,0,0], "min":-360, "max":360, "step":1, "group_label":"Object rotation"}
		//	"uniform mat3  fractalRotation1;",     // {"label":["Rotate x", "Rotate y", "Rotate z"], "group":"Fractal", "control":"rotation", "default":[0,0,0], "min":-360, "max":360, "step":1, "group_label":"Fractal rotation 1"}
		//	"uniform mat3  fractalRotation2;",     // {"label":["Rotate x", "Rotate y", "Rotate z"], "group":"Fractal", "control":"rotation", "default":[0,0,0], "min":-360, "max":360, "step":1, "group_label":"Fractal rotation 2"}


			"float aspectRatio = outputSize.x / outputSize.y;",
			"float fovfactor = 1.0 / sqrt(1.0 + cameraFocalLength * cameraFocalLength);",
			"float pixelScale = 1.0 / min(outputSize.x, outputSize.y);",
			"float epsfactor = 2.0 * fovfactor * pixelScale * surfaceDetail;",
			"vec3  w = vec3(0, 0, 1);",
			"vec3  v = vec3(0, 1, 0);",
			"vec3  u = vec3(1, 0, 0);",
			"mat3  cameraRotation;",


			// Return rotation matrix for rotating around vector v by angle
			"mat3 rotationMatrixVector(vec3 v, float angle)",
			"{",
			"    float c = cos(radians(angle));",
			"    float s = sin(radians(angle));",
				
			"    return mat3(c + (1.0 - c) * v.x * v.x, (1.0 - c) * v.x * v.y - s * v.z, (1.0 - c) * v.x * v.z + s * v.y,",
			"              (1.0 - c) * v.x * v.y + s * v.z, c + (1.0 - c) * v.y * v.y, (1.0 - c) * v.y * v.z - s * v.x,",
			"              (1.0 - c) * v.x * v.z - s * v.y, (1.0 - c) * v.y * v.z + s * v.x, c + (1.0 - c) * v.z * v.z);",
			"}",

			"uniform float sphereScale;",          // {"label":"Sphere scale", "min":0.01, "max":3,    "step":0.01,    "default":1,    "group":"Fractal", "group_label":"Additional parameters"}
			"uniform float boxScale;",             // {"label":"Box scale",    "min":0.01, "max":3,    "step":0.001,   "default":0.5,  "group":"Fractal"}
			"uniform float boxFold;",              // {"label":"Box fold",     "min":0.01, "max":3,    "step":0.001,   "default":1,    "group":"Fractal"}
			"uniform float fudgeFactor;",          // {"label":"Box size fudge factor",     "min":0, "max":100,    "step":0.001,   "default":0,    "group":"Fractal"}

			// Pre-calculations
			"float mR2 = boxScale * boxScale;",    // Min radius
			"float fR2 = sphereScale * mR2;",      // Fixed radius
						
			"vec2  scaleFactor = vec2(scale, abs(scale)) / mR2;",

			// Details about the Mandelbox DE algorithm:
			// http://www.fractalforums.com/3d-fractal-generation/a-mandelbox-distance-estimate-formula/
			"vec3 Mandelbox(vec3 w)",
			"{",
		//	"    w *= objectRotation;",
			"    float md = 1000.0;",
			"    vec3 c = w;",
				
				// distance estimate
			"    vec4 p = vec4(w.xyz, deFactor),",
			"        p0 = vec4(w.xyz, 1.0);",  // p.w is knighty's DEfactor
				
			"    for (int i = 0; i < int(maxIterations); i++) {",
					// box fold:
			"        p.xyz = clamp(p.xyz, -boxFold, boxFold) * 2.0 * boxFold - p.xyz;",  // box fold
	//		"        p.xyz *= fractalRotation1;",
					
					// sphere fold:
			"        float d = dot(p.xyz, p.xyz);",
			"        p.xyzw *= clamp(max(fR2 / d, mR2), 0.0, 1.0);",  // sphere fold
					
			"        p.xyzw = p * scaleFactor.xxxy + p0 + vec4(offset, 0.0);",
	//		"        p.xyz *= fractalRotation2;",

			"        if (i < colorIterations) {",
			"            md = min(md, d);",
			"            c = p.xyz;",
			"        }",
			"    }",
				
				// Return distance estimate, min distance, fractional iteration count
			"    return vec3((length(p.xyz) - fudgeFactor) / p.w, md, 0.33 * log(dot(c, c)) + 1.0);",
			"}",


			// Define the ray direction from the pixel coordinates
			"vec3 rayDirection(vec2 pixel)",
			"{",
			"    vec2 p = (0.5 * size - pixel) / vec2(size.x, -size.y);",
			"    p.x *= aspectRatio;",
			"    vec3 d = (p.x * u + p.y * v - cameraFocalLength * w);",
			"    return normalize(cameraRotation * d);",
			"}",


			// Intersect bounding sphere
			//
			// If we intersect then set the tmin and tmax values to set the start and
			// end distances the ray should traverse.
			"bool intersectBoundingSphere(vec3 origin,",
			"                             vec3 direction,",
			"                             out float tmin,",
			"                             out float tmax)",
			"{",
			"    bool hit = false;",
			"    float b = dot(origin, direction);",
			"    float c = dot(origin, origin) - boundingRadius;",
			"    float disc = b*b - c;",           // discriminant
			"    tmin = tmax = 0.0;",

			"    if (disc > 0.0) {",
					// Real root of disc, so intersection
			"        float sdisc = sqrt(disc);",
			"        float t0 = -b - sdisc;",          // closest intersection distance
			"        float t1 = -b + sdisc;",          // furthest intersection distance

			"        if (t0 >= 0.0) {",
						// Ray intersects front of sphere
			"            tmin = t0;",
			"            tmax = t0 + t1;",
	//		"        } else if (t0 < 0.0) {",
			"        } else {",
						// Ray starts inside sphere
			"            tmax = t1;",
			"        }",
			"        hit = true;",
			"    }",

			"    return hit;",
			"}",

			// Calculate the gradient in each dimension from the intersection point
			"vec3 generateNormal(vec3 z, float d)",
			"{",
			"    float e = max(d * 0.5, MIN_NORM);",
				
			"    float dx1 = Mandelbox(z + vec3(e, 0, 0)).x;",
			"    float dx2 = Mandelbox(z - vec3(e, 0, 0)).x;",
				
			"    float dy1 = Mandelbox(z + vec3(0, e, 0)).x;",
			"    float dy2 = Mandelbox(z - vec3(0, e, 0)).x;",
				
			"    float dz1 = Mandelbox(z + vec3(0, 0, e)).x;",
			"    float dz2 = Mandelbox(z - vec3(0, 0, e)).x;",
				
			"    return normalize(vec3(dx1 - dx2, dy1 - dy2, dz1 - dz2));",
			"}",


			// Blinn phong shading model
			// http://en.wikipedia.org/wiki/BlinnPhong_shading_model
			// base color, incident, point of intersection, normal
			"vec3 blinnPhong(vec3 color, vec3 p, vec3 n)",
			"{",
				// Ambient colour based on background gradient
			"    vec3 ambColor = clamp(mix(background2Color, background1Color, (sin(n.y * HALFPI) + 1.0) * 0.5), 0.0, 1.0);",
			"    ambColor = mix(vec3(ambientColor.x), ambColor, ambientColor.y);",
				
			"    vec3  halfLV = normalize(light - p);",
			"    float diffuse = max(dot(n, halfLV), 0.0);",
			"    float specular = pow(diffuse, specularExponent);",
				
			"    return ambColor * color + color * diffuse + specular * specularity;",
			"}",


			// Ambient occlusion approximation.
			// Based upon boxplorer's implementation which is derived from:
			// http://www.iquilezles.org/www/material/nvscene2008/rwwtt.pdf
			"float ambientOcclusion(vec3 p, vec3 n, float eps)",
			"{",
			"    float o = 1.0;",                  // Start at full output colour intensity
			"    eps *= aoSpread;",                // Spread diffuses the effect
			"    float k = aoIntensity / eps;",    // Set intensity factor
			"    float d = 2.0 * eps;",            // Start ray a little off the surface
				
			"    for (int i = 0; i < aoIterations; ++i) {",
			"        o -= (d - Mandelbox(p + n * d).x) * k;",
			"        d += eps;",
			"        k *= 0.5;",                   // AO contribution drops as we move further from the surface 
			"    }",
				
			"    return clamp(o, 0.0, 1.0);",
			"}",

			// Calculate the output colour for each input pixel
			"vec4 render(vec2 pixel)",
			"{",
			"    vec3  ray_direction = rayDirection(pixel);",
	
			"    float ray_length = minRange;",
			"    vec3  ray = cameraPosition + ray_length * ray_direction;",
			"    vec4  bg_color = vec4(clamp(mix(background2Color, background1Color, (sin(ray_direction.y * HALFPI) + 1.0) * 0.5), 0.0, 1.0), 1.0);",
			"    vec4  color = bg_color;",
				
			"    float eps = MIN_EPSILON;",
			"    vec3  dist;",
			"    vec3  normal = vec3(0);",
			"    int   steps = 0;",
			"    bool  hit = false;",
			"    float tmin = 0.0;",	// 'out' params of intersectBoundingSphere()
			"    float tmax = 0.0;",
			
			"	 bool useAttachment= false;",
			"	 vec4 attachmenColor= vec4(0.,0.,0.,1.);",
			
			"    if (intersectBoundingSphere(ray, ray_direction, tmin, tmax)) {",
		
					// 2D hack: create an "air pocket" for the spacecraft to avoid any geometry intersections 
					// when used in "view from behind" (while moving forward) the thing can then fly wherever 
					// it wants and the landscape just gets out of the ways..

			"		float omin = tmin;",	// keep original
	
			"		if (0. < bubble_radius) {",
			"			vec2 v= bubble_origin - vec2(pixel.x/outputSize.x, pixel.y/outputSize.y);",
			"			v.x*= outputSize.x/outputSize.y;",
			"			float di = length(v);",
			
			"			if (di <= bubble_radius) {",
			"				float depth=(sin((1.-(di/bubble_radius))*HALFPI))*0.01;",
			"				if (tmin < depth) {",
			"					tmin+= (depth*0.03);",		// reset to "the back" of the imaginary "air pocket"		
			"				} ",
			"			} ",
			"		} ",

					// regular calculation	
			"        ray_length = tmin;",
			"        ray = cameraPosition + ray_length * ray_direction;",

			"	   	vec3  lastDist= vec3(0.,0.,0.);",
			
			"        for (int i = 0; i < stepLimit; i++) {",
			"            steps = i;",
			"            dist = Mandelbox(ray);",
			"            dist.x *= surfaceSmoothness;",
						
						// If we hit the surface on the previous step check again to make sure it wasn't
						// just a thin filament
			"            if (hit && dist.x < eps || ray_length > tmax || ray_length < tmin) {",	// XXX ray_length < tmin impossible!
			"                steps--;",
			
			"				if ( (tmin != omin) &&  (dist == lastDist)) {",	// not a great test.. but barely sufficient..
			"		 			useAttachment= true;",
			"	 				attachmenColor.b= 1.;",	// use BLUE channel to report "bubble" intersection..
			"       		}",
			
			"                break;",
			"            }",
						
			"            hit = false;",
			"            ray_length += dist.x;",	// XXX dist.x is always positive...
			"            ray = cameraPosition + ray_length * ray_direction;",
			"            eps = ray_length * epsfactor;",

						
						// add-on effect hack: "distant" stuff turns into water... 			
			"			if (ray_length > 0.1) {",
			"				ray_length+=waterworld;",
			"				hit = true;",
			"			} else ",
			
						// regular calc
			"           if (dist.x < eps || ray_length < tmin) {",
			"               hit = true;",	// normal mode
			"				lastDist= dist;",			
			"       	}",
			"    	}",
			"    }",
				
				// Found intersection?
			"    float glowAmount = float(steps)/float(stepLimit);",
			"    float glow;",
				
			"    if (hit) {",
			"        float aof = 1.0, shadows = 1.0;",
			"        glow = clamp(glowAmount * innerGlowIntensity * 3.0, 0.0, 1.0);",

			"        if (steps < 1 || ray_length < tmin) {",
			"            normal = normalize(ray);",
			"        } else {",
			"            normal = generateNormal(ray, eps);",
			"            aof = ambientOcclusion(ray, normal, eps);",
			"        }",
					
			"        color.rgb = mix(color1, mix(color2, color3, dist.y * color2Intensity), dist.z * color3Intensity);",
			"        color.rgb = blinnPhong(clamp(color.rgb * color1Intensity, 0.0, 1.0), ray, normal);",
			"        color.rgb *= aof;",
			"        color.rgb = mix(color.rgb, innerGlowColor, glow);",
			
					// make details disapear in the distant fog
			"        color.rgb = mix(bg_color.rgb, color.rgb, exp(-pow(abs(ray_length * exp(fogFalloff)), 2.0) * fog));",
			"        color.a = 1.0;",
			"    } else {",
					// Apply outer glow and fog
			"        ray_length = tmax;",
			"        color.rgb = mix(bg_color.rgb, color.rgb, exp(-pow(abs(ray_length * exp(fogFalloff)), 2.0)) * fog);",
			"        glow = clamp(glowAmount * outerGlowIntensity * 3.0, 0.0, 1.0);",
					
			"        color.rgb = mix(color.rgb, outerGlowColor, glow);",
					
					// use "outerGlow" area as source for "god's ray" postprocessing
					// respective into is stored in separate attachment texture
					
			"		attachmenColor.g = 1.;",	// use green channel to signal "unobstructed" area
			"		useAttachment= true;",
					
			"        if (transparent) color = vec4(0.0);",
			"    }",
			
			// add fake depth information for use in postprocessing (note: as long as it's not part of the 
			// core WEBGL apparently they are calling it gl_FragDepthEXT instead of gl_FragDepth; gl_FragCoord.z​ 
			// is input while gl_FragDepth is for output)
			
			// the range of the practically relevant ray_length seems to be between 0 (front) and 0.2 (background)
			// the minimum gl_FragDepthEXT needed to not have the spececraft intersect with the foreground landscape
			// is around 0.4
			
			"    gl_FragDepthEXT = 0.5+ray_length*1.0;",

			"    if (useAttachment) gl_FragData[1] = attachmenColor;",
		//	"		else gl_FragData[1] = 0.2*color;",	// overlay for debugging
			"    return color;", 
			"}",

			// The main loop
			"void main()",
			"{",
			"    vec4 color = vec4(0.0);",
			"    float n = 0.0;",

			"    cameraRotation = rotationMatrixVector(u, cameraPitch)*rotationMatrixVector(v, cameraYaw) * rotationMatrixVector(w, cameraRoll);",
				
			"    color = render(gl_FragCoord.xy);",	// do without antialiasing to limit GPU load
				
			"   gl_FragData[0] = vec4(pow(abs(color.rgb), vec3(1.0 / gamma)), color.a);",
			"}"	
		
		].join( "\n" )
	};
	
	var mat= new THREE.RawShaderMaterial( {
		uniforms:  THREE.UniformsUtils.clone( shader.uniforms ),
		vertexShader: shader.vertexShader,
		fragmentShader: shader.fragmentShader
	} );

	mat.uniforms.bubble_origin.value= bubbleOrigin;
	mat.uniforms.bubble_radius.value= bubbleRadius;
	
	mat.uniforms.cameraPitch.value= cameraOrientation.x;
	mat.uniforms.cameraYaw.value= cameraOrientation.y;
	mat.uniforms.cameraRoll.value= cameraOrientation.z;

	return mat;
}
