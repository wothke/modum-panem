/*
	My own THREE.js style, shader related building blocks.
		
	Note: "If the WEBGL_draw_buffers extension is enabled, but the fragment shader does not contain the 
	#extension GL_EXT_draw_buffers directive to enable it, then writes to gl_FragColor are only written 
	to COLOR_ATTACHMENT0_WEBGL, and not broadcast to all color attachments. In this scenario, other 
	color attachments are guaranteed to remain untouched." Unfortunately Firefox does not seem to
	do this correctly..
*/

WOO = "WOO" in window ? WOO : {}


function getRenderTarget(width, height) {
	// Create a multi render target with Float buffers
	// (note: constructor sets target.attachments[0] = target.texture)
	var target = new THREE.WebGLMultiRenderTarget( width, height );
	target.texSize=  new THREE.Vector2(width, height);
	
	target.texture.format = THREE.RGBAFormat;
	target.texture.minFilter = THREE.LinearFilter;
	target.texture.magFilter = THREE.LinearFilter;
	target.texture.type = THREE.FloatType;
	target.texture.generateMipmaps = false;
	target.stencilBuffer = false;
	target.depthBuffer = true;
	
	// Add an attachment for various post-processing infos	
	var a1= target.texture.clone();
//	a1.type = THREE.UnsignedByteType;	
// specs say: "attachments are all textures allocated with format RGBA and type UNSIGNED_BYTE"
// but Firefox turns belly up when UnsignedByteType is selected..	
	target.attachments.push( a1 );	// i.e. 2nd attachment
	
	// Name our G-Buffer attachments for debugging
	target.attachments[0].name = 'diffuse';
	
	// I would have preferred to use additional attachments 
	// but is seems that even one additional attachment does not work. 
	// maybe a flaw within THREE.js or maybe my browser is limited to a 
	// total of 4 (which  might be exceeeded with the copy made in 
	// MultiTargetEffectComposer) .. I have no intention of debugging that shit:
	
	// I am therefore using 1 extra attachment and am using the RBG channels 
	// to encode different information:
	
	// R:	set to 1 within the area of the "exhaust" of the spacecraft.. it is
	// 		used to create a post-processing "glow" effect
	// G:	set to 1 within the "outer glow" areas of the "Mandelbox".. these
	// 		are treated as "non obstructed" areas by the post-processing "god's ray" effect
	// B:	set to 1 for spacecraft collisions with the "Mandelbox".. used to change 
	//		the texture of the "spacecraft orb"
	// note: G+B are rendered by the "mandelbox shader" while R is added later by the 
	//		regular mesh renderinng.. (way overwrite)
	
	target.attachments[1].name = 'scratchpad';
	return target;
}

/*
* Extended/patched version of THREE.EffectComposer (see official THREE.js examples)
*/
WOO.MultiTargetEffectComposer = function(a, b) {
    if (this.renderer = a, void 0 === b) {
        var c = {
                minFilter: THREE.LinearFilter,
                magFilter: THREE.LinearFilter,
                format: THREE.RGBAFormat,
                stencilBuffer: !1
            },
        d = a.getSize();
        b = new THREE.WebGLRenderTarget(d.width, d.height, c)
    }
    this.renderTarget1 = b, this.renderTarget2 = this.cloneMultiTarget(b);
	this.writeBuffer = this.renderTarget1, 
	this.readBuffer = this.renderTarget2, 
	this.passes = [], void 0 === THREE.CopyShader && console.error("WOO.MultiTargetEffectComposer relies on THREE.CopyShader"), 
	this.copyPass = new THREE.ShaderPass(THREE.CopyShader)
};
 
