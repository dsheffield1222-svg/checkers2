import 'dotenv/config';

import path from 'node:path'; //handling, transforming, and validating file and directory paths across different operating systems.
import { promises as fs } from 'node:fs'; // import the promise-based file system API.
import { fileURLToPath } from 'node:url';


import express from 'express'
import { resolveCpuMove } from './cpu_movement/index.js';
const app = express();
const port = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.dirname(__filename);
const savesDir = path.join(rootDir, 'data')// creates the path to the data directory /home/dame/checkers2/data
const twoDGameSavePath = path.join(savesDir, '2d-game-save.json');


// Simple throttle: one CPU move request at a time to avoid rate-limit hammering
let cpuMoveInProgress = false;
const cpuMoveQueue = [];

async function processCpuMoveQueue() {
    if(cpuMoveInProgress || cpuMoveQueue.length === 0) return;
    cpuMoveInProgress = true;
    const { handler } = cpuMoveQueue.shift();
    try {
        await handler();
    } finally {
        cpuMoveInProgress = false;
        processCpuMoveQueue();
        if(cpuMoveQueue.length > 0) {
            setImmediate(processCpuMoveQueue);
        }
    }
};

function withThrottle(handler) {
    return (req, res) => {
        cpuMoveQueue.push({ handler: () => handler(req, res) });
        processCpuMoveQueue();
    };
}

async function ensureSavesDir() {
    await fs.mkdir(savesDir, { recursive: true });
}

function isValid2dGameState(state) {
    if (!state || typeof state !== 'object') return false;
    if (!Array.isArray(state.board) || state.board.length !== 8) return false;
    if (!Array.isArray(state.pieces)) return false;
    if (state.score && typeof state.score !== 'object') return false;
    return true;
}

function isCoordinateMove(move) {
	return Boolean(
		move &&
		Array.isArray(move.from) &&
		Array.isArray(move.to) &&
		move.from.length === 2 &&
		move.to.length === 2 &&
		move.from.every(Number.isInteger) &&
		move.to.every(Number.isInteger)
	);
}

function buildLegalMoveIndex(legalMoves) {
	const validMoveIds = new Set();
	const legalMoveByCoordinates = new Map();

	for (const move of legalMoves) {
		if (!Number.isInteger(move.moveId)) {
			throw new Error('Each legal move must include an integer moveId.');
		}

		validMoveIds.add(move.moveId);

		const key = [
			move.piece.row,
			move.piece.col,
			move.target.row,
			move.target.col
		].join(',');

		legalMoveByCoordinates.set(key, move.moveId);
	}

	return {
		validMoveIds,
		legalMoveByCoordinates
	};
}

function resolveMoveIdFromCoordinates(moveId, move, legalMoveByCoordinates) {
	if (Number.isInteger(moveId)) return moveId;
	if (!isCoordinateMove(move)) return null;

	const key = [
		move.from[0],
		move.from[1],
		move.to[0],
		move.to[1]
	].join(',');

	return legalMoveByCoordinates.get(key) ?? null;
}

// Serve all project static files under /checkers (script, styles, images, favicons).
app.use(express.static(path.join(rootDir, "public")));

//rate limit the size of incoming JSON payloads to 1MB to prevent abuse or accidental large payloads.
app.use(express.json({ limit: '1mb' }));

app.get('/', (req, res) => {
    res.redirect('/checkers/2D');
});

app.get('/api/checkers/2d/save', async (req, res) => {
    try {
        const rawData = await fs.readFile(twoDGameSavePath, 'utf-8');
        const payload = JSON.parse(rawData);
        return res.json(payload);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return res.status(404).json({ error: 'No saved game found.' });
        }
        return res.status(500).json({ error: 'Failed to read saved game.' });
    }
});

app.post('/api/checkers/2d/save', async (req, res) => {
    const { state } = req.body || {};
    if (!isValid2dGameState(state)) {
        return res.status(400).json({ error: 'Invalid game state.' });
    }
    const payload = { state, savedAt: new Date().toISOString() };
    try {
        await ensureSavesDir();
        await fs.writeFile(twoDGameSavePath, JSON.stringify(payload, null, 2), 'utf-8');
        return res.status(201).json(payload);
    } catch (error) {
        return res.status(500).json({ error: 'Failed to save game state.' });
    }
});

app.post('/api/checkers/2d/cpu-move', withThrottle(async (req, res) => {
	const { state, legalMoves, difficulty } = req.body || {};
    if( difficulty === 'hard'){
        return res.status(500).json({ message: 'Hard difficulty is not available' });
    }

	if (!isValid2dGameState(state) || !Array.isArray(legalMoves) || legalMoves.length === 0) {
		return res.status(400).json({ message: 'Invalid CPU move payload.' });
	}

	let moveIndex;
	try {
		moveIndex = buildLegalMoveIndex(legalMoves);
	} catch {
		return res.status(400).json({ message: 'Each legal move must include an integer moveId.' });
	}

	try {
		const resolved = await resolveCpuMove({
			state,
			legalMoves,
			difficulty: difficulty === 'hard' ? 'hard' : 'easy',
			apiKey: process.env.GEMINI_API_KEY
		});

		const chosenMoveId = resolveMoveIdFromCoordinates(
			resolved.moveId,
			resolved.move,
			moveIndex.legalMoveByCoordinates
		);
		const chosenMove = resolved.move;
		const hasValidMoveId = Number.isInteger(chosenMoveId) && moveIndex.validMoveIds.has(chosenMoveId);
		const hasValidCoordinates = isCoordinateMove(chosenMove);

		if (!hasValidMoveId && !hasValidCoordinates) {
			return res.status(502).json({ message: 'CPU move resolver did not return a valid move.' });
		}

		console.info(
			'[CPU_API] difficulty=%s provider=%s fallback=%s move=%s legalMoves=%s',
			difficulty === 'hard' ? 'hard' : 'easy',
			resolved.provider,
			Boolean(resolved.fallback),
			hasValidMoveId ? chosenMoveId : JSON.stringify(chosenMove),
			legalMoves.length
		);
    const response = {
			moveId: hasValidMoveId ? chosenMoveId : null,
			move: hasValidCoordinates ? chosenMove : null,
			provider: resolved.provider,
			fallback: Boolean(resolved.fallback)
		};

		return res.json(response);
	} catch (error) {
		const isRateLimit = error?.status === 429 || error?.message?.includes('429');
		const statusCode = isRateLimit ? 429 : 500;
		const message = isRateLimit
			? 'Gemini API rate limit exceeded. CPU will use heuristic fallback next move.'
			: 'Failed to resolve CPU move.';

		console.error(
			'[CPU_API] Failed: statusCode=%d message=%s error=%s',
			statusCode,
			message,
			error?.message || String(error)
		);
		return res.status(statusCode).json({ message });
	}
}));

app.get('/checkers', (req,res) => {
    res.redirect('/checkers/2D');
})

app.get('/checkers/2D', (req,res) => {
    res.sendFile(path.join(rootDir, "viewgames", "index.html"));
})

app.get('/checkers/3D', (req,res) => {
    res.send('Hello World, this will be the 3d game');
})

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}/checkers/2D or /checkers/3D (3D)`);
})

