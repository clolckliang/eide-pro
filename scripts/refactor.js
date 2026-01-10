#!/usr/bin/env node

/**
 * EIDE-Pro Refactor Script
 *
 * This script helps to automate the refactoring of large files in the EIDE-Pro project.
 * Run with: node scripts/refactor.js --stage=<stage-number>
 */

const fs = require('fs');
const path = require('path');

const STAGES = {
    1: {
        name: 'Extract VirtualSource',
        status: 'completed',
        file: 'src/models/VirtualSource.ts',
        lines: 370
    },
    2: {
        name: 'Extract FileManager',
        status: 'pending',
        file: 'src/project-managers/FileManager.ts',
        lines: 600,
        methods: [
            'getFile',
            'addFile',
            'removeFile',
            'addFolder',
            'removeFolder',
            'renameFolder',
            'traverse',
            'getFileGroups',
            'isExcluded'
        ]
    },
    3: {
        name: 'Extract ConfigurationManager',
        status: 'pending',
        file: 'src/project-managers/ConfigurationManager.ts',
        lines: 500,
        methods: [
            'GetConfiguration',
            'loadProjectConfig',
            'saveProjectConfig',
            'validateConfig',
            'migrateConfig'
        ]
    },
    4: {
        name: 'Extract IntelliSenseProvider',
        status: 'pending',
        file: 'src/providers/ProjectIntelliSenseProvider.ts',
        lines: 800,
        methods: [
            'canProvideConfiguration',
            'provideConfigurations',
            'canProvideBrowseConfigurationsPerFolder',
            'provideFolderBrowseConfiguration',
            'canProvideBrowseConfiguration',
            'provideBrowseConfiguration'
        ]
    },
    5: {
        name: 'Simplify AbstractProject',
        status: 'pending',
        targetLines: 800
    }
};

function printStatus() {
    console.log('\n=== EIDE-Pro Refactoring Status ===\n');

    let totalLines = 0;
    let completedLines = 0;

    Object.entries(STAGES).forEach(([num, stage]) => {
        const status = stage.status === 'completed' ? '✅' : '🔄';
        const lines = stage.lines || 0;
        totalLines += lines;
        if (stage.status === 'completed') {
            completedLines += lines;
        }

        console.log(`${status} Stage ${num}: ${stage.name}`);
        console.log(`   File: ${stage.file || 'N/A'}`);
        console.log(`   Lines: ${lines || 'N/A'}`);
        console.log(`   Status: ${stage.status}\n`);
    });

    console.log(`Progress: ${completedLines}/${totalLines} lines (${((completedLines/totalLines)*100).toFixed(1)}%)`);
    console.log(`\nOriginal EIDEProject.ts: 4316 lines`);
    console.log(`Target after all stages: ~800 lines`);
    console.log(`Lines to be extracted: ~3500 lines\n`);
}

function generateStagePlan(stageNum) {
    const stage = STAGES[stageNum];
    if (!stage) {
        console.error(`Invalid stage number: ${stageNum}`);
        return;
    }

    console.log(`\n=== Stage ${stageNum}: ${stage.name} ===\n`);
    console.log(`Target File: ${stage.file}`);
    console.log(`Estimated Lines: ${stage.lines}`);
    console.log(`\nSteps:`);
    console.log(`1. Create directory structure (if needed)`);
    console.log(`2. Create new file with extracted methods`);
    console.log(`3. Add necessary imports`);
    console.log(`4. Update EIDEProject.ts to use new module`);
    console.log(`5. Run tests to verify`);
    console.log(`6. Commit changes\n`);
}

function showHelp() {
    console.log('\n=== EIDE-Pro Refactor Help ===\n');
    console.log('Usage: node refactor.js [options]\n');
    console.log('Options:');
    console.log('  --status      Show refactoring status');
    console.log('  --stage=N     Show plan for stage N (1-5)');
    console.log('  --all         Show all stage plans');
    console.log('  --help        Show this help message\n');
    console.log('Example:');
    console.log('  node refactor.js --status');
    console.log('  node refactor.js --stage=2\n');
}

// Main
const args = process.argv.slice(2);

if (args.length === 0) {
    showHelp();
} else if (args[0] === '--status') {
    printStatus();
} else if (args[0].startsWith('--stage=')) {
    const stageNum = args[0].split('=')[1];
    generateStagePlan(stageNum);
} else if (args[0] === '--all') {
    Object.keys(STAGES).forEach(num => generateStagePlan(num));
} else if (args[0] === '--help') {
    showHelp();
} else {
    console.log('Unknown option. Use --help for usage.\n');
}