Object.assign(WOO.MultiTargetEffectComposer.prototype, {
	cloneMultiTarget: function(src) {
		var dest= src.clone();
		
		if ((src.attachments !== null) && (src.attachments.length > 0)) {
			// HACK: used to handle special case with 1 extra attachments
			dest.attachments= [dest.texture];

			var a1= dest.texture.clone();
		//	a1.type = THREE.UnsignedByteType;	// see specs: "attachments are all textures allocated with format RGBA and type UNSIGNED_BYTE"				
			dest.attachments.push(a1);	// i.e. 2nd attachment			
		}
		return dest;
	},
    swapBuffers: function() {
        var a = this.readBuffer;
        this.readBuffer = this.writeBuffer, this.writeBuffer = a
    },
    addPass: function(a) {
        this.passes.push(a);
        var b = this.renderer.getSize();
        a.setSize(b.width, b.height)
    },
    insertPass: function(a, b) {
        this.passes.splice(b, 0, a)
    },
    render: function(a) {
        var b, c, d = !1,
            e = this.passes.length;
        for (c = 0; c < e; c++)
            if (b = this.passes[c], b.enabled !== !1) {
                if (b.render(this.renderer, this.writeBuffer, this.readBuffer, a, d), b.needsSwap) {
					
                    if (d) {
                        var f = this.renderer.context;
                        f.stencilFunc(f.NOTEQUAL, 1, 4294967295), 
						this.copyPass.render(this.renderer, this.writeBuffer, this.readBuffer, a), 
						f.stencilFunc(f.EQUAL, 1, 4294967295)
                    }
					
					this.swapBuffers()
                }
                void 0 !== THREE.MaskPass && (b instanceof THREE.MaskPass ? d = !0 : b instanceof THREE.ClearMaskPass && (d = !1))
            }
    },
    reset: function(a) {
        if (void 0 === a) {
            var b = this.renderer.getSize();
            a = this.cloneMultiTarget(this.renderTarget1);
			a.setSize(b.width, b.height)
        }
        this.renderTarget1.dispose(), this.renderTarget2.dispose(), this.renderTarget1 = a, this.renderTarget2 = this.cloneMultiTarget(a);
		this.writeBuffer = this.renderTarget1, this.readBuffer = this.renderTarget2
    },
    setSize: function(a, b) {
        this.renderTarget1.setSize(a, b), this.renderTarget2.setSize(a, b);
        for (var c = 0; c < this.passes.length; c++) this.passes[c].setSize(a, b)
    }
});

/*
	shader creates the texture used for the orb around the spacecraft.. pattern is different
	while there is a "collision" with the "mandelbox" landscape..
*/

