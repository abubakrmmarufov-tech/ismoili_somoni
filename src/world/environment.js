// Sky, sun, image-based lighting and aerial perspective — all driven by the real
// solar position over Dushanbe for the chosen time of day.

import * as THREE from 'three/webgpu';
import {
	Fn, uniform, float, vec3, vec4, color, mix, exp, max, min, pow, dot, clamp, smoothstep, abs, length, normalize,
	positionWorld, cameraPosition, fog, pmremTexture, select
} from 'three/tsl';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import { SunLight } from 'three/addons/lights/SunLight.js';
import { SunLightNode } from 'three/addons/lights/SunLightNode.js';
import { sunAt, sunLightColor } from '../core/sun.js';

export class Environment {

	constructor( renderer, scene, quality ) {

		this.renderer = renderer;
		this.scene = scene;
		this.quality = quality;
		renderer.library.addLight( SunLightNode, SunLight );

		// ---- sky (Preetham + procedural clouds)
		const sky = new SkyMesh();
		sky.scale.setScalar( 11000 );
		sky.turbidity.value = 3.4; // dusty continental air
		sky.rayleigh.value = 1.45;
		sky.mieCoefficient.value = 0.0042;
		sky.mieDirectionalG.value = 0.84;
		sky.cloudCoverage.value = 0.28;
		sky.cloudDensity.value = 0.42;
		sky.cloudElevation.value = 0.62;
		sky.cloudScale.value = 0.00022;
		sky.cloudSpeed.value = 0.000012;
		sky.frustumCulled = false;
		scene.add( sky );
		this.sky = sky;

		// ---- sun (cascaded shadows)
		const sun = new SunLight( 0xffffff, 4 );
		sun.castShadow = true;
		sun.shadow.mapSize.setScalar( quality.shadowMapSize );
		sun.shadow.camera.far = quality.shadowFar;
		sun.shadow.radius = 2.5;
		sun.shadow.bias = - 0.0002;
		sun.shadow.normalBias = 0.035;
		scene.add( sun );
		this.sun = sun;

		// ---- uniforms shared with materials / post
		this.uSunDir = uniform( new THREE.Vector3( 0, 1, 0 ) );
		this.uSunColor = uniform( new THREE.Color( 1, 1, 1 ) );
		this.uSunIntensity = uniform( 1 );
		this.uDaylight = uniform( 1 ); // 0 at dusk → 1 in full day
		this.uFogDensity = uniform( 0.00011 );
		this.uFogFalloff = uniform( 0.0011 );

		// ---- image based lighting from the live sky
		this.pmrem = new THREE.PMREMGenerator( renderer );
		this.envScene = new THREE.Scene();
		this.groundColor = new THREE.Color();
		const ground = new THREE.Mesh(
			new THREE.CircleGeometry( 9000, 48 ).rotateX( - Math.PI / 2 ),
			new THREE.MeshBasicNodeMaterial( { color: this.groundColor } )
		);
		ground.position.y = - 30;
		this.envGround = ground;
		this.envScene.add( ground );
		this.envTarget = null;

		scene.environmentIntensity = 1.0;

		this.installFog();
		this.hours = null;

	}

	/** Height-based exponential fog tinted by the sky radiance along the view ray (aerial perspective). */
	installFog() {

		const env = this;
		const factor = Fn( () => {

			const ray = positionWorld.sub( cameraPosition );
			const dist = length( ray );
			const dir = ray.div( dist );
			const b = env.uFogFalloff;
			const camH = max( cameraPosition.y, 0 );
			const dy = dir.y.mul( dist ).mul( b );
			// ∫ density along the ray for density(h) = a·e^(−b·h)
			const integral = select( abs( dy ).greaterThan( 1e-4 ), float( 1 ).sub( exp( dy.negate() ) ).div( dy ), float( 1 ) );
			const optical = env.uFogDensity.mul( exp( camH.mul( b ).negate() ) ).mul( dist ).mul( integral );
			return float( 1 ).sub( exp( optical.negate() ) ).clamp( 0, 0.97 );

		} )();

		const fogColor = Fn( () => {

			const dir = normalize( positionWorld.sub( cameraPosition ) );
			const hdir = normalize( vec3( dir.x, max( dir.y, 0 ).mul( 0.35 ).add( 0.06 ), dir.z ) );
			const base = env.envTarget ? pmremTexture( env.envTarget.texture, hdir, float( 0.25 ) ) : vec3( 0.6, 0.7, 0.85 );
			// forward (Mie) scattering glow around the sun
			const mu = dot( dir, env.uSunDir ).max( 0 );
			const glow = env.uSunColor.mul( pow( mu, 10 ).mul( 0.45 ).add( pow( mu, 3 ).mul( 0.12 ) ) ).mul( env.uSunIntensity );
			return base.mul( 0.92 ).add( glow );

		} );

		this._fogColorFn = fogColor;
		this._fogFactor = factor;

	}

	applyFog() {

		this.scene.fogNode = fog( this._fogColorFn(), this._fogFactor );

	}

	/** Moves the sun to the given local time (hours) and refreshes lighting. */
	setTime( hours, { updateEnv = true } = {} ) {

		this.hours = hours;
		const s = sunAt( hours );
		const dir = s.direction;
		this.sunInfo = s;

		this.sky.sunPosition.value.copy( dir );
		this.sun.position.copy( dir );
		this.uSunDir.value.copy( dir );

		const { color: c, intensity } = sunLightColor( s.elevation );
		this.sun.color.copy( c );
		this.sun.intensity = 5.2 * intensity;
		this.uSunColor.value.copy( c );
		this.uSunIntensity.value = intensity;

		const day = THREE.MathUtils.smoothstep( s.elevation, 2, 30 );
		this.uDaylight.value = day;
		// hazier and denser near the horizon at golden hour
		this.uFogDensity.value = THREE.MathUtils.lerp( 0.00016, 0.00009, day ) * ( this.fogScale ?? 1 );
		this.sky.turbidity.value = THREE.MathUtils.lerp( 4.2, 3.2, day );
		this.sky.mieCoefficient.value = THREE.MathUtils.lerp( 0.006, 0.004, day );

		// bounce light colour of the warm plaza/park floor for the lower hemisphere
		this.groundColor.setRGB( 0.13, 0.12, 0.1 ).multiplyScalar( 0.35 + 1.4 * intensity * Math.max( 0.05, dir.y ) );
		this.groundColor.lerp( c, 0.12 * ( 1 - day ) );

		if ( updateEnv ) this.updateEnvironment();

	}

	updateEnvironment() {

		const sky = this.sky;
		sky.showSunDisc.value = 0;
		this.scene.remove( sky );
		this.envScene.add( sky );
		const first = this.envTarget === null;
		this.envTarget = this.pmrem.fromScene( this.envScene, 0, 1, 20000, { size: 256, renderTarget: this.envTarget } );
		this.envScene.remove( sky );
		this.scene.add( sky );
		sky.showSunDisc.value = 1;
		this.scene.environment = this.envTarget.texture;
		if ( first ) this.applyFog();

	}

	update( dt, camera ) {

		// keep the sky dome centred on the camera so clouds never reveal its box
		this.sky.position.copy( camera.position );

	}

}
