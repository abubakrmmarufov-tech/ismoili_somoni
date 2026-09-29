// The long fountain pool on the plaza axis. The water surface is a custom
// reflective shader (planar reflection of the monument on high tier, sky probe
// otherwise) with a two-scale normal map and ripples where the jets land; the
// jets are GPU-animated droplet particles following ballistic paths.

import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
	Fn, float, vec2, vec3, vec4, texture, positionWorld, cameraPosition, normalize, reflect, dot, max, pow, mix, length, sin, fract, exp,
	time, reflector, pmremTexture, attribute, instanceIndex, hash, cameraViewMatrix, positionLocal, uv, smoothstep, clamp, color, screenUV, abs, floor
} from 'three/tsl';
import { greyGranite } from './materials.js';
import { PLAZA } from './landscape.js';

const WATER_Y = 0.32;

export class Fountain {

	constructor( world ) {

		this.world = world;
		this.quality = world.quality;
		this.group = new THREE.Group();
		this.group.name = 'Fountain';
		this.ready = this.build();

	}

	async build() {

		const P = PLAZA.pool;
		const normals = await this.world.assets.texture( 'water_normal', { srgb: false, repeat: true, weight: 0.4 } );

		// granite coping and basin walls
		const rim = [];
		const w = 0.6, h = 0.5;
		rim.push( new THREE.BoxGeometry( P.x1 - P.x0 + w * 2, h, w ).translate( ( P.x0 + P.x1 ) / 2, h / 2, P.z0 - w / 2 ) );
		rim.push( new THREE.BoxGeometry( P.x1 - P.x0 + w * 2, h, w ).translate( ( P.x0 + P.x1 ) / 2, h / 2, P.z1 + w / 2 ) );
		rim.push( new THREE.BoxGeometry( w, h, P.z1 - P.z0 ).translate( P.x0 - w / 2, h / 2, ( P.z0 + P.z1 ) / 2 ) );
		rim.push( new THREE.BoxGeometry( w, h, P.z1 - P.z0 ).translate( P.x1 + w / 2, h / 2, ( P.z0 + P.z1 ) / 2 ) );
		const coping = new THREE.Mesh( mergeGeometries( rim ), greyGranite( { tint: 0x9d978f, slab: [ 1.2, 0.6 ], rough: 0.5 } ) );
		coping.castShadow = coping.receiveShadow = true;
		this.group.add( coping );

		// water surface
		const geo = new THREE.PlaneGeometry( P.x1 - P.x0, P.z1 - P.z0 ).rotateX( - Math.PI / 2 ).translate( ( P.x0 + P.x1 ) / 2, WATER_Y, ( P.z0 + P.z1 ) / 2 );
		const water = new THREE.Mesh( geo, this.waterMaterial( normals ) );
		water.receiveShadow = true;
		this.group.add( water );
		if ( this.reflection ) {

			this.reflection.target.rotateX( - Math.PI / 2 );
			this.reflection.target.position.y = WATER_Y;
			this.group.add( this.reflection.target );

		}

		this.jetZ = [];
		for ( let z = P.z0 + 4; z <= P.z1 - 4; z += 4 ) this.jetZ.push( z );
		this.group.add( this.jets() );

	}

	waterMaterial( normals ) {

		const env = this.world.env;
		const m = new THREE.MeshBasicNodeMaterial();
		const p = positionWorld;
		const t = time;
		const n1 = texture( normals, p.xz.mul( 0.11 ).add( vec2( t.mul( 0.013 ), t.mul( 0.009 ) ) ) ).xyz.mul( 2 ).sub( 1 );
		const n2 = texture( normals, p.xz.mul( 0.37 ).sub( vec2( t.mul( 0.021 ), t.mul( - 0.017 ) ) ) ).xyz.mul( 2 ).sub( 1 );
		// concentric ripples spreading from each jet's splash
		const dz = fract( p.z.sub( PLAZA.pool.z0 ).div( 4 ) ).sub( 0.5 ).mul( 4 );
		const r = length( vec2( p.x, dz ) );
		const ring = sin( r.mul( 9 ).sub( t.mul( 7 ) ) ).mul( exp( r.mul( - 0.9 ) ) ).mul( 0.35 );
		const ringN = vec2( p.x, dz ).div( r.add( 0.001 ) ).mul( ring );
		const nx = n1.x.mul( 0.6 ).add( n2.x.mul( 0.45 ) ).add( ringN.x );
		const nz = n1.y.mul( 0.6 ).add( n2.y.mul( 0.45 ) ).add( ringN.y );
		const N = normalize( vec3( nx.mul( 0.22 ), 1, nz.mul( 0.22 ) ) );

		const V = normalize( cameraPosition.sub( p ) );
		const cosT = max( dot( V, N ), 0 );
		const fresnel = pow( float( 1 ).sub( cosT ), 5 ).mul( 0.98 ).add( 0.02 );
		const R = reflect( V.negate(), N );

		let refl;
		if ( this.quality.reflections ) {

			this.reflection = reflector( { resolutionScale: 0.5 } );
			this.reflection.uvNode = this.reflection.uvNode.add( N.xz.mul( 0.035 ) );
			refl = this.reflection.rgb;

		} else {

			refl = env.envTarget ? pmremTexture( env.envTarget.texture, R, float( 0.03 ) ) : vec3( 0.5, 0.6, 0.7 );

		}

		const sunSpec = pow( max( dot( R, env.uSunDir ), 0 ), 600 ).mul( 60 ).mul( env.uSunColor ).mul( env.uSunIntensity );
		// dark basin (blue-grey tiles) seen through the surface
		const deep = color( 0x163038 ).mul( env.uDaylight.mul( 0.6 ).add( 0.2 ) ).mul( env.uSunIntensity.mul( 0.5 ).add( 0.5 ) );
		m.colorNode = mix( deep, refl, fresnel.mul( 0.92 ).add( 0.08 ) ).add( sunSpec );
		return m;

	}