WOO.PlasmaShader = {
	//adapted from Plasma Globe by nimitz (twitter: @stormoid) https://www.shadertoy.com/view/XsjXRm
	uniforms: {
		size: { type: "v2", value: new THREE.Vector2() },
		time: { type: "f", value: 0 },
		tNoise : { type: "t", value: null },
		tDetector : { type: "t", value: null },	//  note: this is a 1x1 texture that signals "collision" in the "mandelbox" shader
	},

	vertexShader: [
		"#ifdef GL_ES",
		"precision highp float;",
		"#endif",
		"void main()	{",
		"  gl_Position = vec4(position, 0.);",
		"}"

	].join( "\n" ),
	fragmentShader: [
		"#ifdef GL_ES",
		"precision highp float;",
		"#endif",
		"uniform vec2 size;",
		"uniform float time;",
		"uniform sampler2D tNoise;",
		"uniform sampler2D tDetector;",
		"#define HALFPI 1.570796",

		"mat2 mm2(in float a){float c = cos(a), s = sin(a);return mat2(c,-s,s,c);}",

		//iq's ubiquitous 3d noise
		"float noise(in vec3 p)",
		"{",
		"	vec3 ip = floor(p);",
		"    vec3 f = fract(p);",
		"	f = f*f*(3.0-2.0*f);",
			
		"	vec2 uv = (ip.xy+vec2(37.0,17.0)*ip.z) + f.xy;",
		"	vec2 rg = texture2D( tNoise, (uv+ 0.5)/256.0, -16.0 ).yx;",
		"	return mix(rg.x, rg.y, f.z);",
		"}",

		"mat3 m3 = mat3( 0.00,  0.80,  0.60,",
		"              -0.80,  0.36, -0.48,",
		"              -0.60, -0.48,  0.64 );",

		//See: https://www.shadertoy.com/view/XdfXRj
		"float flow(in float b, in vec3 p, in float t)",
		"{",
		"	float z=2.;",
		"	float rz = 0.;",
		"	vec3 bp = p;",

		"	if(b > 0.) {",
			// "shield active"
		"		for (float i= 1.;i < 2. ;i++ ) {",
		"			p += time*.1;",
// OLD		"			rz+= (sin(noise(p+t*0.8)*6.)*0.5+0.5) /z;",
		"			rz+= (sin(noise(p+t*0.8)*10.)*0.5+0.5) /z;",
		"			p = mix(bp,p,0.6);",
		"			z *= 2.;",
		"			p *= 2.01;",
		"       	p*= m3;",
		"		}",
		"	} else {",
			// "shield NOT active"
		"		for (float i= 1.;i < 3. ;i++ ) {",
		"			p += time*.1;",
		"			rz+= (sin(noise(p+t*0.8)*6.)*0.5+0.5) /z;",
		"			p = mix(bp,p,0.6);",
		"			z *= 2.;",
		"			p *= 2.01;",
		"       	p*= m3;",
		"		}",
		"	}",
		
		"	return rz;",
		"}",
		"void main()",
		"{",
		
		"	float b= texture2D( tDetector, vec2(0.,0.)).b;",	// collision detect
//"b= 1.;",
		"	vec2 s = size;",
		"	if (b>0.) {s.x*= 8.; s.y*= 3.; }",	// 'activate shield'
		
		"	vec2 p = gl_FragCoord.xy/s.xy-0.5;",
		"	p.x*=s.x/s.y;",
		
			//camera
		"	vec3 ro = vec3(0.,0.,5.);",
		"   vec3 rd = normalize(vec3(p*.7,-1.5));",
		"   mat2 mx = mm2(time*.4);",
		"   mat2 my = mm2(time*0.3);",
		"   ro.xz *= mx;rd.xz *= mx;",
		"   ro.xy *= my;rd.xy *= my;",
			
		"   vec3 col = vec3(0.0125,0.,0.025);",
			
		"	vec3 rf = reflect( rd, ro+rd );",

		"	float nz = (-log(abs(flow(b, rf*1.2,time)-.01)));",
		"	float nz2 = (-log(abs(flow(b, rf*1.2,-time)-.01)));",
//		"	col += (0.1*nz*nz* vec3(0.12,0.12,0.4) + 0.05*nz2*nz2*vec3(0.75,0.75,.75))*0.8;",
		"	col += (0.1*nz*nz* vec3(0.4,0.12,0.4) + 0.05*nz2*nz2*vec3(0.75,0.75,.75))*0.8;",

		"	col*=1.3;",
		
		"	float alpha= max(max(col.r, col.g),col.b);",
		"   alpha= max(0., 0.7-cos(min(1.,alpha*(1.4))*HALFPI));",

		"	alpha=max(0.,(alpha-(1.-b)*.4));",	// 'hide' while 'no active shield'
		
		
		"	gl_FragColor = vec4(col, alpha);",
		"}"
	].join( "\n" ),	
};

WOO.PlasmaPass = function ( ) {
	THREE.Pass.call( this );

	if ( WOO.PlasmaShader === undefined )
		console.error( "WOO.PlasmaPass relies on WOO.PlasmaShader" );

	var shader = WOO.PlasmaShader;

	this.uniforms = THREE.UniformsUtils.clone( shader.uniforms );

	this.material = new THREE.ShaderMaterial( {
		uniforms: this.uniforms,
		vertexShader: shader.vertexShader,
		fragmentShader: shader.fragmentShader

	} );	

	this.camera = new THREE.OrthographicCamera( - 1, 1, 1, - 1, 0, 1 );
	this.scene  = new THREE.Scene();

	this.quad = new THREE.Mesh( new THREE.PlaneBufferGeometry( 2, 2 ), null );
	this.quad.frustumCulled = false; // Avoid getting clipped
	this.scene.add( this.quad );
};

