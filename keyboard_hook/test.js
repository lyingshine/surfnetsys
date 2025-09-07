const keyboardHook = require('./build/Release/keyboard_hook');

console.log('Starting keyboard hook...');
keyboardHook.startHook();

console.log('Hook is running. Press any key to test (Ctrl+C to exit)');

// Keep the process running
setInterval(() => {}, 1000);

// Handle process exit
process.on('SIGINT', () => {
  console.log('Stopping keyboard hook...');
  keyboardHook.stopHook();
  process.exit();
});