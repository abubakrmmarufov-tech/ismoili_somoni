// Post-processing chain modelled on a digital-cinema camera + grade:
// scene (MRT) → GTAO → TRAA → depth of field → bloom → lens CA → AgX → film grade.

import * as THREE from 'three/webgpu';
import {
	Fn, pass, mrt, output, velocity, normalView, packNormalToRGB, unpackRGBToNormal, sample, screenUV, screenSize, uniform,
	float, vec2, vec3, vec4, mix, smoothstep, dot, length, max, pow, hash, time, renderOutput, clamp, screenCoordinate
} from 'three/tsl';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { traa } from 'three/addons/tsl/display/TRAANode.js';
import { dof } from 'three/addons/tsl/display/DepthOfFieldNode.js';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { fxaa } from 'three/addons/tsl/display/FXAANode.js';
import { chromaticAberration } from 'three/addons/tsl/display/ChromaticAberrationNode.js';

export class Pipeline {

	constructor( renderer, scene, camera, quality, { toneMapping = THREE.AgXToneMapping } = {} ) {

		this.renderer = renderer;
		this.quality = quality;
		const rp = new THREE.RenderPipeline( renderer );
		rp.outputColorTransform = false;
		this.rp = rp;

		// ---- controllable parameters (the director animates these)
		this.focus = uniform( 30 ); // focus distance, metres
		this.dofRange = uniform( 60 ); // distance from the focal plane to full blur, metres
		this.bokeh = uniform( 1.6 );
		this.exposure = uniform( 1.0 );
		this.bloomStrength = uniform( 0.12 );
		this.bloomThreshold = uniform( 1.6 );
		this.aoStrength = uniform( 0.65 );
		this.caStrength = uniform( 0.35 );
		this.vignette = uniform( 0.32 );
		this.grain = uniform( 0.022 );
		this.contrast = uniform( 1.06 );
		this.saturation = uniform( 1.04 );
		this.warmth = uniform( 0.012 );
		this.fade = uniform( 0 ); // 1 = black (cuts / title card)

		// ---- scene pass
		const scenePass = pass( scene, camera );
		const targets = { output };
		const needsVelocity = quality.traa;
		if ( needsVelocity ) targets.velocity = velocity;
		if ( quality.ao ) targets.normal = packNormalToRGB( normalView );
		scenePass.setMRT( mrt( targets ) );
		if ( quality.ao ) scenePass.getTexture( 'normal' ).type = THREE.UnsignedByteType;
		this.scenePass = scenePass;

		const color = scenePass.getTextureNode( 'output' );
		const depth = scenePass.getTextureNode( 'depth' );
		const viewZ = scenePass.getViewZNode();
		let hdr = color;

		if ( quality.ao ) {

			const normalTex = scenePass.getTextureNode( 'normal' );
			const normalSample = sample( ( uv ) => unpackRGBToNormal( normalTex.sample( uv ) ) );
			const aoPass = ao( depth, normalSample, camera );
			aoPass.resolutionScale = 0.5;
			aoPass.radius.value = 1.2;
			aoPass.thickness.value = 1.5;
			aoPass.distanceFallOff.value = 1.0;
			this.aoPass = aoPass;
			const aoValue = aoPass.getTextureNode().sample( screenUV ).r;
			hdr = vec4( color.rgb.mul( mix( float( 1 ), aoValue, this.aoStrength ) ), color.a );

		}

		if ( quality.traa ) {

			const t = traa( hdr, depth, scenePass.getTextureNode( 'velocity' ), camera );
			this.traaPass = t;
			hdr = t;

		}

		if ( quality.dof ) {

			hdr = dof( hdr, viewZ, this.focus, this.dofRange, this.bokeh );

		}

		if ( quality.bloom ) {

			const b = bloom( hdr, this.bloomStrength, 0.55, this.bloomThreshold );
			hdr = hdr.add( b );

		}

		hdr = chromaticAberration( hdr, this.caStrength, vec2( 0.5 ), float( 1.0 ) );

		const exposed = vec4( hdr.rgb.mul( this.exposure ), 1 );
		let ldr = renderOutput( exposed, toneMapping, THREE.SRGBColorSpace );
		ldr = this.grade( ldr );
		if ( quality.fxaa ) ldr = fxaa( ldr );
		rp.outputNode = this.finish( ldr );

	}

	/** Display-referred colour grade: contrast, split-tone, saturation. */
	grade( c ) {

		return Fn( () => {

			let col = c.rgb.toVar();
			col.assign( col.sub( 0.5 ).mul( this.contrast ).add( 0.5 ).max( 0 ) );
			const l = dot( col, vec3( 0.2126, 0.7152, 0.0722 ) );
			// teal-ish shadows, warm highlights (very gentle)
			const shadows = vec3( - 0.6, 0.1, 0.5 ).mul( smoothstep( 0.45, 0.0, l ) );
			const highs = vec3( 0.8, 0.25, - 0.9 ).mul( smoothstep( 0.35, 1.0, l ) );
			col.addAssign( shadows.add( highs ).mul( this.warmth ) );
			col.assign( mix( vec3( l ), col, this.saturation ) );
			return vec4( col, 1 );

		} )();

	}

	/** Vignette, film grain and fades — after anti-aliasing so grain stays crisp. */
	finish( c ) {

		return Fn( () => {

			const aspect = screenSize.x.div( screenSize.y );
			const d = length( screenUV.sub( 0.5 ).mul( vec2( aspect, 1 ) ) );
			let col = c.rgb.mul( float( 1 ).sub( this.vignette.mul( smoothstep( 0.35, 1.05, d ) ) ) );
			const seed = screenCoordinate.x.add( screenCoordinate.y.mul( 3371.0 ) ).add( time.mul( 60 ).floor().mul( 91.7 ) );
			const n = hash( seed ).add( hash( seed.add( 17.3 ) ) ).sub( 1.0 ); // triangular distribution
			const l = dot( col, vec3( 0.2126, 0.7152, 0.0722 ) );
			col = col.add( n.mul( this.grain ).mul( float( 1 ).sub( l.mul( 0.6 ) ) ) );
			col = col.mul( this.fade.oneMinus() );
			return vec4( col, 1 );

		} )();

	}

	render() {

		this.rp.render();

	}

}
