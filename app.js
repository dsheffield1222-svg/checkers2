import 'dotenv/config';

import path from 'node:path'; //handling, transforming, and validating file and directory paths across different operating systems.
import { promises as fs } from 'node:fs'; // import the promise-based file system API.
import { fileURLToPath } from 'node:url';

import express from 'express';

const app = express();
const port = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.dirname(__filename);
const savesDir = path.join(rootDir, 'data')// creates the path to the data directory /home/dame/checkers2/data
const twoDGameSavePath = path.join(savesDir, '2d-game-save.json');


// Simple throttle: one CPU move request at a time to avoid rate-limit hammering
let cpuMoveInProgress = false;
const cpuMoveQueue = [];

// Serve all project static files under /checkers (script, styles, images, favicons).
app.use(express.static(path.join(rootDir, "public")));


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

// console.log(`Hello ${process.env.Hello}`);
// console.log(twoDGameSavePath);