WOO.PlasmaPass.prototype = Object.assign( Object.create( THREE.Pass.prototype ), {

	constructor: WOO.PlasmaPass,

	render: function ( renderer, writeBuffer, readBuffer, delta, maskActive ) {	
		this.quad.material = this.material;

		if ( this.renderToScreen ) {
			renderer.render( this.scene, this.camera );
		} else {
			renderer.render( this.scene, this.camera, writeBuffer, this.clear );
		}
	}
} );



/* 
* This simple "1st pass" shader is used as a Meterial that (also) leaves a marker within an additional 
* postprocessing texture - which is later used to render a postprocessing based effect
*/
WOO.AttachmentShader =  {
	uniforms: {
		color: {type: 'fv', value: [1.0,1.0,1.0]},
		opacity:  {type: 'f', value: 1.0},
		channel:  {type: 'i', value: 1}
	},
	vertexShader: [
		"#extension GL_EXT_draw_buffers : require",

		"uniform vec3 color;",
		"uniform float opacity;",
		"uniform int channel;",
		"varying vec2 vUv;",
		"void main() {",
		"    vUv = uv;",
		"    gl_Position = projectionMatrix *",
		"                  modelViewMatrix * vec4(position, 1.0 );",
		"}"
	].join( "\n" ),

	fragmentShader: [
		"#extension GL_EXT_draw_buffers : require",
		
		"precision highp float;",
		"varying vec2 vUv;",
		"uniform vec3 color;",
		"uniform float opacity;",
		"uniform int channel;",

		"void main(void) {",
		"    gl_FragData[0] = vec4(color, opacity);",	
		
			// channel bit 0=red (channel used for glow), bit 1=green (used for rays)
		"    float r= (channel == 1) ? 1. : 0.;",
		"    float g= (channel == 2) ? 1. : 0.;",
		"    if(channel == 3) {r=1.; g=1.;}",
			
		"    gl_FragData[1] = vec4(r,g,0.,1.);",

		"}",
	].join( "\n" ),
	
	getUniforms: function(color, opacity, channel) {
		var u= THREE.UniformsUtils.clone( WOO.AttachmentShader.uniforms );
		
		u.color= {type: 'fv', value: [(color>>16)/0xff, ((color>>8)&0xff)/0xff, (color&0xff)/0xff]};
		u.opacity=  {type: 'f', value: opacity};
		u.channel=  {type: 'i', value: channel};
		return u;		
	}
}

/*
* This simple 2nd pass shader uses the marker left by the above WOO.AttachmentShader 
* to add a glow effect to the tDiffuse texture.
*/
WOO.ExhaustGlowShader = {
	uniforms: {
		"tDiffuse":   { value: null },
		"tScratchpad":   { value: null },

		"uStepWidth" :  { type: "f", value: 0.0017 }, 
		"uGlowFactor" :  { type: "f", value: 0.031 },
	},

	vertexShader: [
		"#extension GL_EXT_draw_buffers : require",
		"#extension GL_EXT_frag_depth : enable",
		"precision mediump float;",
		"varying vec2 vUv;",

		"void main() {",
			"vUv = uv;",
			"gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );",
		"}"
	].join( "\n" ),

	fragmentShader: [
		"#extension GL_EXT_draw_buffers : require",
		"#extension GL_EXT_frag_depth : enable",
		"precision mediump float;",

		"uniform sampler2D tDiffuse;",
		"uniform sampler2D tScratchpad;",
		
		"uniform float uStepWidth;",	
		"uniform float uGlowFactor;",
		
		"#define SAMPLE_STEPS 3", 				// means x steps in each direction	
		"#define SAMPLE_SIZE 2*SAMPLE_STEPS+1",
		
		// no point in being too sophisticated here.. after all its just pixel based 
		// postprocessing, e.g. may not work well if stuff is zoomed
		"varying vec2 vUv;",
		
		"void main()",
		"{",
		"	vec4 c= texture2D(tDiffuse, vUv.xy );",			
		"	vec4 d= texture2D(tScratchpad, vUv.xy );",

		"	float result= 0.;",
		"	float maxDist= distance(float(SAMPLE_STEPS),float(SAMPLE_STEPS));",
		"	float startx = vUv.x - float(SAMPLE_STEPS) * uStepWidth;",
		"	float starty = vUv.y - float(SAMPLE_STEPS) * uStepWidth;",

		"	for(int i= 0; i< SAMPLE_SIZE; i++) {",
		"		for(int j= 0; j< SAMPLE_SIZE;j++) {",
					// check if there is light
					// note: Firefox is too dumb to use the correct tScratchpad here and for some reason it 
					// uses the regular texture.. therefor check for 1. to avoid that everything glows in FF
		"			if (texture2D(tScratchpad, vec2(startx+float(i)*uStepWidth,starty+float(j)*uStepWidth)).r == 1.) {",
		"				float w= distance(abs(float(i-SAMPLE_STEPS)), abs(float(j-SAMPLE_STEPS)));",
		"				w=1.-((maxDist/w));",
		"				result+= w;",
		"			}",
		"		}",
		"	}",
		"	result*= uGlowFactor;",
		"	result= abs(result);",
		
		"	gl_FragData[0] = vec4(min(1., c.x+result), min(1., c.y+result), min(1., c.z+result), 1.);",	
		"	gl_FragData[1] = d;",	// copy attachment so it will still be available in next pass... 	
		"}"
	].join( "\n" )
};

