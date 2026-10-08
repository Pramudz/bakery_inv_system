// cPanel/Passenger startup file. Keep cwd at the application root for uploads.
process.chdir(__dirname);
require('./backend/dist/main.js');
