import './core/webgpu-compat.js';
import './ui/style.css';
import * as THREE from 'three/webgpu';
import { detectQuality, DynamicResolution } from './core/quality.js';
import { Assets } from './core/assets.js';
import { World } from './world/world.js';
import { Pipeline } from './render/pipeline.js';
import { Director } from './camera/director.js';
import { UI } from './ui/ui.js';

const params = new URLSearchParams( location.search );

async function hasWebGPU() {

	if ( params.has( 'webgl' ) || ! navigator.gpu ) return false;
	try {

		return !! ( await navigator.gpu.requestAdapter() );

	} catch {

		return false;

	}

}

async function boot() {

	const ui = new UI();
	if ( params.has( 'clean' ) ) document.body.classList.add( 'clean' );
	const webgpu = await hasWebGPU();
	const quality = detectQuality( webgpu );

	const canvas = document.getElementById( 'view' );
	const renderer = new THREE.WebGPURenderer( { canvas, antialias: false, forceWebGL: ! webgpu, powerPreference: 'high-performance' } );
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = THREE.PCFShadowMap;
	const dyn = new DynamicResolution( renderer, quality );
	renderer.setPixelRatio( dyn.initial() );
	renderer.setSize( window.innerWidth, window.innerHeight );
	await renderer.init();
	ui.badge( `${renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL 2'} · ${quality.name}` );

	const camera = new THREE.PerspectiveCamera( 35, window.innerWidth / window.innerHeight, 0.3, 16000 );
	camera.position.set( 30, 50, 180 );
	camera.lookAt( 0, 20, 0 );

	const assets = new Assets( renderer, ( p ) => ui.progress( p * 0.9 ) );
	if ( document.fonts?.load ) await Promise.race( [ document.fonts.load( '600 64px "Cormorant Garamond"' ), new Promise( ( r ) => setTimeout( r, 1500 ) ) ] );

	const hours = parseFloat( params.get( 'time' ) || '17.4' );
	ui.timeInput.value = hours;
	ui.showTime( hours );
	const world = new World( { renderer, quality, assets } );
	await world.build( { hours, onStage: ( s ) => ui.stage( s ) } );

	const TONE = { agx: THREE.AgXToneMapping, aces: THREE.ACESFilmicToneMapping, neutral: THREE.NeutralToneMapping };
	const pipeline = new Pipeline( renderer, world.scene, camera, quality, { toneMapping: TONE[ params.get( 'tm' ) ] || THREE.ACESFilmicToneMapping } );
	if ( params.has( 'exp' ) ) pipeline.exposure.value = parseFloat( params.get( 'exp' ) );
	if ( params.has( 'fog' ) ) {

		world.env.fogScale = parseFloat( params.get( 'fog' ) );
		world.env.setTime( hours, { updateEnv: false } );

	}
	const director = new Director( { camera, dom: canvas, world, pipeline, ui, renderer } );

	ui.stage( 'Compiling shaders' );
	await renderer.compileAsync( world.scene, camera );

	// ---------------------------------------------------------------- wiring
	ui.on( 'mode', ( m ) => director.setMode( m ) );
	ui.on( 'next', () => director.mode === 'cinematic' && director.next() );
	let pendingTime = null;
	ui.on( 'time', ( h ) => ( pendingTime = h ) );

	window.addEventListener( 'resize', () => {

		camera.aspect = window.innerWidth / window.innerHeight;
		camera.updateProjectionMatrix();
		renderer.setPixelRatio( dyn.clampToBudget( dyn.scale ) );
		renderer.setSize( window.innerWidth, window.innerHeight );
		ui.letterbox( director.mode === 'cinematic' );

	} );

	if ( params.get( 'mode' ) === 'explore' ) director.setMode( 'explore' );
	else director.start();

	// ------------------------------------------------------------------ loop
	const timer = new THREE.Timer();
	let frames = 0;
	let lastTimeUpdate = 0;
	const loop = () => {

		timer.update();
		const dt = Math.min( timer.getDelta(), 1 / 15 );
		const t = timer.getElapsed();

		if ( pendingTime !== null && t - lastTimeUpdate > 0.12 ) {

			world.setTime( pendingTime );
			pendingTime = null;
			lastTimeUpdate = t;

		}

		director.update( dt );
		world.update( dt, t, camera );
		pipeline.render();

		if ( dyn.update( dt * 1000 ) ) renderer.setPixelRatio( dyn.scale );
		if ( ++ frames === 3 ) window.__ready = true;

	};

	renderer.setAnimationLoop( loop );
	ui.ready();
	ui.letterbox( director.mode === 'cinematic' );
	if ( director.mode === 'cinematic' && ! params.has( 'shot' ) ) ui.titleCard();

	// expose for debugging / automated captures
	window.__somoni = { renderer, world, director, pipeline, camera, quality };

}

boot().catch( ( err ) => {

	console.error( err );
	const ui = new UI();
	ui.error( 'Unable to start the renderer', 'This experience needs a browser with WebGPU or WebGL 2 support. ' + ( err?.message || '' ) );

} );
