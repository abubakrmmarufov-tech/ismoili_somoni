// Minimal cinematic chrome: loader, title card, lower thirds, controls.

export class UI {

	constructor() {

		this.$ = ( s ) => document.querySelector( s );
		this.loader = this.$( '#loader' );
		this.fill = this.$( '#loader .fill' );
		this.stageEl = this.$( '#loader .stage' );
		this.captionEl = this.$( '#caption' );
		this.timeInput = this.$( '#time' );
		this.timeOut = this.$( '#time-out' );
		this.handlers = {};
		this.progressValue = 0;
		this.idleTimer = null;

		for ( const b of document.querySelectorAll( '#controls [data-mode]' ) ) {

			b.addEventListener( 'click', () => this.emit( 'mode', b.dataset.mode ) );

		}

		this.timeInput.addEventListener( 'input', () => {

			this.showTime( + this.timeInput.value );
			this.emit( 'time', + this.timeInput.value );

		} );

		this.$( '#fullscreen' ).addEventListener( 'click', () => this.toggleFullscreen() );

		window.addEventListener( 'keydown', ( e ) => {

			if ( e.target instanceof HTMLInputElement && e.key !== 'Escape' ) return;
			const k = e.key.toLowerCase();
			if ( k === 'c' ) this.emit( 'mode', 'cinematic' );
			else if ( k === 'e' ) this.emit( 'mode', 'explore' );
			else if ( k === 'f' ) this.toggleFullscreen();
			else if ( k === 'n' ) this.emit( 'next' );
			else if ( k === 't' ) this.timeInput.focus();

		} );

		const wake = () => {

			document.body.classList.remove( 'idle' );
			clearTimeout( this.idleTimer );
			this.idleTimer = setTimeout( () => document.body.classList.add( 'idle' ), 3500 );

		};

		for ( const ev of [ 'pointermove', 'pointerdown', 'keydown', 'touchstart' ] ) window.addEventListener( ev, wake, { passive: true } );
		wake();

	}

	on( name, fn ) {

		this.handlers[ name ] = fn;

	}

	emit( name, ...args ) {

		this.handlers[ name ]?.( ...args );

	}

	progress( v ) {

		this.progressValue = Math.max( this.progressValue, v );
		this.fill.style.width = `${( this.progressValue * 100 ).toFixed( 1 )}%`;

	}

	stage( text ) {

		this.stageEl.textContent = text;

	}

	ready() {

		this.progress( 1 );
		document.body.classList.add( 'ready' );
		this.loader.classList.add( 'done' );

	}

	titleCard( ms = 5200 ) {

		const card = this.$( '#title-card' );
		card.classList.add( 'show' );
		return new Promise( ( r ) => setTimeout( () => {

			card.classList.remove( 'show' );
			r();

		}, ms ) );

	}

	letterbox( on ) {

		const h = window.innerWidth / window.innerHeight > 1.2 ? Math.max( 0, ( window.innerHeight - window.innerWidth / 2.39 ) / 2 ) : 0;
		document.documentElement.style.setProperty( '--bar', on ? `${Math.round( h )}px` : '0px' );

	}

	caption( lines ) {

		const el = this.captionEl;
		el.classList.remove( 'show' );
		clearTimeout( this.captionTimer );
		if ( ! lines ) return;
		this.captionTimer = setTimeout( () => {

			el.querySelector( '.line1' ).textContent = lines[ 0 ] || '';
			el.querySelector( '.line2' ).textContent = lines[ 1 ] || '';
			el.classList.add( 'show' );
			this.captionTimer = setTimeout( () => el.classList.remove( 'show' ), 6200 );

		}, 1400 );

	}

	setMode( mode ) {

		for ( const b of document.querySelectorAll( '#controls [data-mode]' ) ) b.classList.toggle( 'active', b.dataset.mode === mode );
		document.body.classList.toggle( 'explore', mode === 'explore' );
		this.letterbox( mode === 'cinematic' );
		if ( mode === 'explore' ) {

			this.caption( null );
			const hint = this.$( '#hint' );
			hint.classList.add( 'show' );
			setTimeout( () => hint.classList.remove( 'show' ), 5000 );

		}

	}

	showTime( h ) {

		const hh = Math.floor( h ), mm = Math.round( ( h - hh ) * 60 );
		this.timeOut.textContent = `${String( hh ).padStart( 2, '0' )}:${String( mm % 60 ).padStart( 2, '0' )}`;

	}

	badge( text ) {

		this.$( '#badge' ).textContent = text;

	}

	toggleFullscreen() {

		if ( document.fullscreenElement ) document.exitFullscreen?.();
		else document.documentElement.requestFullscreen?.().catch( () => {} );

	}

	error( title, message ) {

		const div = document.createElement( 'div' );
		div.id = 'error';
		div.innerHTML = `<div><strong></strong><span></span></div>`;
		div.querySelector( 'strong' ).textContent = title;
		div.querySelector( 'span' ).textContent = message;
		document.body.appendChild( div );

	}

}