WOO.ExhaustGlowPass = function ( ) {
	THREE.Pass.call( this );

	if ( WOO.ExhaustGlowShader === undefined )
		console.error( "WOO.ExhaustGlowPass relies on WOO.ExhaustGlowShader" );

	var shader = WOO.ExhaustGlowShader;

	this.uniforms = THREE.UniformsUtils.clone( shader.uniforms );

	this.material = new THREE.ShaderMaterial( {
		uniforms: this.uniforms,
		vertexShader: shader.vertexShader,
		fragmentShader: shader.fragmentShader

	} );	

	this.camera = new THREE.OrthographicCamera( - 1, 1, 1, - 1, 0, 1 );
	this.scene  = new THREE.Scene();

	this.quad = new THREE.Mesh( new THREE.PlaneBufferGeometry( 2, 2 ), null );
	this.quad.frustumCulled = false; // Avoid getting clipped
	this.scene.add( this.quad );
};

WOO.ExhaustGlowPass.prototype = Object.assign( Object.create( THREE.Pass.prototype ), {

	constructor: WOO.ExhaustGlowPass,

	render: function ( renderer, writeBuffer, readBuffer, delta, maskActive ) {
		// used after "swap", i.e. result from previous pass is in readBuffer and 
		// explicitly fed into this pass via the below uniforms..		
		this.uniforms[ "tDiffuse" ].value = readBuffer.texture;
		this.uniforms[ "tScratchpad" ].value = readBuffer.attachments[1];

		
		this.quad.material = this.material;

		if ( this.renderToScreen ) {
			renderer.render( this.scene, this.camera );
		} else {
			renderer.render( this.scene, this.camera, writeBuffer, this.clear );
		}
	}
} );

/*
* This simple "god's ray" shader that uses a tScratchpad for 'occluded areas'.
*/
WOO.RaysShader = {
	uniforms: {
		"tDiffuse":   { value: null },
		"tScratchpad":   { value: null },

		"exposure":       { value: 1.0 },
		"decay": { value: 0.1 },
		"density": { value: 0.05 },
		"weight":     { value: 0.8 },
		"lightPositionOnScreen": { type: "v2", value: new THREE.Vector2(700,100) },
	},

	vertexShader: [
		"#extension GL_EXT_draw_buffers : require",
		"precision mediump float;",
		"varying vec2 vUv;",

		"void main() {",
			"vUv = uv;",
			"gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );",
		"}"
	].join( "\n" ),

	fragmentShader: [
		"#extension GL_EXT_draw_buffers : require",
		"precision mediump float;",

		"uniform sampler2D tDiffuse;",
		"uniform sampler2D tScratchpad;",

		"uniform float exposure;",
		"uniform float decay;",
		"uniform float density;",
		"uniform float weight;",
		"uniform vec2 lightPositionOnScreen;",
		
		"const int NUM_SAMPLES = 100;",

		"varying vec2 vUv;",

		"void main()",
		"{",
		
			"vec2 xy = vUv;",
			"vec2 deltaXy = vec2( xy - lightPositionOnScreen.xy );",

			"vec4 c= texture2D(tDiffuse, xy );",		// copy pixel from texture
			
	//		"if(length(deltaXy)< 0.01) {c.z= 1.; c.x= 1.; }",	    // highlight position of "god's ray" source
			
			"deltaXy *= 1. /  (float(NUM_SAMPLES) * density);",
			"float lumDecay = 1.;",
			
			"for(int i=0; i < NUM_SAMPLES ; i++) {",
			"	 xy -= deltaXy;",
			"	 float t = texture2D(tScratchpad, xy ).y;",	// SET GREEN channel used for non-obstructed areas
			
			"	 if (t == 1.) {",
			"	 	c += vec4(1.,1.,1.,0.) * (lumDecay * weight);",
			"	 }",
			
			"	 lumDecay *= decay;",
			"}",
		//	"c = texture2D(tScratchpad, vUv );",	// debug input
			"gl_FragData[0] = c*exposure;",	
		"}"
	].join( "\n" )
};

