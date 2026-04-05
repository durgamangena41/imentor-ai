require('dotenv').config();
try {

    console.log('Testing subjects route...');
    require('./routes/subjects');
    console.log('Testing gamification route...');
    require('./routes/gamification');
    console.log('Testing chat route...');
    require('./routes/chat');
    console.log('All tests passed!');
} catch (e) {
    console.error('ERROR FOUND:', e);
}