	jets() {

		const P = PLAZA.pool;
		const env = this.world.env;
		const perJet = this.quality.name === 'low' ? 160 : this.quality.name === 'medium' ? 280 : 420;
		const jets = this.jetZ.length;
		const count = jets * perJet;
		const quad = new THREE.PlaneGeometry( 1, 1 );
		const geo = new THREE.InstancedBufferGeometry();
		geo.index = quad.index;
		geo.setAttribute( 'position', quad.getAttribute( 'position' ) );
		geo.setAttribute( 'uv', quad.getAttribute( 'uv' ) );
		geo.instanceCount = count;
		const jz = new Float32Array( count );
		for ( let i = 0; i < count; i ++ ) jz[ i ] = this.jetZ[ Math.floor( i / perJet ) ];
		geo.setAttribute( 'jetZ', new THREE.InstancedBufferAttribute( jz, 1 ) );

		const m = new THREE.MeshBasicNodeMaterial();
		const id = float( instanceIndex );
		const seed = hash( id.mul( 1.37 ) );
		const seed2 = hash( id.mul( 2.71 ).add( 11 ) );
		const seed3 = hash( id.mul( 5.13 ).add( 3 ) );
		const g = 9.81;
		const height = float( 4.2 ).mul( sin( attribute( 'jetZ', 'float' ).mul( 0.35 ) ).mul( 0.25 ).add( 0.85 ) ).mul( seed3.mul( 0.25 ).add( 0.8 ) );
		const vy = height.mul( 2 * g ).sqrt();
		const life = vy.mul( 2 / g ).mul( 1.0 );
		const age = fract( time.div( life ).add( seed ) ).mul( life );
		const spread = vec2( seed2.sub( 0.5 ), seed3.sub( 0.5 ) ).mul( 0.35 );
		const origin = vec3( 0, WATER_Y, attribute( 'jetZ', 'float' ) );
		const pos = origin.add( vec3( spread.x.mul( age ), vy.mul( age ).sub( age.mul( age ).mul( 0.5 * g ) ), spread.y.mul( age ) ) );
		const vel = vec3( spread.x, vy.sub( age.mul( g ) ), spread.y );

		// camera-facing quad stretched along the droplet velocity (motion streak)
		const right = vec3( cameraViewMatrix[ 0 ].x, cameraViewMatrix[ 1 ].x, cameraViewMatrix[ 2 ].x );
		const up = vec3( cameraViewMatrix[ 0 ].y, cameraViewMatrix[ 1 ].y, cameraViewMatrix[ 2 ].y );
		const size = seed2.mul( 0.05 ).add( 0.04 );
		const stretch = length( vel ).mul( 0.018 ).add( 1 );
		const velN = normalize( vel );
		const viewAxis = vec3( cameraViewMatrix[ 0 ].z, cameraViewMatrix[ 1 ].z, cameraViewMatrix[ 2 ].z );
		const along = normalize( right.mul( dot( velN, right ) ).add( up.mul( dot( velN, up ) ) ).add( vec3( 1e-4, 0, 0 ) ) );
		const side = normalize( along.cross( viewAxis ) );
		const lp = positionLocal;
		m.positionNode = pos.add( side.mul( lp.x ).mul( size ) ).add( along.mul( lp.y ).mul( size ).mul( stretch ) );

		const d = length( uv().sub( 0.5 ) ).mul( 2 );
		const soft = smoothstep( 1.0, 0.2, d );
		const fadeIn = smoothstep( 0.0, 0.08, age );
		// droplets pick up the sky and sparkle when back-lit by the sun
		const sky = env.envTarget ? pmremTexture( env.envTarget.texture, vec3( 0, 1, 0 ), float( 0.8 ) ) : vec3( 0.6 );
		const V = normalize( cameraPosition.sub( pos ) );
		const forward = pow( max( dot( V.negate(), env.uSunDir ), 0 ), 6 ).mul( 2.5 );
		const lit = sky.mul( 0.8 ).add( env.uSunColor.mul( env.uSunIntensity ).mul( forward.add( 0.35 ) ) );
		m.colorNode = lit;
		m.opacityNode = soft.mul( fadeIn ).mul( 0.42 );
		m.transparent = true;
		m.depthWrite = false;
		m.side = THREE.DoubleSide;

		const mesh = new THREE.Mesh( geo, m );
		mesh.frustumCulled = false;
		mesh.renderOrder = 2;
		return mesh;

	}

}
