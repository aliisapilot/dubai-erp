// Test script for trial data cleanup RPCs - repository level checks
import fs from 'fs';
import path from 'path';

const migrationPath = path.join(process.cwd(), 'supabase/migrations/20261008000001_trial_data_cleanup.sql');
const componentPath = path.join(process.cwd(), 'components/settings/TrialDataManagement.tsx');

function checkFileContains(file, patterns) {
  const content = fs.readFileSync(file, 'utf8');
  return patterns.every(p => new RegExp(p).test(content));
}

console.log('Running trial cleanup repository checks...');

// Migration checks
const migrationChecks = [
  'admin_audit_log',
  'trial_data_cleanup_dry_run',
  'trial_data_cleanup_execute',
  'SECURITY DEFINER',
  'SET search_path = public',
  'auth.uid()',
  'DELETE 4dbb309a-f31c-4615-8bb5-59df7a6326e3',
  'supplier_bill_items',
  'bill_id',
  'stock_adjustment_items',
  'adjustment_id',
];
const migrationOk = checkFileContains(migrationPath, migrationChecks);
console.log('Migration checks:', migrationOk ? 'PASS' : 'FAIL');

// Component checks
const componentChecks = [
  'CLEANUP_TABLES',
  'measurement_items',
  'proforma_invoices',
  'petty_cash_transactions',
  'CONFIRMATION_PHRASE',
  'DELETE 4dbb309a-f31c-4615-8bb5-59df7a6326e3',
  'trial_data_cleanup_dry_run',
  'trial_data_cleanup_execute',
  'record_admin_audit',
];
const componentOk = checkFileContains(componentPath, componentChecks);
console.log('Component checks:', componentOk ? 'PASS' : 'FAIL');

// No references to removed tables
const removedTables = ['timesheets', 'invoices'];
const componentContent = fs.readFileSync(componentPath, 'utf8');
const hasRemoved = removedTables.some(t => componentContent.includes(`key: "${t}"`));
console.log('No removed tables referenced:', hasRemoved ? 'FAIL' : 'PASS');

console.log('All repository checks completed.');
