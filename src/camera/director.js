// Camera director: plays the cinematic sequence with physically-derived lens
// behaviour (field of view from focal length, thin-lens depth of field, focus
// pulls) and organic operator motion; hands over to orbit controls in Explore.

import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SHOTS } from './shots.js';

const SENSOR_W = 36; // mm (full-frame)
const _v = new THREE.Vector3();
const _look = new THREE.Vector3();

const EASE = {
	linear: ( t ) => t,
	inOut: ( t ) => t * t * ( 3 - 2 * t ),
	soft: ( t ) => 0.5 - 0.5 * Math.cos( Math.PI * t )
};

// smooth pseudo-random motion (sum of incommensurate sines)
function wobble( t, seed ) {

	return Math.sin( t * 0.71 + seed ) * 0.5 + Math.sin( t * 1.37 + seed * 2.1 ) * 0.3 + Math.sin( t * 2.93 + seed * 3.7 ) * 0.2;

}

export class Director {

	constructor( { camera, dom, world, pipeline, ui, renderer } ) {

		this.camera = camera;
		this.world = world;
		this.pipeline = pipeline;
		this.ui = ui;
		this.renderer = renderer;
		this.shots = SHOTS.map( ( s ) => this.compile( s ) );
		this.index = 0;
		this.t = 0;
		this.mode = 'cinematic';
		this.focus = 30;
		this.focusVel = 0;
		this.lens = 35;
		this.fstop = 4;
		this.fade = 1;

		this.controls = new OrbitControls( camera, dom );
		this.controls.enableDamping = true;
		this.controls.dampingFactor = 0.06;
		this.controls.minDistance = 5;
		this.controls.maxDistance = 420;
		this.controls.maxPolarAngle = Math.PI * 0.495;
		this.controls.target.set( 0, 14, 0 );
		this.controls.enabled = false;
		this.controls.addEventListener( 'start', () => ( this.lastInput = performance.now() ) );

		const q = new URLSearchParams( location.search );
		if ( q.has( 'shot' ) ) {

			this.index = Math.max( 0, SHOTS.findIndex( ( s ) => s.name === q.get( 'shot' ) ) );
			this.t = parseFloat( q.get( 't' ) || '0.5' ) * this.shots[ this.index ].duration;
			this.frozen = q.has( 'freeze' );

		}

	}

	compile( s ) {

		const anchors = this.world.statue.anchors();
		const resolve = ( p ) => ( typeof p === 'string' ? anchors[ p ].clone() : new THREE.Vector3( ...p ) );
		const shot = { ...s };
		if ( s.orbit ) {

			const o = s.orbit;
			const pts = [];
			for ( let i = 0; i <= 8; i ++ ) {

				const k = i / 8;
				const a = THREE.MathUtils.degToRad( THREE.MathUtils.lerp( o.angle[ 0 ], o.angle[ 1 ], k ) );
				const r = THREE.MathUtils.lerp( o.radius[ 0 ], o.radius[ 1 ], k );
				pts.push( new THREE.Vector3( o.center[ 0 ] + Math.sin( a ) * r, THREE.MathUtils.lerp( o.height[ 0 ], o.height[ 1 ], k ), o.center[ 2 ] + Math.cos( a ) * r ) );

			}

			shot.posCurve = new THREE.CatmullRomCurve3( pts, false, 'centripetal' );

		} else {

			shot.posCurve = new THREE.CatmullRomCurve3( s.pos.map( resolve ), false, 'centripetal' );

		}

		shot.lookCurve = new THREE.CatmullRomCurve3( s.look.map( resolve ), false, 'centripetal' );
		shot.focusPoint = s.focus ? resolve( s.focus ) : null;
		shot.ease = EASE[ s.ease || 'inOut' ];
		return shot;

	}

	setMode( mode ) {

		if ( mode === this.mode ) return;
		this.mode = mode;
		const c = this.controls;
		if ( mode === 'explore' ) {

			// start orbiting from wherever the cinematic camera is
			c.target.copy( this.currentLook || new THREE.Vector3( 0, 14, 0 ) );
			if ( c.target.distanceTo( this.camera.position ) > 160 ) c.target.set( 0, 14, 0 );
			c.enabled = true;
			c.update();
			this.lens = 35;
			this.lastInput = performance.now();

		} else {

			c.enabled = false;
			this.cut( ( this.index + 1 ) % this.shots.length );

		}

		this.ui?.setMode( mode );

	}

	cut( index ) {

		this.index = index;
		this.t = 0;
		this.fade = 1;
		this.focusVel = 0;
		this.snapFocus = true;
		this.ui?.caption( this.shots[ index ].caption );

	}