WOO.RaysPass = function (lightPositionOnScreen, weight, density, decay, exposure ) {
	THREE.Pass.call( this );

	if ( WOO.RaysShader === undefined )
		console.error( "WOO.RaysPass relies on WOO.RaysShader" );

	var shader = WOO.RaysShader;

	this.uniforms = THREE.UniformsUtils.clone( shader.uniforms );

	this.material = new THREE.ShaderMaterial( {
		uniforms: this.uniforms,
		vertexShader: shader.vertexShader,
		fragmentShader: shader.fragmentShader

	} );	
	if ( lightPositionOnScreen !== undefined ) this.uniforms.lightPositionOnScreen.value = lightPositionOnScreen;
	if ( weight !== undefined ) this.uniforms.weight.value = weight;
	if ( density !== undefined ) this.uniforms.density.value = density;
	if ( decay !== undefined ) this.uniforms.decay.value = decay;
	if ( exposure !== undefined )	this.uniforms.exposure.value = exposure;

	this.camera = new THREE.OrthographicCamera( - 1, 1, 1, - 1, 0, 1 );
	this.scene  = new THREE.Scene();

	this.quad = new THREE.Mesh( new THREE.PlaneBufferGeometry( 2, 2 ), null );
	this.quad.frustumCulled = false; // Avoid getting clipped
	this.scene.add( this.quad );
};

WOO.RaysPass.prototype = Object.assign( Object.create( THREE.Pass.prototype ), {

	constructor: WOO.RaysPass,

	render: function ( renderer, writeBuffer, readBuffer, delta, maskActive ) {
		this.uniforms[ "tDiffuse" ].value = readBuffer.texture;	// do not directly access attachment idx to avoid double buffering clash
		this.uniforms[ "tScratchpad" ].value = readBuffer.attachments[1];

		
		this.quad.material = this.material;

		if ( this.renderToScreen ) {
			renderer.render( this.scene, this.camera );
		} else {
			renderer.render( this.scene, this.camera, writeBuffer, this.clear );
		}
	}
} );

/*
* Handles a chain of shaders that successively reduce an input texture by a factor of 2 - while 
* certain pixels are prioritized.
*
* Used to create a 1x1 pixel texture that signals if a "Mandelbox collision" is active.

*/
WOO.Condenser = function() {
	this.condenserPass= new WOO.CondenserPass();
	
	this.condensers= [
		// used to condense "collision" info into a single pixel texture (where it can be 
		// fetched by the "plasma" fragment shader..)
		this.createCondenseRenderTarget(0),
		this.createCondenseRenderTarget(1),
		this.createCondenseRenderTarget(2),
		this.createCondenseRenderTarget(3),
		this.createCondenseRenderTarget(4),
		this.createCondenseRenderTarget(5),
		this.createCondenseRenderTarget(6),
		this.createCondenseRenderTarget(7),
		this.createCondenseRenderTarget(8),
		this.createCondenseRenderTarget(9),
		this.createCondenseRenderTarget(10),
		this.createCondenseRenderTarget(11),
	];
};


