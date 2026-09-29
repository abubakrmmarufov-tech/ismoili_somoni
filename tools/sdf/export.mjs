// LOD generation and Meshopt-compressed GLB export.

import { Document, NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization, KHRMaterialsClearcoat } from '@gltf-transform/extensions';
import { reorder, quantize, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

export async function simplifyMesh( mesh, targetRatio, targetError ) {

	await MeshoptSimplifier.ready;
	const { positions, normals, colors, indices } = mesh;
	const vcount = positions.length / 3;
	// attributes: normal xyz + ao + curvature, weighted so shading detail survives
	const attrs = new Float32Array( vcount * 5 );
	for ( let v = 0; v < vcount; v ++ ) {

		attrs[ v * 5 ] = normals[ v * 3 ];
		attrs[ v * 5 + 1 ] = normals[ v * 3 + 1 ];
		attrs[ v * 5 + 2 ] = normals[ v * 3 + 2 ];
		attrs[ v * 5 + 3 ] = colors[ v * 4 ];
		attrs[ v * 5 + 4 ] = colors[ v * 4 + 1 ];

	}

	const target = Math.floor( indices.length * targetRatio / 3 ) * 3;
	const [ out, err ] = MeshoptSimplifier.simplifyWithAttributes(
		indices, positions, 3, attrs, 5, [ 0.35, 0.35, 0.35, 0.2, 0.1 ], null, target, targetError, []
	);
	return { mesh: compact( { positions, normals, colors, indices: out } ), error: err };

}

export function compact( { positions, normals, colors, indices } ) {

	const remap = new Int32Array( positions.length / 3 ).fill( - 1 );
	let n = 0;
	for ( const i of indices ) if ( remap[ i ] < 0 ) remap[ i ] = n ++;
	const P = new Float32Array( n * 3 ), N = new Float32Array( n * 3 ), C = new Float32Array( n * 4 );
	for ( let v = 0; v < remap.length; v ++ ) {

		const r = remap[ v ];
		if ( r < 0 ) continue;
		P.set( positions.subarray( v * 3, v * 3 + 3 ), r * 3 );
		N.set( normals.subarray( v * 3, v * 3 + 3 ), r * 3 );
		C.set( colors.subarray( v * 4, v * 4 + 4 ), r * 4 );

	}

	const I = new Uint32Array( indices.length );
	for ( let i = 0; i < indices.length; i ++ ) I[ i ] = remap[ indices[ i ] ];
	return { positions: P, normals: N, colors: C, indices: I };

}

/** Apply a uniform scale + offset (model units → metres). */
export function transformMesh( mesh, scale, offset = [ 0, 0, 0 ] ) {

	const P = mesh.positions;
	for ( let i = 0; i < P.length; i += 3 ) {

		P[ i ] = P[ i ] * scale + offset[ 0 ];
		P[ i + 1 ] = P[ i + 1 ] * scale + offset[ 1 ];
		P[ i + 2 ] = P[ i + 2 ] * scale + offset[ 2 ];

	}

	return mesh;

}

/**
 * Writes one or more named meshes to a GLB with EXT_meshopt_compression.
 * @param {string} file
 * @param {{name:string, mesh:object, material?:object}[]} parts
 */
export async function writeGLB( file, parts, { level = 'high' } = {} ) {

	await MeshoptEncoder.ready;
	const doc = new Document();
	const buffer = doc.createBuffer();
	const scene = doc.createScene( 'Scene' );

	for ( const { name, mesh, material } of parts ) {

		const m = material || {};
		const mat = doc.createMaterial( m.name || name )
			.setBaseColorFactor( m.color || [ 1, 0.78, 0.34, 1 ] )
			.setMetallicFactor( m.metalness ?? 1 )
			.setRoughnessFactor( m.roughness ?? 0.3 );

		// COLOR_0 carries baked cavity AO (r), curvature (g) and a region mask (b);
		// it is exported as a custom attribute so viewers don't tint the model with it.
		const prim = doc.createPrimitive()
			.setAttribute( 'POSITION', doc.createAccessor().setType( 'VEC3' ).setArray( mesh.positions ).setBuffer( buffer ) )
			.setAttribute( 'NORMAL', doc.createAccessor().setType( 'VEC3' ).setArray( mesh.normals ).setBuffer( buffer ) )
			.setAttribute( '_BAKE', doc.createAccessor().setType( 'VEC4' ).setArray( toUnorm8( mesh.colors ) ).setNormalized( true ).setBuffer( buffer ) )
			.setIndices( doc.createAccessor().setType( 'SCALAR' ).setArray( mesh.indices ).setBuffer( buffer ) )
			.setMaterial( mat );

		const gmesh = doc.createMesh( name ).addPrimitive( prim );
		scene.addChild( doc.createNode( name ).setMesh( gmesh ) );

	}

	await doc.transform(
		reorder( { encoder: MeshoptEncoder, target: 'size' } ),
		quantize( { quantizePosition: 16, quantizeNormal: 10, pattern: /^(POSITION|NORMAL)$/ } ),
		meshopt( { encoder: MeshoptEncoder, level } )
	);

	const io = new NodeIO()
		.registerExtensions( [ EXTMeshoptCompression, KHRMeshQuantization, KHRMaterialsClearcoat ] )
		.registerDependencies( { 'meshopt.encoder': MeshoptEncoder } );
	await io.write( file, doc );

}

function toUnorm8( f ) {

	const out = new Uint8Array( f.length );
	for ( let i = 0; i < f.length; i ++ ) out[ i ] = Math.round( Math.max( 0, Math.min( 1, f[ i ] ) ) * 255 );
	return out;

}
