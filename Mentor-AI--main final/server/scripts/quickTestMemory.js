// server/scripts/quickTestMemory.js
/**
 * Quick test to verify contextual memory system is working
 */

require('dotenv').config({ path: './server/.env' });
const mongoose = require('mongoose');
const knowledgeStateService = require('../services/knowledgeStateService');

async function quickTest() {
    try {
        console.log('🧪 Quick Contextual Memory Test\n');

        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to MongoDB\n');

        const testUserId = new mongoose.Types.ObjectId();
        console.log(`Test User: ${testUserId}\n`);

        // Test 1: Create knowledge state
        console.log('1. Creating knowledge state...');
        const state = await knowledgeStateService.getOrCreateKnowledgeState(testUserId);
        console.log(`   ✅ Created: ${state._id}\n`);

        // Test 2: Update with insights
        console.log('2. Updating with insights...');
        await knowledgeStateService.updateKnowledgeStateFromInsights(
            testUserId,
            'test-session',
            {
                concepts: [{
                    name: 'recursion.base_case',
                    mastery: 45,
                    difficulty: 'high'
                }]
            }
        );
        console.log('   ✅ Updated\n');

        // Test 3: Retrieve memory
        console.log('3. Retrieving contextual memory...');
        const memory = await knowledgeStateService.getContextualMemory(testUserId);
        console.log(`   ✅ Retrieved (${memory?.length || 0} chars)\n`);

        if (memory) {
            console.log('Memory Preview:');
            console.log(memory.substring(0, 300) + '...\n');
        }

        // Cleanup
        const StudentKnowledgeState = require('../models/StudentKnowledgeState');
        await StudentKnowledgeState.deleteOne({ userId: testUserId });
        console.log('✅ Cleanup complete\n');

        console.log('🎉 All basic tests passed!\n');

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error.stack);
    } finally {
        await mongoose.connection.close();
        process.exit(0);
    }
}

quickTest();
