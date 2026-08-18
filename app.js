import 'dotenv/config';

import path from 'node:path'; //handling, transforming, and validating file and directory paths across different operating systems.
import { promises as fs } from 'node:fs'; // import the promise-based file system API.
import express from 'express';

const app = express();

app.use(express.json());

const port = process.env.PORT || 3000;


app.get('/checkers', (req,res) => {
    res.redirect('/checkers/2D');
})

app.get('/checkers/2D', (req,res) => {
    res.send('Hello World, this will be the 2d game');
})

app.get('/checkers/3D', (req,res) => {
    res.send('Hello World, this will be the 3d game');
})

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}/checkers/2D or /checkers/3D (3D)`);
})

console.log(`Hello ${process.env.Hello}`);