#!/usr/bin/env node
// Builds the sculpted hero assets (statue, lions, crown) from their SDF
// definitions into Meshopt-compressed GLB LODs under public/assets/models.
//
//   node tools/build-models.mjs                 # all models, production quality
//   node tools/build-models.mjs statue --draft  # one model, coarse voxels (fast preview)

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { meshSDF } from './sdf/mesher.mjs';
import { simplifyMesh, transformMesh, writeGLB } from './sdf/export.mjs';

const root = path.dirname( fileURLToPath( import.meta.url ) );
const outDir = path.join( root, '..', 'public', 'assets', 'models' );
fs.mkdirSync( outDir, { recursive: true } );

const MODELS = {
	statue: {
		module: 'models/statue.mjs', factory: 'statue', h: 0.0036, aoDist: 0.09,
		lods: [ { ratio: 0.3, error: 0.0004 }, { ratio: 0.08, error: 0.002 }, { ratio: 0.015, error: 0.01 } ],
		material: { name: 'gilded_bronze', color: [ 1, 0.77, 0.36, 1 ], metalness: 1, roughness: 0.28 }
	},
	lion: {
		module: 'models/lion.mjs', factory: 'lion', h: 0.008, aoDist: 0.2,
		lods: [ { ratio: 0.3, error: 0.0005 }, { ratio: 0.06, error: 0.003 } ],
		material: { name: 'bronze', color: [ 0.95, 0.72, 0.38, 1 ], metalness: 1, roughness: 0.35 }
	},
	crown: {
		module: 'models/crown.mjs', factory: 'crown', h: 0.016, aoDist: 0.25,
		lods: [ { ratio: 0.3, error: 0.0005 }, { ratio: 0.06, error: 0.003 } ],
		material: { name: 'gold', color: [ 1, 0.8, 0.4, 1 ], metalness: 1, roughness: 0.22 }
	}
};

const args = process.argv.slice( 2 );
const draft = args.includes( '--draft' );
const names = args.filter( ( a ) => ! a.startsWith( '--' ) );
const list = names.length ? names : Object.keys( MODELS );

for ( const name of list ) {

	const cfg = MODELS[ name ];
	if ( ! cfg ) throw new Error( `unknown model ${name}` );
	const modelPath = path.join( root, cfg.module );
	const mod = await import( modelPath );
	const model = mod[ cfg.factory ]();
	const h = draft ? cfg.h * 2.2 : cfg.h;
	console.log( `▸ ${name}  (voxel ${h})` );

	const t0 = Date.now();
	const raw = await meshSDF( { modelPath, exportName: cfg.factory, bounds: model.bounds, h, aoDist: cfg.aoDist, curvScale: h * 3 } );
	const scale = model.worldScale || 1;

	const lods = draft ? [ cfg.lods[ 0 ] ] : cfg.lods;
	for ( let i = 0; i < lods.length; i ++ ) {

		const { mesh, error } = await simplifyMesh( raw, lods[ i ].ratio, lods[ i ].error );
		transformMesh( mesh, scale );
		const file = path.join( outDir, `${name}_lod${i}.glb` );
		await writeGLB( file, [ { name, mesh, material: cfg.material } ] );
		const kb = ( fs.statSync( file ).size / 1024 ).toFixed( 0 );
		console.log( `  lod${i}: ${mesh.indices.length / 3} tris, err ${error.toExponential( 2 )} → ${path.relative( process.cwd(), file )} (${kb} KB)` );

	}

	console.log( `  done in ${( ( Date.now() - t0 ) / 1000 ).toFixed( 1 )}s` );

}
