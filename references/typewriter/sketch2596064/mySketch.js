/* #WCCChallenge Theme:Typewriter Art

Found an interesting old book online called Bob Neill’s book of typewriter art: 
https://archive.org/details/bob-neills-book-of-typewriter-art/mode/2up
The author documented patterns/instructions for creating pictures with typewriters. 
Computers love instructions like these! So I extracted them from the pdf, stored in an array, and made this
program to generate typewriter art based on the rules. 
When extracting text from pdf some letters were misread, but I somehow like the glitchy effects it creates.

*/

let fontSize = 9;
let lineHeight = 4;

function setup() {

	OPC.select('theme', ["cat", "dog", "lady"]);

	createCanvas(600, 600);
	background('#F7F5EA');
	fill(0);
	textSize(fontSize);
	textFont('monospace');
	strokeWeight(4);

	drawArt(catRules, 180, 100);

}

function drawArt(rules, x, y) {
	background('#F7F5EA');
	startX = x;
	startY = y;
	let lastBaseRow;
	for (let i = 0; i < rules.length; i++) {
		const [rowLabel, instruction] = rules[i];
		const baseRow = rowLabel.replace(/[a-z]$/, '');
		const rowText = parseRowInstructions(instruction);
		if (baseRow === lastBaseRow) {
			text(rowText, startX, startY);
		} else {
			startY += lineHeight;
			text(rowText, startX, startY);
			lastBaseRow = baseRow;
		}
	}
}

function parseRowInstructions(instructions) {
	let tokens = instructions.split(' ');
	let rowStr = '';
	for (let token of tokens) {
		let count = 1;
		let symbol = '';
		const match = token.match(/^(\d+)(.+)/);
		if (match) {
			count = parseInt(match[1]);
			symbol = match[2];
		}
		if (symbol === 'sp') symbol = ' ';
		rowStr += symbol.repeat(count);
	}
	return rowStr;
}

function parameterChanged() {
	if (theme == 'cat') {
		drawArt(catRules, 180, 100);
	} else if (theme == 'dog') {
		drawArt(dogRules, 80, 120);
	} else {
		drawArt(ladyRules, 100, 100);
	}
}