	/** Begins playback at the current shot without resetting a requested start time. */
	start() {

		this.fade = this.t > 0 ? 0 : 1;
		this.snapFocus = true;
		this.ui?.caption( this.shots[ this.index ].caption );

	}

	next() {

		this.cut( ( this.index + 1 ) % this.shots.length );

	}

	update( dt ) {

		if ( this.mode === 'explore' ) this.updateExplore( dt );
		else this.updateCinematic( dt );
		this.updateLens( dt );

	}

	updateCinematic( dt ) {

		const shot = this.shots[ this.index ];
		if ( ! this.frozen ) this.t += dt;
		if ( this.t >= shot.duration ) {

			this.next();
			return this.updateCinematic( 0 );

		}

		const u = shot.ease( THREE.MathUtils.clamp( this.t / shot.duration, 0, 1 ) );
		shot.posCurve.getPointAt( u, this.camera.position );
		shot.lookCurve.getPointAt( u, _look );
		this.currentLook = _look.clone();

		// operator: slow breathing drift + a little rotational wander
		const time = performance.now() / 1000;
		const amp = ( shot.shake ?? 0.5 );
		const lensDamp = 35 / Math.max( 35, this.lens );
		this.camera.position.x += wobble( time, 1.3 ) * 0.035 * amp;
		this.camera.position.y += wobble( time, 4.1 ) * 0.025 * amp;
		this.camera.position.z += wobble( time, 7.7 ) * 0.02 * amp;
		this.camera.lookAt( _look );
		this.camera.rotateX( wobble( time * 1.1, 2.2 ) * 0.0018 * amp * lensDamp );
		this.camera.rotateY( wobble( time * 0.9, 5.3 ) * 0.0022 * amp * lensDamp );
		this.camera.rotateZ( wobble( time * 0.6, 8.8 ) * 0.0012 * amp );

		this.lens = THREE.MathUtils.lerp( shot.lens[ 0 ], shot.lens[ 1 ], u );
		this.fstop = shot.fstop;
		const fp = shot.focusPoint || _look;
		this.focusTarget = _v.copy( fp ).sub( this.camera.position ).dot( this.camera.getWorldDirection( new THREE.Vector3() ) );

		// dip to black around cuts
		const tIn = this.t, tOut = shot.duration - this.t;
		this.fade = Math.max( 1 - THREE.MathUtils.clamp( tIn / 0.6, 0, 1 ), 1 - THREE.MathUtils.clamp( tOut / 0.35, 0, 1 ) );

	}

	updateExplore( dt ) {

		this.controls.update();
		this.fade = Math.max( 0, this.fade - dt * 2 );
		this.fstop = 5.6;
		this.lens = 35;
		// focus on whatever sits at the orbit target
		this.focusTarget = this.controls.target.distanceTo( this.camera.position );
		if ( performance.now() - this.lastInput > 90000 ) this.setMode( 'cinematic' );

	}

	updateLens( dt ) {

		const cam = this.camera;
		const aspect = cam.aspect;
		// horizontal field of view from the focal length; portrait screens keep a sane vertical fov
		const hfov = 2 * Math.atan( SENSOR_W / ( 2 * this.lens ) );
		let vfov = 2 * Math.atan( Math.tan( hfov / 2 ) / aspect );
		vfov = Math.min( vfov, THREE.MathUtils.degToRad( 75 ) );
		cam.fov = THREE.MathUtils.radToDeg( vfov );
		cam.updateProjectionMatrix();

		// critically damped focus pull (a focus puller never snaps)
		if ( this.snapFocus ) {

			this.focus = this.focusTarget;
			this.snapFocus = false;

		}

		const k = 5.5;
		const x = this.focus - this.focusTarget;
		this.focusVel += ( - k * k * x - 2 * k * this.focusVel ) * Math.min( dt, 0.05 );
		this.focus += this.focusVel * Math.min( dt, 0.05 );

		// thin-lens circle of confusion at infinity → blur radius in pixels
		const f = this.lens, s = Math.max( this.focus * 1000, f * 1.5 );
		const cocInf = ( f * f ) / ( this.fstop * ( s - f ) ); // mm on the sensor
		const size = this.renderer.getDrawingBufferSize( new THREE.Vector2() );
		const sensorW = aspect >= 1 ? SENSOR_W : SENSOR_W * aspect;
		const blurPx = cocInf / sensorW * size.x * 0.5;
		const p = this.pipeline;
		p.focus.value = Math.max( 0.5, this.focus );
		p.dofRange.value = Math.max( 0.6, this.focus * 1.4 );
		p.bokeh.value = THREE.MathUtils.clamp( blurPx, 0, 22 );
		p.fade.value = this.fade;

	}

}
