#!/usr/bin/env node
// Headless screenshot harness (Chromium + WebGPU via SwiftShader).
//
//   node tools/shoot.mjs "<path?query>" out.png [width] [height] [timeoutMs]
//   node tools/shoot.mjs --batch shots.json
//
// Starts a Vite dev server on the project, loads the page and waits for
// `window.__ready` before capturing. Console errors are printed.

import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const args = process.argv.slice( 2 );
let jobs;
if ( args[ 0 ] === '--batch' ) jobs = JSON.parse( fs.readFileSync( args[ 1 ], 'utf8' ) );
else jobs = [ { url: args[ 0 ], out: args[ 1 ], width: + ( args[ 2 ] || 640 ), height: + ( args[ 3 ] || 800 ), timeout: + ( args[ 4 ] || 240000 ) } ];

const server = await createServer( { configFile: 'vite.config.js', server: { port: 5199, strictPort: false }, logLevel: 'error' } );
await server.listen();
const port = server.config.server.port;
const base = `http://localhost:${server.httpServer.address().port}`;

const browser = await chromium.launch( {
	executablePath: CHROME,
	args: [ '--no-sandbox', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader', '--use-angle=swiftshader' ]
} );

for ( const job of jobs ) {

	const page = await browser.newPage( { viewport: { width: job.width || 640, height: job.height || 800 } } );
	page.on( 'console', ( m ) => {

		const t = m.type();
		if ( t === 'error' || t === 'warning' || job.verbose ) console.log( `  [${t}] ${m.text().slice( 0, 400 )}` );

	} );
	page.on( 'pageerror', ( e ) => console.log( `  [pageerror] ${e.message}` ) );
	const t0 = Date.now();
	await page.goto( base + job.url, { waitUntil: 'commit' } );
	try {

		await page.waitForFunction( () => window.__ready === true, null, { timeout: job.timeout || 240000, polling: 500 } );

	} catch ( e ) {

		console.log( `  timeout waiting for __ready on ${job.url}` );

	}

	if ( job.wait ) await page.waitForTimeout( job.wait );
	await page.screenshot( { path: job.out, timeout: 180000 } );
	console.log( `✓ ${job.out}  (${( ( Date.now() - t0 ) / 1000 ).toFixed( 1 )}s)` );
	await page.close();

}

await browser.close();
await server.close();
void port;
