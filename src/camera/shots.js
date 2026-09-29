// The cinematic sequence. Positions in metres (statue axis at x = 0, facing +Z).
// Each shot: camera path (Catmull-Rom through `pos`), aim path (`look`), lens in mm
// (animated from→to), f-stop, focus target (default: the aim point) and camera shake.
//
// Anchor names (e.g. 'face') resolve against the statue's anchor points.

export const SHOTS = [
	{
		name: 'establishing',
		caption: [ 'Dousti Square, Dushanbe', '38.5767° N · 68.7798° E' ],
		duration: 15,
		pos: [ [ 38, 58, 190 ], [ 22, 44, 140 ], [ 8, 34, 102 ] ],
		look: [ [ 0, 20, - 6 ], [ 0, 21, - 6 ], [ 0, 22, - 6 ] ],
		lens: [ 32, 36 ], fstop: 8, shake: 0.35, ease: 'inOut'
	},
	{
		name: 'approach',
		caption: [ 'Ismoili Somoni', 'Gilded bronze · 1999' ],
		duration: 13,
		pos: [ [ - 3.2, 1.65, 76 ], [ - 2.2, 1.7, 62 ], [ - 1.2, 1.75, 50 ] ],
		look: [ [ 0, 14, 0 ], [ 0, 15, 0 ], [ 0, 16, 0 ] ],
		lens: [ 55, 58 ], fstop: 2.8, focus: 'face', shake: 1, ease: 'linear'
	},
	{
		name: 'guardian',
		caption: [ 'The guardian lions', 'Stability and the nation’s peace' ],
		duration: 11,
		pos: [ [ 18, 3.1, 13 ], [ 15.5, 3.4, 11.5 ], [ 13.8, 3.6, 10.2 ] ],
		look: [ [ 9.4, 4.4, 2.6 ], [ 9.4, 4.6, 2.4 ], [ 9.3, 4.8, 2.2 ] ],
		lens: [ 85, 85 ], fstop: 2.0, shake: 0.8, ease: 'inOut'
	},
	{
		name: 'sovereign',
		caption: [ 'Founder of the Samanid state', 'Ruled 892 – 907' ],
		duration: 13,
		pos: [ [ 11, 11, 46 ], [ 6, 11.5, 47 ], [ 1, 12, 47.5 ] ],
		look: [ 'face', 'face', 'face' ],
		lens: [ 200, 220 ], fstop: 2.8, focus: 'face', shake: 0.35, ease: 'inOut'
	},
	{
		name: 'sceptre',
		caption: [ 'The seven-star sceptre', 'The stars of the Tajik emblem' ],
		duration: 11,
		pos: [ [ - 16, 16, 30 ], [ - 12, 17.5, 32 ], [ - 7, 19, 33 ] ],
		look: [ 'sceptre', 'sceptre', 'sceptre' ],
		lens: [ 180, 180 ], fstop: 2.8, focus: 'sceptre', shake: 0.3, ease: 'inOut'
	},
	{
		name: 'orbit',
		caption: [ 'Forty-three metres of stone and gold', 'Architect B. Zukhuruddinov · Sculptor L. Kerbel' ],
		duration: 17,
		orbit: { center: [ 0, 15.5, 0 ], radius: [ 21, 19 ], height: [ 13.5, 17.5 ], angle: [ 52, - 40 ] },
		look: [ [ 0, 16, 0 ], [ 0, 16.5, 0 ] ],
		lens: [ 45, 50 ], fstop: 4, focus: 'chest', shake: 0.6, ease: 'inOut'
	},
	{
		name: 'iwan',
		caption: [ 'The golden iwan', 'Muqarnas after the Samanid tradition' ],
		duration: 12,
		pos: [ [ - 7.5, 6.5, 8 ], [ - 6.5, 7.5, 6.5 ], [ - 5.2, 8.5, 5 ] ],
		look: [ [ 0, 22, - 9 ], [ 0, 24, - 9 ], [ 0, 26, - 9 ] ],
		lens: [ 24, 24 ], fstop: 5.6, shake: 0.7, ease: 'inOut'
	},
	{
		name: 'crown',
		caption: [ 'The crown of sovereignty', 'Seven stars over the portal' ],
		duration: 13,
		pos: [ [ 6, 24, 34 ], [ 4, 34, 30 ], [ 2, 44, 26 ] ],
		look: [ [ 0, 30, - 8 ], [ 0, 36, - 9 ], [ 0, 41, - 10 ] ],
		lens: [ 50, 45 ], fstop: 5.6, shake: 0.45, ease: 'inOut'
	},
	{
		name: 'trees',
		caption: [ 'Rudaki Avenue', 'Plane trees of the old boulevard' ],
		duration: 13,
		pos: [ [ - 31, 2.4, 52 ], [ - 30, 2.5, 42 ], [ - 29, 2.6, 32 ] ],
		look: [ [ 0, 15, 0 ], [ 0, 15, 0 ], [ 0, 15, 0 ] ],
		lens: [ 70, 70 ], fstop: 2.4, focus: 'chest', shake: 1, ease: 'linear'
	},
	{
		name: 'telephoto',
		caption: [ 'Beneath the Hisor range', 'Dushanbe, Tajikistan' ],
		duration: 15,
		pos: [ [ 7, 5.5, 175 ], [ 4, 5.8, 172 ], [ 1, 6, 169 ] ],
		look: [ [ 0, 22, - 6 ], [ 0, 22, - 6 ], [ 0, 22, - 6 ] ],
		lens: [ 105, 115 ], fstop: 5.6, focus: 'chest', shake: 0.3, ease: 'inOut'
	}
];
