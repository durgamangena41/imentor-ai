// server/test_boss_battle.js
const { generateLevelQuestions } = require('./services/skillTreeGameService');
require('dotenv').config();

async function test() {
    console.log('--- Testing Boss Battle Question Generation ---');
    const topic = 'General Knowledge / Web Development';
    const levelName = 'The Grand Finale';
    const difficulty = 'boss';

    try {
        console.log(`Generating questions for: ${topic} - ${levelName} (${difficulty})`);
        const questions = await generateLevelQuestions(topic, levelName, difficulty);

        const fs = require('fs');
        const path = require('path');
        const outputPath = path.join(__dirname, 'test_output.json');
        fs.writeFileSync(outputPath, JSON.stringify(questions, null, 2));

        console.log('\n--- SUCCESS ---');
        console.log(`Questions written to: ${outputPath}`);
    } catch (error) {
        console.error('\n--- FAILED ---');
        console.error(error.message);
    }
}

test();