WOO.Condenser.prototype = {
	runChain: function(renderer, center, radius, inputTexture) {
		// FIXME this does not work in Firefox.. permanent collision reported: for some
		// reason FF draws regular output into special purpose attachment.. bloody idiots!
		
		// check if there was a mandelbox "collision" (ideally this should be performed 
		// between mandel- and falcon-pass.. but 1 frame lag should be ok).. 
		// (check that part of the output texture where the "mandelbox bubble" might be drawn) 
		var renderWidth= renderer.getSize().width;
		var renderHeight= renderer.getSize().height;

		var areaSize= renderWidth*radius*2;
		
		var offset= new THREE.Vector2((renderWidth*center.x-areaSize/2)/renderWidth, 
							(renderHeight*center.y-areaSize/2)/renderHeight);
			
		var condenserIdx= 0;
		var sampleWidth= 1;
		
		// get next larger "multiple of 2" size
		for (; sampleWidth < areaSize; condenserIdx++, sampleWidth*=2);
		
		var src= {texture:  inputTexture,
				texSize:  new THREE.Vector2(renderWidth, renderHeight)
			};	// mimick RenderTarget
				 
		condenserIdx -= 1;				// result will be half the size

		while (condenserIdx >= 0) {
			var  newSize= Math.pow(2, condenserIdx);	

			this.condenserPass.uniforms.srcOffset.value= offset;
			this.condenserPass.uniforms.destSizePx.value=  newSize;

			var dest= this.condensers[condenserIdx];	// get correctly sized RenderTarget
			
			if (condenserIdx == -1) {		// use 0..7 to debug respectice condensation result
				// debug: render to screen
				this.condenserPass.renderToScreen= true;
				this.condenserPass.render(renderer, dest, src, null, null);
				
				break;
			} else {
				this.condenserPass.renderToScreen= false;
				this.condenserPass.render(renderer, dest, src, null, null);
			}			
			src= dest;
			
			condenserIdx--;
			offset= new THREE.Vector2(0,0);		// only needed for initial run
		}		
	},
	
	getResultTexture: function() {
		// ARRGHH: while it works to use the 2x2 texture.. the 1x1 just doesn't!
		return this.condensers[1].texture;
	},
	createCondenseRenderTarget: function(idx) {
		var size= Math.pow(2, idx);
		var target = new THREE.WebGLRenderTarget( size, size );
		target.texSize=  new THREE.Vector2(size,size);	// used by WOO.CondenserPass
		
		target.texture.name= "condense " + idx;
		target.texture.format = THREE.RGBAFormat;
	//	target.texture.type = THREE.FloatType;
		target.texture.type = THREE.UnsignedByteType;	// does not seem to make a difference..
		target.texture.generateMipmaps = false;

		target.texture.wrapS = target.texture.wrapT = THREE.ClampToEdgeWrapping;
	//	target.texture.wrapS = target.texture.wrapT = THREE.RepeatWrapping;

		target.texture.minFilter= THREE.NearestFilter ;	// keep pixels.. do not interpolate
		target.texture.magFilter= THREE.NearestFilter ;
		
		target.stencilBuffer = false;
		target.depthBuffer = false;
		
		return target;
	},
	
};
/*
* It "condenses" an input texture area (size must be multiple of 2)
* into an output texture of half that size. This "copy operation"
* is designed to preserve "set" pixels.
* (the tInputTexture is always at least 2x as big as the output)
*/
WOO.CondenserShader = {
	uniforms: {
		srcOffset: 		{ type: "v2", value: new THREE.Vector2() },
		srcSizePx: 		{ type: "v2", value: new THREE.Vector2() },
		destSizePx:		{ type: "f", value: 0 },	// result will always be square (used source area is twice as large)
		tInputTexture:	{ value: null },
	},
	vertexShader: [
		"#ifdef GL_ES",
		"precision highp float;",
		"#endif",
		"varying vec2 vUv;",

		"void main() {",
			"vUv = uv;",
			"gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );",
		"}"


	].join( "\n" ),
	fragmentShader: [
		"#ifdef GL_ES",
		"precision highp float;",
		"#endif",
		"uniform vec2 srcOffset;", 		// offset to the source area within the input (relative to a total input size of 1.0)
		"uniform vec2 srcSizePx;",		// this may be larger than the used square area (e.g. see srcOffset)
		"uniform float destSizePx;",	// implies a source area of twice that length
		"uniform sampler2D tInputTexture;",
		
		"varying vec2 vUv;",
	
		"void main()",
		"{",
			// how wide is the area to be used (relative to the size of the input, e.g. 0.2 of total of 1.0 );
		"	float s= destSizePx*2.;",	// relevant input area in pixels
		"	vec2 inputRange= vec2(s/srcSizePx.x, s/srcSizePx.y);",
		
		
			// step width to get from one source pixel to the next
		"	float dx= inputRange.x/s;",		// pixel distance input texture
		"	float dy= inputRange.y/s;",

		"	vec2 ic= vUv;",					// vUv runs from 0 to 1
		"	vec2 texCoord= ic;",			

			// transform to source coordinates
		"	texCoord.x= srcOffset.x+(inputRange.x*texCoord.x);",
		"	texCoord.y= srcOffset.y+(inputRange.y*texCoord.y);",

	/*	debug output
	"if (((ic.x > 0.498) && (ic.x < 0.502)) || ((ic.y > 0.498) && (ic.y < 0.502))) {",
		"gl_FragColor = vec4(1.,1.,1.,1.);",		
	"} else {",
		"gl_FragColor = texture2D( tInputTexture, texCoord);",
		
	"}",
	*/
		
			// check the BLUE channel (mb better to  just use LinearFilter and let WEBGL use the built-in sampling ?)
		"	if(texture2D( tInputTexture, texCoord).b > 0.0) gl_FragColor =						vec4(0.,0.,1.,1.);",
		"	else if(texture2D( tInputTexture, texCoord+vec2(0. ,dy)).b > 0.0) gl_FragColor = 	vec4(0.,0.,1.,1.);",
		"	else if(texture2D( tInputTexture, texCoord+vec2(dx, dy)).b > 0.0) gl_FragColor = 	vec4(0.,0.,1.,1.);",
		"	else if(texture2D( tInputTexture, texCoord+vec2(dx, 0.)).b > 0.0) gl_FragColor = 	vec4(0.,0.,1.,1.);",
		"	else",
		"		gl_FragColor = vec4(0.,0.,0.,1.);",
		"}"
	].join( "\n" ),
};	

