// Dev-only turntable preview for sculpted GLBs: ?model=statue_lod0&views=4
import '../../src/core/webgpu-compat.js';
import * as THREE from 'three/webgpu';
import { attribute, float, mix, vec3 } from 'three/tsl';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const q = new URLSearchParams( location.search );
const model = q.get( 'model' ) || 'statue_lod0';
const view = parseFloat( q.get( 'az' ) || '0' );
const elev = parseFloat( q.get( 'el' ) || '8' );
const zoom = parseFloat( q.get( 'zoom' ) || '1' );
const focusY = q.get( 'y' );
const mode = q.get( 'mode' ) || 'gold';

const renderer = new THREE.WebGPURenderer( { antialias: true } );
renderer.setSize( innerWidth, innerHeight );
renderer.toneMapping = THREE.AgXToneMapping;
document.body.appendChild( renderer.domElement );
await renderer.init();

const scene = new THREE.Scene();
scene.background = new THREE.Color( 0x6b7178 );
const pmrem = new THREE.PMREMGenerator( renderer );
scene.environment = pmrem.fromScene( new RoomEnvironment(), 0.03 ).texture;
scene.environmentIntensity = 0.6;
const sun = new THREE.DirectionalLight( 0xfff1dd, 3 );
sun.position.set( 3, 6, 5 );
scene.add( sun );

const gltf = await new GLTFLoader().setMeshoptDecoder( MeshoptDecoder ).loadAsync( `/public/assets/models/${model}.glb` );
const obj = gltf.scene;
obj.traverse( ( o ) => {

	if ( ! o.isMesh ) return;
	const bake = attribute( '_bake', 'vec4' );
	const m = new THREE.MeshStandardNodeMaterial();
	if ( mode === 'clay' ) {

		m.colorNode = vec3( 0.75 ).mul( bake.x );
		m.roughness = 0.8; m.metalness = 0;

	} else if ( mode === 'ao' ) {

		m.colorNode = vec3( bake.x, bake.y, bake.z );
		m.roughness = 1; m.metalness = 0;

	} else {

		m.colorNode = mix( vec3( 0.25, 0.16, 0.06 ), vec3( 1.0, 0.72, 0.3 ), bake.x.pow( 1.5 ) );
		m.metalness = 1; m.roughnessNode = float( 0.32 ).sub( bake.y.sub( 0.5 ).mul( 0.3 ) );

	}

	o.material = m;

} );
scene.add( obj );

const box = new THREE.Box3().setFromObject( obj );
const size = box.getSize( new THREE.Vector3() );
const center = box.getCenter( new THREE.Vector3() );
if ( focusY !== null ) center.y = parseFloat( focusY ) * size.y + box.min.y;
const cam = new THREE.PerspectiveCamera( 30, innerWidth / innerHeight, 0.01, 1000 );
const dist = size.y * 2.2 / zoom;
const az = THREE.MathUtils.degToRad( view ), el = THREE.MathUtils.degToRad( elev );
cam.position.set( center.x + Math.sin( az ) * Math.cos( el ) * dist, center.y + Math.sin( el ) * dist, center.z + Math.cos( az ) * Math.cos( el ) * dist );
cam.lookAt( center );
await renderer.renderAsync( scene, cam );
window.__ready = true;
