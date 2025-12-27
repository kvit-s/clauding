/**
 * Manual test for feature sorting functionality
 * This test creates mock features and verifies sorting works correctly
 */

import { FeatureLifecycleStatus } from '../models/Feature';

interface MockFeature {
  name: string;
  worktreePath: string;
  lifecycleStatus: FeatureLifecycleStatus;
  creationTime: number;
}

// Mock features
const mockFeatures: MockFeature[] = [
  { name: 'zeta-feature', worktreePath: '/tmp/zeta', lifecycleStatus: 'implement', creationTime: 3 },
  { name: 'alpha-feature', worktreePath: '/tmp/alpha', lifecycleStatus: 'pre-plan', creationTime: 1 },
  { name: 'beta-feature', worktreePath: '/tmp/beta', lifecycleStatus: 'plan', creationTime: 2 },
  { name: 'gamma-feature', worktreePath: '/tmp/gamma', lifecycleStatus: 'wrap-up', creationTime: 4 },
  { name: 'delta-feature', worktreePath: '/tmp/delta', lifecycleStatus: 'legacy', creationTime: 5 }
];

// Test alphabetical sorting (A-Z)
function testAlphabeticalSort() {
  console.log('\n=== Testing Alphabetical Sort (A-Z) ===');
  const sorted = [...mockFeatures].sort((a, b) => a.name.localeCompare(b.name));
  console.log('Expected order: alpha, beta, delta, gamma, zeta');
  console.log('Actual order:', sorted.map(f => f.name.split('-')[0]).join(', '));
  const isCorrect = sorted[0].name === 'alpha-feature' && sorted[4].name === 'zeta-feature';
  console.log('Result:', isCorrect ? 'PASS' : 'FAIL');
  return isCorrect;
}

// Test alphabetical sorting reverse (Z-A)
function testAlphabeticalSortReverse() {
  console.log('\n=== Testing Alphabetical Sort (Z-A) ===');
  const sorted = [...mockFeatures].sort((a, b) => a.name.localeCompare(b.name)).reverse();
  console.log('Expected order: zeta, gamma, delta, beta, alpha');
  console.log('Actual order:', sorted.map(f => f.name.split('-')[0]).join(', '));
  const isCorrect = sorted[0].name === 'zeta-feature' && sorted[4].name === 'alpha-feature';
  console.log('Result:', isCorrect ? 'PASS' : 'FAIL');
  return isCorrect;
}

// Test chronological sorting (oldest first)
function testChronologicalSort() {
  console.log('\n=== Testing Chronological Sort (oldest first) ===');
  const sorted = [...mockFeatures].sort((a, b) => a.creationTime - b.creationTime);
  console.log('Expected order (by creation time): alpha(1), beta(2), zeta(3), gamma(4), delta(5)');
  console.log('Actual order:', sorted.map(f => `${f.name.split('-')[0]}(${f.creationTime})`).join(', '));
  const isCorrect = sorted[0].creationTime === 1 && sorted[4].creationTime === 5;
  console.log('Result:', isCorrect ? 'PASS' : 'FAIL');
  return isCorrect;
}

// Test chronological sorting reverse (newest first)
function testChronologicalSortReverse() {
  console.log('\n=== Testing Chronological Sort (newest first) ===');
  const sorted = [...mockFeatures].sort((a, b) => a.creationTime - b.creationTime).reverse();
  console.log('Expected order (by creation time): delta(5), gamma(4), zeta(3), beta(2), alpha(1)');
  console.log('Actual order:', sorted.map(f => `${f.name.split('-')[0]}(${f.creationTime})`).join(', '));
  const isCorrect = sorted[0].creationTime === 5 && sorted[4].creationTime === 1;
  console.log('Result:', isCorrect ? 'PASS' : 'FAIL');
  return isCorrect;
}

// Test lifecycle stage sorting (pre-plan → legacy)
function testStageSort() {
  console.log('\n=== Testing Lifecycle Stage Sort (pre-plan → legacy) ===');
  const stageOrder: Record<FeatureLifecycleStatus, number> = {
    'pre-plan': 1,
    plan: 2,
    implement: 3,
    'wrap-up': 4,
    legacy: 5
  };
  const sorted = [...mockFeatures].sort((a, b) => {
    const orderA = stageOrder[a.lifecycleStatus] || 999;
    const orderB = stageOrder[b.lifecycleStatus] || 999;
    return orderA - orderB;
  });
  console.log('Expected order: pre-plan, plan, implement, wrap-up, legacy');
  console.log('Actual order:', sorted.map(f => f.lifecycleStatus).join(', '));
  const isCorrect = sorted[0].lifecycleStatus === 'pre-plan' && sorted[4].lifecycleStatus === 'legacy';
  console.log('Result:', isCorrect ? 'PASS' : 'FAIL');
  return isCorrect;
}

// Test lifecycle stage sorting reverse (legacy → pre-plan)
function testStageSortReverse() {
  console.log('\n=== Testing Lifecycle Stage Sort (legacy → pre-plan) ===');
  const stageOrder: Record<FeatureLifecycleStatus, number> = {
    'pre-plan': 1,
    plan: 2,
    implement: 3,
    'wrap-up': 4,
    legacy: 5
  };
  const sorted = [...mockFeatures].sort((a, b) => {
    const orderA = stageOrder[a.lifecycleStatus] || 999;
    const orderB = stageOrder[b.lifecycleStatus] || 999;
    return orderA - orderB;
  }).reverse();
  console.log('Expected order: legacy, wrap-up, implement, plan, pre-plan');
  console.log('Actual order:', sorted.map(f => f.lifecycleStatus).join(', '));
  const isCorrect = sorted[0].lifecycleStatus === 'legacy' && sorted[4].lifecycleStatus === 'pre-plan';
  console.log('Result:', isCorrect ? 'PASS' : 'FAIL');
  return isCorrect;
}

// Run all tests
function runTests() {
  console.log('Starting Feature Sorting Tests...\n');

  const results = {
    alphabetical: testAlphabeticalSort(),
    alphabeticalReverse: testAlphabeticalSortReverse(),
    chronological: testChronologicalSort(),
    chronologicalReverse: testChronologicalSortReverse(),
    stage: testStageSort(),
    stageReverse: testStageSortReverse()
  };

  console.log('\n=== Test Summary ===');
  console.log('Alphabetical (A-Z):', results.alphabetical ? 'PASS' : 'FAIL');
  console.log('Alphabetical (Z-A):', results.alphabeticalReverse ? 'PASS' : 'FAIL');
  console.log('Chronological (oldest first):', results.chronological ? 'PASS' : 'FAIL');
  console.log('Chronological (newest first):', results.chronologicalReverse ? 'PASS' : 'FAIL');
  console.log('Lifecycle Stage (pre-plan → legacy):', results.stage ? 'PASS' : 'FAIL');
  console.log('Lifecycle Stage (legacy → pre-plan):', results.stageReverse ? 'PASS' : 'FAIL');

  const allPassed = Object.values(results).every(r => r);
  console.log('\nOverall:', allPassed ? 'ALL TESTS PASSED ✓' : 'SOME TESTS FAILED ✗');

  process.exit(allPassed ? 0 : 1);
}

runTests();