WOO.CondenserPass = function ( ) {
	THREE.Pass.call( this );

	if ( WOO.CondenserShader === undefined )
		console.error( "WOO.CondenserPass relies on WOO.CondenserShader" );

	var shader = WOO.CondenserShader;

	this.uniforms = THREE.UniformsUtils.clone( shader.uniforms );

	this.material = new THREE.ShaderMaterial( {
		uniforms: this.uniforms,
		vertexShader: shader.vertexShader,
		fragmentShader: shader.fragmentShader

	} );	

	this.camera = new THREE.OrthographicCamera( - 1, 1, 1, - 1, 0, 1 );
	this.scene  = new THREE.Scene();

	this.quad = new THREE.Mesh( new THREE.PlaneBufferGeometry( 2, 2 ), null );
	this.quad.frustumCulled = false; // Avoid getting clipped
	this.scene.add( this.quad );
};

WOO.CondenserPass.prototype = Object.assign( Object.create( THREE.Pass.prototype ), {

	constructor: WOO.CondenserPass,

	render: function ( renderer, writeBuffer, readBuffer, delta, maskActive ) {
		// used after "swap", i.e. result from previous pass is in readBuffer and 
		// explicitly fed into this pass via the below uniforms..		
		this.uniforms[ "tInputTexture" ].value = readBuffer.texture;
		this.uniforms[ "srcSizePx" ].value = readBuffer.texSize;

		
		this.quad.material = this.material;

		if ( this.renderToScreen ) {
			renderer.render( this.scene, this.camera );
		} else {
			renderer.render( this.scene, this.camera, writeBuffer, this.clear );
		}
	}
} );
